// RANGE bootstrap: builds the renderer, loads the library, wires the modules together, runs the
// fixed-step loop and exposes window.range for staging, metrics and benchmarking.
// Spec: docs/specs/2026-09-06-range-v2.md sections 5.1 and 5.8.
import * as THREE from '../vendor/three.module.js';
import { Flight, bombStep } from '../physics.js';
import { Instructor, aimFromAngles } from '../control.js';
import { loadLibrary } from './loader.js';
import { World } from './world.js';
import { Aircraft } from './aircraft.js';
import { Effects } from './effects.js';
import { ChaseCamera, MunitionCamera } from './camera.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { Engagement } from './engagement.js';
import { Touch, autoGear, seekerPress, releaseBomb } from './touch.js';
import { nextPixelRatio } from './quality.js';
import { AIRPORT } from './airport.js';

const $ = (id) => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const STEP = 1 / 120;
const munitionCamera = new MunitionCamera();
let touchFollow = null;

const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (error) {
  $('error').classList.remove('hidden');
  $('error').textContent = 'RANGE needs WebGL 2. Open it in a browser with hardware acceleration enabled. ' + error.message;
  throw error;
}
// The render tier: mobile in touch mode or when asked for (spec 2026-09-10 section 8).
const touchWanted = Touch.wanted();
const MOBILE = touchWanted || new URLSearchParams(location.search).get('tier') === 'mobile';
// Base 2 on a phone and 1.5 on a desktop looks inverted until the pixels are counted: 844 x 390 at
// ratio 2 is 1.32 Mpx, a desktop at 2560 x 1080 and ratio 1.5 is 6.22 Mpx. The phone draws a fifth
// of the pixels on a screen whose physical pixels are a quarter the size.
const basePixelRatio = () => Math.min(devicePixelRatio, MOBILE ? 2 : 1.5);
renderer.setPixelRatio(basePixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
// PCF rather than PCFSoft: r160's soft filter ignores shadow.radius, and the radius is what gives
// the low sun's shadows their soft edge.
renderer.shadowMap.type = THREE.PCFShadowMap;

const flight = new Flight();
const instructor = new Instructor();
const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();

const library = await loadLibrary(renderer);
const world = new World(renderer, library, { tier: MOBILE ? 'mobile' : 'desktop' });
const chase = new ChaseCamera(innerWidth / innerHeight);
const aircraft = new Aircraft(library, world.scene, world.quadGeometry);
const effects = new Effects(library, world.scene, world.quadGeometry, audio);
const engagement = new Engagement(library,world.scene,effects,aircraft,audio);
effects.world=world;
// The mobile tier carries two samples, not none. Observed: with no MSAA on the half-float post
// target the aircraft's normal-blended contact shadow renders as a hard black square instead of a
// soft falloff (starkest under headless software GL; treat it as a risk on GPUs without half-float
// blend too). Every shader-level fix tried on the shadow itself failed (texture map, premultiplied
// alpha, polygon offset, a multiply-blended texture); the only variable that resolved it was the
// sample count, so the mechanism is not isolated, but two samples fix it and also clean up the
// alpha-tested clutter the phone tier was otherwise drawing aliased. Two rather than the desktop's
// four keeps the phone cost modest; it is cheap on the tile-based mobile GPUs the touch build
// targets. Confirm phone fps on-device; if a device struggles this can drop back to 0 (the square
// is a software-GL artefact there anyway).
const post = new Post(renderer, world.quadGeometry, { samples: MOBILE ? 2 : 4, bloomDivisor: MOBILE ? 4 : 3 });
// The touch layer exists only on a coarse-pointer device or under ?touch=1; the class on body
// switches the intro copy and the HUD layout before the sortie starts.
const touch = touchWanted ? new Touch(input, canvas) : null;
if (touch) document.body.classList.add('touch');

const scene = world.scene;
const camera = chase.camera;

let running = false;
let elapsed = 0;
let accumulator = 0;
let gunTimer = 0;
let hudTimer = 0;
let lastFrame = performance.now();
let stressed = false;
// A staged frame is held: nothing steps, so a staged weapon state survives to the screenshot.
// Any genuine pause or resume clears it, because setPauseUi is the one place the state changes.
let staged = false;
const frameTimes = [];

// Adaptive resolution: every two seconds of play the pixel ratio steps by 0.1 towards whatever
// src/quality.js decides from the last 120 frames, with a per-tier floor of 1.0 on a phone and 0.6
// on a desktop. Off while stressed, since that mode fixes the ratio to measure headroom, and idle
// while paused. The thresholds are measured against the window's own median, not against absolute
// milliseconds: a 60 Hz phone can never report a p95 under 9 ms, so the old recovery branch was
// unreachable and the first rough patch took the phone to 0.6 for the rest of the sortie.
let pixelRatio = basePixelRatio(), ratioTimer = 0;
function adaptResolution(dt) {
  ratioTimer += dt;
  if (stressed || ratioTimer < 2 || frameTimes.length < 60) return;
  ratioTimer = 0;
  const next = nextPixelRatio(frameTimes.slice(-120), pixelRatio, basePixelRatio(), MOBILE ? 1 : 0.6);
  if (next === pixelRatio) return;
  pixelRatio = next;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  post.resize();
}

// ------------------------------------------------------------------------------- actions

function start() {
  if (running) return;
  running = true;
  input.running = true;
  $('intro').classList.add('hidden');
  $('veil').classList.add('hidden');
  $('buttons').classList.remove('hidden');
  hud.show();
  audio.start();
  chase.update(1 / 60, flight, null, true, true);
}

function reset() {
  flight.reset();
  instructor.mode = 'assist';
  instructor.stallLatched = false;
  effects.reset();
  engagement.reset();
  aircraft.resetStores();
  input.centreCursor();
  input.devCamera = false;
  input.devPosition = null;
  input.zoomHeld = false;
  input.setPaused(false);
  hud.reset();
  accumulator = 0;
  chase.update(1 / 60, flight, null, running, true);
}

function setPauseUi(paused) {
  staged = false;
  $('pauseButton').textContent = paused ? 'RESUME · CLICK' : 'PAUSE · P';
  if (!running) return;
  audio.update(flight,paused);
  if(paused)audio.seeker(false,false,false);
  const resume = touch?.active ? 'Tap to continue.' : 'Click the view to take the controls back.';
  hud.setStatus(paused && !flight.crashed ? `PAUSED<small>${resume}</small>` : '');
  if (flight.crashed) hud.crashShown = false;
}

input.on('pause', setPauseUi);
input.on('start', start);
input.on('bomb', () => { if (input.locked && !input.paused && !input.devCamera) effects.dropBomb(flight, aircraft); });
input.on('gear', () => { if (!flight.onGround && !flight.crashed) flight.gear = !flight.gear; });
input.on('camera', () => chase.toggle());
input.on('seeker',()=>{if(input.locked&&!input.paused)engagement.toggleSeeker();});
input.on('missile',()=>{if(input.locked&&!input.paused)engagement.launch(flight);});
input.on('target',()=>{if(input.locked&&!input.paused)engagement.select(flight,input.aimState);});
input.on('laser',()=>{if(input.locked&&!input.paused)engagement.designate(flight,input.aimState);});
input.on('restart', reset);
input.on('help', () => hud.toggleHelp());
input.on('devCamera', () => { input.devCamera = !input.devCamera; input.pendingMouse.set(0,0); engagement.message(input.devCamera ? 'MAP CAMERA · WASD move · Q/E down/up · Shift faster · ` return' : 'FLIGHT CAMERA'); });

// One writer for the skin, so the select, the switch and the aircraft cannot disagree. The choice
// lives in aircraft.skinName for the life of the page: no localStorage, so it is the session and
// nothing longer. The skinName guard is what makes a drag cheap: the commit fires as the knob
// crosses the middle, and setSkin at src/aircraft.js caches the cloned texture.
const SKINS = ['grey', 'heritage'];
function setSkin(name) {
  if (!SKINS.includes(name) || name === aircraft.skinName || !aircraft.setSkin(name)) return false;
  $('skinChoice').value = name;
  $('skinSwitch').classList.toggle('heritage', name === 'heritage');
  for (const [id, wanted] of [['skinGrey', 'grey'], ['skinHeritage', 'heritage']]) {
    $(id).setAttribute('aria-checked', String(name === wanted));
    $(id).tabIndex = name === wanted ? 0 : -1;
  }
  return true;
}

// The portrait check goes after start(), because the layer's pause handler below needs the sortie
// running to take it, and a page that loaded in portrait fires no orientation change event.
$('start').onclick = () => { if (touch) touch.enter(); start(); touch?.pauseIfPortrait(); };
if (touch) {
  // The skin switch: a tap on either legend, a tap anywhere on the 44 px row, or a drag that snaps
  // to the end the finger has crossed into. The window-level pointer pattern is the throttle's,
  // which deliberately avoids pointer capture because some browsers refuse it, so a finger that
  // drifts off the row keeps working and a pointercancel still ends the drag. src/touch.js stays
  // about flying: it does not learn what a skin is.
  const skinSwitch = $('skinSwitch'), skinTrack = $('skinTrack');
  const nearest = (clientX) => {
    const r = skinTrack.getBoundingClientRect();
    return clientX < r.left + r.width / 2 ? 'grey' : 'heritage';
  };
  let skinSliding = null;
  skinSwitch.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  skinSwitch.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.skinLegend')) return;   // the legend's own click handles it
    event.preventDefault();
    skinSliding = event.pointerId;
    skinSwitch.classList.add('sliding');
    setSkin(nearest(event.clientX));
  });
  window.addEventListener('pointermove', (event) => {
    if (skinSliding !== null && event.pointerId === skinSliding) setSkin(nearest(event.clientX));
  });
  const endSkinSlide = (event) => {
    if (event.pointerId !== skinSliding) return;
    skinSliding = null;
    skinSwitch.classList.remove('sliding');
  };
  window.addEventListener('pointerup', endSkinSlide);
  window.addEventListener('pointercancel', endSkinSlide);
  $('skinGrey').onclick = () => setSkin('grey');
  $('skinHeritage').onclick = () => setSkin('heritage');
  // The radiogroup pattern rather than a re-invention of it: focus follows the selection with a
  // roving tabindex, which is what a desktop running ?touch=1 gets.
  skinSwitch.addEventListener('keydown', (event) => {
    const back = ['ArrowLeft', 'ArrowUp', 'Home'], on = ['ArrowRight', 'ArrowDown', 'End'];
    if (!back.includes(event.key) && !on.includes(event.key)) return;
    event.preventDefault();
    const name = back.includes(event.key) ? 'grey' : 'heritage';
    setSkin(name);
    $(name === 'grey' ? 'skinGrey' : 'skinHeritage').focus();
  });
  const watchRelease = (action) => {
    touchFollow=null;
    if(input.paused || input.devCamera) return;
    const previous=effects.lastMunition;
    action();
    if(effects.lastMunition!==previous) touchFollow={target:effects.lastMunition,age:0};
  };
  touch.on('bomb', () => watchRelease(()=>releaseBomb(engagement, effects, flight, aircraft, input.aimState)));
  touch.on('seeker', () => watchRelease(()=>seekerPress(engagement, flight)));
  touch.on('releaseWeapon', () => { touchFollow=null; });
  window.addEventListener('blur',()=>{touchFollow=null;});
  touch.on('pause', () => { if (running) input.setPaused(true); });
  touch.on('resume', () => { input.setPaused(false); audio.start(); });
  touch.on('notice', (text) => engagement.message(text));
  // A tap once the sortie is over restarts it; true tells the layer the tap is spent.
  touch.on('tap', () => {
    const over = flight.crashed || (flight.landed && flight.onGround && flight.velocity.length() < 4);
    if (over) reset();
    return over;
  });
}
$('helpToggle').onclick = () => hud.toggleHelp();
$('pauseButton').onclick = () => { input.setPaused(true); input.exitLock(); };
$('sound').onclick = () => { $('sound').textContent = audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON'; };
$('skinChoice').onchange = (event) => setSkin(event.target.value);

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
  input.clampCursor();
});

