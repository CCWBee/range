// RANGE asset loader: the packed library (assets/library.json plus library.bin, version 3, written
// by tools/pack_library.py from the Blender export) and the texture set become three.js geometries
// and materials. Spec: docs/specs/2026-09-06-range-v2.md sections 4.1 and 5.1.
//
// Version 3 quantises positions and uv as uint16 inside each part's bounds, normals as int8 and
// vertex colour as uint8, with uint16 indices where a part has 65,535 vertices or fewer. Positions
// and uv are dequantised to float here; normals and colour go to the GPU as normalised integer
// attributes. A missing texture falls back to the manifest's flat colour and a missing asset is
// logged and skipped, because the library moves while this runs.
import * as THREE from '../vendor/three.module.js';

const JPEG_FIRST = ['jpg', 'jpeg', 'png'];

// Textures the renderer itself asks for by stem. Anything a manifest material names is added to
// this list at load. The bundle supplies them as data URIs on window.RANGE_TEXTURES (build.py reads
// this list); the dev page resolves them under textures/ trying .jpg before .png.
export const TEXTURE_STEMS = [
  'concrete', 'concrete_normal', 'moor', 'tarmac', 'corrugated', 'grime', 'sky',
  'grass_tuft', 'gorse', 'tree_card', 'cloud_1', 'cloud_2', 'cloud_3',
  'airframe', 'airframe_normal',
  'raf_typhoon_heritage',
];

