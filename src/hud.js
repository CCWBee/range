// RANGE head-up display: the typographic instrument block, the three markers of spec 5.3, the
// bomb impact diamond and the gun pipper, the sortie hints and the crash overlay.
// Spec: docs/specs/2026-09-06-range-v2.md sections 5.3, 5.4 and 5.7.
//
// Every element is an instrument with a job. Nothing here is a badge, a pill or a decorative dot.
import * as THREE from '../vendor/three.module.js';
import { bombStep } from '../physics.js';
import { clearSight, guidedBombStep } from './engagement.js';

const $ = (id) => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

const CRASH_REASONS = {
  impact: 'Too hard',
  gear: 'Gear was up',
  attitude: 'Wing or nose hit the ground',
  terrain: 'Off the paved surface, too fast',
  water: 'Hit the water',
  airframe: 'The airframe broke up',
};

const RANGE_CENTRE = V3(-1000, 0, -4200);
const AIRFIELD_CENTRE = V3(0, 0, -900);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), speed: $('speed'), alt: $('alt'), throttle: $('throttle'), heading: $('heading'),
      load: $('load'), aoa: $('aoa'), vs: $('vs'), mach: $('mach'),
      gear: $('gear'), weapons: $('weapons'), instructor: $('instructor'), fps: $('fps'),
      hint: $('hint'), objective: $('objective'), status: $('status'), help: $('help'),
      markers: $('markers'), reticle: $('reticle'), nose: $('nose'), fpm: $('fpm'),
      pipper: $('pipper'), bombAim: $('bombAim'),
    };
    this.crashShown = false;
    this.scratch = V3();
    this.targetMarks=new Map();
  }

  show() { this.el.hud.classList.remove('hidden'); }

  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  setStatus(html) { this.el.status.innerHTML = html || ''; }

  reset() { this.crashShown = false; this.setStatus(''); }

  // Place an SVG marker group, or hide it when the point is behind the camera or off screen.
  place(group, point, visible = true) {
    if (!group) return;
    if (!visible) { group.setAttribute('visibility', 'hidden'); return; }
    group.setAttribute('visibility', 'visible');
    group.setAttribute('transform', `translate(${point.x.toFixed(1)},${point.y.toFixed(1)})`);
  }

  // Project a world point to screen pixels. Returns null when it is behind the camera.
  project(worldPoint, camera) {
    this.scratch.copy(worldPoint).project(camera);
    if (this.scratch.z > 1) return null;
    return {
      x: (this.scratch.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.scratch.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  update(flight, camera, input, instructor, effects, options = {}) {
    const el = this.el;
    const { forward } = flight.basis();
    const speed = flight.velocity.length();

    el.speed.textContent = Math.round(flight.ias * 1.94384);
    el.alt.textContent = Math.max(0, Math.round((flight.position.y - 1.645) * 3.28084));
    el.throttle.textContent = Math.round(flight.throttle * 100);
    const heading = (Math.atan2(forward.x, -forward.z) * 180 / Math.PI + 360) % 360;
    el.heading.textContent = Math.round(heading % 360).toString().padStart(3, '0');
    el.load.textContent = flight.load.toFixed(1);
    el.aoa.textContent = Math.round(flight.alpha * 180 / Math.PI);
    el.vs.textContent = Math.round(flight.verticalSpeed * 196.85 / 10) * 10;
    el.mach.textContent = flight.mach.toFixed(2);

    el.gear.textContent = flight.gearPosition > 0.01 && flight.gearPosition < 0.99
      ? 'GEAR IN TRANSIT' : flight.gear ? 'GEAR DOWN' : 'GEAR UP';
    const engagement=effects.engagement;
    el.weapons.textContent = `27 MM ${flight.rounds} · PAVEWAY ${flight.bombs} · AIM-9 ${engagement?.remaining ?? 0}`;
    el.instructor.textContent = instructor.mode === 'manual' ? 'INSTRUCTOR OFF'
      : instructor.state.stallGuard > 0.05 ? 'STALL GUARD' : 'INSTRUCTOR ON';

    this.updateObjective(flight, effects);
    this.updateHint(flight, input, effects, options);
    this.updateMarkers(flight, camera, input, effects);
    if(engagement)this.updateEngagement(flight,camera,input,engagement);

    if (flight.crashed && !this.crashShown) {
      this.crashShown = true;
      const reason = CRASH_REASONS[flight.crashReason] || 'Aircraft lost';
      this.setStatus(`AIRCRAFT LOST<small>${reason}. Press R to fly the sortie again.</small>`);
      if (options.onCrash) options.onCrash();
    }
  }

  updateObjective(flight, effects) {
    const bearing = (point) => ((Math.atan2(point.x - flight.position.x, flight.position.z - point.z)
      * 180 / Math.PI + 360) % 360).toFixed(0).padStart(3, '0');
    const airfield = flight.position.distanceTo(
      this.scratch.copy(AIRFIELD_CENTRE).setY(flight.position.y)) / 1000;
    const range = flight.position.distanceTo(
      this.scratch.copy(RANGE_CENTRE).setY(flight.position.y)) / 1000;
    const targets = effects ? effects.targets.length : 0;
    const hits = effects ? effects.rangeHit : 0;
    this.el.objective.textContent = flight.grounded && !flight.landed
      ? 'RUNWAY 36 · DEPARTURE'
      : `AIRFIELD ${airfield.toFixed(1)} KM / ${bearing(AIRFIELD_CENTRE)}° · `
        + `RANGE ${range.toFixed(1)} KM / ${bearing(RANGE_CENTRE)}° · ${hits} / ${targets}`;
  }

  // The hints walk the sortie: line up, reheat, rotate, gear, climb, coast, range, gun, bombs,
  // return, gear again, threshold, flare, brakes.
  updateHint(flight, input, effects, options) {
    const speed = flight.velocity.length();
    const knots = flight.ias * 1.94384;
    const rangeDistance = flight.position.distanceTo(
      this.scratch.copy(RANGE_CENTRE).setY(flight.position.y));
    let hint;
    if (options.paused) {
      hint = 'Click to take the controls back.';
    } else if (!input.locked) {
      hint = 'Click the view to take the controls. The aircraft flies towards the circle.';
    } else if (flight.crashed) {
      hint = 'Press R to fly the sortie again.';
    } else if (flight.landed && flight.onGround) {
      hint = speed > 4
        ? 'Down. Hold Ctrl to idle, then keep holding it for the wheel brakes.'
        : 'Sortie complete, aircraft recovered. Press R to fly it again.';
    } else if (flight.onGround && !flight.landed) {
      if (speed < 3) hint = 'Line up on 36. Hold Shift to advance the throttle; reheat lights past 100 per cent.';
      else if (knots < 130) hint = 'Accelerating. Keep the nose wheel straight with Q and E.';
      else if (knots < 145) hint = 'Rotate at 140 knots: raise the circle above the centre and hold it there.';
      else hint = 'Airborne shortly. Press G once the wheels are clear.';
    } else if (flight.gear && flight.position.y > 60) {
      hint = 'Press G to raise the gear, then climb away on the runway heading.';
    } else if (flight.stall || flight.alpha > 0.28) {
      hint = 'High angle of attack. Lower the circle and let the speed build.';
    } else if (rangeDistance < 2600 && flight.bombs > 0) {
      hint = 'Range ahead. End selects a target; L designates it. Press 2 to release a Paveway.';
    } else if (rangeDistance < 2600) {
      hint = 'Bombs gone. Turn back to the airfield on 180.';
    } else if (effects && (effects.rangeHit > 0 || flight.bombs === 0)) {
      const height = flight.position.y;
      if (!flight.gear && height < 700) hint = 'Gear down at 180 knots with G, then hold the threshold in the circle.';
      else if (flight.gear && height < 60) hint = 'Flare: bring the circle to the horizon and let the speed decay onto the runway.';
      else hint = 'Return to runway 36. Descend on the approach bars, B slows you down.';
    } else if (flight.position.x > 900) {
      hint = 'Following the coast. Bank with the mouse or hold A and D.';
    } else {
      hint = 'Fly the circle. The range is south-west; the impact diamond shows where a bomb lands.';
    }
    if (Math.abs(flight.position.x) > 11000 || Math.abs(flight.position.z) > 12000) {
      hint = 'Leaving the coastal box. Turn back towards the airfield.';
    }
    this.el.hint.textContent = hint;
    if(effects.engagement?.noticeTime>0)this.el.hint.textContent=effects.engagement.notice;
    else if(input.freeLook)this.el.hint.textContent='FREE LOOK · release C to return to the flight view';
  }

  updateMarkers(flight, camera, input, effects) {
    const el = this.el;
    const width = window.innerWidth, height = window.innerHeight;
    el.markers.setAttribute('viewBox', `0 0 ${width} ${height}`);
    el.markers.setAttribute('width', width);
    el.markers.setAttribute('height', height);

    // The reticle sits at the cursor, and the instructor steers the flight-path marker to it.
    const cursor = input.cursorScreen();
    this.place(el.reticle, { x: cursor.x, y: cursor.y }, input.locked&&!input.freeLook&&!input.returningLook);
    el.reticle.setAttribute('stroke-dasharray', input.aimOffscreen ? '4 3' : 'none');

    // The nose cross is the projected body forward.
    const { forward } = flight.basis();
    const nose = this.project(flight.position.clone().addScaledVector(forward, 1000), camera);
    this.place(el.nose, nose, !!nose);

    // The flight-path marker is the projected velocity vector. Below 15 m/s there is no path.
    const speed = flight.velocity.length();
    const path = speed > 15
      ? this.project(flight.position.clone().addScaledVector(flight.velocity.clone().divideScalar(speed), 1000), camera)
      : null;
    this.place(el.fpm, path, !!path);

    // The gun pipper: where the rounds go, gravity and time of flight included.
    const gunPoint = flight.position.clone()
      .addScaledVector(forward, 2040)
      .addScaledVector(flight.velocity, 2)
      .add(V3(0, -19.62, 0));
    const pipper = this.project(gunPoint, camera);
    this.place(el.pipper, pipper, !!pipper && !flight.onGround);

    // Prediction uses the same guidance and ballistics as a released store.
    let diamond = null;
    if (!flight.onGround && flight.bombs > 0 && flight.position.y < 1600 && !flight.crashed) {
      const predicted = {
        position: flight.position.clone().addScaledVector(flight.basis().up, -0.7),
        velocity: flight.velocity.clone().addScaledVector(flight.basis().up, -2),
        guided: true, age: 0,
      };
      for (let i = 0; i < 2400; i++) if (guidedBombStep(predicted, effects.engagement?.laser, 1 / 60)) break;
      diamond = this.project(predicted.position, camera);
    }
    this.place(el.bombAim, diamond, !!diamond);
  }

  setFps(text) { this.el.fps.textContent = text; }

  updateEngagement(flight,camera,input,e){
    const svg=this.el.markers,ns='http://www.w3.org/2000/svg';
    for(const t of [...e.effects.targets,...e.airTargets]){
      let g=this.targetMarks.get(t);
      if(!g){
        g=document.createElementNS(ns,'g');g.setAttribute('class','target-mark');
        g.innerHTML='<path d="M-8,-14 H8"/><text y="-23" text-anchor="middle"></text><text y="1" text-anchor="middle" class="target-distance"></text>';
        svg.appendChild(g);this.targetMarks.set(t,g);
      }
      const distance=flight.position.distanceTo(t.position),p=this.project(t.position.clone().add(V3(0,t.kind==='air'?5:7,0)),camera);
      const visible=!t.destroyed&&distance<7500&&p&&p.x>25&&p.x<innerWidth-25&&p.y>110&&p.y<innerHeight-180&&clearSight(flight.position,t.position.clone().add(V3(0,2,0)));
      this.place(g,p,!!visible);
      if(visible){g.children[0].setAttribute('d',`M-${8*t.hp/t.maxHp},-14 H${8*t.hp/t.maxHp}`);g.children[1].textContent=t.name;g.children[2].textContent=`${(distance/1000).toFixed(2)} KM`;g.setAttribute('opacity',t===e.selected?'1':'.64');}
    }
    const s=e.seeker,nose=this.project(flight.position.clone().addScaledVector(flight.basis().forward,1000),camera);
    this.place($('seekerEnvelope'),nose,!!nose&&s.enabled&&!input.freeLook);
    const head=this.project(flight.position.clone().addScaledVector(s.direction,1000),camera);
    this.place($('seekerHead'),head,!!head&&s.enabled&&!input.freeLook);
    $('seekerHead').setAttribute('stroke',s.locked?'#f09676':'#e5dfcd');
    $('seekerEnvelope').querySelector('circle').setAttribute('r',Math.tan(18*Math.PI/180)/Math.tan(camera.fov*Math.PI/360)*innerHeight/2);
    const laser=this.project(e.laser.point,camera);this.place($('laserMark'),laser,!!laser&&e.laser.active);
    $('weaponState').textContent=s.enabled?(s.warm<1?'SEEKER WARMING':s.locked?'HEAT LOCK':s.target?'ACQUIRING':'SEEKER SEARCH'):e.laser.active?'LASER ON':'WEAPONS READY';
    $('weaponState').classList.toggle('locked',s.locked);
    $('laserState').textContent=e.laser.active?'LTD · ON':'LTD · OFF';
  }
}
