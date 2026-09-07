// Acceptance tests for physics.js and control.js (spec 2.8 and 3.6). Run: node tools/test_flight.mjs
// Every assertion prints PASS <name> <json>; the first failure throws.
import assert from 'node:assert/strict';
import { Flight, bombStep, qMax, terrainHeight, onPavement, fbm2, coast } from '../physics.js';
import { Instructor, aimFromAngles } from '../control.js';
import * as THREE from '../vendor/three.module.js';
import { Input } from '../src/input.js';
import { ChaseCamera } from '../src/camera.js';

const dt = 1 / 120;
const DEG = 180 / Math.PI;
const round = (v, n = 3) => +v.toFixed(n);
const pass = (name, data) => console.log('PASS', name, JSON.stringify(data));
const heading = f => { const fw = f.basis().forward; return ((Math.atan2(fw.x, -fw.z) * DEG) + 360) % 360; };
const bank = f => { const { right, up } = f.basis(); return Math.atan2(-right.y, up.y) * DEG; };
const pitchDeg = f => Math.asin(f.basis().forward.y) * DEG;
const dHeading = (a, b) => ((b - a + 540) % 360) - 180; // signed change a -> b, positive clockwise

function simulate(f, seconds, input) {
  for (let t = 0; t < seconds - dt / 2; t += dt) f.step(dt, typeof input === 'function' ? input(f, t) : input);
}
// An aircraft in the air: clean, throttle as given, wheels clear.
function airborne({ x = 0, y = 1000, z = 0, V = 160, throttle = 0.8, gear = false, bombs = 4, pitch = 0, bank = 0 } = {}) {
  const f = new Flight();
  f.position.set(x, y, z); f.velocity.set(0, 0, -V);
  f.attitude.setFromEuler(new THREE.Euler(pitch, 0, -bank, 'YXZ'));
  f.gear = gear; f.gearPosition = gear ? 1 : 0; f.bombs = bombs;
  f.throttle = f.spool = throttle; f.reheat = throttle > 1 ? 1 : 0;
  f.onGround = false; f.grounded = false; f.airborneTime = 30;
  f.legs.forEach(l => { l.contact = false; l.compression = 0; l.load = 0; });
  f.step(dt, {}); // populate the air data
  return f;
}
// The take-off script: full throttle, then from 74 m/s a 0.5 pull released at 7.5 degrees nose up.
const takeoffInput = f => ({ throttle: 1, pitch: f.velocity.length() > 74 ? (f.basis().forward.y < 0.13 ? 0.5 : 0) : 0 });

// --- 1. Take-off (the original test plus spec item 1) -------------------------------------
{
  const f = new Flight();
  // Full throttle with no pull until 70 m/s: the aircraft must stay on all three wheels.
  let t0 = 0;
  while (f.velocity.length() < 70 && t0 < 30) { f.step(dt, { throttle: 1 }); t0 += dt; }
  assert(f.grounded && !f.crashed && t0 < 30, 'Must stay on runway without rotation');
  const runwaySpeed = f.velocity.length();
  const z0 = 85;
  let rotationSpeed = null, liftoff = null, maxAlpha = 0, recontact = false, minClimb = Infinity;
  simulate(f, 14, (f, t) => {
    if (rotationSpeed === null && !f.legs[0].contact) rotationSpeed = f.velocity.length();
    if (liftoff === null && !f.onGround) liftoff = { t, run: z0 - f.position.z, speed: f.velocity.length() };
    if (liftoff && t - liftoff.t <= 3) { maxAlpha = Math.max(maxAlpha, f.alpha); minClimb = Math.min(minClimb, f.velocity.y); }
    if (liftoff && f.onGround) recontact = true;
    return takeoffInput(f);
  });
  assert(!f.onGround && !f.crashed && f.position.y > 25, 'Must take off with deliberate rotation');
  assert(rotationSpeed > 70 && rotationSpeed < 82, `rotation speed ${rotationSpeed}`);
  assert(liftoff && liftoff.run > 300 && liftoff.run < 700, `lift-off run ${liftoff && liftoff.run}`);
  assert(maxAlpha <= 0.30 && !recontact && f.velocity.y > 0, `alpha ${maxAlpha} recontact ${recontact}`);
  pass('takeoff', { runwaySpeed: round(runwaySpeed, 1), rotationSpeed: round(rotationSpeed, 1), liftoffRun: round(liftoff.run, 0), liftoffSpeed: round(liftoff.speed, 1), maxAlpha: round(maxAlpha), altitude: round(f.position.y, 0), speed: round(f.velocity.length(), 1), z: round(f.position.z, 0) });
}