function decodeBase64(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

// Try each extension in turn. Resolves to null rather than throwing when nothing is there.
async function resolveTexture(stem) {
  const inline = typeof window !== 'undefined' && window.RANGE_TEXTURES;
  if (inline) {
    if (!inline[stem]) return null;
    try { return await loadTexture(inline[stem]); } catch { return null; }
  }
  for (const extension of JPEG_FIRST) {
    try { return await loadTexture(`textures/${stem}.${extension}`); } catch { /* next extension */ }
  }
  return null;
}

export class Library {
  constructor(manifest, binary) {
    this.manifest = manifest;
    this.binary = binary;
    this.version = manifest.version || 0;
    this.materials = {};
    this.geometries = {};
    this.pivots = manifest.pivots || {};
    this.textures = {};
    this.missing = new Set();
    this.triangles = 0;
  }

  // Named textures, or null when the file is not on disk yet.
  texture(stem) { return this.textures[stem] || null; }

  has(name) { return !!this.geometries[name]; }

  // Parts of an asset as {geometry, material, materialName}. Unknown assets log once and give [].
  parts(name) {
    const parts = this.geometries[name];
    if (parts) return parts;
    if (!this.missing.has(name)) {
      this.missing.add(name);
      console.warn(`RANGE: asset "${name}" is not in the library, skipping it`);
    }
    return [];
  }

  // A Group holding every part of an asset. `override` replaces the material on all of them.
  asset(name, override) {
    const group = new THREE.Group();
    group.name = name;
    for (const part of this.parts(name)) {
      const mesh = new THREE.Mesh(part.geometry, override || part.material);
      mesh.name = `${name}:${part.materialName}`;
      group.add(mesh);
    }
    return group;
  }

  // Bounding box of an asset in its own coordinates, or null when it is missing.
  bounds(name) {
    const parts = this.parts(name);
    if (!parts.length) return null;
    const box = new THREE.Box3();
    for (const part of parts) box.union(part.geometry.boundingBox);
    return box;
  }

  // Hinge for a moving part: {point: Vector3, axis: Vector3, range: [stowed, deployed]}.
  pivot(name) {
    const p = this.pivots[name];
    if (!p) return null;
    return {
      point: new THREE.Vector3(...p.point),
      axis: new THREE.Vector3(...p.axis).normalize(),
      range: p.range || [0, 0],
    };
  }
}

// A tiling skin shared across parts: repeat wrapping, and the repeat set from the manifest's
// uvScale, which is metres of surface per uv unit, so one metre of texture covers one metre.
function skin(texture, uvScale, maxAnisotropy, colour) {
  if (!texture) return null;
  const copy = texture.clone();
  copy.needsUpdate = true;
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  copy.anisotropy = Math.min(8, maxAnisotropy);
  if (uvScale) copy.repeat.set(1 / uvScale, 1 / uvScale);
  return copy;
}

export function buildMaterials(library, renderer) {
  const maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  for (const [name, definition] of Object.entries(library.manifest.materials || {})) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...(definition.colour || [0.5, 0.5, 0.5])),
      metalness: definition.metallic === undefined ? 0 : definition.metallic,
      roughness: definition.roughness === undefined ? 0.7 : definition.roughness,
    });
    material.name = name;
    const uvScale = definition.uvScale;
    const base = definition.map ? skin(library.texture(definition.map), uvScale, maxAnisotropy, true) : null;
    const normal = definition.normalMap ? skin(library.texture(definition.normalMap), uvScale, maxAnisotropy, false) : null;
    const orm = definition.ormMap ? library.texture(definition.ormMap) : null;
    // The grime sampler is read directly in the shader, so it needs repeat wrapping but its own
    // repeat is irrelevant: the coarser scale is applied to the uv there.
    const grime = definition.grimeMap ? skin(library.texture(definition.grimeMap), null, maxAnisotropy, false) : null;
    // The tiling sheet is a light painted panel skin, so the manifest colour stays as the tint
    // that gives each material its shade rather than being thrown away.
    if (base) material.map = base;
    if (normal) material.normalMap = normal;
    if (definition.bumpMap) {
      material.bumpMap = skin(library.texture(definition.bumpMap), uvScale, maxAnisotropy, false);
      material.bumpScale = definition.bumpScale ?? .018;
    }
    if (grime) {
      // A grime and streak mask multiplied over the base colour at a coarser scale than the
      // panels, so the weathering does not repeat with them.
      material.userData.grimeMap = grime;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.grimeMap = { value: grime };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D grimeMap;')
          .replace('#include <map_fragment>', `#include <map_fragment>
 #ifdef USE_MAP
 float grime=texture2D(grimeMap,vMapUv*${(1 / 3.5).toFixed(4)}).r;
 diffuseColor.rgb*=mix(1.0,0.62,1.0-grime);
 #endif`);
      };
    }
    if (orm) {
      // Spec 5.1: three.js multiplies the scalar factors into the texels, so both go to 1 and the
      // one packed texture serves ambient occlusion (R), roughness (G) and metalness (B).
      orm.colorSpace = THREE.NoColorSpace;
      orm.anisotropy = Math.min(8, maxAnisotropy);
      material.aoMap = orm;
      material.roughnessMap = orm;
      material.metalnessMap = orm;
      material.roughness = 1;
      material.metalness = 1;
    }
    if (definition.map && !base) {
      console.warn(`RANGE: texture "${definition.map}" is missing, material "${name}" stays flat`);
    }
    library.materials[name] = material;
  }
  if (!library.materials.default) {
    library.materials.default = new THREE.MeshStandardMaterial({ color: 0x8a8f92, roughness: 0.8 });
    library.materials.default.name = 'default';
  }
}

function materialFor(library, name) {
  return library.materials[name] || library.materials.default;
}

// uint16 back to float inside [lo, hi] per component.
export function dequantise(q, stride, lo, hi) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) {
    const k = i % stride;
    out[i] = lo[k] + q[i] / 65535 * (hi[k] - lo[k]);
  }
  return out;
}

