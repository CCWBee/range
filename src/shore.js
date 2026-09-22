import { SHORE } from './shore-data.js';

// The OpenStreetMap coastline, bucketed into a coarse grid for nearest-segment lookup. Each stored
// segment carries its own land-ward normal and those of its two neighbours in the same way, so the
// side test stays consistent where a point's nearest coastline point is a shared vertex. Land is the
// side the polygon interior lies on; with the OSM winding under this projection that is the +normal
// side, where normal = (dz, -dx) for a segment running (dx, dz). See tools/test_shore.mjs.
// Numeric keys (no string per lookup) and one shared result object: shoreSample runs inside every
// terrainHeight call, so it sits under clearSight, the bomb predictor, sparks, wheel contacts and the
// load-time bakes.
const buckets = new Map(), cell = 300;
const cellKey = (ix, iz) => (ix + 1024) * 4096 + (iz + 1024);
const sample = { distance: Infinity, land: false };
function landNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dx, dz);
  return m < 1e-9 ? null : [dz / m, -dx / m];
}
for (const line of SHORE) for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i];
  const n = landNormal(a, b);
  if (!n) continue;
  // Neighbour land-normals, for averaging when the nearest point clamps to a shared vertex. At a
  // way's ends there is no neighbour, so the segment's own normal stands in.
  const pn = (i >= 2 && landNormal(line[i - 2], a)) || n;
  const nn = (i + 1 < line.length && landNormal(b, line[i + 1])) || n;
  const seg = { a, b, nx: n[0], nz: n[1], pnx: pn[0], pnz: pn[1], nnx: nn[0], nnz: nn[1] };
  for (let x = Math.floor(Math.min(a[0], b[0]) / cell) - 1; x <= Math.floor(Math.max(a[0], b[0]) / cell) + 1; x++)
    for (let z = Math.floor(Math.min(a[1], b[1]) / cell) - 1; z <= Math.floor(Math.max(a[1], b[1]) / cell) + 1; z++) {
      const key = cellKey(x, z); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(seg);
    }
}
// Returns a shared object: read distance and land before the next call.
export function shoreSample(x, z) {
  let best = Infinity, land = false;
  for (const s of buckets.get(cellKey(Math.floor(x / cell), Math.floor(z / cell))) || []) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / Math.max(1, l)));
    const px = s.a[0] + t * dx, pz = s.a[1] + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      // Land-ward normal at the nearest point: the segment's own mid-span, or the sum of the two
      // adjacent segments' normals at a shared vertex, which is what stops the classification
      // flipping across a concave corner or a harbour mouth and raising 'land' on the seaward side.
      let lnx = s.nx, lnz = s.nz;
      if (t <= 0) { lnx += s.pnx; lnz += s.pnz; } else if (t >= 1) { lnx += s.nnx; lnz += s.nnz; }
      land = (x - px) * lnx + (z - pz) * lnz > 0;
    }
  }
  sample.distance = best; sample.land = land;
  return sample;
}
export function shoreHeight(x, z, height, sea) {
  return shoreHeightFrom(shoreSample(x, z), x, z, height, sea);
}
// The same for a caller that already holds this point's shoreSample (the water bake).
export function shoreHeightFrom(s, x, z, height, sea) {
  if (s.distance > 250) return height;
  // Restore dry mapped land lost in coarse coastal DEM cells. Do not lower real cliffs, and cap the
  // inland ramp below the sea walls' coping (about sea + 4.7) so the terrain never climbs over a
  // wall and buries it in land behind. The base raise fills the immediate shore; the DEM wins inland.
  if (s.land) return Math.max(height, sea + 2.8 + Math.min(1.8, s.distance * .035));
  // Mid-tide beach exposure in the broad western and southern bays, not the rocky north coast.
  const a = 82.8 * Math.PI / 180, e = x * Math.cos(a) - (z + 1100) * Math.sin(a), n = -x * Math.sin(a) - (z + 1100) * Math.cos(a);
  const lon = -2.1955555556 + e / (73000 * .85), lat = 49.2080555556 + n / (111320 * .85);
  const sandy = (lon < -2.215 && lat > 49.183 && lat < 49.235) || (lat < 49.198 && lon > -2.175 && lon < -2.12) || (lat > 49.177 && lat < 49.19 && lon > -2.205 && lon < -2.18);
  if (sandy && s.distance < 180) return Math.max(height, sea + 2.1 - s.distance * .025);
  return height;
}
