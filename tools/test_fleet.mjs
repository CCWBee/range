import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {Flight,terrainHeight} from '../physics.js';
import {Instructor,aimFromAngles} from '../control.js';
import {Effects} from '../src/effects.js';
import {Engagement} from '../src/engagement.js';
const dt=1/120,V3=(...a)=>new THREE.Vector3(...a);
const f=new Flight();f.airframe='wyvern';f.reset();const instructor=new Instructor();
let liftoff=null;
for(let t=0;t<60;t+=dt){
 // active:true, as the other instructor tests pass it: the ground law only rotates for a live aim.
 const cmd=instructor.update(dt,f,{direction:aimFromAngles(f,0,.13),active:true},{throttle:1,pitch:0,roll:0,yaw:0});
 f.step(dt,cmd);if(!f.onGround&&liftoff===null)liftoff=t;
 if(f.crashed)break;
}
assert(!f.crashed&&liftoff<40&&f.position.y>60,`Wyvern takes off and climbs: ${JSON.stringify({height:f.position.y,speed:f.ias,crash:f.crashReason,liftoff})}`);
assert(f.ias<220,'Propeller profile does not accelerate like the Typhoon');
console.log('PASS Wyvern takes off and climbs on the propeller profile',JSON.stringify({liftoff:+liftoff.toFixed(1),height:Math.round(f.position.y),ias:Math.round(f.ias)}));
const library={has:()=>true,asset:()=>new THREE.Group()},scene=new THREE.Scene();
const fx=new Effects(library,scene,new THREE.PlaneGeometry(1,1),null);
const ac={resetMissiles(){},resetRockets(){},resetStores(){},releaseRocket(){return f.position.clone();},releaseStore(){return f.position.clone();}};
const engagement=new Engagement(library,scene,fx,ac,null);
assert.equal(engagement.airTargets.length,3);
const bear=engagement.airTargets[1];engagement.hitAir(bear,30,bear.position);assert(bear.destroyed);
bear.age=44.99;engagement.update(.02,f);assert(!bear.destroyed&&bear.hp===bear.maxHp);
for(let j=0;j<16;j++)assert(engagement.launchRocket(f));assert(!engagement.launchRocket(f));
engagement.update(20.1,f);assert.equal(engagement.rocketsRemaining,16);
console.log('PASS mixed practice traffic, respawn and sixteen-rocket reload');
fx.reset();f.position.set(4400,-52.6,-3600);f.velocity.set(0,0,-100);f.bombs=1;f.onGround=false;f.crashed=false;
const ship=fx.targets.find(t=>t.ship);ship.position.set(4400,-78.6,-4300);ship.home.set(4400,-82.6,-4300);
assert(terrainHeight(4400,-4300)<-82.6);assert(fx.dropBomb(f,ac));
let ran=false;
for(let t=0;t<40&&!ship.destroyed;t+=1/60){fx.update(1/60,f,null,t);ran ||= fx.bombs.some(b=>b.inWater);}
assert(ran,'Torpedo enters a horizontal water run');assert(ship.destroyed,'Torpedo hits a ship along its launch bearing');
ship.respawnTime=59.99;fx.update(.02,f,null,0);assert(!ship.destroyed&&ship.hp===ship.maxHp);
console.log('PASS torpedo water entry, straight run, naval impact and ship respawn');
