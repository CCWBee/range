// RANGE input: the keyboard map, the pointer lock, the mouse cursor and the pause state.
// Spec: docs/specs/2026-09-06-range-v2.md sections 5.3 and 5.4.
//
// The lock is the single source of truth for whether the sim runs. A mousedown while unlocked only
// asks for the lock and is never a gun event; leaving the lock (which is what Esc does, in the
// browser, not here) pauses; a click while paused asks for the lock again and the game stays paused
// until it is granted, because Chrome refuses the request for about a second after an Esc exit.
import * as THREE from '../vendor/three.module.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const HELD = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyX', 'KeyC', 'KeyZ', 'KeyB', 'Space',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// One-shot keys and the action each fires.
const ACTIONS = {
  Digit2: 'bomb', Digit3: 'bomb', KeyG: 'gear', KeyV: 'camera', KeyR: 'restart',
  Digit5: 'missile', Slash: 'missile', KeyL: 'laser', NumLock: 'laser', Delete: 'laser',
  End: 'target', Digit6: 'target', KeyT: 'target',
  KeyH: 'help', KeyI: 'help', KeyU: 'instructor', KeyP: 'pause',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.cursor = new THREE.Vector2();
    this.gunHeld = false;
    this.paused = false;
    this.running = false;
    this.manual = false;
    this.sensitivity = 1.0;
    this.handlers = {};
    this.ray = new THREE.Raycaster();
    this.worldAim = null;
    this.pendingMouse = new THREE.Vector2();
    this.look = new THREE.Vector2();
    this.returningLook = false;
    this.aimState = { direction: null, active: false };
    this.attach();
  }

  on(name, handler) { this.handlers[name] = handler; }

  fire(name, value) { if (this.handlers[name]) this.handlers[name](value); }

  get locked() { return document.pointerLockElement === this.canvas; }
  get freeLook() { return this.keys.has('KeyC'); }

  // Only ever called from a user gesture on the canvas, never from start() or stage().
  requestLock() {
    let result;
    try { result = this.canvas.requestPointerLock(); } catch { result = null; }
    if (result && typeof result.catch === 'function') {
      result.catch(() => { this.setPaused(true); });
    }
  }

  exitLock() { if (this.locked) document.exitPointerLock(); }

  // Idempotent: calling it with the state it is already in does nothing.
  setPaused(value) {
    if (this.paused === value) return;
    this.paused = value;
    if (value) this.keys.clear();
    this.fire('pause', value);
  }

  attach() {
    const canvas = this.canvas;
    canvas.addEventListener('mousedown', (event) => {
      if (!this.running) return;
      if (!this.locked) {
        // The click that takes the lock back is not a gun event.
        this.setPaused(false);
        this.requestLock();
        return;
      }
      if (event.button === 0) this.gunHeld = true;
    });
    window.addEventListener('mouseup', (event) => { if (event.button === 0) this.gunHeld = false; });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      if (this.freeLook) {
        this.look.x = THREE.MathUtils.clamp(this.look.x + (event.movementX || 0) * .004, -2.9, 2.9);
        this.look.y = THREE.MathUtils.clamp(this.look.y + (event.movementY || 0) * .004, -1.1, 1.1);
        this.returningLook = true;
        return;
      }
      if (this.returningLook) return;
      this.pendingMouse.x += (event.movementX || 0) * this.sensitivity;
      this.pendingMouse.y += (event.movementY || 0) * this.sensitivity;
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.locked) this.setPaused(false);
      else if (this.running) { this.gunHeld = false; this.setPaused(true); }
    });
    document.addEventListener('pointerlockerror', () => { this.setPaused(true); });

    window.addEventListener('keydown', (event) => {
      if (HELD.has(event.code) || ACTIONS[event.code] || event.code === 'Tab' || event.altKey) event.preventDefault();
      if (HELD.has(event.code)) this.keys.add(event.code);
      if (event.repeat) return;
      if (!this.running) { if (event.code === 'Enter') this.fire('start'); return; }
      if (event.altKey && event.code === 'KeyX') { this.fire('seeker'); return; }
      // Escape is the browser leaving the pointer lock. It is not bound here, and pausing
      // happens through pointerlockchange so the two can never disagree.
      const action = ACTIONS[event.code];
      if (action === 'pause') { this.setPaused(true); this.exitLock(); return; }
      if (action) this.fire(action);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.gunHeld = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running) { this.exitLock(); this.setPaused(true); }
    });
  }

  // Only the displayed marker is bounded. The saved direction can turn through the full sphere.
  clampCursor() {
    const scale = Math.max(1, Math.abs(this.cursor.x) / Math.max(1, window.innerWidth / 2 - 38),
      Math.abs(this.cursor.y) / Math.max(1, window.innerHeight / 2 - 120));
    this.aimOffscreen = scale > 1 || this.aimBehind;
    this.cursor.divideScalar(scale);
  }

  centreCursor() { this.cursor.set(0, 0); this.worldAim = null; this.pendingMouse.set(0, 0); this.look.set(0,0); this.returningLook=false; }

  // The flight demands the keyboard contributes. Throttle is a rate; brake and airbrake are held.
  commands(flight = null) {
    const k = this.keys;
    const down = (...codes) => codes.some((code) => k.has(code));
    const manualRoll = this.manual ? (down('ArrowRight') ? 1 : 0) - (down('ArrowLeft') ? 1 : 0) : 0;
    return {
      throttle: (down('ShiftLeft', 'ShiftRight') ? 1 : 0) - (down('ControlLeft', 'ControlRight') ? 1 : 0),
      // Arrow down pulls, as it did before.
      pitch: (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0),
      roll: Math.max(-1, Math.min(1, (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0) + manualRoll)),
      yaw: (down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0),
      brake: down('KeyB') || (down('ControlLeft', 'ControlRight') && !!flight && flight.throttle <= .001 && flight.gearPosition > .95),
      airbrake: down('KeyB'),
    };
  }

  gunFiring() { return this.gunHeld || this.keys.has('Space'); }

  // The world direction of the camera ray through the cursor. Inactive without the lock, which is
  // the instructor's signal to take its hands off.
  aim(camera) {
    if (!this.locked) {
      this.aimState.direction = null; this.aimState.active = false;
      this.worldAim = null; this.pendingMouse.set(0, 0);
      return this.aimState;
    }
    camera.updateMatrixWorld();
    if (!this.worldAim) this.worldAim = camera.getWorldDirection(V3());
    // Rotate a world direction, rather than clamping a ray to a disc on the screen. The mouse
    // can ask for a reversal or a loop, including targets behind the current camera.
    if (this.pendingMouse.lengthSq() > 0) {
      const radiansPerPixel = 2 * Math.tan(camera.fov * Math.PI / 360) / window.innerHeight;
      const cameraUp = V3(0, 1, 0).applyQuaternion(camera.quaternion);
      const cameraRight = V3(1, 0, 0).applyQuaternion(camera.quaternion);
      this.worldAim.applyAxisAngle(cameraUp, -this.pendingMouse.x * radiansPerPixel);
      this.worldAim.applyAxisAngle(cameraRight, -this.pendingMouse.y * radiansPerPixel).normalize();
      this.pendingMouse.set(0, 0);
    }
    this.projectAim(camera);
    this.aimState.direction = this.worldAim;
    this.aimState.active = true;
    return this.aimState;
  }

  // Display the saved steering direction using this frame's final camera, including zoom.
  projectAim(camera) {
    if (!this.worldAim) return;
    const local = this.worldAim.clone().applyQuaternion(camera.quaternion.clone().invert());
    this.aimBehind = local.z >= 0;
    const focal = window.innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.cursor.set(local.x, -local.y).multiplyScalar(focal / Math.max(.01, Math.abs(local.z)));
    if (this.aimBehind) {
      if (this.cursor.lengthSq() < 1) this.cursor.set(window.innerWidth, 0);
      else this.cursor.setLength(Math.max(window.innerWidth, window.innerHeight) * 2);
    }
    this.clampCursor();
  }

  // Where the reticle sits on screen, in pixels from the top left.
  cursorScreen() {
    return V3(window.innerWidth / 2 + this.cursor.x, window.innerHeight / 2 + this.cursor.y, 0);
  }
}
