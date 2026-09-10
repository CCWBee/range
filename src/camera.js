// RANGE chase camera. Spec: docs/specs/2026-09-06-range-v2.md section 5.2.
//
// The camera is aligned to the aircraft's path, not to the mouse. Its offset is filtered in the
// aircraft's own frame, so a roll swings the camera and it settles back, while forward speed never
// stretches the distance. Load factor and buffet move it, and it never drops below 2.7 m of ground.
import * as THREE from '../vendor/three.module.js';
import { groundHeight } from '../physics.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const WORLD_UP = V3(0, 1, 0);

// The aircraft camera continues updating underneath this override. Releasing follow therefore
// restores its current mode immediately, without blending back from a distant impact site.
export class MunitionCamera {
  constructor() { this.target=null; this.direction=V3(); this.offset=V3(); }
  update(camera, target, held, dt) {
    if (!held || !target || target.expired || !target.mesh?.parent) { this.target=null; return false; }
    const fresh=this.target!==target;
    this.target=target;
    const path=target.velocity.clone().normalize();
    if (fresh) this.direction.copy(path);
    else this.direction.lerp(path,1-Math.exp(-dt*3)).normalize();
    const bomb=!!target.guided;
    const offset=this.direction.clone().multiplyScalar(bomb?-42:-30).add(V3(0,bomb?18:9,0));
    if (fresh) this.offset.copy(offset);
    else this.offset.lerp(offset,1-Math.exp(-dt*4));
    camera.position.copy(target.position).add(this.offset);
    camera.position.y=Math.max(camera.position.y,groundHeight(camera.position.x,camera.position.z)+2);
    camera.up.copy(WORLD_UP);
    camera.lookAt(target.position);
    return true;
  }
}

