// RANGE flight model: a rigid-body Eurofighter Typhoon with aerodynamic moments, a rate-command
// fly-by-wire loop scheduled on dynamic pressure, three wheel contacts on spring-dampers, and the
// shared world numbers (pavement rectangles, terrain, noise, speed of sound). Spec: docs/specs/
// 2026-09-06-range-v2.md sections 0, 1.1 and 2. Conventions: world +Y up, runway along -Z,
// heading 000 is -Z; body +X right wing, +Y up, -Z nose. Aero signs: p roll right wing down,
// q pitch nose up, r yaw nose right; q = omega.x, r = -omega.y, p = -omega.z.
import * as THREE from './vendor/three.module.js';
import { JERSEY } from './src/jersey.js';

const clamp = THREE.MathUtils.clamp;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WORLD_UP = V3(0, 1, 0);

export const G0 = 9.81;
export const RHO0 = 1.225;
export const WING_AREA = 51.2;
export const SPAN = 10.95;
export const CHORD = 4.7;
export const MASS_FULL = 15200;

function smoothstep(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
// Shared world numbers (spec 1.1). Physics, renderer and Blender all read these.
// ---------------------------------------------------------------------------------------------

const rect = (name, x0, z0, x1, z1) => ({ name, x0, z0, x1, z1 });
export const PAVEMENT = [
  rect('runway', -31, -2500, 31, 300),
  rect('apron', -290, -245, -10, 125),
  rect('parallel taxiway', -200, -2250, -180, -50),
  rect('link taxiway north', -180, -259.5, 0, -240.5),
  rect('link taxiway middle', -180, -1109.5, 0, -1090.5),
  rect('link taxiway south', -180, -2059.5, 0, -2040.5),
  rect('perimeter road west', -664.5, -2700, -655.5, 400),
  rect('perimeter road north', -665, 285.5, 415, 294.5),
  rect('perimeter road south', -665, -2634.5, 415, -2625.5),
  rect('dispersal taxiway', -200, -1000, -180, -50),
  rect('hangar arch apron A', -460, -200, -200, -60),
  rect('hangar arch apron B', -460, -380, -200, -240),
  ...[-620, -740, -860, -980].map((z, i) => rect(`HAS hardstand ${i + 1}`, -470, z - 30, -380, z + 30)),
  rect('HAS spur', -380, -1010, -200, -590),
  ...[[-330, -130], [-450, -130], [-330, -460], [-450, -460], [-330, -790], [-450, -790]]
    .map(([x, z], i) => rect(`service hardstand ${i + 1}`, x - 29, z - 13, x + 29, z + 93)),
  ...[[-950, -3900], [-1090, -4050], [-800, -4170], [-1040, -4300], [-1220, -4190], [-860, -4430]]
    .map(([x, z], i) => rect(`range hardstand ${i + 1}`, x - 17.5, z - 22.5, x + 17.5, z + 22.5)),
  rect('fuel farm', -620, -1020, -550, -940),
];

export function onPavement(x, z) {
  for (const r of PAVEMENT) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  return false;
}

// Distance from (x, z) to the nearest pavement edge, 0 when inside a rectangle.
function pavementDistance(x, z) {
  let best = Infinity;
  for (const r of PAVEMENT) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dz = Math.max(r.z0 - z, 0, z - r.z1);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

// Value noise, identical in JavaScript and Python (tools/model_range.py carries the twin).
function hash(ix, iz, seed) {
  let n = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return n / 4294967296;
}

function valueNoise(u, v, seed) {
  const ix = Math.floor(u), iz = Math.floor(v);
  const fx = u - ix, fz = v - iz;
  const tx = fx * fx * (3 - 2 * fx), tz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function fbm2(u, v) {
  const n0 = valueNoise(u, v, 7), n1 = valueNoise(2 * u, 2 * v, 8), n2 = valueNoise(4 * u, 4 * v, 9);
  return 2 * (n0 + 0.5 * n1 + 0.25 * n2) / 1.75 - 1;
}

export function coast(z) {
  return 1600 + 350 * Math.sin(0.0008 * z) + 180 * Math.sin(0.0018 * z);
}

function legacyNaturalHeight(x, z) {
  const d = x - coast(z);
  if (d <= -250) {
    const ax = Math.abs(x);
    return -0.34 + Math.max(0, ax - 2200) * 0.006 * (0.6 + 0.4 * Math.sin(0.001 * z))
      + 6 * fbm2(0.0009 * x, 0.0009 * z) * smoothstep(ax - 700, 0, 1500) * smoothstep(-d, 250, 600);
  }
  if (d <= 0) { const t = (d + 250) / 250; return -0.34 - 6 * t * t; }
  if (d <= 1800) return -6.34 - Math.min(25, 0.01 * d);
  return -7 + clamp(0.012 * (d - 1800), 0, 8);
}

function naturalHeight(x,z) {
  const u=(x-JERSEY.originX)/JERSEY.spacing,v=(z-JERSEY.originZ)/JERSEY.spacing;
  if(u<0||v<0||u>=JERSEY.nx-1||v>=JERSEY.nz-1)return JERSEY.seaLevel-12;
  const i=Math.floor(u),j=Math.floor(v),a=j*JERSEY.nx+i,fx=u-i,fz=v-j,h=JERSEY.heights;
  return (h[a]*(1-fx)+h[a+1]*fx)*(1-fz)+(h[a+JERSEY.nx]*(1-fx)+h[a+JERSEY.nx+1]*fx)*fz;
}

// Ground height in metres: 0 on pavement, blended over 60 m outside it to the terrain formula.
export function terrainHeight(x, z) {
  const dist = pavementDistance(x, z);
  if (dist === 0) return 0;
  const airfieldDistance = Math.hypot(Math.max(-850-x,0,x-600),Math.max(-2900-z,0,z-1700));
  const h = -0.34 + (naturalHeight(x,z)+0.34)*smoothstep(airfieldDistance,0,600);
  return dist >= 400 ? h : h * smoothstep(dist, 0, 400);
}

export function speedOfSound(h) {
  return 340 * Math.sqrt(Math.max(0.75, 1 - h / 44300));
}

// FCS pitch rate limits (rad/s): a pull of 8 g0/V is about n = 9 in level flight.
export function qMax(V) {
  const v = Math.max(V, 5);
  return { pull: Math.min(8 * G0 / v, 1.2), push: Math.min(3 * G0 / v, 0.6) };
}

// FCS roll rate limit (rad/s), reduced by stores and by the gear.
export function pMax(V, bombs, gearPosition) {
  return 4.2 * clamp(V / 120, 0.35, 1) * (1 - 0.5 * bombs / 4) * (1 - 0.6 * gearPosition);
}

// ---------------------------------------------------------------------------------------------
// Airframe
// ---------------------------------------------------------------------------------------------

// Wheel contact points in body coordinates: nose, left main, right main (spec 2.6).
// Main wheel track 3.87 m, the real aircraft's. A narrower track tips the aircraft over on tyre
// side force alone: the roll moment acts 1.87 m above the contact, so a half-track of 1.15 m
// tipped at 0.61 g lateral, below what the tyres saturate at, and full rudder on the taxiway
// rolled it past the attitude limit. At 1.935 m it tips at 1.03 g, above tyre saturation.
const LEG_POINTS = [V3(0, -1.83, -4.35), V3(-1.935, -1.87, 1.2), V3(1.935, -1.87, 1.2)];
const LEG_K = [160000, 260000, 260000];
const LEG_SHARE = [0.216, 0.392, 0.392];
const TRAVEL = 0.35;
// With the gear retracted the "wheel" point sits on the fuselage underside; a contact there is a
// crash ('gear'), so the belly touching the ground is caught by the same code path.
const BELLY_Y = -0.9;
const NOSE_TIP = V3(0, -0.3, -8);
const WINGTIPS = [V3(-5.4, -0.1, 3.9), V3(5.4, -0.1, 3.9)];
// Static rest: mains compressed 0.225 m from y = -1.87 puts the centre of mass 1.645 m up.
const REST_HEIGHT = 1.645;

function groundAt(x, z) {
  return onPavement(x, z) ? 0 : terrainHeight(x, z);
}
// The ground the aircraft actually stands on, pavement or terrain. The instructor reads it to
// know how high the aircraft is above the runway.
export { groundAt as groundHeight };

export class Flight {
  constructor() { this.reset(); }

  reset() {
    this.position = V3(0, REST_HEIGHT, 85);
    this.velocity = V3();
    this.attitude = new THREE.Quaternion();
    this.omega = V3();
    this.throttle = 0; this.spool = 0; this.reheat = 0;
    this.gear = true; this.gearPosition = 1;
    this.brake = false; this.airbrake = false;
    this.grounded = true; this.onGround = true; this.crashed = false; this.crashReason = '';
    this.landed = false; this.stopped = true;
    this.alpha = 0; this.beta = 0; this.load = 1; this.mach = 0; this.ias = 0;
    this.verticalSpeed = 0; this.buffet = 0; this.condensation = 0; this.stall = false;
    this.qbar = 0; this.rho = RHO0;
    this.bombs = 4; this.rounds = 150; this.airborneTime = 0; this.elapsed = 0;
    this.mass = MASS_FULL; this.impact = 0;
    this.stallSpeed = Math.sqrt(2 * this.mass * G0 / (RHO0 * WING_AREA * 1.14));
    this.surfaces = { canardL: -0.35, canardR: -0.35, elevonL: 0, elevonR: 0, rudder: 0, airbrake: 0, nozzle: 0, steering: 0 };
    this.legs = LEG_POINTS.map((_, i) => ({
      contact: true, compression: (i === 0 ? 0.20 : 0.225) / TRAVEL,
      load: LEG_SHARE[i] * this.mass * G0, spin: 0,
    }));
    // Control surface state and loop memory.
    this.elevon = 0; this.aileron = 0; this.rudderAngle = 0;
    this._pitchIntegral = 0;
    this._groundedTime = 0.2; // parked: already grounded
    this._droop = 1;
    this._airbrakePos = 0;
  }

  basis() {
    return {
      forward: V3(0, 0, -1).applyQuaternion(this.attitude),
      up: V3(0, 1, 0).applyQuaternion(this.attitude),
      right: V3(1, 0, 0).applyQuaternion(this.attitude),
    };
  }

  setThrottle(value) { this.throttle = clamp(value, 0, 1.12); }

  crash(reason) {
    if (this.crashed) return;
    this.wreckVelocity = this.velocity.clone();
    this.crashed = true; this.crashReason = reason;
    this.velocity.set(0, 0, 0); this.omega.set(0, 0, 0);
  }

  // cmd = {pitch, roll, yaw, throttle, brake, airbrake}: pitch positive pull, roll positive right
  // wing down, yaw positive nose right, all -1..1; throttle a rate -1..1 (0.40 per second);
  // brake and airbrake booleans.
  step(dt, cmd = {}) {
    if (this.crashed) return;
    this.elapsed += dt;

    // Engine: throttle integrates from the key, spool lags it, reheat lights after the spool.
    this.throttle = clamp(this.throttle + (cmd.throttle || 0) * dt * 0.40, 0, 1.12);
    const spoolTau = this.throttle > this.spool ? (this.spool < 0.5 ? 2.4 : 1.6) : 1.0;
    this.spool += (this.throttle - this.spool) * (1 - Math.exp(-dt / spoolTau));
    const reheatTarget = this.spool > 1 ? clamp((this.spool - 1) / 0.12, 0, 1) : 0;
    this.reheat += (reheatTarget - this.reheat) * (1 - Math.exp(-dt / 0.6));

    // Gear and brakes. The gear cannot be commanded with a wheel on the ground.
    this.brake = !!cmd.brake; this.airbrake = !!cmd.airbrake;
    if (this.onGround) this.gear = true;
    this.gearPosition += clamp((this.gear ? 1 : 0) - this.gearPosition, -dt / 2.6, dt / 2.6);
    this._airbrakePos += ((this.airbrake ? 1 : 0) - this._airbrakePos) * (1 - Math.exp(-dt / 0.5));
    const gp = this.gearPosition;

    this.mass = MASS_FULL - 250 * (4 - this.bombs);
    const mass = this.mass;
    const inertiaScale = mass / MASS_FULL;
    // Inertia in the three.js body frame: pitch about x, yaw about y, roll about z.
    const Ix = 105000 * inertiaScale, Iy = 120000 * inertiaScale, Iz = 24000 * inertiaScale;

    // Air data.
    const { forward, up, right } = this.basis();
    const vel = this.velocity;
    const speed = vel.length();
    const vg = Math.max(speed, 5);
    const h = this.position.y;
    const rho = RHO0 * Math.exp(-Math.max(0, h) / 9500);
    const invAttitude = this.attitude.clone().invert();
    const vb = vel.clone().applyQuaternion(invAttitude); // body: x right, y up, z back
    let alpha = 0, beta = 0;
    if (speed >= 5) {
      alpha = Math.atan2(-vb.y, -vb.z);
      beta = Math.asin(clamp(vb.x / speed, -1, 1));
    }
    const qbar = 0.5 * rho * speed * speed;
    const mach = speed / speedOfSound(h);
    const p = -this.omega.z, q = this.omega.x, r = -this.omega.y;
    const ph = p * SPAN / (2 * vg), qh = q * CHORD / (2 * vg), rh = r * SPAN / (2 * vg);

    // Fly-by-wire (spec 2.5), gain-scheduled on dynamic pressure.
    const qn = clamp(qbar, 3000, 40000) / 15000;
    const { pull, push } = qMax(speed);
    const pitchIn = clamp(cmd.pitch || 0, -1, 1);
    const rollIn = clamp(cmd.roll || 0, -1, 1);
    const yawIn = clamp(cmd.yaw || 0, -1, 1);
    let qDem = pitchIn >= 0 ? pitchIn * pull : pitchIn * push;
    qDem = Math.min(qDem, 6 * (0.34 - alpha));
    qDem = Math.max(qDem, 6 * (-0.14 - alpha));
    const qErr = qDem - q;
    // The integrator leaks while the nose wheel carries load: the loop cannot close with the
    // nose held, and a wound-up integrator would otherwise hold full nose-up after release.
    if (this.legs[0].contact) this._pitchIntegral *= Math.exp(-dt / 0.3);
    const elevonRaw = -(0.9 * qErr + 1.2 * this._pitchIntegral) / qn;
    const windingUp = (elevonRaw <= -0.44 && qErr > 0) || (elevonRaw >= 0.44 && qErr < 0);
    if (!windingUp) this._pitchIntegral = clamp(this._pitchIntegral + qErr * dt, -0.3, 0.3);
    const elevonTarget = clamp(-(0.9 * qErr + 1.2 * this._pitchIntegral) / qn, -0.44, 0.44);
    this.elevon += clamp(elevonTarget - this.elevon, -3.5 * dt, 3.5 * dt);
    const aileronTarget = clamp(0.8 * (rollIn * pMax(speed, this.bombs, gp) - p) / qn, -0.35, 0.35);
    this.aileron += clamp(aileronTarget - this.aileron, -5 * dt, 5 * dt);
    this.rudderAngle = clamp(-yawIn * 0.52 * clamp(1 - speed / 250, 0.15, 1) - 1.5 * beta + 0.15 * r, -0.52, 0.52);
    // Nose wheel steering authority falls with the square of speed, so that full deflection asks
    // for about a third of a g of lateral acceleration whatever the speed. A gentler schedule lets
    // a taxi turn command 0.9 g, which lifts the inner main wheel and rolls the aircraft over: the
    // roll moment acts 1.87 m above the contact and its restoring arm shrinks as the bank grows.
    // The real aircraft limits steering angle with speed for the same reason.
    const steering = yawIn * clamp(19 / (Math.max(speed, 5.6) ** 2), 0.02, 0.6);
    const de = this.elevon, da = this.aileron, dr = this.rudderAngle;

    // Aerodynamic coefficients (spec 2.4).
    const aa = Math.abs(alpha);
    const sgnAlpha = alpha < 0 ? -1 : 1;
    let CL = aa <= 0.32 ? 0.05 + 3.4 * alpha : sgnAlpha * Math.max(0.6, 1.14 - (aa - 0.32) * 1.8);
    CL += 0.35 * de;
    const wave = smoothstep(mach, 0.88, 1.10);
    const CD0 = 0.021 + 0.025 * gp + 0.07 * this._airbrakePos + 0.004 * this.bombs;
    const CD = CD0 * (1 + 2 * wave) + 0.16 * CL * CL * (1 + 1.5 * wave) + 0.4 * Math.max(0, aa - 0.28);
    const CY = -0.85 * beta + 0.18 * dr;
    const Cl = -0.06 * beta - 0.32 * ph + 0.10 * rh + 0.11 * da;
    const Cm = -0.02 - 0.30 * alpha - 7.5 * qh - 1.2 * de - 0.35 * smoothstep(aa, 0.30, 0.45) * sgnAlpha;
    const Cn = 0.10 * beta - 0.28 * rh - 0.02 * ph - 0.09 * dr + 0.012 * da;

    const velDir = speed > 0.1 ? vel.clone().divideScalar(speed) : forward.clone();
    let liftDir = right.clone().cross(velDir);
    if (liftDir.lengthSq() < 1e-6) liftDir = up.clone(); else liftDir.normalize();
    const qS = qbar * WING_AREA;
    const force = V3(); // world, everything but gravity
    force.addScaledVector(liftDir, qS * CL);
    force.addScaledVector(velDir, -qS * CD);
    force.addScaledVector(right, qS * CY);
    const thrustScale = Math.pow(rho / RHO0, 0.75);
    const thrust = 120000 * (0.04 + 0.96 * Math.min(this.spool, 1)) * thrustScale * (1 + 0.25 * mach)
      + 60000 * this.reheat * thrustScale * (1 + 0.4 * mach);
    force.addScaledVector(forward, thrust);
    const airframeLoad = force.dot(up) / (mass * G0);
    // Body torque: x = pitching moment M, y = -N (yaw), z = -L (roll).
    const torque = V3(qS * CHORD * Cm, -qS * SPAN * Cn, -qS * SPAN * Cl);

    // Wheels (spec 2.6). Springs first, then friction against the velocity predicted after the
    // other forces so a parked aircraft holds still against idle thrust instead of creeping.
    const omegaWorld = this.omega.clone().applyQuaternion(this.attitude);
    const bank = Math.atan2(-right.y, up.y);
    const pitchAttitude = Math.asin(clamp(forward.y, -1, 1));
    const groundSpeed = Math.hypot(vel.x, vel.z);
    const contacts = [];
    let touchdown = false;
    for (let i = 0; i < 3; i++) {
      const leg = this.legs[i];
      const pb = LEG_POINTS[i];
      const wheelBody = V3(pb.x, BELLY_Y + (pb.y - BELLY_Y) * gp, pb.z);
      const rw = wheelBody.applyQuaternion(this.attitude);
      const pw = rw.clone().add(this.position);
      const pavement = onPavement(pw.x, pw.z);
      const pen = (pavement ? 0 : terrainHeight(pw.x, pw.z)) - pw.y;
      if (pen <= 0) {
        leg.contact = false; leg.compression = 0; leg.load = 0;
        leg.spin *= Math.exp(-dt / 4);
        continue;
      }
      const vPoint = vel.clone().add(omegaWorld.clone().cross(rw));
      const closing = -vPoint.y;
      if (!leg.contact) {
        touchdown = true;
        this.impact = Math.abs(vel.y);
        if (gp < 0.9) this.crash('gear');
        else if (vel.y < -5.5) this.crash('impact');
        else if (Math.abs(bank) > 15 * Math.PI / 180 || pitchAttitude < -6 * Math.PI / 180) this.crash('attitude');
      }
      if (pen >= TRAVEL && closing > 3) this.crash('impact');
      if (!pavement && groundSpeed > 25) this.crash('terrain');
      if (this.crashed) return;
      const k = LEG_K[i], share = LEG_SHARE[i] * mass;
      let fz = k * pen + 2 * 0.7 * Math.sqrt(k * share) * closing;
      if (pen > TRAVEL) fz += 5 * k * (pen - TRAVEL);
      fz = Math.max(0, fz);
      leg.contact = true; leg.compression = clamp(pen / TRAVEL, 0, 1); leg.load = fz;
      force.y += fz;
      torque.add(rw.clone().cross(V3(0, fz, 0)).applyQuaternion(invAttitude));
      contacts.push({ i, leg, rw, vPoint, fz, pavement, share });
    }
    if (contacts.length) {
      const predicted = force.clone().divideScalar(mass); predicted.y -= G0;
      for (const c of contacts) {
        let dirLong = V3(forward.x, 0, forward.z);
        if (dirLong.lengthSq() < 1e-6) dirLong = V3(0, 0, -1); else dirLong.normalize();
        if (c.i === 0 && steering !== 0) dirLong.applyAxisAngle(WORLD_UP, -steering);
        const dirLat = dirLong.clone().cross(WORLD_UP); // right of the wheel
        const vLong = c.vPoint.dot(dirLong) + predicted.dot(dirLong) * dt;
        const vLat = c.vPoint.dot(dirLat) + predicted.dot(dirLat) * dt;
        const muLong = (c.pavement ? 0.02 : 0.08) + (this.brake && c.i > 0 ? 0.45 : 0);
        const cap = c.share / dt; // force that would null the velocity in one step
        const fLong = -Math.sign(vLong) * Math.min(muLong * c.fz, cap * Math.abs(vLong));
        const slip = Math.atan2(vLat, Math.max(Math.abs(vLong), 2));
        const fLat = -Math.sign(vLat) * Math.min(Math.min(8 * c.fz * Math.abs(slip), 0.7 * c.fz), cap * Math.abs(vLat));
        const f = dirLong.clone().multiplyScalar(fLong).addScaledVector(dirLat, fLat);
        force.add(f);
        torque.add(c.rw.clone().cross(f).applyQuaternion(invAttitude));
        c.leg.spin = c.vPoint.dot(dirLong) / 0.31;
      }
    }
    const anyContact = contacts.length > 0;
    const allContact = contacts.length === 3;
    if (anyContact) {
      if (touchdown && this.airborneTime > 10) this.landed = true;
      this.airborneTime = 0;
    } else this.airborneTime += dt;
    this._groundedTime = allContact ? this._groundedTime + dt : 0;
    this.onGround = anyContact;
    this.grounded = allContact && this._groundedTime >= 0.2;
    this.load = force.dot(up) / (mass * G0);

    // Integrate: semi-implicit Euler, Euler's equations in the body frame.
    force.y -= mass * G0;
    this.velocity.addScaledVector(force, dt / mass);
    this.position.addScaledVector(this.velocity, dt);
    const w = this.omega;
    const gyro = V3(w.y * Iz * w.z - w.z * Iy * w.y, w.z * Ix * w.x - w.x * Iz * w.z, w.x * Iy * w.y - w.y * Ix * w.x);
    w.x += (torque.x - gyro.x) / Ix * dt;
    w.y += (torque.y - gyro.y) / Iy * dt;
    w.z += (torque.z - gyro.z) / Iz * dt;
    const rate = w.length();
    if (rate > 6) w.multiplyScalar(6 / rate);
    if (rate > 1e-9) {
      const dq = new THREE.Quaternion().setFromAxisAngle(w.clone().divideScalar(rate), Math.min(rate, 6) * dt);
      this.attitude.multiply(dq).normalize();
    }

    // Crashes that do not need a wheel.
    if (airframeLoad > 12 || airframeLoad < -5) this.crash('airframe');
    else if (this.position.y < JERSEY.seaLevel && terrainHeight(this.position.x,this.position.z) < JERSEY.seaLevel) this.crash('water');
    else {
      for (const tip of [NOSE_TIP, ...WINGTIPS]) {
        const pw = tip.clone().applyQuaternion(this.attitude).add(this.position);
        if (pw.y < groundAt(pw.x, pw.z)) { this.crash('attitude'); break; }
      }
    }

    // Air data and cues for the renderer (spec 2.2 and 2.7).
    this.alpha = alpha; this.beta = beta; this.mach = mach; this.qbar = qbar; this.rho = rho;
    this.ias = speed * Math.sqrt(rho / RHO0);
    this.verticalSpeed = this.velocity.y;
    this.stallSpeed = Math.sqrt(2 * mass * G0 / (RHO0 * WING_AREA * 1.14));
    this.buffet = smoothstep(alpha, 0.24, 0.34) * clamp(qbar / 8000, 0, 1);
    this.condensation = smoothstep(alpha, 0.17, 0.30) * clamp((speed - 80) / 120, 0, 1);
    this.stall = alpha > 0.34 && !this.onGround;
    this.stopped = this.grounded && speed < 0.5;
    // Canards follow the elevons in flight and droop leading edge down with weight on wheels.
    const droopTarget = this.onGround && groundSpeed < 40 ? 1 : 0;
    this._droop += (droopTarget - this._droop) * (1 - Math.exp(-dt / 0.4));
    const canard = (-0.6 * de) * (1 - this._droop) + (-0.35) * this._droop;
    const s = this.surfaces;
    s.canardL = canard; s.canardR = canard;
    s.elevonL = de + da; s.elevonR = de - da;
    s.rudder = dr;
    s.airbrake = this._airbrakePos;
    s.nozzle = clamp((this.spool - 0.85) / 0.27, 0, 1);
    s.steering = steering;
  }
}

// Ballistic practice bomb with fin-stabilised drag so it noses over. Returns true on impact,
// where the ground is the terrain, or sea level over water.
export function bombStep(bomb, dt) {
  bomb.velocity.y -= G0 * dt;
  bomb.velocity.multiplyScalar(Math.exp(-0.018 * dt));
  bomb.position.addScaledVector(bomb.velocity, dt);
  const { x, z } = bomb.position;
  let ground = terrainHeight(x, z);
  ground = Math.max(ground, JERSEY.seaLevel);
  return bomb.position.y <= ground;
}