// --- 2. Ballistic bomb with fin drag ------------------------------------------------------
{
  const b = { position: new THREE.Vector3(0, 300, 0), velocity: new THREE.Vector3(0, 0, -130) };
  let impactTime = 0; for (; impactTime < 20; impactTime += dt) if (bombStep(b, dt)) break;
  assert(impactTime > 7 && impactTime < 9 && b.position.z < -900, 'Bomb must fall ballistically and retain forward velocity');
  const dive = Math.atan2(-b.velocity.y, -b.velocity.z) * DEG;
  const water = { position: new THREE.Vector3(3000, 50, -4000), velocity: new THREE.Vector3(0, 0, 0) };
  let waterTime = 0; for (; waterTime < 20; waterTime += dt) if (bombStep(water, dt)) break;
  assert(Math.abs(water.position.y + 7) < 0.5, 'A bomb over water impacts at sea level');
  pass('ballistic bomb', { impactTime: round(impactTime, 2), downrange: round(-b.position.z, 0), diveAngle: round(dive, 1), waterImpactY: round(water.position.y, 2) });
}

// --- 3. Touchdown and braking (original test plus spec item 9) ----------------------------
function approach(vy, gear = true) {
  // 80 m/s trimmed for a steady descent: alpha 0.20 rad gives 1 g at this speed.
  const gamma = Math.atan2(vy, 80);
  const f = airborne({ y: 1.87 + 2.0, z: -100, V: 80, throttle: 0.28, gear, pitch: 0.20 + gamma });
  f.velocity.set(0, vy, -80); f.airborneTime = 60;
  return f;
}
{
  const land = approach(-2);
  let touchdown = null;
  simulate(land, 4, f => { if (!touchdown && f.onGround) touchdown = { vy: f.impact, z: f.position.z, speed: f.velocity.length() }; return { brake: true }; });
  assert(land.landed && !land.crashed && touchdown, `A gentle geared touchdown on runway must survive (${land.crashReason})`);
  simulate(land, 40, { brake: true, throttle: -1 });
  assert(land.velocity.length() < 1 && land.stopped, 'Wheel brakes must stop the aircraft');
  const hard = approach(-7);
  simulate(hard, 4, { brake: true });
  assert(hard.crashed && hard.crashReason === 'impact', `A 7 m/s touchdown must crash with impact, got ${hard.crashReason}`);
  const noGear = approach(-2, false);
  simulate(noGear, 4, { brake: true });
  assert(noGear.crashed && noGear.crashReason === 'gear', `Gear-up touchdown must crash with gear, got ${noGear.crashReason}`);
  pass('touchdown and braking', { touchdownVy: round(touchdown.vy, 2), touchdownSpeed: round(touchdown.speed, 1), stopRun: round(touchdown.z - land.position.z, 0), hard: hard.crashReason, noGear: noGear.crashReason });
}

// --- 4. Hard landing rejection (original) -------------------------------------------------
{
  const bad = airborne({ y: 3, z: -100, V: 85 });
  bad.velocity.set(0, -12, -85);
  simulate(bad, 1, {});
  assert(bad.crashed, 'Hard belly impact must fail');
  pass('hard landing rejection', { reason: bad.crashReason });
}

// --- 5. Timestep stability (original, spec item 6) ----------------------------------------
{
  const a = new Flight(), c = new Flight();
  simulate(a, 8, takeoffInput);
  for (let i = 0; i < 8 * 60; i++) c.step(1 / 60, takeoffInput(c));
  const gap = a.position.distanceTo(c.position);
  assert(gap < 5, `Physics must be stable across frame rates (${gap} m)`);
  pass('timestep stability', { gap: round(gap, 3), speed120: round(a.velocity.length(), 2), speed60: round(c.velocity.length(), 2) });
}

