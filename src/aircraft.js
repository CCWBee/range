// RANGE aircraft: the Typhoon assembled from its parts, with every control surface, the gear and
// its doors, the nozzles, the reheat plumes, the lights and the condensation driven from the flight
// state. Spec: docs/specs/2026-09-06-range-v2.md section 5.6.
//
// Moving parts come from the library's `pivots` table: the part is exported pivot-relative, so the
// mesh sits at the pivot point and turns about the pivot axis. When the library has no pivots (the
// version 1 export) the whole aircraft is one asset and only the gear is hidden and shown.
import * as THREE from '../vendor/three.module.js';
import { groundHeight } from '../physics.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

// Body positions for the parts the library does not place for us.
const PYLONS = [[-1.85, -0.80, 0.45], [1.85, -0.80, 0.45], [-2.85, -0.57, 1.25], [2.85, -0.57, 1.25]];
const WINGTIPS = [[-5.35, -0.05, 3.6], [5.35, -0.05, 3.6]];

const FLAME_FRAGMENT = `
varying vec3 p;
uniform float time, power;
uniform vec3 eyeLocal;
void main(){
 vec3 ray=normalize(p-eyeLocal);
 vec3 light=vec3(0.);
 for(int i=0;i<24;i++){
  vec3 s=p-ray*(float(i)*.065);
  float t=s.z+.5;
  if(t>0.&&t<1.){
   float radius=.31*(1.-t*.6);
   float r=length(s.xy)/radius;
   float turbulence=1.+.10*sin(t*63.+s.x*26.-time*43.)+.07*cos(s.y*29.+t*81.+time*31.);
   float density=exp(-r*r*5.)*pow(1.-t,.8)*turbulence;
   // The shock diamonds are softened at the cone edge so the plume has no hard rim.
   float shock=pow(max(0.,cos(t*31.)),16.)*.65*smoothstep(1.35,.7,r);
   vec3 colour=mix(vec3(.7,.8,2.5),vec3(3.4,.86,.16),smoothstep(.035,.16,t));
   colour+=vec3(1.2,.8,.5)*shock;
   light+=colour*density*.085*smoothstep(1.5,.85,r);
  }
 }
 gl_FragColor=vec4(light*power*4.5,1.);
}`;

export class Aircraft {
  constructor(library, scene, quadGeometry) {
    this.library = library;
    this.scene = scene;
    this.quadGeometry = quadGeometry;
    this.root = new THREE.Group();
    this.parts = {};
    this.pivoted = {};
    this.wheels = [];
    this.stores = [];
    this.strobePhase = 0;
    scene.add(this.root);

    this.assemble();
    this.buildStores();
    this.buildFlames();
    this.buildLights();
    this.buildCondensation();
    this.buildContactShadow();
  }

  // A part with a hinge becomes a group at the pivot point; without one it is added at the origin.
  setSkin(name) {
    const stems = { grey: 'raf_typhoon_skin', heritage: 'raf_typhoon_heritage' };
    const texture = stems[name] && this.library.texture(stems[name]);
    const material = this.library.materials.raf_airframe;
    if (!texture || !material?.map) return false;
    this.skinMaps ||= { grey: material.map };
    if (!this.skinMaps[name]) {
      const map = this.skinMaps.grey.clone();
      map.image = texture.image;
      map.needsUpdate = true;
      this.skinMaps[name] = map;
    }
    material.map = this.skinMaps[name];
    material.needsUpdate = true;
    this.skinName = name;
    return true;
  }

  addPart(name, parent = this.root) {
    if (!this.library.has(name)) return null;
    const group = this.library.asset(name);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const pivot = this.library.pivot(name);
    if (pivot) {
      const hinge = new THREE.Group();
      hinge.position.copy(pivot.point);
      hinge.add(group);
      parent.add(hinge);
      this.pivoted[name] = { hinge, pivot, group };
      return hinge;
    }
    parent.add(group);
    this.parts[name] = group;
    return group;
  }

