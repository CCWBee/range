// Behaviour checks for the touch layer, independent of a phone and a DOM.
// Spec: docs/specs/2026-09-10-range-mobile.md section 10.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { Flight } from '../physics.js';
import { Instructor } from '../control.js';
import { Input } from '../src/input.js';
import {
  upFromOrientation, calibrate, tiltFromUp, shape, aimFromTilt, seekerLabel, autoGear, releaseBomb,
  seekerPress, throttleCommands, ROLL_DEAD, ROLL_LIMIT, PITCH_DEAD, PITCH_LIMIT, AZIMUTH_MAX, ELEVATION_MAX,
  Touch, seekerParts, countdown, CAP_LEGENDS, GATE_LEGENDS,
} from '../src/touch.js';
import { nextPixelRatio, SLOW_MS } from '../src/quality.js';

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

{
  // getElementById returns the first match, so a duplicated id sends listeners to the wrong
  // element with no error: the touch quadrant once shared "throttle" with the HUD readout.
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set(), duplicates = ids.filter((id) => seen.size === seen.add(id).size);
  assert.deepEqual(duplicates, [], `every id in index.html is unique: ${duplicates}`);
  for (const id of ['quadrant', 'throttleSlot', 'throttleFill', 'throttleLever', 'throttleValue', 'throttleLabel',
    'gunButton', 'bombButton', 'seekerButton', 'pauseTouch', 'recentre',
    'skinSwitch', 'skinGrey', 'skinTrack', 'skinKnob', 'skinHeritage']) {
    assert(ids.includes(id), `the touch layer's ${id} exists`);
  }
  pass('page ids are unique and the touch layer has its elements', { ids: ids.length });
}

{
  // The seeker cap's two lines: the legend carries the state and the numeral line is always a
  // number. Every row of the table in spec section 3.10.
  const s = { enabled: false, warm: 0, locked: false, target: null };
  assert.deepEqual(seekerParts(s, 0, 5), { legend: 'SEEKER', value: '15', state: 'dim' },
    'reloading keeps the SEEKER legend and puts a bare number on the value line');
  assert.deepEqual(seekerParts(s, 2), { legend: 'SEEKER', value: '2', state: 'resting' });
  s.enabled = true;
  assert.deepEqual(seekerParts(s, 2), { legend: 'WARMING', value: '2', state: 'warming' });
  s.warm = 1;
  const search = seekerParts(s, 2);
  assert.deepEqual(search, { legend: 'SEARCH', value: '2', state: 'lit' });
  s.target = {};
  const locking = seekerParts(s, 2);
  assert.deepEqual(locking, { legend: 'LOCKING', value: '2', state: 'lit' });
  // The lit and locked states differ in hue, so the legend string has to change as well: hue may
  // never be the only channel.
  assert.notEqual(search.legend, locking.legend, 'SEARCH and LOCKING are different strings');
  s.locked = true;
  const fire = seekerParts(s, 2);
  assert.deepEqual(fire, { legend: 'FIRE', value: '2', state: 'locked' });
  assert.notEqual(locking.legend, fire.legend, 'the lit and the locked legends are different strings');
  pass('the seeker cap maps state to the legend line');
}

{
  // The vocabulary is a ceiling, so a future state word cannot be added that will not fit: eight
  // glyphs on a cap legend, five on a gate legend, three on any numeral the render can produce.
  for (const legend of CAP_LEGENDS) assert(legend.length <= 8, `cap legend ${legend} is over 8 glyphs`);
  for (const gate of Object.values(GATE_LEGENDS)) assert(gate.length <= 5, `gate legend ${gate} is over 5 glyphs`);
  // The legends seekerParts can emit are the same list, so render() cannot mint one quietly.
  const seeker = { enabled: false, warm: 0, locked: false, target: null };
  for (const enabled of [false, true]) {
    for (const warm of [0, 1]) {
      for (const target of [null, {}]) {
        for (const locked of [false, true]) {
          Object.assign(seeker, { enabled, warm, target, locked });
          for (const remaining of [0, 1, 2]) {
            const parts = seekerParts(seeker, remaining, 0);
            assert(CAP_LEGENDS.includes(parts.legend), `${parts.legend} is not in CAP_LEGENDS`);
            assert(parts.value.length <= 3, `seeker numeral ${parts.value} is over 3 glyphs`);
          }
        }
      }
    }
  }
  // The three countdowns, over their whole run, and the fullest magazine.
  for (let elapsed = 0; elapsed <= 25; elapsed += 0.25) {
    for (const seconds of [12, 25, 20]) {
      assert(countdown(seconds, elapsed).length <= 3, `countdown ${seconds} at ${elapsed} is over 3 glyphs`);
    }
  }
  for (const numeral of [150, 4, 2, 0, 112]) {
    assert(String(numeral).length <= 3, `numeral ${numeral} is over 3 glyphs`);
  }
  // The lists are a ceiling on the markup too. GUN, BOMB, MIL and IDLE are literals in index.html
  // rather than written from these exports, so without this a nine-glyph legend typed into the page
  // would pass every other assertion in this file.
  const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const printed = {};
  for (const [pattern, allowed, what] of [
    [/<span[^>]*class="name"[^>]*>([^<]*)</g, CAP_LEGENDS, 'cap legend'],
    [/<span[^>]*class="gate[^"]*"[^>]*>([^<]*)</g, Object.values(GATE_LEGENDS), 'gate legend'],
  ]) {
    const found = [...markup.matchAll(pattern)].map((m) => m[1].trim());
    assert(found.length, `index.html prints at least one ${what}`);
    for (const legend of found) assert(allowed.includes(legend), `${what} ${legend} in index.html is not in the exported list`);
    printed[what] = found.length;
  }
  pass('the legend and numeral budgets', { legends: CAP_LEGENDS.length, gates: Object.keys(GATE_LEGENDS).length, printed });
}