// --- 6. Inertial banked turn (original) ---------------------------------------------------
{
  const turn = airborne({ V: 165, throttle: 0.55 });
  const initialDirection = turn.velocity.clone().normalize();
  simulate(turn, 0.25, { roll: 0.8 });
  const initialTurn = turn.velocity.clone().normalize().angleTo(initialDirection);
  assert(initialTurn < 0.02, 'Roll input must not instantly rotate the flight path');
  simulate(turn, 1, { roll: 0.65 });
  simulate(turn, 10, { pitch: 0.17 });
  const finalTurn = turn.velocity.clone().normalize().angleTo(initialDirection);
  assert(finalTurn > 0.15 && !turn.crashed, 'Banked lift must turn the aircraft progressively');
  assert(dHeading(0, heading(turn)) > 0, 'A right bank must increase heading');
  pass('inertial banked turn', { initialDegrees: round(initialTurn * DEG, 3), finalDegrees: round(finalTurn * DEG, 1), heading: round(heading(turn), 1), altitude: round(turn.position.y, 0) });
}

// --- 7. Low-speed energy loss (original) --------------------------------------------------
{
  const slow = airborne({ y: 600, V: 40, throttle: 0 });
  simulate(slow, 4, { pitch: 1 });
  assert(slow.position.y < 575 && slow.velocity.y < 0, 'A slow aircraft must lose height even with aft stick');
  pass('low-speed energy loss', { altitude: round(slow.position.y, 1), verticalSpeed: round(slow.velocity.y, 2), alpha: round(slow.alpha) });
}

// --- 8. 1 g stall speed (spec item 2) -----------------------------------------------------
{
  const f = airborne({ y: 100, V: 100, throttle: 0 });
  const y0 = f.position.y;
  let stallV = null;
  simulate(f, 40, f => {
    if (stallV === null && f.velocity.y < -3) stallV = f.ias;
    // Height hold through the stick; saturates when the alpha cap can no longer hold level flight.
    return { pitch: THREE.MathUtils.clamp(-0.6 * f.velocity.y - 0.02 * (f.position.y - y0), -1, 1) };
  });
  assert(stallV !== null && stallV > 58 && stallV < 70, `1 g stall speed ${stallV}`);
  pass('stall speed', { stallSpeedIas: round(stallV, 1), predicted: round(f.stallSpeed, 1), mass: f.mass });
}

// --- 9. Roll rate (spec item 3) -----------------------------------------------------------
{
  const clean = airborne({ V: 200, bombs: 0 });
  let peak = 0, reached = null;
  simulate(clean, 1, (f, t) => { const p = -f.omega.z; peak = Math.max(peak, p); if (reached === null && p >= 3) reached = t; return { roll: 1 }; });
  assert(reached !== null, `full roll input must reach 3 rad/s within 1 s (peak ${peak})`);
  const dirty = airborne({ V: 75, gear: true, bombs: 4 });
  let dirtyPeak = 0;
  simulate(dirty, 3, f => { dirtyPeak = Math.max(dirtyPeak, Math.abs(f.omega.z)); return { roll: 1 }; });
  assert(dirtyPeak < 1.6 && !dirty.crashed, `dirty roll rate ${dirtyPeak}`);
  pass('roll rate', { cleanPeak: round(peak, 2), timeTo3: round(reached, 2), dirtyPeak: round(dirtyPeak, 2) });
}

// --- 10. Energy bleed in a 6 g turn (spec item 4) -----------------------------------------
{
  // The turn is established first (the load takes about 4 s to build through the alpha mode and
  // the FCS integrator), then held for the measured 10 s. Throttle 0.8 is topped up to keep it
  // at 0.8 while the speed falls, so the bleed is the airframe's, not a throttle drift.
  const f = airborne({ V: 250, throttle: 0.8, bank: 1.40 });
  const turnInput = f => {
    const V = f.velocity.length(); const { pull } = qMax(V);
    const phi = bank(f) / DEG;
    return { pitch: Math.min(1, 6 * 9.81 / V / pull), roll: THREE.MathUtils.clamp(2 * (1.40 - phi), -1, 1) };
  };
  simulate(f, 4, turnInput);
  const V0 = f.velocity.length(), n0 = f.load;
  let minLoad = Infinity, maxLoad = 0;
  simulate(f, 10, f => { minLoad = Math.min(minLoad, f.load); maxLoad = Math.max(maxLoad, f.load); return turnInput(f); });
  const bleed = V0 - f.velocity.length();
  assert(n0 > 5.5 && bleed >= 15 && !f.crashed, `6 g turn: load ${n0} at the start, bled ${bleed} m/s`);
  pass('energy bleed', { entrySpeed: round(V0, 1), bleed: round(bleed, 1), loadRange: [round(minLoad, 2), round(maxLoad, 2)], altitude: round(f.position.y, 0) });
}

