// Behaviour checks for the connected sortie, independent of the graphics driver.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Flight, bombStep } from '../physics.js';
import { Instructor } from '../control.js';
import { Input } from '../src/input.js';
import { ChaseCamera, MunitionCamera } from '../src/camera.js';
import { AAM, Engagement, heatSignature, missileStep, guidedBombStep, proximityPass } from '../src/engagement.js';
import { Effects } from '../src/effects.js';
import { Hud } from '../src/hud.js';
import { Aircraft } from '../src/aircraft.js';

const V3=(...v)=>new THREE.Vector3(...v), dt=1/120;
const pass=(name,data={})=>console.log('PASS',name,JSON.stringify(data));
function airborne(direction=V3(0,0,-1)) {
  const f=new Flight(); f.position.set(0,2200,0);f.velocity.copy(direction).multiplyScalar(250);
  f.attitude.setFromUnitVectors(V3(0,0,-1),direction);f.gear=false;f.gearPosition=0;
  f.onGround=false;f.grounded=false;f.airborneTime=30;f.throttle=f.spool=1.1;return f;
}

globalThis.window=Object.assign(new EventTarget(),{innerWidth:1920,innerHeight:1080});
globalThis.document=new EventTarget();
{
  const canvas=new EventTarget();document.pointerLockElement=canvas;
  const input=new Input(canvas),camera=new THREE.PerspectiveCamera(54,16/9);
  const initial=input.aim(camera).direction.clone();
  const radiansPerPixel=2*Math.tan(camera.fov*Math.PI/360)/window.innerHeight;
  input.pendingMouse.x=Math.PI/radiansPerPixel;
  assert(input.aim(camera).direction.dot(initial)<-.999,'Mouse must reach behind the aircraft');
  assert(input.aimBehind&&input.aimOffscreen,'Behind-camera aim needs an edge marker');
  input.pendingMouse.x=Math.PI/radiansPerPixel;
  assert(input.aim(camera).direction.distanceTo(initial)<1e-8,'Mouse must complete 360 degrees');
  input.pendingMouse.y=-Math.PI/2/radiansPerPixel;
  assert(input.aim(camera).direction.y>.999,'Mouse must reach straight up');
  for(const [code,axis,expected] of [['KeyW','pitch',-1],['KeyS','pitch',1],['KeyA','roll',-1],['KeyD','roll',1],['KeyQ','yaw',-1],['KeyE','yaw',1]]) {
    input.keys=new Set([code]);const commands=input.commands();assert.equal(commands[axis],expected);assert.equal(commands.throttle,0);
  }
  input.keys=new Set(['ControlLeft']);
  assert(input.commands({throttle:0,gearPosition:1}).brake);
  assert(!input.commands({throttle:.2,gearPosition:1}).brake);
  assert(!input.commands({throttle:0,gearPosition:0}).brake);
  assert(!input.commands({throttle:0,gearPosition:1}).airbrake);
  pass('360 degree mouse, WASDQE axes and Ctrl idle brakes');
  input.keys.clear();input.centreCursor();const f=airborne(),chase=new ChaseCamera(16/9);
  chase.update(dt,f,null,true,true,input);const aim=input.aim(chase.camera),saved=aim.direction.clone();
  const before=chase.camera.position.clone();input.keys.add('KeyC');input.look.set(1,.3);input.returningLook=true;
  chase.update(dt,f,aim,true,false,input);
  assert(chase.camera.position.distanceTo(before)>10,'C must visibly orbit the aircraft');
  assert(input.aim(chase.camera).direction.distanceTo(saved)<1e-9,'Free look must preserve the flight target');
  input.keys.clear();for(let i=0;i<180;i++)chase.update(dt,f,aim,true,false,input);
  assert(!input.returningLook&&input.look.length()===0,'C release must return to flight view');
  pass('C free look preserves aim and returns');
  input.running=true;
  let instructorToggles=0;input.on('instructor',()=>instructorToggles++);
  window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyU',repeat:false}));
  assert(input.keys.has('KeyU')&&instructorToggles===0,'U must be held camera input, never an instructor toggle');
  document.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:100,movementY:100}));
  assert.equal(input.pendingMouse.lengthSq(),0,'Munition-view mouse movement must not redirect the aircraft');
  input.keys.clear();input.keys.add('KeyC');
  document.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:10,movementY:10}));
  assert(input.look.x>0&&input.look.y<0,'Only vertical freelook direction must be inverted');
  input.keys.clear();
  canvas.dispatchEvent(Object.assign(new Event('mousedown'),{button:2}));
  chase.update(dt,f,aim,true,true,input);assert.equal(chase.camera.fov,26);
  window.dispatchEvent(Object.assign(new Event('mouseup'),{button:2}));
  chase.update(dt,f,aim,true,true,input);assert(chase.camera.fov>45);
  pass('U preserves instructor, vertical-only freelook inversion, held right-mouse zoom');
}
delete globalThis.window;delete globalThis.document;

