// Behaviour checks for the touch layer, independent of a phone and a DOM.
// Spec: docs/specs/2026-09-10-range-mobile.md section 10.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Flight } from '../physics.js';
import { Instructor } from '../control.js';
import { Input } from '../src/input.js';
import {
  upFromOrientation, calibrate, tiltFromUp, shape, aimFromTilt, seekerLabel, autoGear, releaseBomb,
  seekerPress, throttleCommands, ROLL_DEAD, ROLL_LIMIT, PITCH_DEAD, PITCH_LIMIT, AZIMUTH_MAX, ELEVATION_MAX,
} from '../src/touch.js';

const V3 = (...v) => new THREE.Vector3(...v), dt = 1 / 120, DEG = Math.PI / 180;
const pass = (name, data = {}) => console.log('PASS', name, JSON.stringify(data));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
function airborne(direction = V3(0, 0, -1)) {
  const f = new Flight(); f.position.set(0, 2200, 0); f.velocity.copy(direction).multiplyScalar(250);
  f.attitude.setFromUnitVectors(V3(0, 0, -1), direction); f.gear = false; f.gearPosition = 0;
  f.onGround = false; f.grounded = false; f.airborneTime = 30; f.throttle = f.spool = 1.1; return f;
}

globalThis.window ||= Object.assign(new EventTarget(), { innerWidth: 932, innerHeight: 430 });
globalThis.document ||= new EventTarget();

{
  // The three poses of spec section 2.
  assert(upFromOrientation(0, 0).distanceTo(V3(0, 0, 1)) < 1e-9, 'flat and screen-up is +Z');
  assert(upFromOrientation(90, 0).distanceTo(V3(0, 1, 0)) < 1e-9, 'upright portrait is +Y');
  assert(upFromOrientation(0, 90).distanceTo(V3(-1, 0, 0)) < 1e-9, 'right edge down is -X');
  pass('earth-up from the W3C angles');
}

{
  // A phone held sideways, top edge to the left, tilted 40 degrees back: screen-up is device +X.
  const u0 = V3(Math.cos(40 * DEG), 0, Math.sin(40 * DEG));
  const frame = calibrate(u0);
  assert(near(frame.sUp.x, 1) && near(frame.sUp.y, 0), 'screen-up is the projection of earth-up at capture');
  assert(near(frame.sRight.x, 0) && near(frame.sRight.y, -1), 'screen-right is screen-up turned clockwise');
  assert(near(frame.neutralPitch, 40 * DEG), 'the neutral pitch is the hold angle');
  const rest = tiltFromUp(u0, frame);
  assert(near(rest.roll, 0) && near(rest.pitch, 0), 'the neutral sample reads zero');
  // Right edge down by 20 degrees: the device turns clockwise as the player sees it, so earth-up
  // turns anticlockwise in device coordinates, which is +20 degrees about device Z.
  const rolled = u0.clone().applyAxisAngle(V3(0, 0, 1), 20 * DEG);
  const r = tiltFromUp(rolled, frame);
  assert(near(r.roll, 20 * DEG, 1e-9) && near(r.pitch, 0, 1e-9), 'right edge down is positive roll and no pitch');
  assert(shape(r.roll, ROLL_DEAD, ROLL_LIMIT) * AZIMUTH_MAX > 0, 'positive roll aims right');
  // Top edge pulled towards the player: the phone stands more upright, earth-up loses its Z.
  const pulled = V3(Math.cos(30 * DEG), 0, Math.sin(30 * DEG));
  const p = tiltFromUp(pulled, frame);
  assert(near(p.pitch, -10 * DEG, 1e-9) && near(p.roll, 0, 1e-9), 'a pull is negative pitch tilt');
  assert(-shape(p.pitch, PITCH_DEAD, PITCH_LIMIT) * ELEVATION_MAX > 0, 'a pull raises the aim');
  // Deadzone and the limit.
  const slight = tiltFromUp(u0.clone().applyAxisAngle(V3(0, 0, 1), 1.5 * DEG), frame);
  assert.equal(shape(slight.roll, ROLL_DEAD, ROLL_LIMIT), 0, 'inside the deadzone is nothing');
  assert(near(shape(60 * DEG, ROLL_DEAD, ROLL_LIMIT), 1), 'past the limit is full deflection');
  assert(near(shape(-60 * DEG, ROLL_DEAD, ROLL_LIMIT), -1), 'symmetrically');
  // A flat phone has no projection, so the orientation angle names the frame.
  const flat = calibrate(V3(0, 0, 1), 90);
  assert(near(flat.sUp.x, 1) && near(flat.sUp.y, 0), 'angle 90 is screen-up along device +X');
  pass('calibrated frame, tilt signs, deadzone and limit', { rollDeg: r.roll / DEG, pitchDeg: p.pitch / DEG });
}

