// RANGE touch layer: the phone's tilt as the aim, a throttle slider, three weapon discs and the
// virtual lock that lets the sim run without a pointer lock.
// Spec: docs/specs/2026-09-10-range-mobile.md.
//
// The sensor maths sits in pure functions above the class so the tests drive it without a DOM:
// earth-up from the W3C angles, a screen frame calibrated from the neutral pose, roll and pitch
// from a sample, and the aim direction the instructor is handed. The class owns the overlay.
import * as THREE from '../vendor/three.module.js';
import { groundHeight } from '../physics.js';
import { RANGE_CENTRE, RANGE_LEG_RADIUS, returnLeg } from './hud.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const DEG = Math.PI / 180;

// Spec section 2: deadzones, tilt limits and what they map to.
export const ROLL_DEAD = 2 * DEG, ROLL_LIMIT = 40 * DEG, AZIMUTH_MAX = 50 * DEG;
export const PITCH_DEAD = 2 * DEG, PITCH_LIMIT = 25 * DEG, ELEVATION_MAX = 25 * DEG;
// Pushing away reaches further than pulling: a held pull past 25 degrees is a loop waiting to
// happen, a held push to 55 is a dive the instructor can fly (spec section 12).
export const ELEVATION_DOWN = 55 * DEG;
const SMOOTHING = 0.08, DRAG_GAIN = 1.6, LOOK_GAIN = 0.006, SENSOR_WAIT = 1500;

// The whole legend vocabulary of the three caps and of the throttle's gate column. Eight glyphs is
// the ceiling on a cap word and five on a gate word, asserted in tools/test_touch.mjs, so a future
// state word cannot be added that will not fit the 54 px of usable cap.
// Spec: docs/specs/2026-09-10-range-touch-cockpit.md sections 4.3 and 7.
export const CAP_LEGENDS = ['GUN', 'BOMB', 'SEEKER', 'WARMING', 'SEARCH', 'LOCKING', 'FIRE'];
export const GATE_LEGENDS = { mil: 'MIL', idle: 'IDLE', brake: 'BRAKE' };

// A cap's numeral line is always a bare number: the gun and bomb magazines, the missiles left, or
// the seconds of a reload once the cap has gone dim and the numeral amber.
export const countdown = (seconds, elapsed = 0) => String(Math.max(1, Math.ceil(seconds - elapsed)));

// The key the first flight is remembered under. Absent or unreadable means a first flight, so a
// private window and a refused localStorage both get the coaching.
const FLOWN_KEY = 'range.flown';

// Earth-up in the device frame: the third row of Rz(alpha) Rx(beta) Ry(gamma). Alpha drops out,
// which is why the compass never enters the steering.
export function upFromOrientation(beta, gamma) {
  const b = beta * DEG, g = gamma * DEG;
  return V3(-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g));
}

// The screen frame from the neutral sample: screen-up is where earth-up projects onto the screen
// plane at capture, screen-right is that turned clockwise as the player sees it. A flat phone has
// no such projection, so there the orientation angle decides.
export function calibrate(u0, screenAngle = 0) {
  const xy = Math.hypot(u0.x, u0.y);
  let sUp;
  if (xy >= 0.2) sUp = new THREE.Vector2(u0.x / xy, u0.y / xy);
  else { const t = screenAngle * DEG; sUp = new THREE.Vector2(Math.sin(t), Math.cos(t)); }
  return { sUp, sRight: new THREE.Vector2(sUp.y, -sUp.x), neutralPitch: Math.atan2(u0.z, xy) };
}

// Roll and pitch of a sample against the frame, in radians. Right edge down is positive roll; the
// top edge tipped away from the player is positive pitch. Pitch is measured against the whole
// in-plane magnitude, not the screen-up component alone, so a pure roll reads as no pitch.
export function tiltFromUp(u, frame) {
  const a = u.x * frame.sRight.x + u.y * frame.sRight.y;
  const b = u.x * frame.sUp.x + u.y * frame.sUp.y;
  return { roll: Math.atan2(-a, b), pitch: Math.atan2(u.z, Math.hypot(a, b)) - frame.neutralPitch };
}