{
  const report=[];
  for(const direction of [V3(1,0,0),V3(.05,0,1).normalize(),V3(0,.8,-.6)]) {
    const f=airborne(),instructor=new Instructor();let peakG=0;
    for(let i=0;i<4800;i++){f.step(dt,instructor.update(dt,f,{active:true,direction},{}));peakG=Math.max(peakG,f.load);}
    const error=f.velocity.angleTo(direction)*180/Math.PI;
    assert(!f.crashed&&error<5&&peakG>5&&peakG<11,`Large mouse requests must pull hard and catch the direction: error ${error}, peak ${peakG}`);
    report.push({errorDegrees:+error.toFixed(2),peakG:+peakG.toFixed(2)});
  }
  pass('hard mouse pull and reversal',report);
}

{
  const target={position:V3(0,1000,-1000),velocity:V3(0,0,-200),engine:1,destroyed:false};
  const rear=heatSignature(target,V3(0,1000,0)),front=heatSignature(target,V3(0,1000,-2000));
  assert(rear>front*5);target.destroyed=true;assert.equal(heatSignature(target,V3()),0);
  const times=[];
  for(const step of [1/60,1/120]) {
    const t={position:V3(0,1000,-1800),velocity:V3(0,0,-200)},m={position:V3(0,1000,0),velocity:V3(0,0,-230),age:0,target:t};
    let closest=1e9,maxSpeed=0,time=0;
    for(;time<22;time+=step){t.position.addScaledVector(t.velocity,step);const before=m.position.clone();if(missileStep(m,m.target,step))break;
      closest=new THREE.Line3(before,m.position).closestPointToPoint(t.position,true,V3()).distanceTo(t.position);
      maxSpeed=Math.max(maxSpeed,m.velocity.length());if(closest<11)break;
    }
    assert(closest<11&&time<10&&maxSpeed<1000,'Extended motor must reach an intercept');times.push(time);
  }
  assert(Math.abs(times[0]-times[1])<.06,'Missile intercept must be stable at 60 and 120 Hz');
  const coastTest={position:V3(0,5000,0),velocity:V3(0,0,-700),age:AAM.burn+.1};
  missileStep(coastTest,null,.1);
  assert(coastTest.velocity.length()<700,'Motor must stop accelerating after its finite burn');
  const lost={position:V3(0,1000,0),velocity:V3(0,0,-300),age:1,target:{position:V3(0,1000,1000),velocity:V3()}};
  missileStep(lost,lost.target,dt);assert(lost.lost&&lost.target===null,'Target behind the seeker must break tracking');
  pass('heat aspect, finite motor, interception and lock loss',{rear,front,interceptSeconds:times});
}

{
  const report=[];
  for(const active of [false,true])for(const step of [1/60,1/120]) {
    const b={position:V3(-1000,600,-2600),velocity:V3(0,-2,-180),guided:true,age:0};
    const laser={active,point:V3(-850,1,-4400)};
    let t=0;for(;t<30;t+=step)if(guidedBombStep(b,laser,step))break;
    const miss=b.position.distanceTo(laser.point);
    assert(active?miss<8:miss>140,'Laser must correct a release that misses ballistically');
    report.push({laser:active,step,missMetres:+miss.toFixed(2)});
  }
  const b={position:V3(0,500,0),velocity:V3(0,-2,-180),guided:true,age:2};
  const reference={position:b.position.clone(),velocity:b.velocity.clone()};
  for(let i=0;i<120;i++){guidedBombStep(b,{active:false,point:V3(400,0,-1000)},dt);bombStep(reference,dt);}
  assert(b.position.distanceTo(reference.position)<1e-9,'Laser off must return to pure ballistics');
  pass('laser correction, ballistics and frame independence',report);
}