// ------------------------------------------------------------------------------- the frame

// One frame of everything the loop does. The animation loop and renderOnce both come through
// here, so a benchmark measures exactly what the game draws.
function frame(dt, stepSim) {
  if (touch) touch.update(dt, flight);
  const aim = input.aim(camera);
  if (stepSim) {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 40) {
      instructor.mode = 'assist';
      const keys = input.devCamera ? {} : touch?.active ? touch.commands(flight) : input.commands(flight);
      const cmd = instructor.update(STEP, flight, aim, keys);
      flight.step(STEP, cmd);
      if (touch?.active) autoGear(flight);
      engagement.update(STEP,flight,aim);
      accumulator -= STEP;
      guard++;
    }
    if (guard >= 40) accumulator = 0;
    gunTimer -= dt;
    if (!input.devCamera && input.gunFiring() && gunTimer <= 0 && !flight.crashed) {
      effects.fireGun(flight);
      gunTimer = 0.065;
    }
    effects.update(dt, flight, camera, elapsed);
    audio.update(flight, false);
  }
  elapsed += dt;

  chase.update(dt, flight, aim, running, false, input);
  if(touchFollow) touchFollow.age+=dt;
  const heldTouch=touchFollow && touchFollow.age>=.18 && !input.paused;
  munitionCamera.update(camera,heldTouch?touchFollow.target:effects.lastMunition,
    !input.devCamera && (input.keys.has('KeyU') || heldTouch),dt);
  if (input.devCamera) {
    input.devPosition ||= camera.position.clone();
    input.devLook ||= new THREE.Vector2();
    camera.rotation.set(input.devLook.y,input.devLook.x,0,'YXZ');
    const move = V3(Number(input.keys.has('KeyD'))-Number(input.keys.has('KeyA')),0,Number(input.keys.has('KeyS'))-Number(input.keys.has('KeyW')));
    if (move.lengthSq()) move.normalize().applyQuaternion(camera.quaternion);
    move.y += Number(input.keys.has('KeyE'))-Number(input.keys.has('KeyQ'));
    input.devPosition.addScaledVector(move,dt*(input.keys.has('ShiftLeft')?900:160));
    camera.position.copy(input.devPosition);
  } else input.devPosition = null;
  camera.updateMatrixWorld(true);
  input.projectAim(camera);
  audio.setGun(stepSim && !input.devCamera && input.gunFiring() && flight.rounds > 0 && !flight.crashed,flight,camera);
  aircraft.update(dt, flight, camera, elapsed);
  world.update(dt, flight, camera, elapsed);

  if (running) {
    const detachedView = !!munitionCamera.target || input.devCamera;
    hud.updateMarkers(flight, camera, input, effects, detachedView);
    hud.updateEngagement(flight, camera, input, engagement, detachedView, munitionCamera.target);
    hud.updateKillConfirmation(input.paused ? 0 : dt, effects);
    if (touch?.active) touch.render(flight, effects, engagement);
  }

  hudTimer += dt;
  if (running && hudTimer > 0.1) {
    hudTimer = 0;
    hud.update(flight, camera, input, instructor, effects, hudOptions());
  }

  renderer.info.reset();
  post.render(scene, camera, elapsed, effects.hitFlash);
}