{
  // Through the instructor: right tilt rolls right, a pull pulls, level holds level.
  const f = airborne(), right = new Instructor();
  let cmd;
  for (let i = 0; i < 60; i++) { cmd = right.update(dt, f, { direction: aimFromTilt(f, 0.4, 0), active: true }, {}); f.step(dt, cmd); }
  assert(cmd.roll > 0.05, `a right tilt must roll right, got ${cmd.roll}`);
  const g = airborne(), pull = new Instructor();
  for (let i = 0; i < 60; i++) { cmd = pull.update(dt, g, { direction: aimFromTilt(g, 0, 0.3), active: true }, {}); g.step(dt, cmd); }
  assert(cmd.pitch > 0.05, `a pull must pull, got ${cmd.pitch}`);
  const h = airborne(), level = new Instructor();
  let worst = 0;
  for (let i = 0; i < 1200; i++) {
    const c = level.update(dt, h, { direction: aimFromTilt(h, 0, 0), active: true }, {});
    h.step(dt, c);
    worst = Math.max(worst, Math.abs(Math.asin(h.velocity.y / h.velocity.length()) / DEG));
  }
  assert(worst < 3, `a level aim must hold the path angle within 3 degrees over ten seconds, worst ${worst.toFixed(2)}`);
  // Absolute elevation: the aim is on the horizon whatever the path is doing.
  const dive = airborne(); dive.velocity.set(0, -60, -240);
  const aim = aimFromTilt(dive, 0, 0);
  assert(near(aim.y, 0, 1e-9) && aim.z < -0.99, 'elevation zero is the horizon at the path heading');
  const turn = aimFromTilt(dive, Math.PI / 2, 0);
  assert(near(turn.x, 1, 1e-9), 'azimuth is measured from the path heading');
  pass('right rolls right, a pull pulls, level holds', { worstPathAngle: Number(worst.toFixed(2)) });
}

{
  const s = { enabled: false, warm: 0, locked: false, target: null };
  assert.equal(seekerLabel(s, 2), 'SEEKER');
  s.enabled = true; assert.equal(seekerLabel(s, 2), 'WARMING');
  s.warm = 1; assert.equal(seekerLabel(s, 2), 'SEARCH');
  s.target = {}; assert.equal(seekerLabel(s, 2), 'LOCKING');
  s.locked = true; assert.equal(seekerLabel(s, 2), 'FIRE');
  assert.equal(seekerLabel(s, 0, 5), 'RELOAD 15');
  const log = [];
  const engagement = {
    remaining: 2, seeker: { enabled: false, warm: 0, locked: false, target: null },
    toggleSeeker() { this.seeker.enabled = !this.seeker.enabled; log.push('toggle'); },
    launch() { log.push('launch'); this.seeker.locked = false; return true; },
  };
  assert.equal(seekerPress(engagement, {}), 'on'); assert(engagement.seeker.enabled);
  engagement.seeker.locked = true;
  assert.equal(seekerPress(engagement, {}), 'launched');
  assert(engagement.seeker.enabled && !engagement.seeker.locked, 'a launch leaves the seeker on');
  assert.equal(seekerPress(engagement, {}), 'off'); assert(!engagement.seeker.enabled);
  engagement.remaining = 0;
  assert.equal(seekerPress(engagement, {}), 'reloading');
  assert.deepEqual(log, ['toggle', 'launch', 'toggle']);
  pass('seeker labels and the one-button state machine');
}

