// The packed library decodes: every asset present, triangles as the manifest says, positions inside
// their bounds, normals unit length, indices inside the part. Reads assets/library.json and .bin.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Library, buildMaterials, buildGeometries } from '../src/loader.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('assets/library.json', root)), 'utf8'));
const binary = new Uint8Array(readFileSync(fileURLToPath(new URL('assets/library.bin', root))));
const pass = (name, data = {}) => console.log('PASS', name, JSON.stringify(data));

assert.equal(manifest.version, 3, 'the packed library is version 3');
const library = new Library(manifest, binary);
buildMaterials(library, null);
buildGeometries(library);

const names = Object.keys(manifest.assets);
assert.deepEqual(Object.keys(library.geometries).sort(), names.sort(), 'every asset decodes');
const expected = names.reduce((sum, n) => sum + manifest.assets[n].reduce((s, p) => s + p.indexCount / 3, 0), 0);
assert.equal(library.triangles, expected, 'triangle count matches the manifest');

// The Blender export carries a few zero normals of its own (24 in the MiG); those are not the
// decoder's to fix, so the unit-length check skips them and counts them.
let worstNormal = 0, checked = 0, zeroed = 0;
for (const name of names) {
  for (const [i, part] of library.geometries[name].entries()) {
    const meta = manifest.assets[name][i], g = part.geometry;
    const position = g.getAttribute('position'), normal = g.getAttribute('normal'), index = g.getIndex();
    for (let v = 0; v < position.count; v += Math.max(1, Math.floor(position.count / 200))) {
      for (const [k, get] of [['x', 'getX'], ['y', 'getY'], ['z', 'getZ']].map(([k, f], j) => [j, f])) {
        const value = position[get](v);
        assert(value >= meta.bounds[k] - 1e-3 && value <= meta.bounds[k + 3] + 1e-3, `${name} position inside bounds`);
      }
      const length = Math.hypot(normal.getX(v), normal.getY(v), normal.getZ(v));
      if (length < 0.5) zeroed++;
      else worstNormal = Math.max(worstNormal, Math.abs(length - 1));
      checked++;
    }
    let maxIndex = 0;
    for (let k = 0; k < index.count; k++) maxIndex = Math.max(maxIndex, index.getX(k));
    assert(maxIndex < position.count, `${name} indices inside the part`);
    assert.equal(index.array.BYTES_PER_ELEMENT, meta.indexBytes, `${name} index width as declared`);
    assert(g.boundingSphere.radius > 0, `${name} has a bounding sphere`);
  }
}
assert(worstNormal < 0.02, `int8 normals stay unit length, worst ${worstNormal}`);
assert(zeroed <= 30, `source zero normals stay rare, ${zeroed} sampled`);
pass('packed library decodes', { assets: names.length, triangles: library.triangles, sampledVertices: checked, worstNormalError: Number(worstNormal.toFixed(4)), sourceZeroNormals: zeroed });
// Geographic placement is baked into these meshes. Check it independently of the scene labels
// so an accidental rotation, recentering or double translation cannot move Gorey to St Catherine's.
const a=82.8*Math.PI/180;
for(const [name,latMin,latMax,lonMin,lonMax] of [
  ['landmark_2',49.1985,49.2005,-2.021,-2.018],
  ['landmark_6',49.2218,49.2252,-2.021,-2.010],
]) {
  assert(library.has(name),`${name} must be in both render tiers`);
  for(const part of library.geometries[name]) {
    const p=part.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),z=p.getZ(i)+1100;
      const lat=49.2080555556+(-x*Math.sin(a)-z*Math.cos(a))/(111320*.85);
      const lon=-2.1955555556+(x*Math.cos(a)-z*Math.sin(a))/(73000*.85);
      assert(lat>=latMin&&lat<=latMax&&lon>=lonMin&&lon<=lonMax,`${name} remains on its mapped site`);
    }
  }
}
pass('Gorey and St Catherine geometry remains on the correct geographic sites');
console.log('ALL LIBRARY CHECKS PASS');
