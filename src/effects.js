// RANGE effects: bombs and their impact craters, the gun and its tracers, explosions and the smoke
// that follows them, wheel spray and tyre smoke, and the range targets and their wrecks.
// Spec: docs/specs/2026-09-06-range-v2.md section 5.6.
//
// Everything that can be many at once is one instanced billboard mesh with a per-instance alpha,
// so a busy frame still costs one draw call per effect class.
import * as THREE from '../vendor/three.module.js';
import { bombStep, terrainHeight, groundHeight } from '../physics.js';
import { NOISE_GLSL } from './world.js';
import { guidedBombStep } from './engagement.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export const RANGE_PADS = [[-950, -3900], [-1090, -4050], [-800, -4170], [-1040, -4300], [-1220, -4190], [-860, -4430]];

const BILLBOARD_VERTEX = `
attribute float alpha;
varying vec2 uvp;
varying float vAlpha;
void main(){
 uvp=position.xy+.5;
 vAlpha=alpha;
 vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
 vec2 size=vec2(instanceMatrix[0].x,instanceMatrix[1].y);
 gl_Position=projectionMatrix*(centre+vec4(position.xy*size,0.,0.));
}`;

// A pool of billboarded sprites, drawn in one call, with a soft noisy edge.
class SpritePool {
  constructor(scene, quadGeometry, count, fragment, options = {}) {
    this.count = count;
    this.live = [];
    this.alpha = new Float32Array(count);
    const geometry = quadGeometry.clone();
    geometry.setAttribute('alpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { tint: { value: new THREE.Color(options.tint || 0xffffff) } },
      vertexShader: BILLBOARD_VERTEX, fragmentShader: fragment,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.matrix = new THREE.Matrix4();
    scene.add(this.mesh);
  }

  spawn(particle) { if (this.live.length < this.count) this.live.push(particle); }

  clear() { this.live.length = 0; this.mesh.count = 0; }

  // step(particle, dt) returns false when the particle is done.
  update(dt, step) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (!step(this.live[i], dt)) this.live.splice(i, 1);
    }
    const n = Math.min(this.live.length, this.count);
    for (let i = 0; i < n; i++) {
      const p = this.live[i];
      this.matrix.makeScale(p.size * (p.width || 1), p.size, 1);
      this.matrix.setPosition(p.position.x, p.position.y, p.position.z);
      this.mesh.setMatrixAt(i, this.matrix);
      this.alpha[i] = p.alpha;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(library, scene, quadGeometry, audio) {
    this.library = library;
    this.scene = scene;
    this.quadGeometry = quadGeometry;
    this.audio = audio;
    this.bombs = [];
    this.shots = [];
    this.blasts = [];
    this.targets = [];
    this.killEvents = [];
    this.hitFlash = 0;
    this.rangeHit = 0;
    this.craterCount = 0;

    this.buildTargets();
    this.buildTracers();
    this.buildCraters();
    this.smoke = new SpritePool(scene, quadGeometry, 280, `
varying vec2 uvp;varying float vAlpha;uniform vec3 tint;${NOISE_GLSL}
void main(){
 float d=length(uvp-.5)*2.;
 float n=fbm(uvp*8.);
 float a=smoothstep(.96,.18,d+n*.25)*smoothstep(.22,.6,n)*vAlpha;
 vec3 shade=mix(vec3(.012,.014,.018),vec3(.12,.13,.14),uvp.y*.65+n*.4);
 gl_FragColor=vec4(shade,a);
}`, { tint: 0x30383d });
    this.spray = new SpritePool(scene, quadGeometry, 96, `
varying vec2 uvp;varying float vAlpha;uniform vec3 tint;${NOISE_GLSL}
void main(){
 float d=length(uvp-.5)*2.;
 float n=fbm(uvp*6.+.5);
 gl_FragColor=vec4(tint*(.8+n*.5),smoothstep(1.,.05,d)*(.35+n*.65)*vAlpha);
}`, { tint: 0x9aa6ab });
    this.fire = new SpritePool(scene,quadGeometry,128,`
varying vec2 uvp;varying float vAlpha;uniform vec3 tint;${NOISE_GLSL}
void main(){vec2 q=(uvp-.5)*2.;float n=fbm(uvp*11.+vAlpha*1.5);
 float edge=1.-length(q);float a=smoothstep(.03,.45,edge)*smoothstep(.25,.63,n)*vAlpha;
 vec3 c=mix(vec3(2.4,.16,.012),vec3(10.,6.5,3.2),smoothstep(.43,.74,n)*vAlpha);
 gl_FragColor=vec4(c,a);}`,{additive:true});
    this.rocketGlow=new SpritePool(scene,quadGeometry,48,`
varying vec2 uvp;varying float vAlpha;
void main(){float r=length((uvp-.5)*2.);float core=exp(-r*r*18.);
 gl_FragColor=vec4(mix(vec3(3.,.75,.12),vec3(7.,5.,2.8),core),pow(max(0.,1.-r),2.)*vAlpha);}`,{additive:true});
    this.sparks = new SpritePool(scene,quadGeometry,400,`
varying vec2 uvp;varying float vAlpha;uniform vec3 tint;
void main(){vec2 q=abs(uvp-.5)*2.;float a=pow(max(0.,1.-q.x),2.)*max(0.,1.-q.y)*vAlpha;
 gl_FragColor=vec4(vec3(5.,1.6,.23),a);}`,{additive:true});
    this.dust = new SpritePool(scene,quadGeometry,160,`
varying vec2 uvp;varying float vAlpha;uniform vec3 tint;${NOISE_GLSL}
void main(){float n=fbm(uvp*8.);float d=length((uvp-.5)*2.);
 gl_FragColor=vec4(mix(vec3(.09,.08,.065),vec3(.28,.27,.23),uvp.y+n*.2),smoothstep(1.,.1,d+n*.18)*vAlpha);}`);
    // Keep the light count fixed so detonations never recompile scene materials.
    this.blastLights=Array.from({length:2},()=>{const l=new THREE.PointLight(0xff963d,0,150,2);scene.add(l);return l;});
    this.debris=[];
    this.smokeShadow=this.buildSmokeShadow();
  }

  buildTargets() {
    if (!this.library.has('target')) return;
    for (const [x, z] of RANGE_PADS) {
      const mesh = this.library.asset('target');
      mesh.position.set(x, terrainHeight(x, z), z);
      mesh.rotation.y = Math.sin(x) * 0.7;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(mesh);
      this.targets.push({ mesh, position: mesh.position.clone(), hp: 3, destroyed: false, wreck: null });
    }
  }

  buildTracers() {
    if(this.library.has('practice_ship')) {
      const mesh=this.library.asset('practice_ship');mesh.position.set(4400,-82.6,-4300);
      mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(mesh);
      this.targets.push({mesh,position:mesh.position.clone().add(V3(0,4,0)),home:mesh.position.clone(),name:'PRACTICE COASTER',ship:true,hp:12,maxHp:12,destroyed:false,wreck:null});
    }
    const geometry = new THREE.CylinderGeometry(0.16, 0.16, 9, 6);
    this.tracerMesh = new THREE.InstancedMesh(
      geometry, new THREE.MeshBasicMaterial({ color: 0xffe7a1, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }), 64);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.scene.add(this.tracerMesh);
  }

  // Craters left by bomb impacts. They stay for the rest of the sortie.
  buildCraters() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x1a1613, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 uvp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nuvp=position.xz+.5;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 uvp;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a*=smoothstep(1.,.35,length(uvp-.5)*2.);');
    };
    this.craterMesh = new THREE.InstancedMesh(geometry, material, 32);
    this.craterMesh.frustumCulled = false;
    this.craterMesh.count = 0;
    this.scene.add(this.craterMesh);
  }

  addCrater(position, size) {
    if (this.craterCount >= 32) return;
    const matrix = new THREE.Matrix4();
    matrix.makeScale(size, 1, size);
    matrix.setPosition(position.x, terrainHeight(position.x, position.z) + 0.05, position.z);
    this.craterMesh.setMatrixAt(this.craterCount, matrix);
    this.craterCount++;
    this.craterMesh.count = this.craterCount;
    this.craterMesh.instanceMatrix.needsUpdate = true;
  }

  buildSmokeShadow(){
    const g=this.quadGeometry.clone();g.rotateX(-Math.PI/2);
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
      vertexShader:'varying vec2 uvp;void main(){uvp=position.xz+.5;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 uvp;void main(){float a=pow(max(0.,1.-length((uvp-.5)*2.)),1.7);gl_FragColor=vec4(.015,.02,.027,a*.26);}'});
    const mesh=new THREE.InstancedMesh(g,material,12);mesh.count=0;mesh.frustumCulled=false;this.scene.add(mesh);return mesh;
  }

  sparksAt(position,inherited=V3(),count=26){
    for(let i=0;i<count;i++)this.sparks.spawn({position:position.clone(),velocity:V3((Math.random()-.5)*45,8+Math.random()*30,(Math.random()-.5)*45).addScaledVector(inherited,.15),size:1.3+Math.random()*2,width:.08,alpha:1,life:.4+Math.random()*1.4});
  }

  missileLaunch(position,velocity,forward) {
    // Ignition is visible from the aircraft camera even before the missile clears the wing.
    this.audio?.missileLaunch?.();
    const nozzle=position.clone().addScaledVector(forward,-1.45);
    this.rocketGlow.spawn({position:nozzle,velocity:velocity.clone().addScaledVector(forward,-35),size:2.1,alpha:1,life:.18});
    this.launchGlow={position:position.clone(),age:0};
    for(let i=0;i<7;i++)this.spray.spawn({position:nozzle.clone().addScaledVector(forward,-i*.6),
      velocity:velocity.clone().multiplyScalar(.12),size:1.1+i*.28,alpha:.62,life:.7+i*.12});
  }

  missilePlume(m,dt) {
    // Sample along the path, rather than leaving isolated puffs at low phone frame rates.
    const forward=m.velocity.clone().normalize();
    while(m.trail>=.025){
      m.trail-=.025;
      const nozzle=m.position.clone().addScaledVector(m.velocity,-m.trail).addScaledVector(forward,-1.45);
      this.spray.spawn({position:nozzle.clone(),velocity:V3(1,1,0),size:1.5,alpha:.62,life:2});
      this.rocketGlow.spawn({position:nozzle,velocity:m.velocity.clone().multiplyScalar(.75),size:1.7,alpha:.9,life:.075});
    }
  }

  explosion(position, strength = 1, inherited = V3()) {
    const ground=groundHeight(position.x,position.z),surface=position.y-ground<12;
    this.blasts.push({position:position.clone(),age:0,strength});
    this.hitFlash = 0.18;
    if (this.audio) this.audio.burst();
    this.sparksAt(position,V3(),Math.round(45*strength));
    for(let i=0;i<16;i++){
      const a=Math.random()*Math.PI*2,r=Math.random()*8*strength;
      this.fire.spawn({position:position.clone().add(V3(Math.cos(a)*r,Math.random()*7,Math.sin(a)*r)),velocity:V3(Math.cos(a)*7,8+Math.random()*18,Math.sin(a)*7),size:(8+Math.random()*10)*strength,alpha:1,life:.3+Math.random()*.6});
      if(surface)this.dust.spawn({position:V3(position.x,ground+.4,position.z),velocity:V3(Math.cos(a)*(15+Math.random()*25),1+Math.random()*5,Math.sin(a)*(15+Math.random()*25)),size:5+Math.random()*8,width:1.6,alpha:.55,life:3+Math.random()*3});
    }
    for (let i = 0; i < 18; i++) {
      this.smoke.spawn({
        position: position.clone().add(V3((Math.random() - 0.5) * 10, Math.random() * 9 + 2, (Math.random() - 0.5) * 10)),
        velocity: V3((Math.random() - 0.5) * 12, 10 + Math.random() * 17, (Math.random() - 0.5) * 12),
        size: 7 + Math.random()*14, alpha: .65+Math.random()*.2, life: 7+Math.random()*8,
      });
    }
    if(this.library.has('debris'))for(let i=0;i<12 && this.debris.length<72;i++){
      const mesh=this.library.asset('debris');mesh.position.copy(position);mesh.scale.setScalar(.4+Math.random());mesh.traverse(o=>{if(o.isMesh)o.castShadow=true;});this.scene.add(mesh);
      this.debris.push({mesh,velocity:V3((Math.random()-.5)*35,12+Math.random()*30,(Math.random()-.5)*35).add(inherited),spin:V3(Math.random()*7,Math.random()*6,Math.random()*8),life:30});
    }
    if(this.world?.blastImpulse)this.world.blastImpulse.value.set(position.x,position.z,0,80*strength);
    for (const target of this.targets) {
      if (!target.destroyed && target.position.distanceTo(position) < (target.ship?48:33) * strength) this.destroyTarget(target);
    }
  }

  destroyTarget(target) {
    if (target.destroyed) return;
    target.destroyed = true;
    target.respawnTime=0;
    this.confirmKill(target);
    this.rangeHit++;
    if (target.ship) { target.smokeSource=true;target.sinkTime=0;return; }
    target.mesh.visible = false;
    if (this.library.has('wreck')) {
      const wreck = this.library.asset('wreck');
      wreck.position.copy(target.position);
      wreck.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(wreck);
      target.wreck = wreck;
    }
    target.smokeSource = true;
  }

  confirmKill(target) {
    this.killEvents.push({ kind: target.ship ? 'naval' : target.kind === 'air' ? 'air' : 'ground' });
    this.audio?.confirmKill?.();
  }

  dropBomb(flight, aircraft) {
    if (flight.crashed || flight.onGround || flight.bombs <= 0) return false;
    const torpedo=flight.airframe==='wyvern';
    const index = (torpedo?1:4) - flight.bombs;
    const origin = aircraft.releaseStore(index);
    flight.bombs--;
    const mesh = this.library.has(torpedo?'torpedo17':'bomb')
      ? this.library.asset(torpedo?'torpedo17':'bomb')
      : new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2, 8), new THREE.MeshStandardMaterial({ color: 0x2c2f2c }));
    mesh.position.copy(origin);
    mesh.quaternion.copy(flight.attitude);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(mesh);
    this.bombs.push({
      mesh, position: mesh.position,
      velocity: flight.velocity.clone().addScaledVector(flight.basis().up, -2),
      guided: !torpedo, torpedo, age: 0,
    });
    this.lastMunition = this.bombs[this.bombs.length-1];
    this.engagement?.message(torpedo?'TORPEDO AWAY · drop low and level towards a ship':'PAVEWAY AWAY · hold U to follow · L controls the laser');
    return true;
  }

  fireGun(flight) {
    if (flight.rounds <= 0 || flight.crashed) return false;
    flight.rounds--;
    const forward = flight.basis().forward;
    this.shots.push({
      position: flight.position.clone().addScaledVector(forward, 8),
      velocity: flight.velocity.clone().addScaledVector(forward, 1020),
      age: 0,
    });
    this.hitFlash = 0.025;
    this.fire.spawn({position:flight.position.clone().addScaledVector(forward,8),velocity:flight.velocity.clone(),size:1.8,alpha:1,life:.045});
    return true;
  }

  burningTrail(source, velocity, dt) {
    source.burnTimer = (source.burnTimer || 0) + dt;
    while (source.burnTimer >= .04) {
      source.burnTimer -= .04;
      const position = source.position.clone().addScaledVector(velocity, -source.burnTimer);
      this.smoke.spawn({position:position.clone(),velocity:velocity.clone().multiplyScalar(.18).add(V3(2,5,1)),size:4+Math.random()*3,alpha:.9,life:18});
      this.fire.spawn({position,velocity:velocity.clone().multiplyScalar(.55).add(V3(0,2,0)),size:3+Math.random()*4,alpha:1,life:.6});
    }
  }

  update(dt, flight, camera, elapsed) {
    for(const t of this.targets)if(t.destroyed){
      t.respawnTime=(t.respawnTime||0)+dt;
      if(t.respawnTime>=60){
        t.destroyed=false;t.hp=t.maxHp||3;t.smokeSource=false;t.mesh.visible=true;t.respawnTime=0;
        if(t.wreck){this.scene.remove(t.wreck);t.wreck=null;}
        if(t.ship){t.mesh.position.copy(t.home);t.mesh.rotation.set(0,0,0);t.position.copy(t.home).add(V3(0,4,0));t.sinkTime=0;}
      }
    }
    this.reload ||= { bombs: 0, rounds: 0 };
    if (!flight.crashed) for (const [kind, capacity, seconds] of [['bombs',flight.airframe==='wyvern'?1:4,25],['rounds',flight.airframe==='wyvern'?400:150,12]]) {
      if (flight[kind] === 0) {
        this.reload[kind] += dt;
        if (this.reload[kind] >= seconds) {
          flight[kind] = capacity; this.reload[kind] = 0;
          if (kind === 'bombs') this.engagement?.aircraft.resetStores();
          this.engagement?.message(kind === 'bombs' ? 'PAVEWAYS RELOADED' : 'GUN RELOADED');
        }
      } else this.reload[kind] = 0;
    }
    for(const target of this.targets)if(target.ship&&target.destroyed){
      target.sinkTime+=dt;target.mesh.rotation.z=Math.min(.20,target.sinkTime*.006);
      target.mesh.position.y=target.home.y-Math.min(2.5,target.sinkTime*.07);
      this.burningTrail(target,V3(),dt);
    }
    if (flight.crashed) {
      if (!this.playerWreck) {
        this.playerWreck = {position:flight.position,velocity:flight.wreckVelocity?.clone() || V3(),age:0};
        this.explosion(flight.position,1.3,this.playerWreck.velocity);
      }
      const wreck = this.playerWreck;
      wreck.age += dt;
      wreck.velocity.y -= 9.81 * dt;
      wreck.position.addScaledVector(wreck.velocity,dt);
      const floor = groundHeight(wreck.position.x,wreck.position.z)+1;
      if (wreck.position.y < floor) {
        wreck.position.y = floor;
        wreck.velocity.y = Math.abs(wreck.velocity.y)*.12;
        wreck.velocity.multiplyScalar(Math.exp(-dt*2.2));
      }
      const spin = Math.min(1,wreck.velocity.length()/40);
      flight.attitude.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt*.35*spin,dt*.2*spin,dt*.65*spin))).normalize();
      this.burningTrail(wreck,wreck.velocity,dt);
    }
    // Bombs: the mesh points along its velocity, so a fin-stabilised bomb noses over as it falls.
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      let impact;
      if(bomb.torpedo){
        bomb.age+=dt;
        if(!bomb.inWater){
          bomb.velocity.y-=9.81*dt;bomb.position.addScaledVector(bomb.velocity,dt);
          if(bomb.position.y<=-82.6){
            const valid=terrainHeight(bomb.position.x,bomb.position.z)<-82.6&&Math.abs(bomb.velocity.y)<48&&bomb.velocity.length()<150;
            if(valid){bomb.inWater=true;bomb.velocity.y=0;bomb.velocity.setLength(21);bomb.position.y=-83.1;}
            else impact=true;
          } else if(bomb.position.y<=groundHeight(bomb.position.x,bomb.position.z))impact=true;
        }else{
          bomb.position.addScaledVector(bomb.velocity,dt);
          if(terrainHeight(bomb.position.x,bomb.position.z)>-83.2||bomb.age>100)impact=true;
          bomb.wake=(bomb.wake||0)+dt;
          if(bomb.wake>.1){bomb.wake=0;this.spray.spawn({position:bomb.position.clone().setY(-82.4),velocity:V3(0,.1,0),size:2,alpha:.6,life:2});}
          for(const t of this.targets)if(t.ship&&!t.destroyed&&t.position.distanceTo(bomb.position)<25){this.destroyTarget(t);impact=true;}
        }
      } else impact=guidedBombStep(bomb, this.engagement?.laser, dt);
      if (impact) {
        bomb.expired = true;
        this.explosion(bomb.position, 1.2);
        this.addCrater(bomb.position, 16);
        this.scene.remove(bomb.mesh);
        this.bombs.splice(i, 1);
      } else if (bomb.velocity.lengthSq() > 1e-6) {
        bomb.mesh.quaternion.setFromUnitVectors(V3(0, 0, -1), bomb.velocity.clone().normalize());
      }
    }

    // Gun: tracers travel, check the targets they pass, and raise dust where they hit the ground.
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    let tracerCount = 0;
    const line = new THREE.Line3();
    const closest = V3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const previous = shot.position.clone();
      shot.velocity.y -= 9.81 * dt;
      shot.position.addScaledVector(shot.velocity, dt);
      shot.age += dt;
      let hit = false;
      line.set(previous, shot.position);
      for (const target of this.targets) {
        if (target.destroyed) continue;
        const centre = target.position.clone().add(V3(0, 1, 0));
        line.closestPointToPoint(centre, true, closest);
        if (closest.distanceTo(centre) < (target.ship?18:3.8)) {
          target.hp--;
          this.smoke.spawn({ position: closest.clone(), velocity: V3(0, 3, 0), size: 3, alpha: 0.5, life: 1.2 });
          if (target.hp <= 0) { this.explosion(target.position, 0.35); this.destroyTarget(target); }
          hit = true;
          break;
        }
      }
      if(!hit && this.engagement)for(const target of this.engagement.airTargets){
        if(target.destroyed)continue;
        line.closestPointToPoint(target.position,true,closest);
        if(closest.distanceTo(target.position)<5.2){this.engagement.hitAir(target,1,closest);hit=true;break;}
      }
      const ground = groundHeight(shot.position.x, shot.position.z);
      if (!hit && shot.position.y < ground) {
        this.spray.spawn({
          position: V3(shot.position.x, ground + 0.6, shot.position.z),
          velocity: V3((Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4),
          size: 2.4, alpha: 0.5, life: 0.8,
        });
        hit = true;
      }
      if (hit || shot.age > 3) { this.shots.splice(i, 1); continue; }
      if (tracerCount < 64 && camera) {
        quaternion.setFromUnitVectors(V3(0, 1, 0), shot.velocity.clone().normalize());
        matrix.compose(shot.position, quaternion, V3(1, 1, 1));
        this.tracerMesh.setMatrixAt(tracerCount++, matrix);
      }
    }
    this.tracerMesh.count = tracerCount;
    this.tracerMesh.instanceMatrix.needsUpdate = true;

    // The flash illuminates nearby surfaces briefly; smoke and debris remain after it dies.
    for(const light of this.blastLights)light.intensity=0;
    if(this.launchGlow){
      const glow=this.launchGlow;glow.age+=dt;
      if(glow.age<.22){const light=this.blastLights[0];light.position.copy(glow.position);light.intensity=75*Math.exp(-glow.age*20);}
      else this.launchGlow=null;
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      blast.age += dt;
      const light=this.blastLights[i%2];
      light.position.copy(blast.position).add(V3(0,3,0));
      light.intensity=Math.max(light.intensity,22000*blast.strength*Math.exp(-blast.age*10));
      if(blast.age>1.5)this.blasts.splice(i,1);
    }
    for(let i=this.debris.length-1;i>=0;i--){const p=this.debris[i];p.life-=dt;p.velocity.y-=9.81*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=p.spin.x*dt;p.mesh.rotation.y+=p.spin.y*dt;
      const ground=groundHeight(p.mesh.position.x,p.mesh.position.z);
      if(p.mesh.position.y<ground+.1){p.mesh.position.y=ground+.1;p.velocity.y=Math.abs(p.velocity.y)*.22;p.velocity.multiplyScalar(.65);}
      if(p.life<=0){this.scene.remove(p.mesh);this.debris.splice(i,1);}}

    // Wheel spray and tyre smoke.
    const groundSpeed = Math.hypot(flight.velocity.x, flight.velocity.z);
    if (flight.onGround && groundSpeed > 25 && !flight.crashed) {
      const { forward, right } = flight.basis();
      this.sprayTimer = (this.sprayTimer || 0) + dt;
      while (this.sprayTimer > 0.02) {
        this.sprayTimer -= 0.02;
        for (const side of [-1, 1]) {
          const at = flight.position.clone()
            .addScaledVector(right, side * 1.9)
            .addScaledVector(forward, -1.2);
          at.y = groundHeight(at.x, at.z) + 0.35;
          this.spray.spawn({
            position: at,
            velocity: flight.velocity.clone().multiplyScalar(-0.10).add(V3((Math.random() - 0.5) * 4, 1.6 + Math.random() * 2, (Math.random() - 0.5) * 4)),
            size: 1.6, alpha: clamp((groundSpeed - 25) / 55, 0, 1) * 0.7, life: 0.9,
          });
        }
      }
    }
    const touching = flight.legs.some((leg) => leg.contact);
    if (touching && !this.wasTouching && groundSpeed > 30) {
      const { right } = flight.basis();
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const at = flight.position.clone().addScaledVector(right, side * 1.9);
          at.y = groundHeight(at.x, at.z) + 0.3;
          this.smoke.spawn({
            position: at,
            velocity: V3((Math.random() - 0.5) * 8, 2 + Math.random() * 3, (Math.random() - 0.5) * 8),
            size: 2 + i * 0.6, alpha: 0.55, life: 1.6,
          });
        }
      }
      if (this.audio) this.audio.touchdown(flight.impact);
    }
    this.wasTouching = touching;

    // Smoke columns from the wrecks on the range.
    this.columnTimer = (this.columnTimer || 0) + dt;
    if (this.columnTimer > 0.35) {
      this.columnTimer = 0;
      for (const target of this.targets) {
        if (!target.smokeSource) continue;
        this.smoke.spawn({
          position: target.position.clone().add(V3(0, 3, 0)),
          velocity: V3(1.4, 5.5, 0.7), size: 7, alpha: 0.45, life: 9,
        });
        this.fire.spawn({position:target.position.clone().add(V3((Math.random()-.5)*4,1,0)),velocity:V3(0,3,0),size:3,alpha:.65,life:.6});
        this.sparksAt(target.position,V3(),2);
      }
    }

    const step = (p, delta) => {
      p.life -= delta;
      if (p.life <= 0) return false;
      p.position.addScaledVector(p.velocity, delta);
      p.velocity.multiplyScalar(Math.exp(-delta * 0.8));
      p.size += delta * 3.5;
      p.alpha *= Math.exp(-delta * 0.55);
      return p.alpha > 0.01;
    };
    this.smoke.update(dt, (p,d) => {
      p.life -= d;
      p.position.addScaledVector(p.velocity,d);
      p.velocity.x += Math.sin(p.life*1.7+p.position.z*.03)*d*1.2;
      p.velocity.z += Math.cos(p.life*1.3+p.position.x*.03)*d*1.2;
      p.velocity.lerp(V3(2,4,1),1-Math.exp(-d*.35));
      p.size += d*2.1;
      p.alpha *= Math.exp(-d*.12);
      return p.life>0 && p.alpha>.015;
    });
    this.spray.update(dt, step);
    this.rocketGlow.update(dt,(p,d)=>{p.life-=d;p.position.addScaledVector(p.velocity,d);p.alpha=Math.min(1,p.life*16);return p.life>0;});
    this.dust.update(dt,step);
    this.fire.update(dt,(p,d)=>{p.life-=d;p.position.addScaledVector(p.velocity,d);p.size+=d*7;p.alpha*=Math.exp(-d*3.8);return p.life>0;});
    this.sparks.update(dt,(p,d)=>{p.life-=d;p.velocity.y-=9.81*d;p.velocity.multiplyScalar(Math.exp(-d*.35));p.position.addScaledVector(p.velocity,d);p.alpha=Math.min(1,p.life*2);return p.life>0&&p.position.y>groundHeight(p.position.x,p.position.z);});
    let shadows=0;const shadowMatrix=new THREE.Matrix4();
    for(const target of this.targets){if(!target.destroyed)continue;shadowMatrix.makeScale(26,1,32);shadowMatrix.setPosition(target.position.x+5,groundHeight(target.position.x,target.position.z)+.08,target.position.z+7);this.smokeShadow.setMatrixAt(shadows++,shadowMatrix);}
    this.smokeShadow.count=shadows;this.smokeShadow.instanceMatrix.needsUpdate=true;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  reset() {
    this.lastMunition = null;
    this.launchGlow = null;
    this.rocketGlow.clear();
    this.reload = { bombs: 0, rounds: 0 };
    this.playerWreck = null;
    for (const bomb of this.bombs) this.scene.remove(bomb.mesh);
    this.bombs.length = 0;
    this.shots.length = 0;
    this.blasts.length = 0;
    for(const p of this.debris)this.scene.remove(p.mesh);this.debris.length=0;
    for(const l of this.blastLights)l.intensity=0;
    this.fire.clear();this.dust.clear();this.sparks.clear();this.smokeShadow.count=0;
    this.smoke.clear();
    this.spray.clear();
    this.tracerMesh.count = 0;
    this.craterCount = 0;
    this.craterMesh.count = 0;
    this.rangeHit = 0;
    this.hitFlash = 0;
    this.killEvents.length = 0;
    for (const target of this.targets) {
      target.destroyed = false;
      target.smokeSource = false;
      target.hp = target.maxHp || 3;
      target.mesh.visible = true;
      if(target.ship){target.mesh.position.copy(target.home);target.mesh.rotation.set(0,0,0);target.sinkTime=0;}
      if (target.wreck) { this.scene.remove(target.wreck); target.wreck = null; }
    }
  }
}
