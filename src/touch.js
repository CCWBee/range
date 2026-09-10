// RANGE touch layer: the phone's tilt as the aim, a throttle slider, three weapon discs and the
// virtual lock that lets the sim run without a pointer lock.
// Spec: docs/specs/2026-09-10-range-mobile.md.
//
// The sensor maths sits in pure functions above the class so the tests drive it without a DOM:
// earth-up from the W3C angles, a screen frame calibrated from the neutral pose, roll and pitch
// from a sample, and the aim direction the instructor is handed. The class owns the overlay.
import * as THREE from '../vendor/three.module.js';
import { groundHeight } from '../physics.js';
import { RANGE_CENTRE } from './hud.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const DEG = Math.PI / 180;

// Spec section 2: deadzones, tilt limits and what they map to.
export const ROLL_DEAD = 2 * DEG, ROLL_LIMIT = 40 * DEG, AZIMUTH_MAX = 50 * DEG;
export const PITCH_DEAD = 2 * DEG, PITCH_LIMIT = 25 * DEG, ELEVATION_MAX = 25 * DEG;
const SMOOTHING = 0.08, DRAG_GAIN = 1.6, SENSOR_WAIT = 1500;

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
  if (!engagement.laser.active) engagement.designate(flight, aim);
  const released = effects.dropBomb(flight, aircraft);
  if (released) engagement.message(engagement.laser.active ? 'PAVEWAY AWAY · LASER ON' : 'PAVEWAY AWAY · NO LASER TARGET');
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
    this.handlers = {};
    this.labels = {};
    const $ = (id) => document.getElementById(id);
    const value = (id) => $(id).querySelector('.value');
    this.el = {
      touch: $('touch'), track: $('quadrant'), fill: $('throttleFill'), lever: $('throttleLever'),
      throttleLabel: $('throttleLabel'), gun: $('gunButton'), bomb: $('bombButton'), seeker: $('seekerButton'),
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
    this.renderThrottle();
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
    if (!this.sensors && this.armed && !this.fallbackNoted && performance.now() - this.armed > SENSOR_WAIT) {
      this.fallbackNoted = true;
      this.fire('notice', 'NO MOTION SENSORS · DRAG TO AIM');
    }
    if (this.sensors && this.sample && this.frame) {
      const t = tiltFromUp(this.sample, this.frame);
      const k = 1 - Math.exp(-dt / SMOOTHING);
      this.roll += (t.roll - this.roll) * k;
      this.pitch += (t.pitch - this.pitch) * k;
      this.azimuth = shape(this.roll, ROLL_DEAD, ROLL_LIMIT) * AZIMUTH_MAX;
      this.elevation = -shape(this.pitch, PITCH_DEAD, PITCH_LIMIT) * ELEVATION_MAX;
      this.input.worldAim = aimFromTilt(flight, this.azimuth, this.elevation);
      this.input.pendingMouse.set(0, 0);
    }
    if (!flight.crashed) flight.setThrottle(this.throttle);
  }

  commands(flight) { return throttleCommands(this.throttle, flight); }

  // The keys' numeral lines, from the live state. Only changed strings touch the DOM.
  render(flight, effects, engagement) {
    const set = (key, element, text) => { if (this.labels[key] !== text) { this.labels[key] = text; element.textContent = text; } };
    const reload = (seconds, elapsed) => `RELOAD ${Math.max(1, Math.ceil(seconds - (elapsed || 0)))}`;
    set('gun', this.el.gunValue, flight.rounds > 0 ? String(flight.rounds) : reload(12, effects.reload?.rounds));
    set('bomb', this.el.bombValue, flight.bombs > 0 ? String(flight.bombs) : reload(25, effects.reload?.bombs));
    const label = seekerLabel(engagement.seeker, engagement.remaining, engagement.reloadTime || 0);
    const locked = label === 'FIRE';
    set('seekerName', this.el.seekerName, locked ? 'FIRE' : 'SEEKER');
    set('seekerValue', this.el.seekerValue, locked ? 'LOCKED' : label === 'SEEKER' ? 'OFF' : label);
    if (locked && !this.wasLocked) navigator.vibrate?.(8);
    this.wasLocked = locked;
    this.el.seeker.classList.toggle('locked', locked);
    this.el.seeker.classList.toggle('dim', engagement.remaining <= 0 || (locked && (flight.onGround || flight.velocity.length() < 45)));
    this.el.gun.classList.toggle('dim', flight.rounds <= 0);
    this.el.bomb.classList.toggle('dim', flight.bombs <= 0 || flight.onGround);
  }

  renderThrottle() {
    const pct = this.throttle / 1.12 * 100;
    this.el.fill.style.height = `${pct}%`;
    this.el.lever.style.bottom = `${pct}%`;
    this.el.track.classList.toggle('reheat', this.throttle > 1.0);
    this.el.track.setAttribute('aria-valuenow', Math.round(this.throttle * 100));
    this.el.throttleLabel.textContent = `THR ${Math.round(this.throttle * 100)}`;
  }

  // The sortie's hints in touch wording. The engagement notice still overrides them.
  hint(flight, effects, paused) {
    if (paused) return 'Tap to continue.';
    if (flight.crashed) return 'Tap to fly again.';
    const speed = flight.velocity.length(), knots = flight.ias * 1.94384;
    if (flight.landed && flight.onGround) {
      return speed > 4 ? 'Down. Throttle to idle for the wheel brakes.' : 'Sortie complete. Tap to fly again.';
    }
    if (flight.onGround) {
      if (speed < 3) return 'Slide the throttle up. Reheat is at the top of the slider.';
      if (knots < 130) return 'Keep the nose wheel straight: tilt the phone to steer.';
      return 'Rotate: pull the phone towards you and hold it.';
    }
    if (!this.sensors && this.fallbackNoted && flight.airborneTime < 8) return 'No motion sensors. Drag on the view to move the circle.';
    if (flight.gear && flight.airborneTime < 6) return 'Airborne. The gear comes up by itself.';
    if (flight.stall || flight.alpha > 0.28) return 'High angle of attack. Push the phone away and let the speed build.';
    const range = flight.position.distanceTo(V3(RANGE_CENTRE.x, flight.position.y, RANGE_CENTRE.z));
    if (range < 2600 && flight.bombs > 0) return 'Range ahead. Tap PAVEWAY: the laser finds the target.';
    if (range < 2600) return 'Bombs gone. Turn back to the airfield.';
    if (effects && (effects.rangeHit > 0 || flight.bombs === 0)) {
      const height = flight.position.y;
      if (!flight.gear && height < 700) return 'Slow below 215 knots on the approach and the gear lowers itself.';
      if (flight.gear && height < 60) return 'Flare: level the phone and let the speed decay onto the runway.';
      return 'Return to the airfield. Throttle back to descend.';
    }
    if (Math.abs(flight.position.x) > 11000 || Math.abs(flight.position.z) > 12000) return 'Leaving the coastal box. Turn back towards the airfield.';
    if (flight.position.x > 900) return 'Following the coast. Tilt to turn.';
    return 'Tilt to turn, pull to climb. The range is south-west.';
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
    press(el.bomb, () => this.fire('bomb'));
    press(el.seeker, () => this.fire('seeker'));
    press(el.pause, () => this.fire('pause'));
    press(el.recentre, () => this.recentre());

    // The slider: the whole track is the target, the lever follows the finger, on the window so
    // it keeps following once the finger has drifted off the track.
    const setThrottle = (event) => {
      const r = el.track.getBoundingClientRect();
      this.throttle = (1 - clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1)) * 1.12;
      this.renderThrottle();
    };
    let sliding = null;
    swallow(el.track);
    el.track.addEventListener('pointerdown', (event) => { event.preventDefault(); sliding = event.pointerId; setThrottle(event); });
    window.addEventListener('pointermove', (event) => { if (sliding !== null && event.pointerId === sliding) setThrottle(event); });
    const endSlide = (event) => { if (event.pointerId === sliding) sliding = null; };
    window.addEventListener('pointerup', endSlide);
    window.addEventListener('pointercancel', endSlide);

    // The view: a tap resumes or restarts, a drag aims when there are no sensors.
    let last = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.active) return;
      event.preventDefault();
      if (this.fire('tap') === true) return;
      if (input.paused) { this.fire('resume'); return; }
      if (!this.sensors) { last = { x: event.clientX, y: event.clientY, id: event.pointerId }; this.canvas.setPointerCapture?.(event.pointerId); }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!last || event.pointerId !== last.id || this.sensors || input.paused) return;
      input.pendingMouse.x += (event.clientX - last.x) * DRAG_GAIN;
      input.pendingMouse.y += (event.clientY - last.y) * DRAG_GAIN;
      last.x = event.clientX; last.y = event.clientY;
    });
    const endDrag = () => { last = null; };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // Portrait pauses; the veil is CSS.
    const portrait = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
    portrait?.addEventListener?.('change', (event) => { if (event.matches && this.active) this.fire('pause'); });
  }
}
