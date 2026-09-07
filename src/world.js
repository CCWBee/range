// RANGE world: sky and atmosphere, ocean, terrain, pavement, lighting and two shadow maps, the
// airfield scenery at the coordinates of spec 1.1, instanced airfield lights, ground clutter and
// the cloud decks. Spec: docs/specs/2026-09-06-range-v2.md section 5.5.
//
// Placement is a data table read against the library by name. An asset the library does not carry
// yet is logged once and skipped, so the scene fills in as stream B lands each mesh.
import * as THREE from '../vendor/three.module.js';
import { terrainHeight, onPavement, coast } from '../physics.js';
import { tiled } from './loader.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// Sun direction, the vector pointing at the sun: about 11 degrees of elevation in the
// north-north-west, which is where the atmosphere shader puts its warm band.
export const SUN_DIRECTION = V3(-0.35, 0.21, -1).normalize();

// Value noise and the layered sky, shared by the terrain, ocean, cloud and smoke shaders.
export const NOISE_GLSL = `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+13.4;a*=.5;}return f;}
vec3 atmosphere(vec3 d){
 float h=max(d.y,0.);vec3 top=vec3(.095,.135,.19);vec3 horizon=vec3(.40,.445,.49);
 vec3 col=mix(horizon,top,smoothstep(0.,.7,h));
 float warm=exp(-pow((d.y-.025)*17.,2.))*pow(max(0.,dot(normalize(d.xz),normalize(vec2(-.35,-1.)))),7.);
 col+=vec3(.30,.195,.085)*warm;
 return col;
}
vec3 skyColour(vec3 d,vec2 offset){
 vec3 col=atmosphere(d);float h=max(.025,d.y+.045);
 vec2 p=d.xz/h*.82+offset;
 float n=fbm(p+fbm(p*.5)*1.5);
 float cover=smoothstep(.26,.57,n);
 float layer=fbm(p*2.7+vec2(11.3));
 vec3 cloud=mix(vec3(.065,.083,.115),vec3(.29,.335,.39),layer*.8+max(0.,d.y)*.22);
 cloud+=vec3(.12,.10,.075)*pow(max(0.,-d.z),4.)*exp(-h*4.);
 col=mix(col,cloud,cover*smoothstep(-.012,.10,d.y));
 col=mix(col,vec3(.50,.55,.59),exp(-abs(d.y)*85.)*.34);
 return col;
}`;

// The coastline, in GLSL, exactly as physics.js has it. The terrain shader discards the strip of
// sea bed between the coast and the far shore so the water plane shows through along the true
// sine coast rather than the 110 m stair-step of the height grid.
const COAST_GLSL = `
float coastX(float z){return 1600.+350.*sin(.0008*z)+180.*sin(.0018*z);}`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Yaw in degrees clockwise from north (heading 000 is -Z) as a three.js rotation about +Y.
const yawToRotation = (degrees) => -degrees * DEG;

// ---------------------------------------------------------------------------------------------
// Placement tables (spec 1.1). Each entry is {asset, places: [[x, z, yawDegrees], ...]}.
// ---------------------------------------------------------------------------------------------