{
  const calls = [];
  const engagement = {
    laser: { active: true },
    designate() { this.laser.active = !this.laser.active; calls.push('designate'); },
    message(text) { calls.push(text); },
  };
  const effects = { dropBomb() { calls.push('drop'); return true; } };
  const f = airborne(); f.bombs = 4;
  assert(releaseBomb(engagement, effects, f, {}, null));
  assert(engagement.laser.active && !calls.includes('designate'), 'an active laser stays on');
  engagement.laser.active = false; calls.length = 0;
  assert(releaseBomb(engagement, effects, f, {}, null));
  assert.deepEqual(calls.slice(0, 2), ['designate', 'drop']);
  assert(engagement.laser.active && calls[2] === 'PAVEWAY AWAY · LASER ON');
  f.bombs = 0; assert(!releaseBomb(engagement, effects, f, {}, null), 'nothing to release');
  const parked = new Flight(); parked.bombs = 4;
  assert(!releaseBomb(engagement, effects, parked, {}, null), 'no release on the ground');
  pass('the bomb button designates only when the laser is off');
}

{
  const f = airborne(); f.gear = true; f.gearPosition = 1; f.airborneTime = 4; f.verticalSpeed = 5;
  assert.equal(autoGear(f), false, 'climbing clear of the ground raises the gear');
  f.gear = true; f.airborneTime = 1;
  assert.equal(autoGear(f), true, 'not within three seconds of leaving the ground');
  f.airborneTime = 40; f.gear = false; f.position.y = 150; f.ias = 90; f.verticalSpeed = -3;
  assert.equal(autoGear(f), true, 'slow, low and descending lowers the gear');
  f.gear = false; f.ias = 150;
  assert.equal(autoGear(f), false, 'fast and low keeps it up');
  const parked = new Flight();
  assert.equal(autoGear(parked), true, 'the ground is left to the model');
  pass('automatic gear');
}

{
  const f = new Flight();
  f.setThrottle(1.12); assert(near(f.throttle, 1.12), 'the slider reaches reheat');
  f.setThrottle(2); assert(near(f.throttle, 1.12), 'and no further');
  assert(throttleCommands(0, { onGround: true, gearPosition: 1 }).brake, 'idle on the ground brakes');
  assert(!throttleCommands(0.2, { onGround: true, gearPosition: 1 }).brake);
  assert(!throttleCommands(0, { onGround: false, gearPosition: 1 }).brake);
  assert(!throttleCommands(0, { onGround: true, gearPosition: 0.5 }).brake);
  // The virtual lock: the sim counts as locked, a tap is never a gun event, the aim is live.
  const canvas = new EventTarget(), input = new Input(canvas);
  input.running = true;
  assert(!input.locked, 'no pointer lock in node');
  input.virtualLock = true;
  assert(input.locked, 'the virtual lock counts as locked');
  canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
  assert(!input.gunHeld, 'a tap under the virtual lock is not a gun event');
  const camera = new THREE.PerspectiveCamera(54, 16 / 9);
  input.worldAim = V3(0, 0, -1);
  const aim = input.aim(camera);
  assert(aim.active && aim.direction === input.worldAim, 'the aim is the saved direction');
  input.exitLock();
  assert(input.locked, 'leaving the pointer lock does not touch the virtual one');
  pass('throttle slider, the brake rule and the virtual lock');
}

console.log('ALL TOUCH CHECKS PASS');