// The HUD's options: in touch mode the layer supplies the hint wording, its voice and the crash
// copy. The class and the string travel together, so they can never disagree. A staged frame is a
// presentation still: the sim is stopped so the pose holds, but the HUD is written as if it were
// flying, or the loop would overwrite the staged hint with the paused one a tenth of a second later.
function hudOptions(paused = staged ? false : input.paused) {
  if (!touch?.active) return { paused };
  const hint = touch.hint(flight, effects, paused);
  return { paused, touch: true, hint: hint.text, hintVoice: hint.voice };
}

function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  frameTimes.push(raw * 1000);
  if (frameTimes.length > 900) frameTimes.shift();
  const dt = Math.min(raw, 0.06);
  // The simulation runs only while the pointer is locked to the canvas, which is what makes the
  // pause state and the lock state impossible to disagree.
  const stepSim = running && !input.paused && input.locked;
  frame(dt, stepSim);
  if (stepSim) adaptResolution(dt);
  if (running && hudTimer < 0.02 && frameTimes.length > 8) {
    const window90 = frameTimes.slice(-90);
    const mean = window90.reduce((a, b) => a + b, 0) / window90.length;
    hud.setFps(`${Math.round(1000 / mean)} FPS`);
  }
  canvas.classList.toggle('unlocked', !input.locked);
}