  assemble() {
    const names = ['jet_body', 'jet_canopy', 'jet_canard_l', 'jet_canard_r', 'jet_elevon_l',
      'jet_elevon_r', 'jet_rudder', 'jet_airbrake', 'jet_nozzle_l', 'jet_nozzle_r',
      'jet_gear_nose', 'jet_gear_main_l', 'jet_gear_main_r',
      'jet_door_nose', 'jet_door_main_l', 'jet_door_main_r'];
    let found = 0;
    for (const name of names) if (this.addPart(name)) found++;
    if (found === 0) {
      // Version 1 library: one `jet` asset with the gear as a second monolithic asset.
      this.legacy = true;
      const jet = this.library.asset('jet');
      jet.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.root.add(jet);
      this.parts.jet = jet;
      const gear = this.library.asset('gear');
      gear.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.root.add(gear);
      this.parts.gear = gear;
      console.warn('RANGE: no jet parts in the library, using the version 1 monolithic jet and gear');
    } else {
      console.log(`RANGE: aircraft assembled from ${found} parts, ${Object.keys(this.pivoted).length} on hinges`);
    }
    // The canopy glass is its own material: dark, glossy and see-through.
    const canopy = this.library.materials.canopy;
    if (canopy) {
      canopy.transparent = true;
      canopy.opacity = 0.85;
      canopy.envMapIntensity = 1.2;
      canopy.roughness = Math.min(canopy.roughness, 0.12);
      canopy.side = THREE.DoubleSide;
    }
    // The tyre of each gear leg turns about body X through the centre of its rubber part.
    for (const [name, index] of [['jet_gear_nose', 0], ['jet_gear_main_l', 1], ['jet_gear_main_r', 2]]) {
      const entry = this.pivoted[name] || (this.parts[name] ? { group: this.parts[name] } : null);
      if (!entry) continue;
      const leg = entry.group;
      let spinner = null;
      for (const mesh of leg.children) {
        if (!mesh.isMesh || !/rubber|tyre/i.test(mesh.name)) continue;
        mesh.geometry.computeBoundingBox();
        const centre = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
        const hub = new THREE.Group();
        hub.position.copy(centre);
        leg.remove(mesh);
        mesh.position.copy(centre).negate();
        hub.add(mesh);
        leg.add(hub);
        spinner = hub;
      }
      if (spinner) this.wheels[index] = spinner;
      // Leg length below the hinge, for the oleo squash.
      const bounds = this.library.bounds(name);
      const pivot = this.library.pivot(name);
      if (bounds && pivot) {
        const length = Math.max(0.4, pivot.point.y - (bounds.min.y + pivot.point.y));
        this.pivoted[name].legLength = Math.max(0.4, Math.abs(bounds.min.y)) || length;
      }
    }
  }

  buildStores() {
    if (!this.library.has('bomb')) return;
    for (const [x, y, z] of PYLONS) {
      const bomb = this.library.asset('bomb');
      bomb.position.set(x, y, z);
      bomb.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.root.add(bomb);
      this.stores.push(bomb);
    }
    this.addPart('jet_detail');
    this.missileStores=[];
    if(this.library.has('sidewinder'))for(const side of [-1,1]){
      const missile=this.library.asset('sidewinder');missile.position.set(side*3.68,-.49,1.15);
      missile.traverse(o=>{if(o.isMesh)o.castShadow=true;});this.root.add(missile);this.missileStores.push(missile);
    }
  }