// Deadzone, a mild expo and the limit. Tilt, dead and limit in radians; the result is -1 to 1.
export function shape(tilt, dead, limit) {
  const m = Math.abs(tilt);
  if (m <= dead) return 0;
  const x = clamp((m - dead) / (limit - dead), 0, 1);
  return Math.sign(tilt) * (0.6 * x + 0.4 * x * x);
}

// The aim the instructor is handed: the path heading plus the azimuth, at an absolute elevation
// above the horizon. Neutral tilt is therefore level flight, and a held pull is a climb at that
// angle rather than a pitch rate.
export function aimFromTilt(flight, azimuth, elevation) {
  const speed = flight.velocity.length();
  let ref = speed >= 40 ? flight.velocity : flight.basis().forward;
  if (Math.hypot(ref.x, ref.z) < 0.15 * ref.length()) ref = flight.basis().forward;
  const heading = Math.hypot(ref.x, ref.z) > 1e-6 ? Math.atan2(ref.x, -ref.z) + azimuth : azimuth;
  const c = Math.cos(elevation);
  return V3(Math.sin(heading) * c, Math.sin(elevation), -Math.cos(heading) * c);
}

// The one label of the seeker button, from the engagement state.
export function seekerLabel(seeker, remaining, reloadTime = 0) {
  if (remaining <= 0) return `RELOAD ${Math.max(1, Math.ceil(20 - reloadTime))}`;
  if (!seeker.enabled) return 'SEEKER';
  if (seeker.warm < 1) return 'WARMING';
  if (seeker.locked) return 'FIRE';
  if (seeker.target) return 'LOCKING';
  return 'SEARCH';
}

// The two lines of the seeker cap. The vocabulary is seekerLabel's; this only decides which line
// each part goes on and which class the cap takes, so the numeral line is always a number.
export function seekerParts(seeker, remaining, reloadTime = 0) {
  const label = seekerLabel(seeker, remaining, reloadTime);
  if (label.startsWith('RELOAD')) return { legend: 'SEEKER', value: label.slice(7), state: 'dim' };
  if (label === 'FIRE') return { legend: 'FIRE', value: String(remaining), state: 'locked' };
  if (label === 'SEEKER') return { legend: 'SEEKER', value: String(remaining), state: 'resting' };
  return { legend: label, value: String(remaining), state: label === 'WARMING' ? 'warming' : 'lit' };
}

// Spec section 6. On the ground the model extends the gear by itself.
export function autoGear(flight) {
  if (flight.onGround || flight.crashed) return flight.gear;
  const agl = flight.position.y - groundHeight(flight.position.x, flight.position.z);
  if (flight.gear && flight.airborneTime > 3 && agl > 50 && flight.verticalSpeed > 0) flight.gear = false;
  else if (!flight.gear && agl < 200 && flight.ias < 110 && flight.verticalSpeed < 0) flight.gear = true;
  return flight.gear;
}

// BOMB: designate first when the laser is off (designate is a toggle, so never with it on), then
// release. The Paveway still releases ballistically when the designator finds nothing.
export function releaseBomb(engagement, effects, flight, aircraft, aim) {
  if (flight.crashed || flight.onGround || flight.bombs <= 0) return false;
  if (flight.airframe!=='wyvern' && !engagement.laser.active) engagement.designate(flight, aim);
  const released = effects.dropBomb(flight, aircraft);
  if (released && flight.airframe!=='wyvern') engagement.message(engagement.laser.active ? 'PAVEWAY AWAY · LASER ON' : 'PAVEWAY AWAY · NO LASER TARGET');
  return released;
}

// The keyboard's part of the command, from the slider: the desktop's Ctrl-at-idle brake rule.
export function throttleCommands(throttle, flight) {
  return {
    throttle: 0, pitch: 0, roll: 0, yaw: 0, airbrake: false,
    brake: throttle <= 0.001 && !!flight.onGround && flight.gearPosition > 0.95,
  };
}

