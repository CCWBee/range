// Behaviour checks for the connected sortie, independent of the graphics driver.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Flight, bombStep } from '../physics.js';
import { Instructor } from '../control.js';
import { Input } from '../src/input.js';
import { ChaseCamera } from '../src/camera.js';
import { Engagement, heatSignature, missileStep, guidedBombStep } from '../src/engagement.js';
import { Effects } from '../src/effects.js';

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
}
delete globalThis.window;delete globalThis.document;

{
  const report=[];
  for(const direction of [V3(1,0,0),V3(.05,0,1).normalize(),V3(0,.8,-.6)]) {
    const f=airborne(),instructor=new Instructor();let peakG=0;
    for(let i=0;i<4800;i++){f.step(dt,instructor.update(dt,f,{active:true,direction},{}));peakG=Math.max(peakG,f.load);}
    const error=f.velocity.angleTo(direction)*180/Math.PI;
    assert(!f.crashed&&error<5&&peakG>5&&peakG<9,'Large mouse requests must pull hard and catch the direction');
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
    assert(closest<11&&time<10&&maxSpeed<700&&m.velocity.length()<maxSpeed-80,'Motor must burn out and coast into an intercept');times.push(time);
  }
  assert(Math.abs(times[0]-times[1])<.06,'Missile intercept must be stable at 60 and 120 Hz');
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
}
console.log('ALL ENGAGEMENT CHECKS PASS');