function placements() {
  const list = [];
  const add = (asset, places, options = {}) => list.push({ asset, places, ...options });

  add('hangar_arch', [[-330, -130, 90], [-330, -310, 90]], { tall: true });
  add('has', [-620, -740, -860, -980].map((z) => [-425, z, 90]), { tall: true });
  add('tower', [[-260, 170, 0]], { tall: true });
  add('fire_station', [[-120, 150, 180]], { tall: true });
  add('service_block', Array.from({ length: 7 }, (_, i) => [-525, -230 - 83 * i, 0]), { tall: true });
  add('fuel_tank', [[-570, -960, 0], [-601, -960, 0], [-570, -997, 0], [-601, -997, 0]], { tall: true });
  add('radar', [[-700, 350, 0]], { tall: true });
  add('windsock', [[-60, 250, 0]]);
  add('blast_fence', [[0, 330, 180], [0, -2530, 0]], { tall: true });
  add('bowser', [[-150, -40, 60]]);
  add('tractor', [[-120, -20, 30]]);
  add('gpu_cart', [[-100, 40, 0], [-95, 60, 0]]);
  add('landrover', [[-240, 150, 100]]);
  add('fire_tender', [[-120, 138, 180]]);
  add('chocks', [[-1.3, 1.8, 0], [1.3, 1.8, 0]]);
  add('sign', [[-170, -240, 0], [-170, -1090, 0], [-170, -2040, 0], [-40, 120, 0]]);
  add('gate', [[-660, 400, 0]]);

  // Range pads: containers and gabion blocks scattered within 60 m of each hardstand centre.
  const pads = [[-950, -3900], [-1090, -4050], [-800, -4170], [-1040, -4300], [-1220, -4190], [-860, -4430]];
  const random = mulberry32(20260906);
  const containers = [];
  const hescos = [];
  const hulks = [];
  for (const [px, pz] of pads) {
    hulks.push([px + 8, pz - 6, random() * 360]);
    for (let i = 0; i < 20; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 22 + random() * 38;
      const spot = [px + Math.cos(angle) * radius, pz + Math.sin(angle) * radius, random() * 360];
      (i % 2 ? hescos : containers).push(spot);
    }
  }
  add('container', containers);
  add('target_container', containers.slice(0, 6));
  add('hesco', hescos);
  add('target_hulk', hulks);

  // Coast: rocks and groynes along the shoreline, which runs roughly north to south at +X.
  const rocks = [[], [], []];
  const groynes = [];
  for (let z = 600; z > -6200; z -= 90) {
    const x = coast(z);
    const jitter = (random() - 0.5) * 90;
    rocks[Math.floor(random() * 3)].push([x - 30 - random() * 90, z + jitter, random() * 360]);
    if (z % 900 < 90) groynes.push([x - 20, z, 90]);
  }
  rocks.forEach((set, i) => add(i === 0 ? 'rock' : `rock_${i + 1}`, set));
  add('groyne', groynes);

  // A tree belt behind the service blocks, and gorse-height cards along the western boundary.
  const belt = [];
  for (let z = -180; z > -840; z -= 22) belt.push([-585 + Math.sin(z * 0.02) * 6, z, 0]);
  add('tree_card', belt, { billboard: true });

  return list;
}

// Fence posts every 12 m along the perimeter roads (spec 5.5).
function fencePosts() {
  const posts = [];
  for (let z = 400; z > -2700; z -= 12) posts.push([-672, z, 0]);
  for (let x = -672; x < 420; x += 12) { posts.push([x, 302, 0]); posts.push([x, -2618, 0]); }
  return posts;
}

// ---------------------------------------------------------------------------------------------
// Airfield lighting: every lamp is an emissive body plus an additive glow billboard.
// ---------------------------------------------------------------------------------------------

const LAMP_COLOURS = {
  white: 0xffeccd,
  green: 0x36ff92,
  red: 0xff3c28,
  blue: 0x4a86ff,
  amber: 0xffb352,
};

function lampPlacements() {
  const lamps = { white: [], green: [], red: [], blue: [], amber: [] };
  // Runway edge lights every 60 m, both sides, from the 36 threshold at z = 300 to the 18 end.
  for (let z = 300; z >= -2500; z -= 60) { lamps.white.push([-31.5, 0.22, z]); lamps.white.push([31.5, 0.22, z]); }
  // Threshold bars: green facing runway 36 at its threshold, red at the far end.
  for (let x = -30; x <= 30; x += 5) { lamps.green.push([x, 0.22, 300]); lamps.red.push([x, 0.22, -2500]); }
  // Taxiway edge lights blue, centreline green, along the parallel taxiway.
  for (let z = -50; z >= -2250; z -= 30) {
    lamps.blue.push([-201, 0.22, z]); lamps.blue.push([-179, 0.22, z]);
    lamps.green.push([-190, 0.18, z]);
  }
  for (let x = -180; x <= 0; x += 30) {
    for (const z of [-250, -1100, -2050]) lamps.green.push([x, 0.18, z]);
  }
  // Approach bars every 150 m out to 900 m off the 36 threshold, five lamps to a bar.
  for (let k = 1; k <= 6; k++) {
    const z = 300 + 150 * k;
    for (let i = -2; i <= 2; i++) lamps.white.push([i * 3.5, 1.4, z]);
  }
  // PAPI, four boxes on the left of runway 36, 300 m in from the threshold. Two show white and
  // two red on the correct three-degree slope, which is what the frame should read.
  for (let i = 0; i < 4; i++) {
    const x = -46 - i * 8;
    (i < 2 ? lamps.white : lamps.red).push([x, 0.9, 0]);
  }
  return lamps;
}

// ---------------------------------------------------------------------------------------------

