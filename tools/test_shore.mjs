// Shore classification regression: the "sea walls with land behind them" defect. The land raise in
// src/shore.js must not climb above the wall coping (or it buries the wall in land), and the coast's
// seaward side must not be classified as land (or raised terrain appears on the wrong face of a wall).
// Run: node tools/test_shore.mjs  (also chained from tools/test_flight.mjs).
import assert from 'node:assert/strict';
import { SHORE } from '../src/shore-data.js';
import { shoreSample, shoreHeight } from '../src/shore.js';

const SEA = -82.6, COPING = SEA + 4.7;
const landNormal = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dx, dz); return m < 1e-9 ? null : [dz / m, -dx / m]; };

// 1. The raise never exceeds the wall coping. Feed a low DEM so the artificial raise, not real
//    terrain, is what shoreHeight returns; sample a band inland and seaward of many coastline points.
let maxRaise = -Infinity, samples = 0;
for (const line of SHORE) for (let i = 0; i < line.length; i += 9) {
  const [x, z] = line[i];
  for (const dx of [-160, -60, -15, 15, 60, 160]) for (const dz of [-160, -60, 15, 60, 160]) {
    maxRaise = Math.max(maxRaise, shoreHeight(x + dx, z + dz, SEA - 10, SEA)); samples++;
  }
}
assert(maxRaise <= COPING + 1e-6, `land raise ${maxRaise.toFixed(2)} exceeds the wall coping ${COPING}`);
console.log('PASS shore raise stays below the wall coping', JSON.stringify({ samples, maxRaise: +maxRaise.toFixed(2), coping: COPING }));

// 2. At coastline corners the two sides classify oppositely, and the seaward side is never raised as
//    land. The old single-nearest-segment test flipped at concave corners and harbour mouths, which
//    is what put land on a wall's seaward face; the neighbour-averaged normal fixes it.
// Probe 8 m off the vertex so the sample stays local to the corner rather than crossing a short
// adjacent segment (real coastline carries slipways, piers and detached rock ways).
let pairs = 0, opposite = 0, seaRaised = 0;
for (const line of SHORE) {
  if (line.length < 3) continue;
  for (let i = 1; i < line.length - 1; i += 3) {
    const n1 = landNormal(line[i - 1], line[i]), n2 = landNormal(line[i], line[i + 1]);
    if (!n1 || !n2) continue;
    let nx = n1[0] + n2[0], nz = n1[1] + n2[1]; const m = Math.hypot(nx, nz);
    if (m < 1e-6) continue; nx /= m; nz /= m;
    const [bx, bz] = line[i];
    pairs++;
    if (shoreSample(bx + nx * 8, bz + nz * 8).land && !shoreSample(bx - nx * 8, bz - nz * 8).land) opposite++;
    // The user-facing invariant: the seaward side of the coast must not be raised as land.
    if (shoreHeight(bx - nx * 8, bz - nz * 8, SEA - 8, SEA) > SEA + 2.7) seaRaised++;
  }
}
assert(seaRaised / pairs < 0.05, `${seaRaised}/${pairs} seaward samples wrongly raised to land`);
assert(opposite / pairs > 0.9, `corner sides opposite on only ${(100 * opposite / pairs) | 0}% of ${pairs} vertices`);
console.log('PASS coast corners classify consistently and the seaward side is not raised', JSON.stringify({ pairs, oppositePct: Math.round(100 * opposite / pairs), seaRaisedPct: +(100 * seaRaised / pairs).toFixed(1) }));