// Every attribute is a byte offset into the binary blob, 4-byte aligned.
export function buildGeometries(library) {
  const buffer = library.binary.buffer;
  const base = library.binary.byteOffset;
  for (const [name, parts] of Object.entries(library.manifest.assets || {})) {
    const built = [];
    for (const part of parts) {
      try {
        const n = part.vertexCount, b = part.bounds;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(
          dequantise(new Uint16Array(buffer, base + part.position, n * 3), 3, b.slice(0, 3), b.slice(3)), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(
          new Int8Array(buffer, base + part.normal, n * 3), 3, true));
        if (part.uv != null) {
          const u = part.uvBounds;
          geometry.setAttribute('uv', new THREE.BufferAttribute(
            dequantise(new Uint16Array(buffer, base + part.uv, n * 2), 2, u.slice(0, 2), u.slice(2)), 2));
        }
        if (part.color != null) {
          // Vertex ambient occlusion baked in Blender, three bytes per vertex, linear.
          geometry.setAttribute('color', new THREE.BufferAttribute(
            new Uint8Array(buffer, base + part.color, n * 3), 3, true));
        }
        const Index = part.indexBytes === 2 ? Uint16Array : Uint32Array;
        geometry.setIndex(new THREE.BufferAttribute(new Index(buffer, base + part.index, part.indexCount), 1));
        geometry.boundingBox = new THREE.Box3(
          new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        library.triangles += part.indexCount / 3;
        const material = materialFor(library, part.material);
        if (geometry.hasAttribute('color')) material.vertexColors = true;
        built.push({ geometry, material, materialName: part.material });
      } catch (error) {
        console.warn(`RANGE: part of "${name}" failed to decode, skipping it`, error);
      }
    }
    if (built.length) library.geometries[name] = built;
  }
}

// The bundle carries the manifest and binary on window; the dev page fetches them over http.
// Nothing is fetched as a data URL: the content security policy blocks that, so the bundle's
// binary arrives base64 encoded and is decoded with atob.
async function readLibrary() {
  if (typeof window !== 'undefined' && window.RANGE_MANIFEST) {
    return { manifest: window.RANGE_MANIFEST, binary: decodeBase64(window.RANGE_BIN), source: 'bundle' };
  }
  const manifest = await fetch('assets/library.json').then((r) => r.json());
  const binary = new Uint8Array(await fetch('assets/library.bin').then((r) => r.arrayBuffer()));
  return { manifest, binary, source: 'http' };
}

export async function loadLibrary(renderer) {
  const { manifest, binary, source } = await readLibrary();
  if (manifest.version !== 3) {
    throw new Error(`RANGE: library version ${manifest.version} is not 3; run python tools/pack_library.py`);
  }
  const library = new Library(manifest, binary);
  // Everything the renderer wants, plus every map a manifest material names: the library decides
  // its own skin, so a texture stem that only appears there is still fetched.
  const wanted = new Set(TEXTURE_STEMS);
  for (const definition of Object.values(manifest.materials || {})) {
    for (const key of ['map', 'normalMap', 'bumpMap', 'ormMap', 'grimeMap']) {
      if (definition[key]) wanted.add(definition[key]);
    }
  }
  const list = [...wanted];
  const stems = await Promise.all(list.map((stem) => resolveTexture(stem)));
  list.forEach((stem, i) => { if (stems[i]) library.textures[stem] = stems[i]; });
  const absent = list.filter((stem) => !library.textures[stem]);
  buildMaterials(library, renderer);
  buildGeometries(library);
  console.log(`RANGE: library version ${library.version} from ${source}, `
    + `${Object.keys(library.geometries).length} assets, `
    + `${Math.round(library.triangles / 1000)}k triangles, `
    + `${Object.keys(library.textures).length} of ${list.length} textures`
    + (absent.length ? `, missing ${absent.join(', ')}` : ''));
  return library;
}

// A tiled surface texture: repeat wrapping, sRGB for colour maps, anisotropy for grazing angles.
export function tiled(texture, renderer, colour = true) {
  if (!texture) return null;
  const copy = texture.clone();
  copy.needsUpdate = true;
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (renderer) copy.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return copy;
}

// A unit quad in the XY plane spanning -0.5 to 0.5, the shape every sprite and post pass uses.
// The library carries one as `quad`; this is the stand-in when it does not.
export function unitQuad() {
  return new THREE.PlaneGeometry(1, 1);
}