{
  // The screen wake lock, driven through the prototype so it needs no DOM and no phone. Node
  // defines navigator as a getter-only global, so the stub goes in through defineProperty.
  const nativeNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const stub = (request) => Object.defineProperty(globalThis, 'navigator',
    { value: { wakeLock: request ? { request } : undefined }, configurable: true, writable: true });
  // Off the prototype rather than a bare object, because syncWakeLock calls the other two on this.
  const layer = () => Object.assign(Object.create(Touch.prototype),
    { active: true, wakeLock: null, wakePending: null, wakeWanted: true });
  const request = Touch.prototype.requestWakeLock, sync = Touch.prototype.syncWakeLock;
  const newLock = () => {
    const lock = { released: 0, release() { lock.released++; return Promise.resolve(); }, addEventListener() {} };
    return lock;
  };

  let asked = [], lock = newLock(), settle = null;
  stub((type) => { asked.push(type); return Promise.resolve(lock); });
  const t = layer();
  await request.call(t);
  assert.deepEqual(asked, ['screen'], 'an active layer asks once for a screen lock');
  assert.equal(t.wakeLock, lock, 'and holds it');
  await sync.call(t, true);
  assert(t.wakeLock === null && lock.released === 1, 'a pause releases the lock and clears the handle');
  await sync.call(t, false);
  assert.equal(asked.length, 2, 'a resume asks again');
  await sync.call(t, false);
  assert.equal(asked.length, 2, 'the same value twice asks once: that is the edge detector');

  // The race, which is the assertion that earns its place: a guard on the resolved handle alone
  // passes only because a stub resolves in a microtask, and on a phone it takes two locks.
  asked = []; lock = newLock();
  stub((type) => { asked.push(type); return new Promise((resolve) => { settle = () => resolve(lock); }); });
  const r = layer();
  const first = request.call(r), second = request.call(r);
  assert.deepEqual(asked, ['screen'], 'two calls before the first resolves ask once');
  settle();
  await Promise.all([first, second]);
  assert(r.wakeLock === lock && lock.released === 0, 'and one lock is held');

  // A pause that lands while the request is still outstanding.
  asked = []; lock = newLock();
  const p = layer();
  const pending = request.call(p);
  p.wakeWanted = false;
  settle();
  await pending;
  assert(p.wakeLock === null && lock.released === 1, 'a lock arriving after the pause is handed straight back');

  // The phones that cannot: no wakeLock at all, and a request that refuses. Neither throws, and
  // neither locks the layer out of asking again for the rest of the sortie.
  for (const broken of [undefined, () => Promise.reject(new Error('refused'))]) {
    const n = layer();
    stub(broken);
    assert.equal(await request.call(n), null, 'an unsupported or refused lock resolves to null');
    assert.equal(n.wakePending, null, 'and leaves the layer free to ask again');
    assert.equal(await request.call(n), null, 'which it does');
  }
  if (nativeNavigator) Object.defineProperty(globalThis, 'navigator', nativeNavigator);
  else delete globalThis.navigator;
  pass('the screen wake lock, its race and the phones that cannot');
}

{
  // The render scale. A 60 Hz phone's frames are 16.7 ms by definition, so the old p95-under-9-ms
  // recovery branch was unreachable on every 60 Hz device.
  const window120 = (ms, slow = 0, slowMs = 0) => [...Array(120 - slow).fill(ms), ...Array(slow).fill(slowMs)];
  assert.equal(SLOW_MS, 22);
  assert.equal(nextPixelRatio(window120(16.7), 1.5, 2, 1), 1.6, '120 frames at 60 Hz step a phone up');
  assert.equal(nextPixelRatio(window120(16.7, 12, 33.4), 2, 2, 1), 1.9, 'one dropped frame in ten steps it down');
  assert.equal(nextPixelRatio(window120(8.3), 1.5, 2, 1), 1.6, '120 frames at 120 Hz step up');
  assert.equal(nextPixelRatio(window120(8.3, 12, 25), 2, 2, 1), 1.9, 'and a slow tail steps down');
  assert.equal(nextPixelRatio(window120(40), 2, 2, 1), 1.9, 'a flat 40 ms window steps down on the SLOW_MS guard');
  assert.equal(nextPixelRatio(window120(40), 1.1, 2, 1), 1, 'the ladder lands on the floor exactly');
  assert.equal(nextPixelRatio(window120(40), 1, 2, 1), 1, 'and never goes under it');
  assert.equal(nextPixelRatio(window120(16.7), 2, 2, 1), 2, 'a healthy window at the base stays there');
  assert.equal(nextPixelRatio(window120(20.8), 1.9, 2, 1), 2, "a variable panel's 48 Hz floor still recovers");
  assert.equal(nextPixelRatio(Array(59).fill(40), 2, 2, 1), 2, 'fewer than 60 samples decide nothing');
  assert.equal(nextPixelRatio(window120(20), 0.7, 1.5, 0.6), 0.8, 'the desktop keeps its own floor');
  pass('the adaptive pixel ratio recovers on every refresh rate');
}

console.log('ALL TOUCH CHECKS PASS');