// --- 11. Wheels: parked settle, no creep, braking distance (spec item 5) ------------------
{
  const f = new Flight();
  simulate(f, 3, { brake: true });
  const settledPitch = pitchDeg(f);
  assert(Math.abs(settledPitch) < 1 && f.grounded, `parked pitch ${settledPitch}`);
  const start = f.position.clone();
  simulate(f, 30, { brake: true });
  const creep = f.position.distanceTo(start);
  assert(creep < 0.05 && f.stopped && !f.crashed, `parked aircraft crept ${creep} m`);
  const roll = new Flight();
  roll.velocity.set(0, 0, -60); roll.throttle = roll.spool = 0;
  const z0 = roll.position.z;
  simulate(roll, 40, { brake: true });
  const run = z0 - roll.position.z;
  assert(roll.stopped && run < 900, `braking run ${run} m`);
  pass('wheels', { settledPitch: round(settledPitch, 2), height: round(f.position.y, 3), creep: round(creep, 4), load: round(f.load, 3), legs: f.legs.map(l => round(l.compression, 3)), brakingRun: round(run, 0) });
}

// --- 12. Rudder (spec item 7) -------------------------------------------------------------
{
  const f = airborne({ V: 160 });
  const h0 = heading(f);
  simulate(f, 2, { yaw: 1 });
  const change = dHeading(h0, heading(f));
  assert(change > 1 && !f.crashed, `rudder heading change ${change}`);
  pass('rudder', { headingChange: round(change, 2), beta: round(f.beta), rudder: round(f.surfaces.rudder) });
}