export class ChaseCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(51, aspect, 0.8, 65000);
    this.mode = 0;
    this.smoothForward = V3(0, 0, -1);
    this.localOffset = V3(0, 6.5, 24);
    this.localVelocity = V3();
    this.lookDirection = V3(0, 0, -1);
    this.viewForward = V3(0, 0, -1);
    this.noisePhase = 0;
    this.scratch = { desired: V3(), local: V3(), look: V3(), up: V3() };
  }

  toggle() { this.mode = 1 - this.mode; }

  // running false holds the pre-start pose: a low three-quarter view of the parked aircraft.
  update(dt, flight, aim, running, snap = false, input = null) {
    const camera = this.camera;
    const { forward, up } = flight.basis();
    const speed = flight.velocity.length();
    const s = this.scratch;

    // Smoothed path direction: the velocity above 40 m/s, the nose below it.
    const target = speed >= 40 ? flight.velocity.clone().divideScalar(speed) : forward.clone();
    if (snap) this.smoothForward.copy(target);
    else this.smoothForward.lerp(target, 1 - Math.exp(-dt / 0.35));
    if (this.smoothForward.lengthSq() < 1e-6) this.smoothForward.copy(forward);
    this.smoothForward.normalize();
    const fs = this.smoothForward;
    let viewTarget = fs.clone();
    if (aim?.direction && !input?.freeLook && !input?.returningLook) {
      const angle = fs.angleTo(aim.direction);
      const weight = lerp(.15, .88, THREE.MathUtils.smoothstep(angle, .25, 1.1));
      const orbit = new THREE.Quaternion().setFromUnitVectors(fs, aim.direction);
      orbit.slerp(new THREE.Quaternion(), 1 - weight);
      viewTarget.applyQuaternion(orbit);
    }
    if (snap) this.viewForward.copy(viewTarget);
    else {
      const rotation = new THREE.Quaternion().setFromUnitVectors(this.viewForward, viewTarget);
      rotation.slerp(new THREE.Quaternion(), Math.exp(-dt * 7));
      this.viewForward.applyQuaternion(rotation).normalize();
    }

    if (!running) {
      camera.position.copy(flight.position).add(V3(13, 4.2, 21));
      s.look.copy(flight.position).add(V3(0, 0.6, 0));
      camera.up.copy(WORLD_UP);
      camera.lookAt(s.look);
      camera.fov = 46;
      camera.updateProjectionMatrix();
      this.localVelocity.set(0, 0, 0);
      return;
    }

    const distance = (this.mode ? 38 : 24) + 4 * clamp(speed / 300, 0, 1);
    const height = this.mode ? 8 : 4.8;
    s.desired.copy(this.viewForward).multiplyScalar(-distance).addScaledVector(WORLD_UP, height);
    // Load factor pulls the camera down and back, 0.35 m per g beyond one.
    const pull = clamp(flight.load - 1, -3, 8) * 0.35;
    s.desired.addScaledVector(WORLD_UP, -pull).addScaledVector(fs, -pull);
    // Buffet: a 12 Hz shake of 0.06 m per unit.
    if (flight.buffet > 0.001) {
      this.noisePhase += dt * 12 * Math.PI * 2;
      const shake = flight.buffet * 0.06;
      s.desired.x += Math.sin(this.noisePhase) * shake;
      s.desired.y += Math.sin(this.noisePhase * 1.7 + 1.3) * shake;
    }

    // Filter in the aircraft's frame: translation stays rigid, rotation lags.
    s.local.copy(s.desired).applyQuaternion(flight.attitude.clone().invert());
    if (snap) {
      this.localOffset.copy(s.local);
      this.localVelocity.set(0, 0, 0);
    } else {
      const omega = 6;
      const step = Math.min(dt, 1 / 30);
      const accel = s.local.clone().sub(this.localOffset).multiplyScalar(omega * omega)
        .addScaledVector(this.localVelocity, -2 * omega);
      this.localVelocity.addScaledVector(accel, step);
      this.localOffset.addScaledVector(this.localVelocity, step);
    }
    camera.position.copy(this.localOffset).applyQuaternion(flight.attitude).add(flight.position);
    const floor = groundHeight(camera.position.x, camera.position.z) + 2.7;
    if (camera.position.y < floor) camera.position.y = floor;

    // The view follows large mouse requests around the aircraft, while the aircraft still has
    // to turn under its own lift. Small corrections keep the familiar view down the flight path.
    this.lookDirection.copy(this.viewForward);
    // Keep the optical axis on the requested direction. Looking at a point ahead of the
    // aircraft from an elevated camera introduces a permanent downward aiming error.
    s.look.copy(camera.position).addScaledVector(this.lookDirection, 1000);
    s.up.copy(WORLD_UP).lerp(up, 0.3);
    if (s.up.lengthSq() < 1e-6) s.up.copy(WORLD_UP);
    camera.up.copy(s.up).normalize();
    camera.lookAt(s.look);

    // C orbits the view without changing the instructor's saved world direction.
    if (input) {
      if (!input.freeLook) input.look.multiplyScalar(Math.exp(-dt * 9));
      if (input.look.length() < .002) { input.look.set(0,0); input.returningLook=false; }
      if (input.look.lengthSq() > 0) {
        const orbit = camera.position.clone().sub(flight.position);
        orbit.applyAxisAngle(WORLD_UP, -input.look.x);
        const right = WORLD_UP.clone().cross(orbit).normalize();
        orbit.applyAxisAngle(right, input.look.y);
        camera.position.copy(flight.position).add(orbit);
        camera.position.y=Math.max(camera.position.y,groundHeight(camera.position.x,camera.position.z)+2.7);
        camera.up.copy(WORLD_UP);
        camera.lookAt(flight.position.clone().addScaledVector(fs,3));
      }
    }

    const fov = (input?.keys.has('KeyZ') || input?.zoomHeld) ? 26 : lerp(50, 58, clamp(speed / 300, 0, 1));
    camera.fov = snap ? fov : lerp(camera.fov, fov, 1 - Math.exp(-dt * 8));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
}