// ------------------------------------------------------------------------------- staging

// Poses unchanged from the first pass, with the seeding the rigid-body model needs so that legs,
// surfaces and the canard droop are real in the frame rather than left at their reset values.
const POSES = {
  ramp: [AIRPORT.spawn[0], null, AIRPORT.spawn[1], 0, 0],
  takeoff: [AIRPORT.spawn[0], 12, -950, 0.12, 92],
  cloud: [1600, 1000, -2600, 0.035, 200],
  bomb: [-980, 270, -3300, -0.12, 155],
  landing: [AIRPORT.spawn[0], 32, -100, 0.055, 84],
};

function stage(name) {
  if (!running) start();
  reset();
  input.setPaused(true);
  const pose = POSES[name] || POSES.ramp;
  const [x, y, z, pitch, speed] = pose;
  if (y !== null) flight.position.set(x, y, z);
  else flight.position.set(x, flight.position.y, z);
  flight.attitude.setFromEuler(new THREE.Euler(pitch, 0, 0));
  flight.velocity.set(0, name === 'landing' ? -3 : name === 'takeoff' ? 9 : 0, -speed);
  flight.gear = ['ramp', 'takeoff', 'landing'].includes(name);
  flight.gearPosition = flight.gear ? 1 : 0;
  flight.airborneTime = name === 'ramp' ? 0 : 30;
  flight.landed = false;

  if (name === 'ramp') {
    // Thirty steps at 120 Hz with the brakes on: the oleos settle, the legs report real loads and
    // the canards sit at their parked droop.
    flight.setThrottle(0);
    for (let i = 0; i < 30; i++) flight.step(STEP, { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: true });
  } else {
    const reheat = ['cloud', 'takeoff'].includes(name);
    flight.setThrottle(reheat ? 1.12 : 0.55);
    flight.spool = reheat ? 1.12 : 0.55;
    flight.reheat = reheat ? 1 : 0;
    // The droop decays with a 0.4 s time constant, so one step would leave the canards parked.
    // Clearing it puts them where the airflow has them: deflected with the elevons.
    flight._droop = 0;
    flight.step(STEP, { pitch: name === 'takeoff' ? 0.35 : 0.05, roll: 0, yaw: 0, throttle: 0 });
    flight.spool = reheat ? 1.12 : 0.55;
    flight.reheat = reheat ? 1 : 0;
    flight.surfaces.nozzle = reheat ? 1 : 0.1;
  }

  if (name === 'takeoff') {
    // Seed the spray the wheels threw up on the roll: at this pose the aircraft has just left the
    // wet runway, and the mist behind it is what the concept frame shows.
    for (let i = 0; i < 40; i++) {
      const back = 6 + i * 3.4;
      effects.spray.spawn({
        position: V3((Math.random() - 0.5) * 9, 0.6 + Math.random() * 2.2, -800 + back),
        velocity: V3(0, 0.6, 6), size: 3 + i * 0.25, alpha: 0.42 * Math.exp(-i / 22), life: 4,
      });
    }
    effects.spray.update(0.001, (p) => p.alpha > 0.01);
  }
  if (name === 'bomb') {
    // A bomb already released and falling ahead of the aircraft.
    aircraft.update(0.016, flight, camera, elapsed);
    aircraft.root.updateMatrixWorld(true);
    effects.dropBomb(flight, aircraft);
    const bomb = effects.bombs[effects.bombs.length - 1];
    if (bomb) for (let i = 0; i < 110; i++) bombStep(bomb, 1 / 60);
  }

  aircraft.update(0.016, flight, camera, elapsed);
  effects.update(0.001, flight, camera, elapsed);
  chase.update(0.016, flight, null, true, true);
  world.update(0.016, flight, camera, elapsed);
  hud.update(flight, camera, input, instructor, effects, { paused: true });
  // A staged frame is a presentation still, so clear the pause overlay that the interactive pause
  // would show. The normal pause text returns as soon as the viewer clicks to take the controls.
  hud.setStatus('');
  // One writer for the lever. frame() calls touch.update(), which writes the layer's own throttle
  // back into the flight model, so without this the pose's throttle is overwritten by whatever the
  // last staged cell left on the slider and every ramp frame photographed a parked aircraft at full
  // reheat with the gate reading IDLE.
  if (touch?.active) { touch.throttle = flight.throttle; touch.renderThrottle(); }
  frame(0.001, false);
  return name;
}