export class World {
  constructor(renderer, library) {
    this.renderer = renderer;
    this.library = library;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x7e8b91, 0.000105);
    this.time = 0;
    this.animated = [];
    this.billboards = [];
    this.quadGeometry = this.geometryOf('quad') || new THREE.PlaneGeometry(1, 1);

    this.buildSky();
    this.buildLighting();
    this.buildOcean();
    this.buildTerrain();
    this.buildPavement();
    this.buildScenery();
    this.buildLamps();
    this.buildClutter();
    this.buildClouds();
    this.buildTownLights();
  }

  // The first geometry of an asset, for the cases where a single mesh is wanted.
  geometryOf(name) {
    const parts = this.library.geometries[name];
    return parts && parts.length ? parts[0].geometry : null;
  }

  // ------------------------------------------------------------------------- sky and environment

  buildSky() {
    const skyTexture = this.library.texture('sky');
    if (skyTexture) { skyTexture.colorSpace = THREE.SRGBColorSpace; skyTexture.wrapS = THREE.RepeatWrapping; }
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { offset: { value: new THREE.Vector2() }, panorama: { value: skyTexture }, hasMap: { value: skyTexture ? 1 : 0 } },
      vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 direction;uniform sampler2D panorama;uniform vec2 offset;uniform float hasMap;${NOISE_GLSL}
void main(){vec3 d=normalize(direction);
 vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5+offset.x*.025,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
 vec3 col=hasMap>.5?texture2D(panorama,uv).rgb*.84:skyColour(d,offset);
 gl_FragColor=vec4(col,1.);}`,
    });
    const skyGeometry = this.geometryOf('sky') || new THREE.SphereGeometry(1, 32, 20);
    this.sky = new THREE.Mesh(skyGeometry, this.skyMaterial);
    this.sky.scale.setScalar(40000);
    this.sky.frustumCulled = false;
    this.sky.castShadow = false;
    this.sky.receiveShadow = false;
    this.scene.add(this.sky);

    // The same sky, captured to a cube map, gives the aircraft and the puddles their reflections.
    const environmentScene = new THREE.Scene();
    const environmentSky = new THREE.Mesh(skyGeometry, this.skyMaterial);
    environmentSky.scale.setScalar(100);
    environmentScene.add(environmentSky);
    const target = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cubeCamera = new THREE.CubeCamera(0.1, 200, target);
    cubeCamera.update(this.renderer, environmentScene);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromCubemap(target.texture).texture;
  }

  // ------------------------------------------------------------------------- lighting and shadows

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xb9c6d3, 0x2f3630, 1.65));
    const make = (footprint, height, distance, bias, normalBias) => {
      const light = new THREE.DirectionalLight(0xd8d8ce, 0.07);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      // The shadow camera is sized by ground footprint: a square of side W seen from 11 degrees
      // of elevation and 19 degrees off the axis needs 1.27 W across and W sin(11) plus the
      // caster height along the light.
      const half = footprint * 0.635;
      const vertical = footprint * 0.5 * Math.sin(11.2 * DEG) + height;
      const camera = light.shadow.camera;
      camera.left = -half; camera.right = half;
      camera.top = vertical; camera.bottom = -vertical;
      camera.near = 1; camera.far = distance * 2 + footprint;
      light.shadow.bias = bias;
      light.shadow.normalBias = normalBias;
      light.shadow.radius = 3;
      light.userData.distance = distance;
      this.scene.add(light);
      this.scene.add(light.target);
      return light;
    };
    // Near: a 70 m square on the aircraft, which is what carries its own shadow and the shadows
    // of anything it taxis past. Far: an 800 m square ahead of the camera for the buildings.
    this.nearLight = make(70, 6, 260, -0.00012, 0.06);
    this.farLight = make(800, 24, 2200, -0.0006, 0.9);
  }

  // ------------------------------------------------------------------------- ocean

  buildOcean() {
    // The water plane is built here rather than taken from the library: it is one quad, and the
    // v2 scenery list drops the old `ocean` asset.
    this.oceanMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 worldP;void main(){worldP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}',
      fragmentShader: `varying vec3 worldP;uniform float time;${NOISE_GLSL}${COAST_GLSL}
void main(){
 vec3 eye=normalize(cameraPosition-worldP);
 float waveFade=exp(-length(cameraPosition-worldP)*.0007);
 float a=(sin(worldP.x*.06+time*.7)+sin(worldP.z*.093-time*.5))*waveFade;
 vec3 normal=normalize(vec3(a*.045,1.,cos(worldP.x*.087+worldP.z*.04+time)*.06*waveFade));
 vec3 reflection=reflect(-eye,normal);
 vec3 reflected=atmosphere(reflection);
 float fres=pow(1.-max(0.,dot(eye,normal)),4.);
 vec3 c=mix(vec3(.035,.075,.086),reflected,.18+fres*.8);
 float foam=noise(worldP.xz*.1+time*.1);
 c+=vec3(.03)*smoothstep(.78,.95,foam);
 // Surf along the true analytic coast, so the water meets the shore on the same line the
 // terrain shader discards on.
 float d=worldP.x-coastX(worldP.z);
 c+=vec3(.10,.12,.13)*smoothstep(90.,4.,abs(d))*(.4+.6*noise(vec2(worldP.z*.05,time*.6)));
 float fog=1.-exp(-length(cameraPosition-worldP)*.00009);
 c=mix(c,vec3(.44,.51,.55),fog);
 gl_FragColor=vec4(c,1.);}`,
    });
    const plane = new THREE.PlaneGeometry(120000, 120000);
    plane.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(plane, this.oceanMaterial);
    this.ocean.position.y = -7;
    this.ocean.frustumCulled = false;
    this.scene.add(this.ocean);
  }

  // ------------------------------------------------------------------------- terrain

  buildTerrain() {
    const grid = this.library.terrain;
    const nx = grid ? grid.nx : 256;
    const nz = grid ? grid.nz : 256;
    const originX = grid ? grid.originX : -12000;
    const originZ = grid ? grid.originZ : -14000;
    const spacing = grid ? grid.spacing : 110;
    const positions = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const index = j * nx + i;
        const x = originX + i * spacing;
        const z = originZ + j * spacing;
        positions[index * 3] = x;
        positions[index * 3 + 1] = grid ? grid.heights[index] : terrainHeight(x, z);
        positions[index * 3 + 2] = z;
      }
    }
    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let k = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    console.log(`RANGE: terrain ${nx} by ${nz} at ${spacing} m ${grid ? 'from the manifest grid' : 'generated from terrainHeight'}`);

    const moor = tiled(this.library.texture('moor'), this.renderer);
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: moor ? 0xffffff : 0x2c3527, roughness: 0.95, metalness: 0, map: moor,
    });
    this.terrainMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 worldP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nworldP=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 worldP;${NOISE_GLSL}${COAST_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 // Analytic shoreline: drop the sea bed between the coast and the far shore so the water plane
 // shows through along the true sine coast instead of the height grid's stair-step.
 float coastD=worldP.x-coastX(worldP.z);
 if(coastD>0.&&coastD<2000.)discard;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
 // Two samples of the moor tile at different scales and rotations, so the repeat does not read.
 vec2 rot=vec2(worldP.x*.9397-worldP.z*.342,worldP.x*.342+worldP.z*.9397);
 vec3 fine=texture2D(map,rot/17.).rgb;
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*fine*2.1,.45);
 float wet=fbm(worldP.xz*.0035);
 diffuseColor.rgb*=mix(.72,1.14,smoothstep(.25,.72,wet));
 diffuseColor.rgb*=.80+.35*noise(worldP.xz*.11);
 // Shingle and wet sand within 30 m of the shore.
 float shore=1.-smoothstep(0.,30.,abs(coastD));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.195,.175),shore*.75);
 // Drainage ditches down both sides of the runway at 45 m.
 float ditch=exp(-pow((abs(worldP.x)-45.)*.5,2.))*step(-2560.,worldP.z)*step(worldP.z,360.);
 diffuseColor.rgb*=1.-ditch*.55;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
 roughnessFactor=mix(.98,.55,smoothstep(.25,.72,fbm(worldP.xz*.0035)));`);
    };
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrain.receiveShadow = true;
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
  }

  // ------------------------------------------------------------------------- pavement and markings

  buildPavement() {
    const concrete = tiled(this.library.texture('concrete'), this.renderer);
    const concreteNormal = tiled(this.library.texture('concrete_normal'), this.renderer, false);
    const tarmac = tiled(this.library.texture('tarmac'), this.renderer);
    const surface = (map, normalMap, colour, seams) => {
      const material = new THREE.MeshStandardMaterial({
        color: colour, roughness: 0.55, metalness: 0.04, map, normalMap,
      });
      material.envMapIntensity = 0.55;
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 worldP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nworldP=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 worldP;${NOISE_GLSL}`)
          .replace('#include <map_fragment>', `#ifdef USE_MAP
 diffuseColor*=texture2D(map,worldP.xz/9.);
 #endif
 ${seams ? `
 // Cast slab seams every 7 m, with the tar line darker where water sits in it.
 vec2 slab=abs(fract(worldP.xz/7.)-.5);
 float seam=smoothstep(.482,.496,max(slab.x,slab.y));
 diffuseColor.rgb*=mix(1.,.42,seam);
 float tracks=exp(-pow(abs(worldP.x)-5.,2.)*.2)*.20;
 diffuseColor.rgb*=1.-tracks;` : `
 diffuseColor.rgb*=.86+.14*noise(worldP.xz*.4);`}`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
 // Standing water. The floor of 0.35 is deliberate: a lower roughness prints a hard disc of the
 // sun on the apron, which the ramp concept does not have.
 float puddle=smoothstep(.40,.64,fbm(worldP.xz*.09));
 roughnessFactor=mix(.68,.48,puddle);`);
      };
      return material;
    };
    this.concreteMaterial = surface(concrete, concreteNormal, concrete ? 0x6b7278 : 0x5c6268, true);
    this.tarmacMaterial = surface(tarmac || concrete, concreteNormal, tarmac ? 0x8b9095 : 0x40464a, false);

    const surfaces = [
      ['runway', this.concreteMaterial], ['apron', this.concreteMaterial],
      ['taxiway', this.tarmacMaterial], ['pavement', this.concreteMaterial],
    ];
    for (const [name, material] of surfaces) {
      if (!this.library.has(name)) continue;
      const group = this.library.asset(name, material);
      group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      this.scene.add(group);
    }
    for (const name of ['markings', 'runway_markings']) {
      if (!this.library.has(name)) continue;
      const group = this.library.asset(name);
      group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      this.scene.add(group);
      break;
    }
    this.buildTyreMarks();
  }

  // Rubber laid down in the touchdown zones, as dark alpha streaks on the runway.
  buildTyreMarks() {
    const material = new THREE.MeshBasicMaterial({
      color: 0x14181a, transparent: true, opacity: 0.45, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 streakUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nstreakUv=uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 streakUv;')
        .replace('#include <color_fragment>', `#include <color_fragment>
 float fade=pow(max(0.,sin(streakUv.y*3.14159)),2.)*pow(max(0.,sin(streakUv.x*3.14159)),4.);
 float wear=.35+.65*pow(sin(streakUv.x*65.),2.);
 diffuseColor.a*=fade*wear;`);
    };
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const marks = [];
    for (const zone of [0, -2200]) {
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1;
        const z = zone + (i - 13) * 9 * (zone < 0 ? -1 : 1);
        marks.push([side * (4.5 + (i % 3)), 0.02, z, 1.4 + (i % 4) * 0.4, 16 + (i % 5) * 4]);
      }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, marks.length);
    const matrix = new THREE.Matrix4();
    marks.forEach((m, i) => {
      matrix.makeScale(m[3], 1, m[4]);
      matrix.setPosition(m[0], m[1], m[2]);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  // ------------------------------------------------------------------------- scenery

  buildScenery() {
    let placed = 0;
    const before = new Set(this.scene.children);
    for (const entry of placements()) {
      if (!this.library.has(entry.asset) || !entry.places.length) continue;
      const bounds = this.library.bounds(entry.asset);
      const tall = entry.tall || (bounds && bounds.max.y > 3);
      for (const part of this.library.parts(entry.asset)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, entry.places.length);
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const scale = V3(1, 1, 1);
        entry.places.forEach((place, i) => {
          const [x, z, yaw = 0] = place;
          quaternion.setFromAxisAngle(V3(0, 1, 0), yawToRotation(yaw));
          matrix.compose(V3(x, terrainHeight(x, z), z), quaternion, scale);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.castShadow = !!tall;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
      }
      placed++;
    }
    // Perimeter fence.
    if (this.library.has('fence_post')) {
      const posts = fencePosts();
      for (const part of this.library.parts('fence_post')) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, posts.length);
        const matrix = new THREE.Matrix4();
        posts.forEach(([x, z], i) => { matrix.makeTranslation(x, terrainHeight(x, z), z); mesh.setMatrixAt(i, matrix); });
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
      }
    }
    // The version 1 library carries the airfield as a handful of monolithic assets. Place those
    // when the version 2 names are not there yet, so the scene is never empty.
    const legacy = [['hangar', [[-330, -130, 0], [-450, -130, 0], [-330, -460, 0], [-450, -460, 0], [-330, -790, 0], [-450, -790, 0]]]];
    if (!this.library.has('hangar_arch')) {
      for (const [name, places] of legacy) {
        if (!this.library.has(name)) continue;
        for (const part of this.library.parts(name)) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
          const matrix = new THREE.Matrix4();
          places.forEach(([x, z], i) => { matrix.makeTranslation(x, 0, z); mesh.setMatrixAt(i, matrix); });
          mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
          this.scene.add(mesh);
        }
        placed++;
      }
    }
    if (this.library.has('scenery') && !this.library.has('service_block')) {
      const group = this.library.asset('scenery');
      group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(group);
      placed++;
    }
    // Static library instances can share one draw per material. Bake their placement matrices,
    // retaining Blender normals, skin coordinates and vertex colours.
    const batches = new Map();
    for (const mesh of this.scene.children.slice()) {
      if (before.has(mesh) || !mesh.isInstancedMesh) continue;
      const key = mesh.material.uuid + ':' + mesh.castShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    }
    for (const meshes of batches.values()) {
      const p=[], n=[], uv=[], colours=[], indices=[];
      const matrix=new THREE.Matrix4(), normalMatrix=new THREE.Matrix3(), point=V3();
      for (const mesh of meshes) {
        const g=mesh.geometry, a=g.attributes;
        for(let instance=0;instance<mesh.count;instance++) {
          mesh.getMatrixAt(instance,matrix);normalMatrix.getNormalMatrix(matrix);
          const offset=p.length/3;
          for(let i=0;i<a.position.count;i++) {
            point.fromBufferAttribute(a.position,i).applyMatrix4(matrix);p.push(...point.toArray());
            point.fromBufferAttribute(a.normal,i).applyMatrix3(normalMatrix).normalize();n.push(...point.toArray());
            uv.push(a.uv ? a.uv.getX(i):0,a.uv ? a.uv.getY(i):0);
            colours.push(a.color ? a.color.getX(i):1,a.color ? a.color.getY(i):1,a.color ? a.color.getZ(i):1);
          }
          if(g.index)for(let i=0;i<g.index.count;i++)indices.push(offset+g.index.getX(i));
          else for(let i=0;i<a.position.count;i++)indices.push(offset+i);
        }
        this.scene.remove(mesh);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
      geometry.setIndex(indices);geometry.computeBoundingSphere();
      const merged=new THREE.Mesh(geometry,meshes[0].material);
      merged.castShadow=meshes[0].castShadow;merged.receiveShadow=true;
      this.scene.add(merged);
    }
    console.log(`RANGE: ${placed} scenery assets placed`);
  }

  // ------------------------------------------------------------------------- airfield lights

  buildLamps() {
    const lamps = lampPlacements();
    const glowVertex = `
attribute float glowSize;
varying vec2 uvp;
void main(){
 uvp=position.xy+.5;
 vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
 float size=instanceMatrix[0].x;
 gl_Position=projectionMatrix*(centre+vec4(position.xy*size,0.,0.));
}`;
    const glowFragment = `
varying vec2 uvp;uniform vec3 colour;
void main(){
 float d=length(uvp-.5)*2.;
 gl_FragColor=vec4(colour,pow(max(0.,1.-d),3.)*.85);
}`;
    const bodyGeometry = this.geometryOf('edge_light') || this.geometryOf('lamp')
      || new THREE.CylinderGeometry(0.16, 0.18, 0.26, 8);
    const matrix = new THREE.Matrix4();
    this.lampGlows = [];
    for (const [name, places] of Object.entries(lamps)) {
      if (!places.length) continue;
      const colour = new THREE.Color(LAMP_COLOURS[name]);
      const body = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshBasicMaterial({ color: colour }), places.length);
      places.forEach(([x, y, z], i) => { matrix.makeTranslation(x, y, z); body.setMatrixAt(i, matrix); });
      body.computeBoundingSphere();
      this.scene.add(body);

      // The glow is one instanced billboard mesh per colour. The per-object quaternion trick the
      // old renderer used does not survive instancing, so the facing is done in the vertex shader
      // and the sprite size travels in the instance matrix.
      const glowMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { colour: { value: colour } },
        vertexShader: glowVertex, fragmentShader: glowFragment,
      });
      const glow = new THREE.InstancedMesh(this.quadGeometry, glowMaterial, places.length);
      places.forEach(([x, y, z], i) => {
        const size = name === 'white' ? 2.6 : 2.2;
        matrix.makeScale(size, size, size);
        matrix.setPosition(x, y + 0.15, z);
        glow.setMatrixAt(i, matrix);
      });
      glow.computeBoundingSphere();
      glow.frustumCulled = false;
      this.scene.add(glow);
      this.lampGlows.push(glow);
    }
  }

  // ------------------------------------------------------------------------- clutter

  buildClutter() {
    // A crossed pair of upright quads, one metre high with its base on the ground.
    const crossed = () => {
      const a = new THREE.PlaneGeometry(1, 1);
      a.translate(0, 0.5, 0);
      const b = a.clone();
      b.rotateY(Math.PI / 2);
      const merged = new THREE.BufferGeometry();
      const position = new Float32Array(a.attributes.position.count * 2 * 3);
      const normal = new Float32Array(position.length);
      const uv = new Float32Array(a.attributes.uv.count * 2 * 2);
      position.set(a.attributes.position.array, 0);
      position.set(b.attributes.position.array, a.attributes.position.array.length);
      normal.set(a.attributes.normal.array, 0);
      normal.set(b.attributes.normal.array, a.attributes.normal.array.length);
      uv.set(a.attributes.uv.array, 0);
      uv.set(b.attributes.uv.array, a.attributes.uv.array.length);
      const count = a.attributes.position.count;
      const index = [];
      for (const offset of [0, count]) for (const i of a.index.array) index.push(i + offset);
      merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      merged.setIndex(index);
      return merged;
    };
    const geometry = crossed();
    const random = mulberry32(31337);
    const scatter = (count, stem, height, tint) => {
      const map = this.library.texture(stem);
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({
        map, color: map ? tint : new THREE.Color(tint).multiplyScalar(0.6),
        alphaTest: 0.42, transparent: false, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
      });
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = V3();
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 12) {
        attempts++;
        // Denser near the airfield, thinning out to 1.8 km.
        const angle = random() * Math.PI * 2;
        const radius = 1800 * Math.pow(random(), 0.62);
        const x = Math.cos(angle) * radius;
        const z = -1100 + Math.sin(angle) * radius;
        if (onPavement(x, z)) continue;
        const y = terrainHeight(x, z);
        if (y < -1.5) continue; // no grass on the shore or in the sea
        const s = height * (0.7 + random() * 0.7);
        quaternion.setFromAxisAngle(V3(0, 1, 0), random() * Math.PI);
        scale.set(s, s * (0.8 + random() * 0.5), s);
        matrix.compose(V3(x, y - 0.05, z), quaternion, scale);
        mesh.setMatrixAt(placed, matrix);
        placed++;
      }
      mesh.count = placed;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return placed;
    };
    const grass = scatter(14000, 'grass_tuft', 0.75, 0xb6bd93);
    const gorse = scatter(2500, 'gorse', 1.7, 0x8c9a5e);
    console.log(`RANGE: clutter ${grass} grass tufts, ${gorse} gorse bushes`);
  }

  // ------------------------------------------------------------------------- clouds

  buildClouds() {
    const textures = ['cloud_1', 'cloud_2', 'cloud_3'].map((s) => this.library.texture(s)).filter(Boolean);
    const random = mulberry32(9081);
    const vertexShader = `
varying vec2 uvp;
void main(){
 uvp=position.xy+.5;
 vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
 vec2 size=vec2(instanceMatrix[0].x,instanceMatrix[1].y);
 gl_Position=projectionMatrix*(centre+vec4(position.xy*size,0.,0.));
}`;
    const fragmentShader = `
varying vec2 uvp;uniform sampler2D map;uniform float hasMap;uniform float time;uniform vec3 tint;uniform float strength;
${NOISE_GLSL}
void main(){
 vec2 q=(uvp-.5)*2.;
 float edge=1.-dot(q,q);
 float a;
 vec3 c;
 if(hasMap>.5){
  vec4 t=texture2D(map,uvp);
  a=max(t.a,dot(t.rgb,vec3(.33)))*smoothstep(0.,.35,edge);
  c=tint*(.55+.75*dot(t.rgb,vec3(.33)));
 } else {
  float density=fbm(uvp*vec2(9.,5.)+time*.003);
  a=smoothstep(.02,.55,edge)*smoothstep(.27,.6,density);
  c=tint*(.6+density*.6);
 }
 gl_FragColor=vec4(c,a*strength);
}`;
    const makeBank = (count, place, tint, strength) => {
      const map = textures.length ? textures[Math.floor(random() * textures.length)] : null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          map: { value: map }, hasMap: { value: map ? 1 : 0 }, time: { value: 0 },
          tint: { value: new THREE.Color(tint) }, strength: { value: strength },
        },
        vertexShader, fragmentShader,
      });
      const mesh = new THREE.InstancedMesh(this.quadGeometry, material, count);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const [x, y, z, w, h] = place(i, random);
        matrix.makeScale(w, h, 1);
        matrix.setPosition(x, y, z);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.cloudMaterials.push(material);
      return mesh;
    };
    this.cloudMaterials = [];
    // The high banks that fill the sky in the concept frames.
    makeBank(28, (i, r) => [900 + Math.sin(i * 2.31) * 4200, 760 + (i % 3) * 130,
      -6500 + (i * 683) % 10500, 1600 + (i % 4) * 320, 190 + (i % 3) * 90], 0x51606e, 0.62);
    // A broken deck at 900 to 1100 m over the sea, which is what the cloud-break stage emerges
    // from: sprites near and around the aircraft rather than a wall at the horizon.
    makeBank(36, (i, r) => {
      const angle = r() * Math.PI * 2;
      const radius = 400 + r() * 4200;
      return [1400 + Math.cos(angle) * radius, 900 + r() * 200,
        -2600 + Math.sin(angle) * radius, 600 + r() * 800, 260 + r() * 200];
    }, 0x5a6a78, 0.72);
    // A denser, closer knot of cloud around the cloud-break pose (1600, 1050, -2600), so the frame
    // reads as the aircraft punching up through the deck with cloud wrapping it, not clear air over
    // a distant layer. Sprites sit both below the pose (the deck it climbs out of) and beside it.
    makeBank(30, (i, r) => {
      const angle = r() * Math.PI * 2;
      const radius = 120 + r() * 900;
      return [1600 + Math.cos(angle) * radius, 840 + r() * 320,
        -2600 + Math.sin(angle) * radius - 300, 420 + r() * 520, 200 + r() * 180];
    }, 0x6b7a88, 0.9);
  }

  // The far shore's town, forty lamps sitting three metres above the ground.
  buildTownLights() {
    const random = mulberry32(4242);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { colour: { value: new THREE.Color(0xffd9a0) } },
      vertexShader: `varying vec2 uvp;void main(){uvp=position.xy+.5;vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);float size=instanceMatrix[0].x;gl_Position=projectionMatrix*(centre+vec4(position.xy*size,0.,0.));}`,
      fragmentShader: `varying vec2 uvp;uniform vec3 colour;void main(){float d=length(uvp-.5)*2.;gl_FragColor=vec4(colour,pow(max(0.,1.-d),2.6)*.7);}`,
    });
    const mesh = new THREE.InstancedMesh(this.quadGeometry, material, 40);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const x = 4700 + random() * 1800;
      const z = -6000 + random() * 4000;
      matrix.makeScale(26, 26, 26);
      matrix.setPosition(x, terrainHeight(x, z) + 3, z);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  // ------------------------------------------------------------------------- per frame

  update(dt, flight, camera, elapsed) {
    this.time = elapsed;
    this.oceanMaterial.uniforms.time.value = elapsed;
    for (const material of this.cloudMaterials) material.uniforms.time.value = elapsed;
    this.sky.position.copy(camera.position);
    this.skyMaterial.uniforms.offset.value.set(
      flight.position.x * 0.00003 + elapsed * 0.001, flight.position.z * 0.00003);
    this.ocean.position.x = camera.position.x;
    this.ocean.position.z = camera.position.z;

    // Both shadow cameras follow: the near one on the aircraft, the far one ahead of the camera.
    const forward = V3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    this.aimLight(this.nearLight, flight.position);
    this.aimLight(this.farLight, camera.position.clone().addScaledVector(forward, 250).setY(0));

    // Cloud fog: flying through the deck thickens the fog, so the cloud-break stage reads as
    // coming out of cloud rather than past it.
    const inCloud = Math.exp(-Math.pow((flight.position.y - 980) / 130, 2))
      * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(flight.position.x * 0.0013 + flight.position.z * 0.001)));
    this.scene.fog.density = 0.000105 + inCloud * 0.0008;
  }

  aimLight(light, target) {
    light.target.position.copy(target);
    light.position.copy(target).addScaledVector(SUN_DIRECTION, light.userData.distance);
    light.target.updateMatrixWorld();
  }
}