// --- 13. Instructor tests (spec 3.6) ------------------------------------------------------
function fly(f, seconds, aimFn, keys = {}, watch = () => {}) {
  const ins = new Instructor();
  for (let t = 0; t < seconds - dt / 2; t += dt) {
    const aim = aimFn(f, t);
    const cmd = ins.update(dt, f, aim, typeof keys === 'function' ? keys(f, t) : keys);
    f.step(dt, cmd);
    watch(f, t, ins);
  }
  return ins;
}
const aimAt = (az, el) => f => ({ direction: aimFromAngles(f, az / DEG, el / DEG), active: true });
{
  const f = airborne();
  const h0 = heading(f), y0 = f.position.y;
  let maxBank = 0, maxDy = 0;
  fly(f, 8, aimAt(15, 0), {}, f => { maxBank = Math.max(maxBank, Math.abs(bank(f))); maxDy = Math.max(maxDy, Math.abs(f.position.y - y0)); });
  const change = dHeading(h0, heading(f));
  assert(change >= 20 && change <= 90 && maxDy < 120 && !f.crashed && maxBank < 75, `aim 15 right: heading ${change} dy ${maxDy} bank ${maxBank}`);
  pass('instructor aim 15 right', { headingChange: round(change, 1), maxBank: round(maxBank, 1), maxHeightChange: round(maxDy, 1), speed: round(f.velocity.length(), 1) });
}
{
  const f = airborne({ bank: 60 / DEG });
  let levelAt = null;
  fly(f, 4, aimAt(0, 0), {}, (f, t) => { if (levelAt === null && Math.abs(bank(f)) < 5) levelAt = t; });
  assert(levelAt !== null && Math.abs(bank(f)) < 5 && !f.crashed, `bank recovery: level at ${levelAt}, bank ${bank(f)}`);
  pass('instructor level from 60 bank', { levelAt: round(levelAt, 2), finalBank: round(bank(f), 2) });
}
{
  // Idle throttle: at 0.8 the aircraft climbs at 35 degrees without ever slowing below 1.10 vs
  // (75 m/s true at 1000 m is 71.2 indicated against a 71.1 threshold), so the guard never sees it.
  const f = airborne({ V: 75, throttle: 0 });
  let maxAlpha = 0, maxGuard = 0, minIas = Infinity;
  fly(f, 10, aimAt(0, 20), {}, (f, t, ins) => { maxAlpha = Math.max(maxAlpha, f.alpha); maxGuard = Math.max(maxGuard, ins.state.stallGuard); minIas = Math.min(minIas, f.ias); });
  assert(!f.crashed && maxAlpha <= 0.36 && maxGuard > 0, `slow pull: alpha ${maxAlpha} guard ${maxGuard}`);
  pass('instructor stall guard', { maxAlpha: round(maxAlpha), maxGuard: round(maxGuard, 2), minIas: round(minIas, 1), stallSpeed: round(f.stallSpeed, 1), finalSpeed: round(f.velocity.length(), 1), altitude: round(f.position.y, 0) });
}
{
  const f = airborne({ V: 120 });
  const y0 = f.position.y;
  let maxBank = 0, maxDy = 0;
  fly(f, 20, () => ({ direction: null, active: false }), {}, f => { maxBank = Math.max(maxBank, Math.abs(bank(f))); maxDy = Math.max(maxDy, Math.abs(f.position.y - y0)); });
  assert(maxDy < 150 && maxBank < 5 && !f.crashed, `hands off: dy ${maxDy} bank ${maxBank}`);
  pass('instructor hands off', { maxHeightChange: round(maxDy, 1), maxBank: round(maxBank, 2), finalVerticalSpeed: round(f.velocity.y, 2), speed: round(f.velocity.length(), 1) });
}
{
  const f = airborne();
  const p0 = pitchDeg(f);
  let maxBank = 0, minLoad = Infinity;
  fly(f, 3, aimAt(0, -12), {}, f => { maxBank = Math.max(maxBank, Math.abs(bank(f))); minLoad = Math.min(minLoad, f.load); });
  assert(pitchDeg(f) < p0 - 2 && maxBank < 15 && minLoad > -1 && !f.crashed, `push: pitch ${pitchDeg(f)} bank ${maxBank} load ${minLoad}`);
  pass('instructor push', { pitch: round(pitchDeg(f), 1), maxBank: round(maxBank, 2), minLoad: round(minLoad, 2) });
}
{
  const f = airborne();
  const h0 = heading(f);
  let bankAt = null;
  fly(f, 6, aimAt(60, 0), {}, (f, t) => { if (bankAt === null && bank(f) > 60) bankAt = t; });
  const change = dHeading(h0, heading(f));
  assert(bankAt !== null && bankAt < 2 && change >= 40 && !f.crashed, `aim 60 right: bank at ${bankAt} heading ${change}`);
  pass('instructor aim 60 right', { bankAt: round(bankAt, 2), headingChange: round(change, 1), altitude: round(f.position.y, 0) });
}
{
  const f = new Flight();
  let rotatedEarly = false, liftoff = null, maxAlpha = 0, recontact = false, Vr = 0;
  fly(f, 30, f => { Vr = 1.12 * f.stallSpeed; return f.ias >= Vr ? aimAt(0, 10)(f) : aimAt(0, 0)(f); }, { throttle: 1 }, (f, t) => {
    if (f.ias < Vr && !f.legs[0].contact) rotatedEarly = true;
    if (liftoff === null && !f.onGround) liftoff = { t, speed: f.velocity.length(), run: 85 - f.position.z };
    if (liftoff && t - liftoff.t <= 3) maxAlpha = Math.max(maxAlpha, f.alpha);
    if (liftoff && f.onGround) recontact = true;
  });
  assert(!rotatedEarly && liftoff && liftoff.t < 20 && maxAlpha <= 0.30 && !recontact && !f.crashed, `ground: early ${rotatedEarly} liftoff ${liftoff && liftoff.t} alpha ${maxAlpha} recontact ${recontact} ${f.crashReason}`);
  pass('instructor ground take-off', { Vr: round(Vr, 1), liftoffTime: round(liftoff.t, 1), liftoffSpeed: round(liftoff.speed, 1), liftoffRun: round(liftoff.run, 0), maxAlpha: round(maxAlpha), altitude: round(f.position.y, 0) });
}
{
  const f = airborne({ y: 210, z: 4300, V: 82, throttle: 0.3, gear: true, pitch: 0.16 });
  f.velocity.set(0, -82 * Math.sin(3 / DEG), -82 * Math.cos(3 / DEG));
  const threshold = new THREE.Vector3(0, 0, 300);
  let flare = false, touchdown = null;
  fly(f, 90, f => {
    if (!flare && f.position.y - 1.87 < 12) flare = true;
    // The flare holds the path level and lets the speed decay onto the runway. Aiming above the
    // horizontal instead balloons the aircraft and it arrives slow and out of ideas.
    if (flare) return { direction: new THREE.Vector3(0, 0, -1), active: true };
    return { direction: threshold.clone().sub(f.position).normalize(), active: true };
  }, f => ({
    // The approach holds 82 m/s through the throttle key; the flare pulls it to idle.
    throttle: flare ? -1 : (f.ias > 83 ? -1 : f.ias < 81 ? 1 : 0),
    brake: !!touchdown,
  }), (f, t) => {
    if (!touchdown && f.onGround) touchdown = { t, vy: f.impact, x: f.position.x, z: f.position.z, speed: f.velocity.length(), pitch: pitchDeg(f) };
  });
  assert(touchdown && touchdown.vy < 3.5 && !f.crashed, `landing: touchdown ${JSON.stringify(touchdown)} ${f.crashReason}`);
  assert(f.stopped && touchdown.z - f.position.z < 1500, `landing roll ${touchdown && touchdown.z - f.position.z}`);
  assert(Math.abs(touchdown.x) < 31 && touchdown.z < 300 && touchdown.z > -2500, 'touchdown on the runway');
  pass('instructor landing', { touchdownVy: round(touchdown.vy, 2), touchdownSpeed: round(touchdown.speed, 1), touchdownZ: round(touchdown.z, 0), touchdownX: round(touchdown.x, 1), pitchAtTouchdown: round(touchdown.pitch, 1), rollOut: round(touchdown.z - f.position.z, 0) });
}
{
  const f = airborne();
  const h0 = heading(f);
  const ins = new Instructor(); ins.mode = 'manual';
  for (let t = 0; t < 6.3; t += dt) f.step(dt, ins.update(dt, f, { direction: null, active: false }, { roll: t < 0.3 ? 1 : 0 }));
  const change = dHeading(h0, heading(f));
  assert(change > 5 && !f.crashed, `manual roll: heading change ${change}`);
  pass('instructor manual', { headingChange: round(change, 1), bank: round(bank(f), 1), regime: ins.state.regime });
}