{
  // Real gameplay objects with mesh-only stand-ins: release, damage, wrecks and reset together.
  const scene=new THREE.Scene(),library={has:()=>true,asset:()=>new THREE.Group()};
  const effects=new Effects(library,scene,new THREE.PlaneGeometry(1,1),null);
  let released=0;const f=airborne(V3(1,0,0));f.position.set(-2500,1050,-2300);
  const aircraft={releaseMissile:()=>{released++;return f.position.clone();},resetMissiles:()=>{released=0;}};
  const e=new Engagement(library,scene,effects,aircraft,null);e.toggleSeeker();
  assert(!e.launch(f)&&released===0,'Launch without lock must keep the store attached');
  for(let i=0;i<260;i++)e.update(dt,f,null);
  assert(e.seeker.locked,'Rear-aspect target must acquire after warm-up and dwell');
  assert(e.launch(f)&&released===1&&e.remaining===1,'Launch must consume one visible store');
  for(let i=0;i<1800&&!e.airTargets[0].destroyed;i++)e.update(dt,f,null);
  assert(e.airTargets[0].destroyed&&e.airTargets[0].engine===0,'Missile must kill the looping air target and its heat signature');
  const ground=effects.targets[0];effects.explosion(ground.position,1.2);
  assert(ground.destroyed&&ground.wreck&&!ground.mesh.visible&&effects.rangeHit===1,'Blast must leave a persistent ground wreck');
  e.update(2,f,null);assert(e.airTargets[0].destroyed,'Air target must stay destroyed');
  e.reset();effects.reset();assert(e.remaining===2&&released===0&&!ground.destroyed&&!e.airTargets[0].destroyed);
  pass('connected seeker, release, looping target kill, ground wreck and reset');
  const ship=effects.targets.find(t=>t.ship);
  effects.explosion(ship.position,1.2);effects.update(.1,f,new THREE.PerspectiveCamera(),0);
  assert(ship.destroyed&&ship.mesh.visible&&ship.smokeSource&&ship.mesh.position.y<ship.home.y,'Ship must retain its burning, settling hull');
  let bombReloads=0;aircraft.resetStores=()=>bombReloads++;
  f.bombs=0;f.rounds=0;e.remaining=0;
  for(let i=0;i<110;i++){effects.update(.1,f,null,0);e.update(.1,f,null);}
  assert.equal(f.rounds,0);assert.equal(f.bombs,0);assert.equal(e.remaining,0);
  for(let i=0;i<150;i++){effects.update(.1,f,null,0);e.update(.1,f,null);}
  assert.equal(f.rounds,150);assert.equal(f.bombs,4);assert.equal(e.remaining,2);assert.equal(bombReloads,1);
  effects.reset();assert(!ship.destroyed&&ship.mesh.position.equals(ship.home));
  pass('burning ship target, empty-store reload timers and reset');
}
{
  const grey=new THREE.Texture({width:2048,height:2048}),heritage=new THREE.Texture({width:1254,height:1254}),original=grey.image;
  const material={map:grey},aircraft={library:{texture:name=>name==='raf_typhoon_skin'?grey:heritage,materials:{raf_airframe:material}}};
  for(let i=0;i<5;i++){
    Aircraft.prototype.setSkin.call(aircraft,'heritage');assert.equal(material.map.image,heritage.image);assert.notEqual(material.map.source,grey.source);
    Aircraft.prototype.setSkin.call(aircraft,'grey');assert.equal(material.map.image,original);
  }
  pass('different-sized skin atlases retain independent image storage');
}
{
  for (const step of [1/30,1/60,1/120]) {
    const a=V3(-1200*step/2,0,0),b=V3(1200*step/2,0,0);
    assert(proximityPass(a,b,V3(0,17,-300*step/2),V3(0,17,300*step/2))!==null);
    assert.equal(proximityPass(a,b,V3(0,19,0),V3(0,19,0)),null);
  }
  pass('moving-target proximity fuse catches crossings and rejects outside-radius misses');
}
{
  globalThis.window=Object.assign(new EventTarget(),{innerWidth:1920,innerHeight:1080});
  globalThis.document=new EventTarget();
  const canvas=new EventTarget();document.pointerLockElement=canvas;
  const input=new Input(canvas),chase=new ChaseCamera(16/9),flight=airborne();
  chase.update(dt,flight,null,true,true,input);input.aim(chase.camera);
  const saved=input.worldAim.clone(),projector={scratch:V3()};
  input.keys.add('KeyZ');input.keys.add('KeyC');input.look.set(.7,.3);
  for(let i=0;i<120;i++)chase.update(dt,flight,input.aimState,true,false,input);
  assert(chase.camera.fov<27,'Held zoom must smoothly reach the narrow field of view');
  const target=flight.position.clone().add(V3(20,30,-1000));
  const p=Hud.prototype.project.call(projector,target,chase.camera);
  const expected=target.clone().project(chase.camera);
  if(p)assert(Math.abs(p.x-(expected.x*.5+.5)*window.innerWidth)<1e-7);
  input.keys.clear();input.look.set(0,0);input.returningLook=false;
  chase.update(dt,flight,input.aimState,true,true,input);input.projectAim(chase.camera);
  const axis=saved.clone().applyQuaternion(chase.camera.quaternion.clone().invert());
  const px=axis.x/-axis.z*window.innerHeight/(2*Math.tan(chase.camera.fov*Math.PI/360));
  assert(Math.abs(input.cursor.x-px)<1e-6,'Steering marker must use final camera pose');
  assert(input.worldAim.distanceTo(saved)<1e-9,'Zoom and freelook must never alter steering');
  pass('zoom and freelook preserve steering and final-camera projections');
}
{
  const scene=new THREE.Scene(),library={has:()=>true,asset:()=>new THREE.Group()};
  const effects=new Effects(library,scene,new THREE.PlaneGeometry(1,1),null),f=airborne();
  f.position.set(0,20,0);f.velocity.set(80,-40,0);f.crash('impact');
  const before=f.position.clone();
  for(let i=0;i<600;i++)effects.update(dt,f,null,i*dt);
  assert(f.position.distanceTo(before)>20,'Player wreck must retain impact momentum');
  assert(effects.fire.live.length>0&&effects.smoke.live.length>0,'Wreck must still burn five seconds after impact');
  assert(effects.debris.length>0,'Detached debris should outlast the initial flash');
  assert(Number.isFinite(f.position.y)&&Number.isFinite(f.attitude.w));
  effects.reset();assert.equal(effects.playerWreck,null);
  pass('player crash momentum, continued burning, debris and reset');
}
{
  // Ray-cast back from the HUD pixel to a stationary target during an orbit. This catches
  // stale camera matrices and world offsets that only appear wrong during freelook.
  globalThis.window=Object.assign(new EventTarget(),{innerWidth:1600,innerHeight:900});
  const camera=new THREE.PerspectiveCamera(55,16/9,.8,65000);
  const target=V3(120,400,-900),projector={scratch:V3()};
  const ray=new THREE.Raycaster();
  let samples=0;
  for(const fov of [26,55]) for(let i=0;i<24;i++) {
    const angle=i*Math.PI/12;
    camera.position.copy(target).add(V3(Math.sin(angle)*300,80,Math.cos(angle)*300));
    camera.lookAt(target);camera.rotateZ(.3*Math.sin(angle));
    camera.fov=fov;camera.updateProjectionMatrix();
    // Deliberately leave matrixWorld stale, as it is before renderer.render.
    const p=Hud.prototype.project.call(projector,target,camera);
    assert(p,'Target being looked at must remain visible throughout the orbit');
    ray.setFromCamera(new THREE.Vector2(p.x/1600*2-1,1-p.y/900*2),camera);
    assert(ray.ray.distanceToPoint(target)<1e-7,'Marker ray must intersect its world anchor');
    const behind=camera.position.clone().add(camera.getWorldDirection(V3()).negate());
    assert.equal(Hud.prototype.project.call(projector,behind,camera),null);
    samples++;
  }
  pass('world marker stays anchored through full orbit, roll and zoom',{samples});
}
{
  const t={position:V3(0,3000,0),velocity:V3(0,0,-200),engine:1,throttle:1};
  const rear=V3(0,3000,6000),front=V3(0,3000,-6000);
  assert(heatSignature(t,rear)>AAM.threshold,'Hot military rear aspect should acquire at 6 km');
  assert(heatSignature(t,front)<AAM.threshold,'Same-distance frontal aspect should be weaker');
  t.afterburner=true;
  assert(heatSignature(t,V3(0,3000,10000))>AAM.threshold,'Reheat rear aspect should acquire at 10 km');
  t.afterburner=false;t.throttle=.25;
  assert(heatSignature(t,rear)<AAM.threshold,'Low power should reduce acquisition range');
  t.destroyed=true;assert.equal(heatSignature(t,rear),0);
  const camera=new THREE.PerspectiveCamera(),follow=new MunitionCamera(),scene=new THREE.Scene();
  const m={position:V3(0,1000,0),velocity:V3(0,0,-500),mesh:new THREE.Group()};scene.add(m.mesh);
  assert(follow.update(camera,m,true,dt));
  const offset=camera.position.clone().sub(m.position);m.velocity.set(500,0,0);
  follow.update(camera,m,true,dt);
  assert(camera.position.clone().sub(m.position).distanceTo(offset)<3,'Direction changes must be damped');
  assert(!follow.update(camera,m,false,dt),'Release immediately relinquishes the camera');
  m.expired=true;assert(!follow.update(camera,m,true,dt),'Impact ends held follow');
  m.expired=false;scene.remove(m.mesh);assert(!follow.update(camera,m,true,dt),'Despawn ends held follow');
  pass('WVR signature envelope and damped munition camera lifetime');
}
console.log('ALL ENGAGEMENT CHECKS PASS');
