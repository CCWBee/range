// Small sortie mechanics. Public names and silhouettes, deliberately simplified game dynamics.
// The seeker and steering are tuned for readable gameplay, not a real weapon performance model.
import * as THREE from '../vendor/three.module.js';
import { groundHeight, bombStep } from '../physics.js';

const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const DEG=Math.PI/180;

// Public identity: MBDA, 2023 ASRAAM datasheet (88 kg, 2.9 m, 166 mm).
// https://www.mbda-systems.com/sites/mbda/files/2024-06/2023%20ASRAAM%20datasheet.pdf
// Everything below is a deliberately simplified game envelope, not engineering data.
export const AAM = Object.freeze({ name:'ASRAAM', burn:6, life:36, acquisition:12000,
  threshold:.075, cone:28, trackingCone:65 });

// Closest approach of two moving points during one simulation step. The fuse is independent
// of seeker lock: a seeker losing the target beside the nose must not disable the warhead.
export function proximityPass(a0, a1, b0, b1, radius = 18) {
  const relative = a0.clone().sub(b0);
  const travel = a1.clone().sub(a0).sub(b1.clone().sub(b0));
  const time = clamp(-relative.dot(travel) / Math.max(1e-12, travel.lengthSq()), 0, 1);
  return relative.addScaledVector(travel, time).lengthSq() <= radius * radius ? time : null;
}

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
  const aspect=.15+.85*Math.pow(Math.max(0,rear.dot(toward)),1.6);
  const throttle=clamp(target.throttle ?? target.engine,0,1);
  // The MiG-15 has no afterburner. Other aircraft may explicitly declare one.
  const power=(.25+.75*throttle*throttle)*(target.afterburner ? 3.2 : 1);
  const atmosphere=Math.exp(-distance/Math.max(1000,target.visibility ?? 28000));
  return target.engine*power*aspect*atmosphere/(1+Math.pow(distance/2900,2));
}