// --- 13b. Ground handling: a full rudder taxi turn must not roll the aircraft over ----------
{
  const report = [];
  for (const V of [5, 20]) {
    const f = new Flight();
    f.velocity.set(0, 0, -V);
    let maxBank = 0;
    for (let t = 0; t < 8; t += dt) {
      f.step(dt, { yaw: 1, throttle: 0.15 });
      maxBank = Math.max(maxBank, Math.abs(bank(f)));
      if (f.crashed) break;
    }
    // Off the pavement at speed the aircraft is allowed to crash on 'terrain'; what it must never
    // do is lift a main wheel and roll over on tyre side force alone.
    assert(maxBank < 10 && f.crashReason !== 'attitude', `taxi ${V} m/s: bank ${maxBank} ${f.crashReason}`);
    report.push({ speed: V, maxBank: round(maxBank, 2), steering: round(f.surfaces.steering, 3) });
  }
  pass('taxi turn', report);
}
{
  // Turning hard at the stall: the instructor must trade height for speed and recover, never
  // hold a bank the wing cannot support until the aircraft mushes into the ground.
  const f = airborne({ V: 62, throttle: 1 });
  let maxBank = 0, maxAlpha = 0;
  const y0 = f.position.y;
  fly(f, 10, aimAt(20, 0), {}, f => { maxBank = Math.max(maxBank, Math.abs(bank(f))); maxAlpha = Math.max(maxAlpha, f.alpha); });
  const lost = y0 - f.position.y;
  assert(!f.crashed && maxAlpha <= 0.32 && lost < 400 && f.ias > f.stallSpeed,
    `low speed turn: bank ${maxBank} alpha ${maxAlpha} lost ${lost} ias ${f.ias} ${f.crashReason}`);
  pass('hard turn at the stall', { maxBank: round(maxBank, 1), maxAlpha: round(maxAlpha, 3), heightLost: round(lost, 0), speed: round(f.velocity.length(), 1) });
}