// SEEKER / FIRE: off turns it on, locked fires, on without a lock turns it off.
export function seekerPress(engagement, flight) {
  const s = engagement.seeker;
  if (engagement.remaining <= 0) return 'reloading';
  if (!s.enabled) { engagement.toggleSeeker(); return 'on'; }
  if (s.locked) return engagement.launch(flight) ? 'launched' : 'inhibited';
  engagement.toggleSeeker();
  return 'off';
}

export class Touch {
  // Coarse pointer and no hover, or ?touch=1; ?touch=0 forbids it.
  static wanted() {
    if (typeof matchMedia === 'undefined' || typeof location === 'undefined') return false;
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '0') return false;
    if (q === '1') return true;
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches;
  }

  constructor(input, canvas) {
    this.input = input;
    this.canvas = canvas;
    this.active = false;
    this.sensors = false;
    this.frame = null;
    this.sample = null;
    this.roll = 0; this.pitch = 0;
    this.azimuth = 0; this.elevation = 0;
    this.throttle = 0;
    this.armed = 0;
    this.fallbackNoted = false;
    // The screen never sleeps while the sortie runs. wakeWanted is the intent the edge detector
    // compares against; wakePending is the request still in flight.
    this.wakeLock = null;
    this.wakePending = null;
    this.wakeWanted = false;
    // A player who has flown before is not coached. Read once, and a storage that throws (a
    // private window, blocked site data) reads as a first flight.
    this.veteran = false;
    try { this.veteran = localStorage.getItem(FLOWN_KEY) === '1'; } catch { /* first flight */ }
    this.flownWritten = false;
    this.handlers = {};
    this.labels = {};
    const $ = (id) => document.getElementById(id);
    const value = (id) => $(id).querySelector('.value');
    this.el = {
      touch: $('touch'), track: $('quadrant'), slot: $('throttleSlot'),
      fill: $('throttleFill'), lever: $('throttleLever'),
      throttleLabel: $('throttleLabel'), throttleValue: $('throttleValue'),
      gun: $('gunButton'), bomb: $('bombButton'), seeker: $('seekerButton'),
      gunValue: value('gunButton'), bombValue: value('bombButton'),
      seekerName: $('seekerButton').querySelector('.name'), seekerValue: value('seekerButton'),
      pause: $('pauseTouch'), recentre: $('recentre'),
    };
    this.onOrientation = this.onOrientation.bind(this);
    this.bind();
  }

  on(name, handler) { this.handlers[name] = handler; }
  fire(name, value) { return this.handlers[name] ? this.handlers[name](value) : undefined; }

  // The one gesture: permission on iOS, fullscreen and a landscape lock on Android, the virtual
  // lock, and the overlay. The synchronous part runs inside the tap; the rest may reject.
  enter() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    this.input.virtualLock = true;
    this.el.touch.classList.remove('hidden');
    this.armed = performance.now();
    const Orientation = window.DeviceOrientationEvent;
    const listen = () => window.addEventListener('deviceorientation', this.onOrientation, true);
    if (Orientation && typeof Orientation.requestPermission === 'function') {
      Orientation.requestPermission().then((state) => { if (state === 'granted') listen(); }).catch(() => {});
    } else listen();
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* not offered */ }
    try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not offered */ }
    this.unlockAudio();
    // unlockAudio is synchronous, so the ENTER tap is still the live gesture here, which is the
    // gesture Safari asks for. The flag goes first so the edge detector does not ask again on the
    // very next frame.
    this.wakeWanted = true;
    this.requestWakeLock();
    this.renderThrottle();
  }

  // A page that was already portrait when it loaded never fires the matchMedia change event below,
  // so the sortie would run unpaused behind the rotate veil. Called from the ENTER handler after
  // start(), because the pause handler needs the sortie running to take it.
  pauseIfPortrait() {
    if (!this.active || typeof matchMedia !== 'function') return false;
    const portrait = matchMedia('(orientation: portrait)').matches;
    if (portrait) this.fire('pause');
    return portrait;
  }

  // The screen sleeps during tilt play because nothing touches it. Every path is wrapped: an
  // unsupported or a refused lock changes nothing and says nothing, because a line of copy about
  // the browser is not a line about the aircraft.
  requestWakeLock() {
    // wakePending, not just wakeLock: request() is asynchronous, and the resume path asks directly
    // inside the tap while update() asks again on the very next frame. With only the resolved
    // handle guarding it, the second call lands while the first is still pending and the phone
    // takes two locks, of which release() then frees one.
    if (!this.active || this.wakeLock || this.wakePending) return this.wakePending || Promise.resolve(this.wakeLock);
    try {
      this.wakePending = Promise.resolve(navigator.wakeLock?.request('screen')).then((lock) => {
        if (!lock) return null;
        // A pause or a hide that arrived while the request was in flight: hand the lock straight
        // back rather than storing one nothing will release.
        if (!this.wakeWanted) { try { lock.release?.()?.catch?.(() => {}); } catch { /* gone */ } return null; }
        this.wakeLock = lock;
        // The browser drops the lock itself when the page hides; without this the instance still
        // holds a dead handle and the re-request on resume does nothing.
        lock.addEventListener?.('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
        return lock;
      }).catch(() => null);
      // A settled request must clear the flag whichever way it went, or a refusal locks the layer
      // out of ever asking again.
      return this.wakePending.finally(() => { this.wakePending = null; });
    } catch { this.wakePending = null; return Promise.resolve(null); }
  }

  releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try { lock?.release?.()?.catch?.(() => {}); } catch { /* already gone */ }
  }

  // One place, so every pause source is covered: the PAUSE cap, portrait, a hidden tab, a crash and
  // the restart. The edge is detected here and update() calls it every frame.
  syncWakeLock(paused) {
    const want = this.active && !paused;
    if (want === this.wakeWanted) return Promise.resolve(this.wakeLock);
    this.wakeWanted = want;
    if (want) return this.requestWakeLock();
    this.releaseWakeLock();
    return Promise.resolve(null);
  }

  // The first landing or crash is what makes a player a veteran, and it is written once. The flag
  // read at construction is not touched: this sortie keeps the coaching it started with.
  markFlown() {
    if (this.flownWritten) return;
    this.flownWritten = true;
    try { localStorage.setItem(FLOWN_KEY, '1'); } catch { /* nothing to remember it with */ }
  }

  // Older iOS keeps Web Audio under the ringer switch until a media element has played, so a
  // tenth of a second of silence goes through one inside the same tap. The WAV is built here
  // rather than shipped: eight kHz, eight bit, 800 samples of silence.
  unlockAudio() {
    try {
      const samples = 800, bytes = new Uint8Array(44 + samples), view = new DataView(bytes.buffer);
      const tag = (offset, text) => { for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i); };
      tag(0, 'RIFF'); view.setUint32(4, 36 + samples, true); tag(8, 'WAVE'); tag(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
      tag(36, 'data'); view.setUint32(40, samples, true); bytes.fill(128, 44);
      const element = new window.Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
      element.setAttribute('playsinline', ''); element.volume = 0.01;
      element.play()?.catch?.(() => {});
    } catch { /* no media element, nothing lost */ }
  }

  onOrientation(event) {
    if (event.beta == null || event.gamma == null) return;
    const u = upFromOrientation(event.beta, event.gamma);
    if (!this.frame) {
      const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) ?? window.orientation ?? 0;
      this.frame = calibrate(u, angle);
    }
    this.sample = u;
    this.sensors = true;
  }

  // Tests and the staged screenshot inject a sample without a device.
  simulate(beta, gamma) { this.onOrientation({ beta, gamma }); }

  recentre() { this.frame = null; this.roll = 0; this.pitch = 0; }

  // Before input.aim() each frame: tilt into the saved aim, the slider into the throttle.
  update(dt, flight) {
    if (!this.active) return;
    // main.js calls frame() on every animation frame whatever stepSim is, so this runs while
    // paused and the release actually happens.
    this.syncWakeLock(this.input.paused);
    if (!this.sensors && this.armed && !this.fallbackNoted && performance.now() - this.armed > SENSOR_WAIT) {
      this.fallbackNoted = true;
      this.fire('notice', 'NO SENSORS · DRAG TO AIM');
    }
    if (flight.crashed || (flight.landed && flight.onGround)) this.markFlown();
    if (this.sensors && this.sample && this.frame) {
      const t = tiltFromUp(this.sample, this.frame);
      const k = 1 - Math.exp(-dt / SMOOTHING);
      this.roll += (t.roll - this.roll) * k;
      this.pitch += (t.pitch - this.pitch) * k;
      this.azimuth = shape(this.roll, ROLL_DEAD, ROLL_LIMIT) * AZIMUTH_MAX;
      const lift = -shape(this.pitch, PITCH_DEAD, PITCH_LIMIT);
      this.elevation = lift * (lift < 0 ? ELEVATION_DOWN : ELEVATION_MAX);
      this.input.worldAim = aimFromTilt(flight, this.azimuth, this.elevation);
      this.input.pendingMouse.set(0, 0);
    }
    if (!flight.crashed) flight.setThrottle(this.throttle);
  }

  commands(flight) { return throttleCommands(this.throttle, flight); }

  // The caps, from the live state. A legend line carries the state and a numeral line always
  // carries a number. Only changed strings touch the DOM.
  render(flight, effects, engagement) {
    const set = (key, element, text) => { if (this.labels[key] !== text) { this.labels[key] = text; element.textContent = text; } };
    set('gun', this.el.gunValue, flight.rounds > 0 ? String(flight.rounds) : countdown(12, effects.reload?.rounds));
    set('bomb', this.el.bombValue, flight.bombs > 0 ? String(flight.bombs) : countdown(25, effects.reload?.bombs));
    const seeker = flight.airframe==='wyvern' ? {legend:'ROCKET',value:engagement.rocketsRemaining>0?String(engagement.rocketsRemaining):countdown(20,engagement.rocketReload),state:'resting'} : seekerParts(engagement.seeker, engagement.remaining, engagement.reloadTime || 0);
    this.el.bomb.querySelector('.name').textContent=flight.airframe==='wyvern'?'TORPEDO':'BOMB';
    set('seekerName', this.el.seekerName, seeker.legend);
    set('seekerValue', this.el.seekerValue, seeker.value);
    const locked = seeker.state === 'locked';
    if (locked && !this.wasLocked) navigator.vibrate?.(8);
    this.wasLocked = locked;
    // A lock inhibited on the ground or below 45 m/s is a dimmed cap with a FIRE legend: the lock
    // is real and the launch is not available.
    const inhibited = locked && (flight.onGround || flight.velocity.length() < 45);
    this.el.seeker.classList.toggle('lit', seeker.state === 'lit' || seeker.state === 'warming');
    this.el.seeker.classList.toggle('warming', seeker.state === 'warming');
    this.el.seeker.classList.toggle('locked', locked);
    this.el.seeker.classList.toggle('dim', seeker.state === 'dim' || inhibited);
    // The gun is the one cap that lights: a system that is live and powered, only while it fires.
    this.el.gun.classList.toggle('lit', !!this.input.gunHeld && flight.rounds > 0);
    this.el.gun.classList.toggle('dim', flight.rounds <= 0);
    this.el.bomb.classList.toggle('dim', flight.bombs <= 0 || flight.onGround);
    // .reloading is what the amber numeral is scoped to, so a cap dimmed for any other reason keeps
    // its numeral in the ink: a bomb cap dim on the ground still holds four Paveways, and a lock
    // inhibited below 45 m/s still has its missiles. Amber means a number is counting down.
    this.el.gun.classList.toggle('reloading', flight.rounds <= 0);
    this.el.bomb.classList.toggle('reloading', flight.bombs <= 0);
    this.el.seeker.classList.toggle('reloading', seeker.state === 'dim');
    // The bottom gate reads BRAKE only when the wheel brake is genuinely applied. It cannot live in
    // renderThrottle(), which takes no flight, so it goes here beside the cap classes and uses the
    // same predicate the command already computes.
    set('gate', this.el.throttleLabel, throttleCommands(this.throttle, flight).brake ? GATE_LEGENDS.brake : GATE_LEGENDS.idle);
  }

  renderThrottle() {
    const pct = this.throttle / 1.12 * 100;
    this.el.fill.style.height = `${pct}%`;
    this.el.lever.style.bottom = `${pct}%`;
    this.el.track.classList.toggle('reheat', this.throttle > 1.0);
    this.el.track.setAttribute('aria-valuenow', Math.round(this.throttle * 100));
    // The commanded power, 0 to 112, shown only while a finger is on the lever. aria-valuenow above
    // still carries the exact figure for tests and assistive technology.
    this.el.throttleValue.textContent = String(Math.round(this.throttle * 100));
  }

  // The sortie's hints, one clause each, in two voices: `voice` is undefined for the instructor's
  // sentence case, 'notice' for the aircraft's own upper case and 'warning' for the stall. A
  // coaching line says nothing at all to a player who has flown before; an act-now line always
  // speaks. The engagement notice still overrides the lot.
  hint(flight, effects, paused) {
    const say = (text, voice) => ({ text, voice });
    const coach = (text) => say(this.veteran ? '' : text);
    const silent = say('');
    // Both stop screens are silent here: the status block in the middle of the screen already
    // carries the instruction, and printing it a second time on the hint line is two treatments for
    // one fact on a 375 px screen.
    if (paused || flight.crashed) return silent;
    const speed = flight.velocity.length(), knots = flight.ias * 1.94384;
    if (flight.landed && flight.onGround) {
      return speed > 4 ? say('Throttle to idle for the brakes.') : say('Tap to fly again.');
    }
    if (flight.onGround) {
      if (speed < 3) return coach('Slide the throttle up.');
      if (knots < 130) return coach('Tilt to keep it straight.');
      return coach('Pull the phone towards you.');
    }
    if (!this.sensors && this.fallbackNoted && flight.airborneTime < 8) return say('NO SENSORS · DRAG TO AIM', 'notice');
    // The gear comes up by itself and the retraction asked for nothing, so this branch is silent.
    if (flight.gear && flight.airborneTime < 6) return silent;
    if (flight.stall || flight.alpha > 0.28) return say('HIGH ALPHA · PUSH THE PHONE AWAY', 'warning');
    if (Math.abs(flight.position.x) > 11000 || Math.abs(flight.position.z) > 12000) return say('Turn back towards the airfield.');
    const range = flight.position.distanceTo(V3(RANGE_CENTRE.x, flight.position.y, RANGE_CENTRE.z));
    if (range < RANGE_LEG_RADIUS && flight.bombs > 0) return say('Tap BOMB over the target.');
    if (range < RANGE_LEG_RADIUS) return say('Turn back to the airfield.');
    if (returnLeg(flight, effects)) {
      const height = flight.position.y;
      if (!flight.gear && height < 700) return say('Slow to 400 km/h for the gear.');
      if (flight.gear && height < 60) return say('Level the phone and let it settle.');
      return say('Throttle back to descend.');
    }
    // Following the coast described the view rather than asking for anything.
    if (flight.position.x > 900) return silent;
    return coach('Tilt to turn, pull to climb.');
  }

  bind() {
    const el = this.el, input = this.input;
    // Keys and the slider act on pointerdown, release on any pointerup or cancel anywhere (a
    // finger sliding off a key still lets go), and never depend on pointer capture, which some
    // browsers refuse. touchmove is cancelled as well so nothing scrolls under a held finger.
    const swallow = (element) => element.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
    const press = (element, down, up) => {
      let active = null;
      swallow(element);
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        active = event.pointerId;
        element.classList.add('pressed');
        down(event);
      });
      const release = (event) => {
        if (active === null || event.pointerId !== active) return;
        active = null;
        element.classList.remove('pressed');
        if (up) up(event);
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    };
    press(el.gun, () => { input.gunHeld = true; }, () => { input.gunHeld = false; });
    press(el.bomb, () => this.fire('bomb'), () => this.fire('releaseWeapon'));
    press(el.seeker, () => this.fire('seeker'), () => this.fire('releaseWeapon'));
    press(el.pause, () => this.fire('pause'));
    press(el.recentre, () => this.recentre());

    // The slider: the whole panel is the target, the lever follows the finger, on the window so
    // it keeps following once the finger has drifted off the panel. The travel is measured on the
    // slot and not on the panel, because the slot is inset 19 px top and bottom, half the lever's
    // height plus its rounded end, and the lever would otherwise lag the finger by that much at each
    // end.
    const setThrottle = (event) => {
      const r = el.slot.getBoundingClientRect();
      this.throttle = (1 - clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1)) * 1.12;
      this.renderThrottle();
    };
    let sliding = null;
    swallow(el.track);
    el.track.addEventListener('pointerdown', (event) => {
      event.preventDefault(); sliding = event.pointerId;
      el.track.classList.add('sliding');   // reveals the transient numeral in the gate column
      setThrottle(event);
    });
    window.addEventListener('pointermove', (event) => { if (sliding !== null && event.pointerId === sliding) setThrottle(event); });
    const endSlide = (event) => { if (event.pointerId === sliding) { sliding = null; el.track.classList.remove('sliding'); } };
    window.addEventListener('pointerup', endSlide);
    window.addEventListener('pointercancel', endSlide);

    // The view: a tap resumes or restarts, a drag aims when there are no sensors.
    let last = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.active) return;
      event.preventDefault();
      if (this.fire('tap') === true) return;
      if (input.paused) {
        // The edge detector would catch this on the next frame anyway, but the tap is a live gesture
        // and the frame after it is not, which is what a browser requiring one for the re-request
        // needs.
        this.wakeWanted = true;
        this.requestWakeLock();
        this.fire('resume');
        return;
      }
      // With sensors live a drag is free look: the finger swings the camera while the tilt keeps
      // steering, and the view eases back to the flight view when the finger lifts, through the
      // same returningLook decay the desktop's C key uses. Without sensors a drag still aims.
      last = { x: event.clientX, y: event.clientY, id: event.pointerId };
      this.canvas.setPointerCapture?.(event.pointerId);
      if (this.sensors) input.touchLook = true;
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!last || event.pointerId !== last.id || input.paused) return;
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      last.x = event.clientX; last.y = event.clientY;
      if (this.sensors) {
        input.look.x = clamp(input.look.x + dx * LOOK_GAIN, -2.9, 2.9);
        input.look.y = clamp(input.look.y - dy * LOOK_GAIN, -1.1, 1.1);
        input.returningLook = true;
        return;
      }
      input.pendingMouse.x += dx * DRAG_GAIN;
      input.pendingMouse.y += dy * DRAG_GAIN;
    });
    const endDrag = () => { last = null; input.touchLook = false; };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // Portrait pauses; the veil is CSS.
    const portrait = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
    portrait?.addEventListener?.('change', (event) => { if (event.matches && this.active) this.fire('pause'); });

    // The layer's own visibility listener, so src/input.js keeps doing exactly what it does now.
    // The hidden path reads document.visibilityState rather than the paused flag, so the order the
    // two listeners run in cannot matter.
    document.addEventListener('visibilitychange', () => {
      if (!this.active) return;
      if (document.visibilityState !== 'visible') { this.wakeWanted = false; this.releaseWakeLock(); }
      else if (!this.input.paused) { this.wakeWanted = true; this.requestWakeLock(); }
    });
  }
}
