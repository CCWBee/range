// RANGE mouse-aim instructor: steers the velocity vector to the aim direction, guards the stall,
// handles the ground roll, and passes the keyboard through. Spec: docs/specs/2026-09-06-range-v2.md
// section 3. Output is the cmd object for Flight.step: {pitch, roll, yaw, throttle, brake, airbrake}.
import * as THREE from './vendor/three.module.js';
import { qMax, pMax, G0, WING_AREA, groundHeight } from './physics.js';

const clamp = THREE.MathUtils.clamp;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WORLD_UP = V3(0, 1, 0);

function smoothstep(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Unbanked path frame: z back along the path, x the horizontal right of the path, y = z cross x.
// The reference direction is the velocity above 40 m/s, else the body forward.
export function pathFrame(flight) {
  const { forward, right } = flight.basis();
  const speed = flight.velocity.length();
  const vhat = speed >= 40 ? flight.velocity.clone().divideScalar(speed) : forward.clone();
  // Right of the path is vhat cross worldUp (for a -Z path that is +X, east). Within about
  // 11 degrees of the vertical that vector collapses, so it blends into the body right there
  // (projected perpendicular to the path) and the frame stays continuous through a loop.
  const horizontal = vhat.clone().cross(WORLD_UP);
  const bodyRight = right.clone().addScaledVector(vhat, -right.dot(vhat));
  if (bodyRight.lengthSq() < 1e-6) bodyRight.set(1, 0, 0);
  bodyRight.normalize();
  const wh = clamp(horizontal.length() / 0.2, 0, 1);
  let x = wh > 0 ? horizontal.normalize().multiplyScalar(wh).addScaledVector(bodyRight, 1 - wh) : bodyRight;
  if (x.lengthSq() < 1e-6) x = bodyRight;
  x.normalize();
  const z = vhat.clone().negate();
  const y = z.clone().cross(x).normalize();
  return { vhat, x, y, z };
}

// World unit vector azimuth (rad, positive right) and elevation (rad, positive up) from the
// current path direction. Tests and staging use it as a stand-in for the cursor.
export function aimFromAngles(flight, azimuth, elevation) {
  const frame = pathFrame(flight);
  const dir = frame.vhat.clone().applyAxisAngle(WORLD_UP, -azimuth);
  const xr = frame.x.clone().applyAxisAngle(WORLD_UP, -azimuth);
  dir.applyAxisAngle(xr, elevation);
  return dir.normalize();
}

export class Instructor {
  constructor() {
    this.mode = 'assist';
    this.state = { regime: 'ground', bankDesired: 0, stallGuard: 0, alphaLimited: false, gLimited: false, active: false };
    this.stallLatched = false;
  }

  // aim = {direction: Vector3 | null, active: boolean}; keys = {pitch, roll, yaw, throttle, brake, airbrake}.
  update(dt, flight, aim, keys = {}) {
    const k = {
      pitch: clamp(keys.pitch || 0, -1, 1), roll: clamp(keys.roll || 0, -1, 1), yaw: clamp(keys.yaw || 0, -1, 1),
      throttle: clamp(keys.throttle || 0, -1, 1), brake: !!keys.brake, airbrake: !!keys.airbrake,
    };
    const state = this.state;
    const active = !!(aim && aim.active && aim.direction);
    state.active = active;
    if (this.mode === 'manual') {
      state.regime = 'manual'; state.bankDesired = 0; state.stallGuard = 0;
      state.alphaLimited = false; state.gLimited = false;
      this.stallLatched = false;
      return { pitch: k.pitch, roll: k.roll, yaw: k.yaw, throttle: k.throttle, brake: k.brake, airbrake: k.airbrake };
    }

    const { forward, up, right } = flight.basis();
    const V = Math.max(flight.velocity.length(), 5);
    const alpha = flight.alpha;
    const frame = pathFrame(flight);

    // The target: the cursor ray, or with hands off the horizontal projection of the path.
    let t;
    if (active) t = aim.direction.clone().normalize();
    else {
      t = V3(flight.velocity.x, 0, flight.velocity.z);
      if (t.length() < 1) t = V3(forward.x, 0, forward.z);
      if (t.lengthSq() < 1e-6) t = frame.vhat.clone();
      t.normalize();
    }
    const tx = t.dot(frame.x), ty = t.dot(frame.y), tz = t.dot(frame.z);
    // Azimuth is measured horizontally, between where the aircraft is going and where the cursor
    // points, and elevation as the difference of the two path angles. Taking both inside the
    // tilted path frame instead divides the azimuth by the cosine of the descent angle, so a
    // steepening dive inflates a small sideways error, the bank follows it, the aircraft descends
    // faster and the loop closes on itself: a spiral out of an 8 degree cursor offset.
    let ex = Math.atan2(tx, -tz);
    const ey = Math.atan2(ty, -tz);
    const pathH = Math.hypot(frame.vhat.x, frame.vhat.z), aimH = Math.hypot(t.x, t.z);
    if (pathH > 0.15 && aimH > 0.15) {
      // Both directions have a usable heading, so use the honest horizontal angle between them.
      const d = Math.atan2(t.x, -t.z) - Math.atan2(frame.vhat.x, -frame.vhat.z);
      ex = Math.atan2(Math.sin(d), Math.cos(d));
    }
    const theta = Math.acos(clamp(frame.vhat.dot(t), -1, 1));
    const bx = t.dot(right), by = t.dot(up);
    const phi = Math.atan2(-right.y, up.y);
    const { pull, push } = qMax(V);

    // Stall guard (3.3): strength from indicated airspeed, latch with hysteresis, off on the ground.
    const vs = flight.stallSpeed, ias = flight.ias;
    let guard = 1 - clamp((ias - vs) / (0.10 * vs), 0, 1);
    // In the flare the aircraft is meant to decelerate through its stall speed onto the runway,
    // so the airspeed guard stands down close to the ground with the gear down. The alpha cap
    // further below still prevents a real stall. Without this the guard reads the deliberate
    // deceleration as a stall and pushes the nose into the runway from the flare height.
    const agl = flight.position.y - groundHeight(flight.position.x, flight.position.z);
    const flaring = flight.gearPosition > 0.5 && agl < 25;
    if (flight.onGround || flaring) { guard = 0; this.stallLatched = false; }
    else {
      if (guard > 0.7 || alpha > 0.32) this.stallLatched = true;
      if (this.stallLatched && ias > 1.06 * vs && alpha < 0.26) this.stallLatched = false;
    }
    const latched = this.stallLatched;

    // Small-angle law: bank to turn, pitch to the elevation error, hold the path in the turn.
    // The bank ceiling is set by the lift available at the instructor's own alpha cap of 0.30, not
    // at CLmax, because the instructor will never pull past that cap to hold the turn.
    const nAvail = (0.05 + 3.4 * 0.30) * flight.qbar * WING_AREA / (flight.mass * G0);
    const phiMax = Math.max(0.35, 0.9 * Math.acos(clamp(1 / Math.max(nAvail, 1e-6), 0, 1)));
    let phiDes = theta < 0.02 || latched ? 0 : clamp(6 * ex, -phiMax, phiMax);
    const pSmall = 4 * (phiDes - phi);
    const pitchGain = 1.2 + (flight.gearPosition < .1 ? 1.2 * smoothstep(Math.abs(ey), .08, .3) : 0);
    const qSmall = pitchGain * ey * Math.cos(phi) + Math.min(0.4, (G0 / V) * Math.tan(phi) * Math.sin(phi));
    // Large-angle law: roll the target above the nose, then pull.
    const dphi = Math.atan2(bx, by);
    const pLarge = 5 * dphi;
    const qLarge = 1.8 * theta * Math.max(0, Math.cos(dphi)) * clamp((0.30 - alpha) / 0.06, 0, 1);
    // Roll answers azimuth, pitch answers elevation, so the blend is on the sideways error alone.
    // Blending on the total angle instead couples them: an aircraft descending with the cursor on
    // the horizon sees a large total angle, hands the demand to the rolling law, banks past 80
    // degrees and descends faster, which tightens the same loop. That is the aircraft falling out
    // of the sky from an 8 degree cursor offset.
    // Small corrections retain the height-holding law. A deliberate large upward request can
    // command a hard pull too; unrestricted mouse aim now reaches the full sphere.
    let w = smoothstep(Math.abs(ex), 0.5, 0.9);
    if (ey > 0) w = Math.max(w, smoothstep(ey, .65, 1.15));
    const pushCone = ey < 0 && Math.abs(ex) < 0.3;
    if (ey < 0) w *= smoothstep(Math.abs(ex), 0.25, 0.4); // push, never roll inverted
    // Bank ceiling on the rolling law only. It rolls to put the target above the nose whatever the
    // speed, which at 60 m/s asks for 90 degrees of bank the wing cannot hold. The bank-to-turn law
    // is left alone: its demand is already bounded by phiDes and it is the term that rolls back
    // out, so fading the sum would leave the aircraft stuck at whatever bank it overshot to.
    const overBank = Math.abs(phi) - phiMax;
    let pLargeLimited = pLarge;
    if (overBank > 0 && Math.sign(pLarge) === Math.sign(phi)) pLargeLimited *= Math.max(0, 1 - overBank / 0.35);
    let pDem = clamp((1 - w) * pSmall + w * pLargeLimited, -3.5, 3.5);
    let qDem = (1 - w) * qSmall + w * qLarge;

    // Keyboard on top, before the guard and the caps so they still win.
    const keyRoll = Math.abs(k.roll) > 0.05;
    qDem += 0.6 * k.pitch * pull;
    if (qDem > 0) qDem *= 1 - guard;
    if (latched) qDem = Math.min(qDem, -0.15);
    const alphaCap = 12 * (0.30 - alpha), gCap = 7 * G0 / V, negCap = -1.5 * G0 / V;
    state.alphaLimited = qDem > alphaCap;
    state.gLimited = qDem > gCap;
    qDem = Math.max(Math.min(qDem, alphaCap, gCap), negCap);

    const flightCmd = {
      pitch: clamp(qDem >= 0 ? qDem / pull : qDem / push, -1, 1),
      roll: keyRoll ? k.roll : clamp(pDem / pMax(V, flight.bombs, flight.gearPosition), -1, 1),
      yaw: k.yaw,
    };

    // Ground law (3.4): keys own the roll, the nose wheel tracks the aim ahead, rotation is a
    // rate-limited action at Vr, and after touchdown the nose is lowered at the same rate.
    const Vr = 1.12 * vs;
    let groundPitch = 0;
    const cursorUp = active && ey > 0.02 && !flight.landed;
    if (ias >= Vr && (cursorUp || k.pitch > 0)) {
      groundPitch = Math.min(clamp(Math.max(8 * ey, 0.7 * k.pitch), 0, 0.7), 0.12 / pull);
    } else if (flight.legs[1].contact && !flight.legs[0].contact && k.pitch <= 0) {
      groundPitch = -0.12 / push;
    }
    const groundCmd = {
      pitch: groundPitch,
      roll: k.roll,
      yaw: clamp((tz < 0 ? clamp(3 * ex, -1, 1) : 0) + k.yaw, -1, 1),
    };

    let cmd;
    if (flight.onGround) cmd = groundCmd;
    else {
      const b = clamp(flight.airborneTime / 1, 0, 1);
      cmd = {
        pitch: groundCmd.pitch + (flightCmd.pitch - groundCmd.pitch) * b,
        roll: groundCmd.roll + (flightCmd.roll - groundCmd.roll) * b,
        yaw: groundCmd.yaw + (flightCmd.yaw - groundCmd.yaw) * b,
      };
    }
    cmd.throttle = k.throttle; cmd.brake = k.brake; cmd.airbrake = k.airbrake;

    state.regime = flight.onGround ? 'ground' : latched ? 'stall' : !active ? 'level'
      : w > 0.5 ? 'large' : pushCone ? 'push' : 'small';
    state.bankDesired = phiDes;
    state.stallGuard = latched ? 1 : guard;
    return cmd;
  }
}