{
  // A sustained level turn on the cursor must hold its height. This is the behaviour that felt
  // wrong: measuring the sideways error inside the tilted path frame inflated it as the aircraft
  // descended, which deepened the bank, which steepened the descent.
  const report = [];
  for (const [V, gear] of [[95, true], [150, false], [220, false]]) {
    const f = airborne({ V, gear, y: 400, throttle: 0.55 });
    f.bombs = 0; f.mass = 14200;
    const instructor = new Instructor();
    const y0 = f.position.y;
    let maxBank = 0, minY = Infinity;
    for (let t = 0; t < 60; t += dt) {
      const h = new THREE.Vector3(f.velocity.x, 0, f.velocity.z).normalize();
      const direction = h.applyAxisAngle(new THREE.Vector3(0, 1, 0), -8 / DEG);
      const cmd = instructor.update(dt, f, { direction, active: true },
        { throttle: f.ias > V + 4 ? -1 : f.ias < V - 4 ? 1 : 0 });
      f.step(dt, cmd);
      maxBank = Math.max(maxBank, Math.abs(bank(f)));
      minY = Math.min(minY, f.position.y);
    }
    assert(!f.crashed && Math.abs(f.position.y - y0) < 60 && y0 - minY < 60 && maxBank < 60,
      `level turn at ${V}: bank ${maxBank} height ${y0} to ${f.position.y} low ${minY} ${f.crashReason}`);
    report.push({ speed: V, maxBank: round(maxBank, 1), heightChange: round(f.position.y - y0, 0), lowest: round(minY, 0) });
  }
  pass('level turn holds height', report);
}

// --- 14. Shared numbers: terrain, pavement, noise range ------------------------------------
{
  const samples = [[0, 0], [-1000, -4200], [900, -3000], [3000, -4000], [5500, -4000]].map(([x, z]) => [x, z, +terrainHeight(x, z).toFixed(6)]);
  assert(onPavement(0, 0) && onPavement(-425, -620) && !onPavement(100, 0), 'pavement lookup');
  let lo = 1, hi = -1;
  for (let i = 0; i < 4000; i++) { const v = fbm2(i * 0.37, i * 0.11); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert(lo >= -1 && hi <= 1 && hi - lo > 0.5, `fbm2 range ${lo}..${hi}`);
  const parked = new Flight(); parked.step(dt, {});
  assert([parked.alpha, parked.beta, parked.ias, parked.mach, parked.load].every(Number.isFinite), 'no NaN at V = 0');
  pass('shared numbers', { terrain: samples, coastAt0: round(coast(0), 1), fbm2Range: [round(lo), round(hi)] });
}
console.log('ALL PASS');

// The instructor must also work with the actual camera and persistent mouse target.
// Synthetic aimFromAngles tests alone cannot detect camera feedback causing a dive.
{
  globalThis.window = Object.assign(new EventTarget(), {innerWidth:1920, innerHeight:1080});
  globalThis.document = new EventTarget();
  for (const offset of [0, 280]) {
    const canvas = new EventTarget(); document.pointerLockElement = canvas;
    const input = new Input(canvas), f = airborne(), instructor = new Instructor(), chase = new ChaseCamera(16/9);
    chase.update(1/60, f, null, true, true); input.pendingMouse.x = offset;
    let lowest = f.position.y;
    for (let i=0;i<1800;i++) {
      const aim = input.aim(chase.camera);
      for (let k=0;k<2;k++) f.step(dt, instructor.update(dt,f,aim,{}));
      chase.update(1/60,f,aim,true); lowest=Math.min(lowest,f.position.y);
    }
    assert(!f.crashed && lowest>950, 'Camera ray must not feed a dive into the instructor');
    assert(Math.abs(input.cursor.x)<20, 'The aircraft must catch the selected world aim');
    if(offset) assert(heading(f)>8 && heading(f)<25, 'Mouse right must produce a bounded right turn');
    pass('camera and mouse '+offset, {altitude:round(f.position.y),lowest:round(lowest),cursor:round(input.cursor.x),heading:round(heading(f))});
    input.keys.add('KeyD'); input.keys.add('KeyW');
    const keys=input.commands(), cmd=instructor.update(dt,f,input.aim(chase.camera),keys);
    assert(cmd.roll===1 && cmd.throttle===1,'Keyboard must retain roll and throttle authority');
    const stable=input.worldAim.clone();chase.toggle();chase.update(1/60,f,input.aim(chase.camera),true);
    assert(stable.distanceTo(input.aim(chase.camera).direction)<1e-10,'Camera toggle must preserve the world target');
  }
  delete globalThis.window;delete globalThis.document;
  pass('keyboard priority and camera toggle',{});
}
