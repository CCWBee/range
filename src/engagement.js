// Small sortie mechanics. Public names and silhouettes, deliberately simplified game dynamics.
// The seeker and steering are tuned for readable gameplay, not a real weapon performance model.
import * as THREE from '../vendor/three.module.js';
import { groundHeight, bombStep } from '../physics.js';

const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const DEG=Math.PI/180;

export function clearSight(a,b) {
  const p=V3();
  for(let i=1;i<28;i++) {p.lerpVectors(a,b,i/28);if(p.y<groundHeight(p.x,p.z)+.5)return false;}
  return true;
}

export function heatSignature(target, observer) {
  if(target.destroyed || !target.engine) return 0;
  const toward=observer.clone().sub(target.position),distance=toward.length();
  toward.normalize();
  const rear=target.velocity.clone().normalize().negate();
  const aspect=.12+.88*Math.pow(Math.max(0,rear.dot(toward)),2);
  return target.engine*aspect/(1+Math.pow(distance/1800,2));
}

export function missileStep(m, target, dt) {
  m.age+=dt;
  const speed=Math.max(1,m.velocity.length());
  const forward=m.velocity.clone().divideScalar(speed);
  let steer=V3();
  if(target && !target.destroyed && m.age>.18) {
    const delta=target.position.clone().sub(m.position);
    const los=delta.clone().normalize();
    if(forward.dot(los)>Math.cos(42*DEG) && clearSight(m.position,target.position)) {
      const closing=Math.max(150,speed-target.velocity.dot(los));
      const lead=target.velocity.clone().multiplyScalar(clamp(delta.length()/closing,0,4)*.9);
      const desired=delta.add(lead).normalize();
      steer.copy(desired).addScaledVector(forward,-desired.dot(forward));
      const demand=steer.length();
      if(demand>0)steer.multiplyScalar(Math.min(180,demand*speed*2.6)/demand);
    } else { m.target=null; m.lost=true; }
  }
  // Finite motor burn, drag, gravity and limited steering make a poor launch miss naturally.
  const thrust=m.age<2.7 ? 175 : 0;
  m.velocity.addScaledVector(forward,(thrust-speed*speed*.00016)*dt).addScaledVector(steer,dt);
  m.velocity.y-=9.81*dt;
  m.position.addScaledVector(m.velocity,dt);
  return m.age>22 || m.position.y<groundHeight(m.position.x,m.position.z);
}

export function guidedBombStep(b, laser, dt) {
  b.age=(b.age||0)+dt;
  if(laser?.active && b.guided && b.age>.6 && b.velocity.length()>35 && clearSight(b.position,laser.point)) {
    const desired=laser.point.clone().sub(b.position).normalize();
    const path=b.velocity.clone().normalize();
    if(path.dot(desired)>.35) {
      const distance=b.position.distanceTo(laser.point);
      const gain=Math.max(48,b.velocity.lengthSq()/Math.max(40,distance)*3);
      const steer=desired.addScaledVector(path,-desired.dot(path)).multiplyScalar(gain);
      // Compensate the component of gravity across the flight path. Pure pursuit alone keeps
      // steepening the descent and makes even a well-centred release land short of the spot.
      steer.addScaledVector(V3(0,1,0).addScaledVector(path,-path.y),9.81);
      if(steer.length()>20)steer.setLength(20);
      b.velocity.addScaledVector(steer,dt);
    }
  }
  return bombStep(b,dt);
}

export class Engagement {
  constructor(library,scene,effects,aircraft,audio) {
    this.library=library;this.scene=scene;this.effects=effects;this.aircraft=aircraft;this.audio=audio;
    this.airTargets=[];this.missiles=[];this.selected=null;this.elapsed=0;this.remaining=2;
    this.laser={active:false,point:V3(),target:null};
    this.seeker={enabled:false,warm:0,dwell:0,target:null,locked:false,direction:V3(0,0,-1)};
    this.notice='';this.noticeTime=0;
    if(library.has('mig15')) {
      const mesh=library.asset('mig15');scene.add(mesh);
      mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      this.airTargets.push({kind:'air',name:'MiG-15',mesh,position:mesh.position,velocity:V3(),engine:1,hp:6,maxHp:6,destroyed:false,age:0,fall:V3()});
    }
    effects.engagement=this;
    for(const [i,t] of effects.targets.entries())Object.assign(t,{kind:'ground',name:`RANGE ${i+1}`,maxHp:3});
    this.reset();
  }