export function missileStep(m, target, dt) {
  m.age+=dt;
  const speed=Math.max(1,m.velocity.length());
  const forward=m.velocity.clone().divideScalar(speed);
  let steer=V3();
  if(target && !target.destroyed && m.age>.18) {
    const delta=target.position.clone().sub(m.position);
    const los=delta.clone().normalize();
    if(forward.dot(los)>Math.cos(AAM.trackingCone*DEG) && clearSight(m.position,target.position)) {
      const closing=Math.max(150,speed-target.velocity.dot(los));
      const lead=target.velocity.clone().multiplyScalar(clamp(delta.length()/closing,0,8)*.95);
      const desired=delta.add(lead).normalize();
      steer.copy(desired).addScaledVector(forward,-desired.dot(forward));
      const demand=steer.length();
      const authority=45*9.81*clamp(Math.pow(speed/650,2),0,1);
      if(demand>0)steer.multiplyScalar(Math.min(authority,demand*speed*3.1)/demand);
    } else { m.target=null; m.lost=true; }
  }
  // Finite motor burn, drag, gravity and limited steering make a poor launch miss naturally.
  const thrust=m.age<1.5 ? 330 : m.age<AAM.burn ? 180 : 0;
  const turnLoss=steer.lengthSq()/(Math.max(150,speed)*35);
  const nextSpeed=Math.max(0,speed+(thrust-speed*speed*.000095-turnLoss)*dt);
  // Rotate the flight path without accidentally adding kinetic energy with lateral steering.
  m.velocity.addScaledVector(steer,dt).normalize().multiplyScalar(nextSpeed);
  m.velocity.y-=9.81*dt;
  m.position.addScaledVector(m.velocity,dt);
  return m.age>AAM.life || m.position.y<groundHeight(m.position.x,m.position.z);
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
      this.airTargets.push({kind:'air',name:'MiG-15',mesh,position:mesh.position,velocity:V3(),engine:1,throttle:.9,afterburner:false,hp:6,maxHp:6,destroyed:false,age:0,fall:V3()});
    }
    effects.engagement=this;
    for(const [i,t] of effects.targets.entries())Object.assign(t,{kind:'ground',name:t.name||`RANGE ${i+1}`,maxHp:t.maxHp||3});
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
    if(this.remaining<=0){this.message('ASRAAM EXPENDED');return false;}
    if(!s.locked||!s.target){this.message('NO HEAT LOCK');return false;}
    const mesh=this.library.asset('asraam');
    const position=this.aircraft.releaseMissile(2-this.remaining);mesh.position.copy(position);mesh.quaternion.copy(flight.attitude);this.scene.add(mesh);
    this.missiles.push({mesh,position:mesh.position,velocity:flight.velocity.clone().addScaledVector(flight.basis().forward,30),target:s.target,age:0,trail:0});
    this.effects.lastMunition=this.missiles[this.missiles.length-1];
    this.effects.missileLaunch?.(position,flight.velocity,flight.basis().forward);
    this.remaining--;s.locked=false;s.dwell=0;this.message('ASRAAM AWAY · hold U to follow');return true;
  }
  hitAir(target,damage,point){
    if(target.destroyed)return;
    target.hp-=damage;
    this.effects.sparksAt(point,target.velocity,10);
    if(target.hp<=0){target.destroyed=true;target.engine=0;target.fall.copy(target.velocity);target.age=0;target.impacted=false;this.effects.explosion(target.position,1,target.velocity);this.message('AIR TARGET DESTROYED');}
  }
  update(dt,flight,aim){
    if (this.remaining === 0 && !flight.crashed) {
      this.reloadTime = (this.reloadTime || 0) + dt;
      if (this.reloadTime >= 20) { this.remaining=2; this.reloadTime=0; this.aircraft.resetMissiles(); this.message('ASRAAM RELOADED'); }
    }
    this.elapsed+=dt;this.noticeTime=Math.max(0,this.noticeTime-dt);
    for(const target of this.airTargets) {
      target.previousPosition = target.position.clone();
      if(target.destroyed){
        target.age+=dt;
        if (!target.impacted) {
          target.fall.y-=9.81*dt;target.fall.multiplyScalar(Math.exp(-dt*.04));
          target.position.addScaledVector(target.fall,dt);target.mesh.rotateZ(dt*.65);target.mesh.rotateX(dt*.24);
          if(target.position.y<=groundHeight(target.position.x,target.position.z)+2){
            target.position.y=groundHeight(target.position.x,target.position.z)+2;target.impacted=true;
            this.effects.explosion(target.position,1.1);this.effects.addCrater(target.position,13);target.fall.set(0,0,0);
          }
        }
        this.effects.burningTrail(target,target.fall,dt);
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
      const inCone=this.airTargets.filter(t=>!t.destroyed
        &&axis.dot(t.position.clone().sub(flight.position).normalize())>Math.cos(AAM.cone*DEG));
      const visible=inCone.filter(t=>clearSight(flight.position,t.position));
      const candidates=visible.filter(t=>t.position.distanceTo(flight.position)<AAM.acquisition
        &&heatSignature(t,flight.position)>AAM.threshold);
      const target=candidates.sort((a,b)=>heatSignature(b,flight.position)-heatSignature(a,flight.position))[0]||null;
      if(target!==s.target)s.dwell=0;
      s.target=target;s.dwell=target&&s.warm===1?Math.min(1,s.dwell+dt/.65):0;s.locked=s.dwell===1;
      s.status=s.warm<1?'SEEKER WARMING':s.locked?'ASRAAM LOCK':target?'ACQUIRING':
        visible.length?'IR TOO WEAK · CLOSE OR CHANGE ASPECT':inCone.length?'TARGET MASKED':'NO SEEKER CONTACT';
      if(target)s.direction.copy(target.position).sub(flight.position).normalize();
    }
    if(this.laser.active && (!clearSight(flight.position,this.laser.point)||flight.position.distanceTo(this.laser.point)>7000)) {this.laser.active=false;this.message('LASER MASKED');}
    for(let i=this.missiles.length-1;i>=0;i--){
      const m=this.missiles[i],before=m.position.clone();
      const expired=missileStep(m,m.target,dt);
      m.mesh.quaternion.setFromUnitVectors(V3(0,0,-1),m.velocity.clone().normalize());
      m.trail+=dt;
      if(m.age<AAM.burn) this.effects.missilePlume?.(m,dt);
      let hit = null;
      if (m.age > .2) for (const target of this.airTargets) {
        if (target.destroyed) continue;
        const time = proximityPass(before, m.position, target.previousPosition || target.position, target.position);
        if (time !== null) { hit = target; m.position.lerpVectors(before, m.position.clone(), time); break; }
      }
      if(hit)this.hitAir(hit,10,m.position);
      if(expired||hit){m.expired=true;if(hit)this.effects.explosion(m.position,.65);this.scene.remove(m.mesh);this.missiles.splice(i,1);}
    }
    this.audio?.seeker?.(s.enabled,s.locked,!!s.target);
  }
  reset(){
    this.reloadTime=0;
    this.remaining=2;this.selected=null;this.elapsed=0;this.laser.active=false;
    Object.assign(this.seeker,{enabled:false,warm:0,dwell:0,target:null,locked:false,status:''});
    for(const m of this.missiles)this.scene.remove(m.mesh);this.missiles.length=0;
    for(const t of this.airTargets){t.destroyed=false;t.hp=t.maxHp;t.engine=1;t.mesh.visible=true;t.age=0;t.position.set(-700,1050,-2300);t.velocity.set(199.5,6,0);}
    this.aircraft.resetMissiles?.();this.notice='';this.noticeTime=0;
  }
}
