import * as THREE from './vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const AX = V(1,0,0), AY=V(0,1,0), AZ=V(0,0,1);

export class Flight {
  constructor() { this.reset(); }
  reset() {
    this.position=V(0,1.9,85); this.velocity=V(); this.attitude=new THREE.Quaternion();
    this.rates=V(); this.throttle=0; this.spool=0; this.gear=true; this.gearPosition=1;
    this.brake=false; this.airbrake=false; this.grounded=true; this.crashed=false;
    this.alpha=0; this.load=1; this.bombs=4; this.rounds=150; this.airborneTime=0;
    this.landed=false; this.elapsed=0; this.mass=14200; this.impact=0;
  }
  basis() {
    return {forward:V(0,0,-1).applyQuaternion(this.attitude),up:AY.clone().applyQuaternion(this.attitude),right:AX.clone().applyQuaternion(this.attitude)};
  }
  step(dt,input={}) {
    if (this.crashed) return;
    this.elapsed+=dt;
    this.throttle=clamp(this.throttle+(input.throttle||0)*dt*.32,0,1.12);
    this.spool+=(this.throttle-this.spool)*(1-Math.exp(-dt/1.4));
    this.gearPosition+=clamp((this.gear?1:0)-this.gearPosition,-dt*.45,dt*.45);
    this.brake=!!input.brake; this.airbrake=!!input.airbrake;
    let {forward,up,right}=this.basis();
    const speed=this.velocity.length(), rho=1.225*Math.exp(-Math.max(0,this.position.y)/9500);
    const along=Math.max(.1,this.velocity.dot(forward));
    this.alpha=Math.atan2(-this.velocity.dot(up),along);
    const slip=Math.atan2(this.velocity.dot(right),along);
    const q=.5*rho*speed*speed;
    const authority=clamp((speed-22)/65,0,1);
    let pitch=(input.pitch||0)*.44*authority;
    // A restrained stability augmentation mirrors the Typhoon's fly-by-wire feel.
    // Lift remains a force on velocity; the aircraft cannot turn its velocity instantly.
    if (!this.grounded) {
      pitch+=clamp(this.alpha*.12,-.04,.04);
      if(this.alpha>.29) pitch-=clamp((this.alpha-.29)*3,0,1.2);
      if(this.alpha<-.20) pitch+=(-.20-this.alpha)*2;
    }
    if(this.grounded) pitch=speed>58?Math.max(0,pitch):0;
    const roll=-(input.roll||0)*1.1*authority;
    const yaw=-(input.yaw||0)*.22*authority+slip*.65;
    this.rates.x+=(pitch-this.rates.x)*(1-Math.exp(-dt*2.8));
    this.rates.z+=(roll-this.rates.z)*(1-Math.exp(-dt*3.1));
    this.rates.y+=(yaw-this.rates.y)*(1-Math.exp(-dt*2.0));
    if(this.grounded) {
      this.rates.y=-(input.yaw||0)*clamp(speed*.014,.025,.32);
      this.rates.z=0;
    }
    this.attitude.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rates.x*dt,this.rates.y*dt,this.rates.z*dt,'XYZ'))).normalize();
    ({forward,up,right}=this.basis());
    const st=Math.abs(this.alpha);
    let cl=.18+4.5*this.alpha;
    if(st>.30) cl*=Math.max(.2,1-(st-.30)*3.8);
    cl=clamp(cl,-1.05,1.48);
    const cd=.024+.071*cl*cl+.027*this.gearPosition+(this.airbrake?.105:0)+Math.max(0,st-.25)*.4;
    const velDir=speed>.1?this.velocity.clone().divideScalar(speed):forward.clone();
    const liftDirection=right.clone().cross(velDir).normalize();
    const thrust=this.spool<=1?120000*this.spool:120000+60000*(this.spool-1)/.12;
    const acceleration=forward.clone().multiplyScalar(thrust/this.mass);
    acceleration.addScaledVector(liftDirection,q*50*cl/this.mass);
    acceleration.addScaledVector(velDir,-q*50*cd/this.mass);
    acceleration.addScaledVector(right,-slip*q*17/this.mass);
    acceleration.y-=9.81;
    this.load=q*50*cl/(this.mass*9.81);
    const onRunway=Math.abs(this.position.x)<31 && this.position.z<300 && this.position.z>-2500;
    if(this.grounded) {
      const rolling=(this.brake?7.5:.30)+(onRunway?0:2.5);
      acceleration.addScaledVector(velDir,-Math.min(rolling,speed/dt));
      if(this.brake && speed<.3 && thrust<20000) acceleration.set(0,0,0);
      if(acceleration.y>0 && speed>58 && forward.y>.035) this.grounded=false;
      else { acceleration.y=Math.max(0,acceleration.y); this.velocity.y=0; }
    }
    this.velocity.addScaledVector(acceleration,dt);
    this.position.addScaledVector(this.velocity,dt);
    if(!this.grounded) this.airborneTime+=dt;
    if(this.grounded && this.airborneTime===0) {
      this.position.y=1.9;
      const e=new THREE.Euler().setFromQuaternion(this.attitude,'YXZ');
      e.x=clamp(e.x,0,.17); e.z=0; this.attitude.setFromEuler(e);
    }
    const ground=onRunway?1.9:1.6;
    if(this.position.y<ground) {
      const bank=Math.acos(clamp(up.y,-1,1));
      this.impact=Math.abs(this.velocity.y);
      if(!onRunway || this.gearPosition<.95 || this.impact>5 || bank>.23 || speed>115) {
        this.crashed=true; this.velocity.set(0,0,0); this.position.y=ground;
      } else {
        this.grounded=true; this.position.y=ground; this.velocity.y=0;
        const e=new THREE.Euler().setFromQuaternion(this.attitude,'YXZ'); e.z=0; e.x=Math.max(0,e.x-dt*.2); this.attitude.setFromEuler(e);
        if(this.airborneTime>10) this.landed=true;
      }
    }
  }
}

export function bombStep(bomb,dt) {
  bomb.velocity.y-=9.81*dt;
  bomb.velocity.multiplyScalar(Math.exp(-.012*dt));
  bomb.position.addScaledVector(bomb.velocity,dt);
  return bomb.position.y<=0;
}