  message(text){this.notice=text;this.noticeTime=3;}
  toggleSeeker(){const s=this.seeker;s.enabled=!s.enabled;s.warm=0;s.dwell=0;s.target=null;s.locked=false;this.message(s.enabled?'SEEKER WARMING':'SEEKER OFF');}
  select(flight,aim){
    const axis=aim?.direction||flight.basis().forward;
    const choices=[...this.airTargets,...this.effects.targets].filter(t=>!t.destroyed&&clearSight(flight.position,t.position));
    choices.sort((a,b)=>axis.dot(b.position.clone().sub(flight.position).normalize())-axis.dot(a.position.clone().sub(flight.position).normalize()));
    this.selected=choices[0]||null;this.message(this.selected?`${this.selected.name} SELECTED`:'NO VISIBLE TARGET');
  }
  designate(flight,aim){
    if(this.laser.active){this.laser.active=false;this.message('LASER OFF');return;}
    const axis=aim?.direction||flight.basis().forward;
    let target=this.selected?.kind==='ground'&&!this.selected.destroyed?this.selected:null;
    if(!target)target=this.effects.targets.filter(t=>!t.destroyed).sort((a,b)=>axis.dot(b.position.clone().sub(flight.position).normalize())-axis.dot(a.position.clone().sub(flight.position).normalize()))[0];
    if(!target||target.position.distanceTo(flight.position)>6500||!clearSight(flight.position,target.position)) {this.message('DESIGNATOR HAS NO LINE OF SIGHT');return;}
    this.selected=target;this.laser.target=target;this.laser.point.copy(target.position).add(V3(0,1,0));this.laser.active=true;
    this.message('LASER ON · MAINTAIN LINE OF SIGHT');
  }
  launch(flight){
    const s=this.seeker;
    if(flight.onGround||flight.crashed||flight.velocity.length()<45){this.message('LAUNCH INHIBITED');return false;}
    if(this.remaining<=0){this.message('SIDEWINDERS EXPENDED');return false;}
    if(!s.locked||!s.target){this.message('NO HEAT LOCK');return false;}
    const mesh=this.library.asset('sidewinder');
    const position=this.aircraft.releaseMissile(2-this.remaining);mesh.position.copy(position);mesh.quaternion.copy(flight.attitude);this.scene.add(mesh);
    this.missiles.push({mesh,position:mesh.position,velocity:flight.velocity.clone().addScaledVector(flight.basis().forward,30),target:s.target,age:0,trail:0});
    this.remaining--;s.locked=false;s.dwell=0;this.message('SIDEWINDER AWAY');return true;
  }
  hitAir(target,damage,point){
    if(target.destroyed)return;
    target.hp-=damage;
    this.effects.sparksAt(point,target.velocity,10);
    if(target.hp<=0){target.destroyed=true;target.engine=0;target.fall.copy(target.velocity);target.age=0;this.effects.explosion(target.position,.7);this.message('AIR TARGET DESTROYED');}
  }
  update(dt,flight,aim){
    this.elapsed+=dt;this.noticeTime=Math.max(0,this.noticeTime-dt);
    for(const target of this.airTargets) {
      if(target.destroyed){
        target.age+=dt;target.fall.y-=9.81*dt;target.position.addScaledVector(target.fall,dt);target.mesh.rotateZ(dt*.65);
        if(target.mesh.visible && target.position.y<=groundHeight(target.position.x,target.position.z)+2){target.mesh.visible=false;this.effects.explosion(target.position,1.1);this.effects.addCrater(target.position,13);}
        if(target.mesh.visible&&Math.random()<dt*20)this.effects.smoke.spawn({position:target.position.clone(),velocity:V3(2,5,0),size:6,alpha:.65,life:7});
        continue;
      }
      const phase=this.elapsed*.095,old=target.position.clone();
      target.position.set(-700+Math.sin(phase)*2100,1050+Math.sin(phase*.7)*90,-4400+Math.cos(phase)*2100);
      target.velocity.copy(target.position).sub(old).divideScalar(Math.max(dt,.001));
      if(target.velocity.length()>400)target.velocity.set(Math.cos(phase)*199.5,Math.cos(phase*.7)*6,-Math.sin(phase)*199.5);
      const forward=target.velocity.clone().normalize(),right=forward.clone().cross(V3(0,1,0)).normalize(),up=right.clone().cross(forward);
      const matrix=new THREE.Matrix4().makeBasis(right,up,forward.clone().negate());target.mesh.quaternion.setFromRotationMatrix(matrix);target.mesh.rotateZ(-.32);
    }
    const s=this.seeker;
    if(s.enabled){
      s.warm=Math.min(1,s.warm+dt/1.4);
      const axis=flight.basis().forward;
      // The small circle is the seeker head; the larger circle is the acquisition envelope.
      s.direction.copy(axis);
      const candidates=this.airTargets.filter(t=>!t.destroyed&&t.position.distanceTo(flight.position)<5000
        &&axis.dot(t.position.clone().sub(flight.position).normalize())>Math.cos(18*DEG)
        &&heatSignature(t,flight.position)>.085&&clearSight(flight.position,t.position));
      const target=candidates.sort((a,b)=>heatSignature(b,flight.position)-heatSignature(a,flight.position))[0]||null;
      if(target!==s.target)s.dwell=0;
      s.target=target;s.dwell=target&&s.warm===1?Math.min(1,s.dwell+dt/.65):0;s.locked=s.dwell===1;
      if(target)s.direction.copy(target.position).sub(flight.position).normalize();
    }
    if(this.laser.active && (!clearSight(flight.position,this.laser.point)||flight.position.distanceTo(this.laser.point)>7000)) {this.laser.active=false;this.message('LASER MASKED');}
    for(let i=this.missiles.length-1;i>=0;i--){
      const m=this.missiles[i],before=m.position.clone(),targetBefore=m.target?.position.clone();
      const expired=missileStep(m,m.target,dt);
      m.mesh.quaternion.setFromUnitVectors(V3(0,0,-1),m.velocity.clone().normalize());
      m.trail+=dt;
      if(m.age<3&&m.trail>.035){m.trail=0;this.effects.spray.spawn({position:m.position.clone(),velocity:V3(1,1,0),size:1.1,alpha:.5,life:2.7});}
      const closest=targetBefore?new THREE.Line3(before,m.position).closestPointToPoint(targetBefore,true,V3()):null;
      const hit=closest&&m.target&&!m.target.destroyed&&closest.distanceTo(targetBefore)<11;
      if(hit)this.hitAir(m.target,10,m.position);
      if(expired||hit){if(hit)this.effects.explosion(m.position,.65);this.scene.remove(m.mesh);this.missiles.splice(i,1);}
    }
    this.audio?.seeker?.(s.enabled,s.locked,!!s.target);
  }
  reset(){
    this.remaining=2;this.selected=null;this.elapsed=0;this.laser.active=false;
    Object.assign(this.seeker,{enabled:false,warm:0,dwell:0,target:null,locked:false});
    for(const m of this.missiles)this.scene.remove(m.mesh);this.missiles.length=0;
    for(const t of this.airTargets){t.destroyed=false;t.hp=t.maxHp;t.engine=1;t.mesh.visible=true;t.age=0;t.position.set(-700,1050,-2300);t.velocity.set(199.5,6,0);}
    this.aircraft.resetMissiles?.();this.notice='';this.noticeTime=0;
  }
}