  buildFlames() {
    this.flameMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, power: { value: 0 }, eyeLocal: { value: V3() } },
      vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: FLAME_FRAGMENT,
    });
    this.flames = [];
    const geometry = this.library.geometries.flame;
    if (!geometry) return;
    for (const x of [-0.55, 0.55]) {
      // Each nozzle has its own object space, including the animated plume length.
      const material = this.flameMaterial.clone();
      const flame = this.library.asset('flame', material);
      flame.userData.material = material;
      flame.position.set(x, -0.1, 8.7);
      flame.scale.set(1, 1, 5);
      flame.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.onBeforeRender = (_renderer, _scene, camera) => {
          material.uniforms.eyeLocal.value.copy(camera.position);
          o.worldToLocal(material.uniforms.eyeLocal.value);
        };
      });
      this.root.add(flame);
      this.flames.push(flame);
    }
    this.reheatLight = new THREE.PointLight(0xff7022, 0, 18, 2);
    this.reheatLight.position.set(0, -0.2, 7.7);
    this.root.add(this.reheatLight);
  }

  buildLights() {
    const lamp = (colour, position, size) => {
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { colour: { value: new THREE.Color(colour) }, strength: { value: 1 } },
        vertexShader: 'varying vec2 uvp;void main(){uvp=position.xy+.5;vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);gl_Position=projectionMatrix*(c+vec4(position.xy*' + size.toFixed(2) + ',0.,0.));}',
        fragmentShader: 'varying vec2 uvp;uniform vec3 colour;uniform float strength;void main(){float d=length(uvp-.5)*2.;gl_FragColor=vec4(colour,pow(max(0.,1.-d),2.6)*strength);}',
      });
      const mesh = new THREE.Mesh(this.quadGeometry, material);
      mesh.position.set(...position);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return material;
    };
    // Navigation lights: red on the left wingtip, green on the right, white at the tail.
    this.navLights = [
      lamp(0xff2a1e, WINGTIPS[0], 0.55),
      lamp(0x24ff62, WINGTIPS[1], 0.55),
      lamp(0xfff2dc, [0, 1.1, 5.6], 0.45),
    ];
    // Strobes: fin and belly, a double flash every 1.4 s.
    this.strobes = [lamp(0xffffff, [0, 3.5, 4.4], 1.1), lamp(0xffffff, [0, -0.85, 0.4], 1.1)];
    // The landing light lives in the scene from load, because adding or removing a light
    // recompiles every material in the scene. Its intensity follows the gear.
    this.landingLight = new THREE.SpotLight(0xfff0d2, 0, 260, 0.30, 0.45, 1.2);
    this.landingLight.position.set(0, -1.4, -4.2);
    this.landingLight.target.position.set(0, -3.4, -70);
    this.root.add(this.landingLight);
    this.root.add(this.landingLight.target);
  }

  buildCondensation() {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
      uniforms: { opacity: { value: 0 } },
      vertexShader: 'varying vec2 uvp;void main(){uvp=position.xy+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 uvp;uniform float opacity;void main(){float d=length(uvp-.5)*2.;gl_FragColor=vec4(vec3(.92,.95,.97),pow(max(0.,1.-d),1.8)*opacity);}',
    });
    this.condensationMaterial = material;
    this.condensation = [];
    for (const [x, y, z, s] of [[-2.6, 0.15, 2.2, 3.4], [2.6, 0.15, 2.2, 3.4], [0, 1.1, -1.6, 2.2]]) {
      const mesh = new THREE.Mesh(this.quadGeometry, material);
      mesh.position.set(x, y, z);
      // The exported quad is XY. Lay it over the wing in XZ, with its length aft.
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(s);
      mesh.userData.base = s;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.condensation.push(mesh);
    }
  }

  // A soft dark disc under the aircraft. A sun eleven degrees above the horizon cannot ground an
  // aircraft on its own, and this is what reads as contact in the ramp and landing frames.
  buildContactShadow() {
    const material = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity: 0, color: 0x05080a,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 uvp;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a*=pow(max(0.,1.-length(uvp-.5)*2.),1.6);');
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 uvp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nuvp=position.xz+.5;');
    };
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.contactShadow = new THREE.Mesh(geometry, material);
    this.contactShadow.scale.setScalar(13);
    this.contactShadow.renderOrder = 2;
    this.scene.add(this.contactShadow);
  }

  // Angle a hinged part, mapping 0..1 over its stowed-to-deployed range where one is given.
  setHinge(name, angle) {
    const entry = this.pivoted[name];
    if (!entry) return;
    entry.hinge.quaternion.setFromAxisAngle(entry.pivot.axis, angle);
  }

  setHingeFraction(name, fraction) {
    const entry = this.pivoted[name];
    if (!entry) return;
    const [stowed, deployed] = entry.pivot.range;
    this.setHinge(name, stowed + (deployed - stowed) * clamp(fraction, 0, 1));
  }

  update(dt, flight, camera, elapsed) {
    this.root.position.copy(flight.position);
    this.root.quaternion.copy(flight.attitude);
    const s = flight.surfaces;

    this.setHinge('jet_canard_l', s.canardL);
    this.setHinge('jet_canard_r', s.canardR);
    this.setHinge('jet_elevon_l', s.elevonL);
    this.setHinge('jet_elevon_r', s.elevonR);
    this.setHinge('jet_rudder', s.rudder);
    this.setHinge('jet_airbrake', s.airbrake * 0.9);

    // Nozzles: the petal ring closes radially as the engine spools up.
    const petal = 1 - 0.18 * (1 - s.nozzle);
    for (const name of ['jet_nozzle_l', 'jet_nozzle_r']) {
      const entry = this.pivoted[name];
      if (entry) entry.group.scale.set(petal, petal, 1);
      else if (this.parts[name]) this.parts[name].scale.set(petal, petal, 1);
    }

    // Gear: the legs swing over their range, the doors lead by 0.15 of the travel.
    const gp = flight.gearPosition;
    const doorFraction = clamp(gp * 1.15, 0, 1);
    for (const name of ['jet_gear_nose', 'jet_gear_main_l', 'jet_gear_main_r']) this.setHingeFraction(name, gp);
    for (const name of ['jet_door_nose', 'jet_door_main_l', 'jet_door_main_r']) this.setHingeFraction(name, doorFraction);
    if (this.legacy && this.parts.gear) {
      this.parts.gear.visible = gp > 0.01;
      this.parts.gear.scale.y = Math.max(0.01, gp);
    }
    // Wheels turn with their ground speed, and the oleo squashes under load.
    for (let i = 0; i < 3; i++) {
      const leg = flight.legs[i];
      if (this.wheels[i]) this.wheels[i].rotation.x += leg.spin * dt;
      const name = ['jet_gear_nose', 'jet_gear_main_l', 'jet_gear_main_r'][i];
      const entry = this.pivoted[name];
      if (entry && entry.legLength) {
        entry.group.scale.y = 1 - clamp(leg.compression * 0.35 / entry.legLength, 0, 0.4);
      }
    }

    // Reheat, driven by the lit fraction rather than the raw throttle.
    const power = flight.crashed ? 0 : flight.reheat;
    if (this.flameMaterial) {
      this.flameMaterial.uniforms.time.value = elapsed;
      this.flameMaterial.uniforms.power.value = power;
      if (camera) {
        this.flameMaterial.uniforms.eyeLocal.value.copy(camera.position);
        this.root.worldToLocal(this.flameMaterial.uniforms.eyeLocal.value);
      }
    }
    for (const flame of this.flames || []) {
      flame.visible = power > 0.01;
      flame.userData.material.uniforms.time.value = elapsed;
      flame.userData.material.uniforms.power.value = power;
      const length = 1.1 + power * 2.0 + Math.sin(elapsed * 77) * 0.08;
      flame.scale.z = length;
      flame.position.z = 6.2 + length / 2;
    }
    if (this.reheatLight) this.reheatLight.intensity = power * 60;

    // Lights. It is dusk, so the navigation lights are on from the start.
    const strobe = (elapsed % 1.4);
    const flash = (strobe < 0.06 || (strobe > 0.16 && strobe < 0.22)) ? 1 : 0;
    for (const material of this.strobes) material.uniforms.strength.value = flash;
    for (const material of this.navLights) material.uniforms.strength.value = 0.85;
    if (this.landingLight) this.landingLight.intensity = gp * 70;

    // Condensation over the wing roots and the canopy when the aircraft is pulling hard and fast.
    this.condensationMaterial.uniforms.opacity.value = flight.crashed ? 0 : flight.condensation * 0.6;
    const spread = 1 + clamp(flight.qbar / 30000, 0, 1) * 0.8;
    const airflow = flight.velocity.clone().applyQuaternion(flight.attitude.clone().invert()).normalize();
    for (const mesh of this.condensation) {
      mesh.rotation.set(-Math.PI / 2 + Math.atan2(airflow.y, -airflow.z), 0, 0);
      mesh.scale.set(mesh.userData.base * spread, mesh.userData.base * (1.3 + spread * .6), 1);
    }

    // Contact shadow, fading out as the aircraft climbs away from the ground.
    const ground = groundHeight(flight.position.x, flight.position.z);
    const height = flight.position.y - ground;
    this.contactShadow.position.set(flight.position.x, ground + 0.06, flight.position.z);
    const { forward } = flight.basis();
    this.contactShadow.rotation.y = Math.atan2(forward.x, -forward.z);
    this.contactShadow.material.opacity = 0.5 * clamp(1 - height / 6, 0, 1);
    this.contactShadow.visible = this.contactShadow.material.opacity > 0.005 && !flight.crashed;
  }

  // Drop the store that goes with the next bomb, returning its world position.
  releaseStore(index) {
    const store = this.stores[index];
    if (!store) return this.root.localToWorld(V3(0, -0.7, 0.3));
    store.visible = false;
    return store.getWorldPosition(new THREE.Vector3());
  }

  resetStores() { for (const store of this.stores) store.visible = true; }
  releaseMissile(index){const store=this.missileStores[index];if(!store)return this.root.localToWorld(V3(0,-1,0));store.visible=false;return store.getWorldPosition(V3());}
  resetMissiles(){for(const store of this.missileStores||[])store.visible=true;}
}