// ------------------------------------------------------------------------------- metrics

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function metrics() {
  const samples = frameTimes.slice(-600);
  const sorted = samples.slice().sort((a, b) => a - b);
  const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
  // The vsync interval is the median frame; a slow frame is one longer than one and a half of it.
  const recent = frameTimes.slice(-240);
  const median = percentile(recent.slice().sort((a, b) => a - b), 0.5);
  const slowFraction = recent.length && median
    ? recent.filter((t) => t > median * 1.5).length / recent.length : null;
  return {
    samples: samples.length,
    meanMs: samples.length > 4 ? mean : null,
    p95Ms: samples.length > 4 ? percentile(sorted, 0.95) : null,
    fps: samples.length > 4 && mean ? 1000 / mean : null,
    slowFraction,
    resolution: [canvas.width, canvas.height],
    pixelRatio: renderer.getPixelRatio(),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
}

// A synchronous frame, for measuring where requestAnimationFrame cannot be trusted: the
// Claude-in-Chrome automation tab freezes it, and headless timings mean nothing.
function renderOnce(dt = 1 / 60) {
  frame(dt, running && !flight.crashed);
  return dt;
}

// WebGL queues its work, so the frame is finished on the GPU before the clock stops; without
// that the figure is the CPU's submission rate, which says nothing where the GPU is the limit.
function benchmark(frames = 240, dt = 1 / 60) {
  const warmup = Math.min(30, Math.floor(frames / 4));
  const gl = renderer.getContext();
  const times = [];
  for (let i = 0; i < frames + warmup; i++) {
    const t0 = performance.now();
    renderOnce(dt);
    gl.finish();
    const t1 = performance.now();
    if (i >= warmup) times.push(t1 - t0);
  }
  const sorted = times.slice().sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    frames: times.length,
    meanMs: mean,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    pixelRatio: renderer.getPixelRatio(),
    resolution: [canvas.width, canvas.height],
  };
}

// Pixel ratio 2 with the post targets resized: four times the pixels, which is the headroom
// number spec section 7 asks for.
function stress(on = true) {
  stressed = !!on;
  pixelRatio = stressed ? 2 : basePixelRatio();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  post.resize();
  return renderer.getPixelRatio();
}

// The touch overlay over a staged pose, for the layout screenshot. There is no device, so the
// neutral pose is injected first and a rolled sample after it, and the slider takes the pose's
// throttle from stage() rather than the other way about. The state goes second because
// tools/qa_touch.mjs calls touchDemo(STAGE, STATE).
function touchDemo(name = 'cloud', state = 'resting', beta = 50, gamma = 12) {
  if (!touch) { stage(name); return null; }
  // Entered before the pose is staged, so the layer is active while stage() paints its frame and
  // the lever is synced there: one writer for the throttle, and the ramp cell photographs the
  // resting quadrant the player actually meets.
  touch.enter();
  stage(name);
  // A previous QA run's localStorage must not blank the coaching lines in this run's screenshots.
  touch.veteran = false;
  touch.simulate(beta, 0);
  touch.simulate(beta, gamma);
  // Set from scratch every time, because these two outlive reset() and would otherwise leak from
  // the previous cell of the matrix into this one.
  input.gunHeld = state === 'firing';
  touch.el.gun.classList.toggle('pressed', state === 'firing');
  if (state === 'warming' || state === 'searching') {
    // The seeker powered, cold-soaking and then looking: WARMING is the fringe without the bloom and
    // SEARCH is the full phosphor ramp, which is the pair section 1.2's amendment turns on.
    Object.assign(engagement.seeker, { enabled: true, warm: state === 'warming' ? 0.4 : 1, locked: false, target: null });
    engagement.remaining = 2;
  } else if (state === 'locked') {
    // Whether the launch is inhibited is the pose's business: the ramp cell is deliberately a
    // dimmed cap with a FIRE legend, which is what the shipped build already means.
    Object.assign(engagement.seeker, { enabled: true, warm: 1, locked: true, target: {} });
    engagement.remaining = 2;
  } else if (state === 'reloading') {
    // Every digit column exercised at once: the three countdowns read 7, 12 and 15.
    flight.rounds = 0;
    flight.bombs = 0;
    engagement.remaining = 0;
    engagement.reloadTime = 5;
    effects.reload = { rounds: 5, bombs: 13 };
  }
  // Held, not resumed: engagement.update() recomputes the seeker's target from the live air picture
  // every step, so a staged lock would be gone before the shutter.
  staged = true;
  hud.setStatus('');
  hud.update(flight, camera, input, instructor, effects, hudOptions(false));
  frame(0.001, false);
  return name;
}

function setAim(azimuth, elevation) {
  const direction = aimFromAngles(flight, azimuth, elevation);
  // Put the cursor where that direction lands on screen, so the reticle and the aim agree.
  const point = flight.position.clone().addScaledVector(direction, 1000).project(camera);
  input.worldAim = direction.clone();
  input.cursor.set(point.x * innerWidth / 2, -point.y * innerHeight / 2);
  input.clampCursor();
  return direction;
}

// ------------------------------------------------------------------------------- go

chase.update(1 / 60, flight, null, false, true);
aircraft.update(0.016, flight, camera, 0);
world.update(0.016, flight, camera, 0);
$('loading').classList.add('hidden');
$('start').disabled = false;
requestAnimationFrame(loop);

// Assigned last, once every await has settled, so a headless --eval that runs the moment the page
// loads either finds the whole object or none of it.
window.range = {
  flight, instructor, renderer, scene, camera, world, aircraft, effects, input, hud, engagement, touch,
  targets: effects.targets, bombs: effects.bombs,
  start, reset, stage, metrics, renderOnce, benchmark, stress, setAim, touchDemo, setSkin,
  dropBomb: () => effects.dropBomb(flight, aircraft),
  fireGun: () => effects.fireGun(flight),
  explosion: (position, strength) => effects.explosion(position, strength),
  setPaused: (value) => input.setPaused(value),
  resume: () => input.setPaused(false),
  get paused() { return input.paused; },
  get followingMunition() { return munitionCamera.target; },
};
