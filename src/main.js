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
const SHOW_FPS = new URLSearchParams(location.search).has('fps');
const munitionCamera = new MunitionCamera();
let touchFollow = null;

const canvas = $('view');
// A failure while loading or building the world must say so, rather than leave the intro up with a
// disabled ENTER for ever: a module that throws before its last line never hides #loading. After
// start-up the same events only reach the console.
let started = false;
function showStartFailure(message) {
  if (started) return;
  $('loading')?.classList.add('hidden');
  const box = $('error');
  box.classList.remove('hidden');
  box.innerHTML = '<p>RANGE could not start.</p><p class="detail"></p><button type="button" class="key" id="reloadPage">RELOAD</button>';
  box.querySelector('.detail').textContent = message;
  $('reloadPage').onclick = () => location.reload();
}
addEventListener('error', (event) => showStartFailure(event.message || 'A script error stopped the loader.'));
addEventListener('unhandledrejection', (event) => showStartFailure(event.reason?.message || String(event.reason)));
let renderer;
try {
  // No depth or stencil on the canvas: every 3D pass renders into the post scene target, which
  // has its own, and the final quad does not depth-test. About 5 to 6 MB of GPU memory on a phone.
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', depth: false, stencil: false });
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
// updateStyle false throughout: the stylesheet sizes the canvas at 100%, and the inline pixel size
// setSize would otherwise write goes stale on the next resize and uncovers a band of the page.
renderer.setSize(innerWidth, innerHeight, false);
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

// The load gauge (index.html, load-gauge), and a frame between build stages so it repaints and the
// page takes taps while the island is assembled. A hidden tab (opened in the background) paints
// nothing and throttles its timers to about one a second, so there the boot runs straight through, as
// it did before it had stages; the timer covers a tab hidden mid-wait.
const gauge = (fraction, text) => window.RANGE_GAUGE?.(fraction, text);
const nextFrame = () => document.hidden ? Promise.resolve() : new Promise((resolve) => {
  const timer = setTimeout(resolve, 100);
  requestAnimationFrame(() => { clearTimeout(timer); setTimeout(resolve, 0); });
});
// For a loop of small steps: a frame only once 100 ms of work has gone by, since each frame waited
// for is about 16 ms the loop is not working.
function frameEvery100ms() {
  let since = performance.now();
  return async (fraction, text) => {
    if (performance.now() - since < 100) return;
    gauge(fraction, text);
    await nextFrame();
    since = performance.now();
  };
}
gauge(.5, 'LOADING · TEXTURES');
await nextFrame();
const library = await loadLibrary(renderer);
const world = new World(renderer, library, { tier: MOBILE ? 'mobile' : 'desktop' });
await world.build(async (fraction, text) => { gauge(.55 + .3 * fraction, text); await nextFrame(); });
gauge(.86, 'BUILDING · AIRCRAFT');
await nextFrame();
const chase = new ChaseCamera(innerWidth / innerHeight);
const aircraft = new Aircraft(library, world.scene, world.quadGeometry);
const effects = new Effects(library, world.scene, world.quadGeometry, audio, { tier: MOBILE ? 'mobile' : 'desktop' });
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

// A lost WebGL context (a phone backgrounded under memory pressure, a driver reset) leaves three.js
// skipping every render: before this the canvas went black under a live HUD while the sortie flew
// on unseen. Pause, say so, and on restore rebuild the one GPU resource three cannot re-upload by
// itself, the sky's environment capture, then resize the post targets.
let contextLost = false, contextTimer = 0;
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost = true;
  if (running) input.setPaused(true);
  hud.setStatus('GRAPHICS RESET<small>Restoring the view.</small>');
  clearTimeout(contextTimer);
  contextTimer = setTimeout(() => {
    if (!contextLost) return;
    hud.setStatus('GRAPHICS LOST<small>The browser did not restore the view.</small><button type="button" class="key" id="reloadView">RELOAD</button>');
    $('reloadView').onclick = () => location.reload();
  }, 5000);
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  clearTimeout(contextTimer);
  world.captureEnvironment();
  post.resize();
  // setPauseUi returns early on the intro, so the reset line is cleared here first; mid-sortie it
  // then puts the paused screen back, since the loss paused the sortie.
  hud.setStatus('');
  setPauseUi(input.paused);
}, false);

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
let frameErrors = 0;
const frameTimes = [];

// Adaptive resolution: every two seconds of play the pixel ratio steps by 0.1 towards whatever
// src/quality.js decides from the last 120 frames, with a per-tier floor of 1.0 on a phone and 0.6
// on a desktop. Off while stressed, since that mode fixes the ratio to measure headroom, and idle
// while paused. The thresholds are measured against the window's own median, not against absolute
// milliseconds: a 60 Hz phone can never report a p95 under 9 ms, so the old recovery branch was
// unreachable and the first rough patch took the phone to 0.6 for the rest of the sortie.
let pixelRatio = basePixelRatio(), ratioTimer = 0, ratioLean = 0;
function adaptResolution(dt) {
  ratioTimer += dt;
  if (stressed || ratioTimer < 2 || frameTimes.length < 60) return;
  ratioTimer = 0;
  const next = nextPixelRatio(frameTimes.slice(-120), pixelRatio, basePixelRatio(), MOBILE ? 1 : 0.6);
  const lean = Math.sign(next - pixelRatio);
  // Two decisions in a row the same way before a step, so a window sitting on a threshold does not
  // ping-pong the ratio: every step reallocates the MSAA scene target and both bloom targets.
  if (!lean || lean !== ratioLean) { ratioLean = lean; return; }
  ratioLean = 0;
  pixelRatio = next;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  post.resize();
}

// ------------------------------------------------------------------------------- actions

function start() {
  // ENTER lights only once the warm-up is done; Enter on the keyboard must not start sooner.
  if (running || $('start').disabled) return;
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
  hud.setStatus(paused && !flight.crashed ? `PAUSED<small>${resume}</small><button id="returnMenu" type="button" class="key">CHANGE AIRCRAFT</button>` : '');
  if ($('returnMenu')) $('returnMenu').onclick = returnToMenu;
  if (flight.crashed) hud.crashShown = false;
}

function returnToMenu() {
  running = false;
  input.running = false;
  input.exitLock();
  input.virtualLock = false;
  input.keys.clear();
  input.gunHeld = false;
  input.touchLook = false;
  touchFollow = null;
  if (touch) { touch.active = false; touch.throttle = 0; touch.syncWakeLock(true); }
  reset();
  staged = false;
  audio.update(flight, true);
  audio.seeker(false, false, false);
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('buttons').classList.add('hidden');
  hud.toggleHelp(false);
  $('intro').classList.remove('hidden');
  $('veil').classList.remove('hidden');
  $('start').focus();
}

input.on('pause', setPauseUi);
input.on('start', start);
input.on('bomb', () => { if (input.locked && !input.paused && !input.devCamera) effects.dropBomb(flight, aircraft); });
input.on('gear', () => { if (!flight.onGround && !flight.crashed) flight.gear = !flight.gear; });
input.on('camera', () => chase.toggle());
input.on('seeker',()=>{if(input.locked&&!input.paused)flight.airframe==='wyvern'?engagement.launchRocket(flight):engagement.toggleSeeker();});
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
const SKIN_LEGENDS = [['skinGrey', 'grey'], ['skinHeritage', 'heritage']];
function setSkin(name) {
  if (!SKINS.includes(name) || name === aircraft.skinName || !aircraft.setSkin(name)) return false;
  $('skinChoice').value = name;
  setSwitch('skinSwitch', SKIN_LEGENDS, name);
  return true;
}

// One writer for the airframe, on the same terms. It is an intro decision: the switch is inert
// once the sortie runs, and the skin switch hides for the Wyvern, whose paint is its own.
const AIRFRAMES = ['typhoon', 'wyvern'];
const AIRFRAME_LEGENDS = [['aircraftTyphoon', 'typhoon'], ['aircraftWyvern', 'wyvern']];
function setAircraft(type) {
  if (running || !AIRFRAMES.includes(type) || type === (aircraft.type || 'typhoon') || !aircraft.setType(type)) return false;
  flight.airframe = type; reset();
  setSwitch('aircraftSwitch', AIRFRAME_LEGENDS, type);
  $('skinSwitch').style.display = type === 'wyvern' ? 'none' : '';
  $('gunHelp').textContent = type === 'wyvern' ? 'Four wing-mounted Hispano cannons' : '27 mm cannon';
  $('bombHelp').textContent = type === 'wyvern' ? 'Release torpedo, low and level over water' : 'Release Paveway';
  $('seekerHelp').textContent = type === 'wyvern' ? 'Fire RP-3 rocket' : 'Heat-seeking missile sensor on / off';
  $('missileHelp').textContent = type === 'wyvern' ? 'Fire RP-3 rocket, no lock needed' : 'Launch locked heat-seeking missile';
  return true;
}

// The knob's position is the state (`on` puts it at the second legend), aria-checked carries it,
// and focus follows it with a roving tabindex.
function setSwitch(id, legends, value) {
  $(id).classList.toggle('on', value === legends[1][1]);
  for (const [legendId, wanted] of legends) {
    $(legendId).setAttribute('aria-checked', String(value === wanted));
    $(legendId).tabIndex = value === wanted ? 0 : -1;
  }
}

// A switch: a click on either legend, a press anywhere on the 44 px row, or a drag that snaps to
// the end the pointer has crossed into. The window-level pointer pattern is the throttle's, which
// deliberately avoids pointer capture because some browsers refuse it, so a finger that drifts off
// the row keeps working and a pointercancel still ends the drag. It binds on both tiers, outside
// the touch block below: the first desktop switch shipped with this binding inside that block, and
// its legends did nothing under a mouse while the hidden select still worked. src/touch.js stays
// about flying: it does not learn what a skin or an airframe is.
function bindSwitch(id, trackId, legends, set) {
  const root = $(id), track = $(trackId);
  const nearest = (clientX) => {
    const r = track.getBoundingClientRect();
    return clientX < r.left + r.width / 2 ? legends[0][1] : legends[1][1];
  };
  // A tap anywhere on the row outside the legends toggles, committed on release as a hardware toggle
  // is. The knob always sits at the current end, so the old press-resolves-to-nearest-end rule made a
  // tap on the knob, the natural target, do nothing. A drag past a 6 px dead zone still follows the
  // pointer and snaps to the end it crosses into; jitter under that cannot snap the knob back.
  let press = null;
  root.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  root.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.switchLegend')) return;   // the legend's own click handles it
    event.preventDefault();
    press = { id: event.pointerId, x: event.clientX, slid: false };
    root.classList.add('held');
  });
  window.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.id) return;
    if (!press.slid && Math.abs(event.clientX - press.x) < 6) return;
    press.slid = true;
    root.classList.add('sliding');
    set(nearest(event.clientX));
  });
  const endPress = (event) => {
    if (!press || event.pointerId !== press.id) return;
    const tap = !press.slid && event.type === 'pointerup';
    press = null;
    root.classList.remove('held', 'sliding');
    // Only setSwitch writes the `on` class, so it reads the state; the setter's own guard handles
    // the rest (setAircraft refuses once a sortie is running).
    if (tap) set(legends[root.classList.contains('on') ? 0 : 1][1]);
  };
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);
  for (const [legendId, value] of legends) $(legendId).onclick = () => set(value);
  // The radiogroup pattern rather than a re-invention of it: focus follows the selection.
  root.addEventListener('keydown', (event) => {
    const back = ['ArrowLeft', 'ArrowUp', 'Home'], on = ['ArrowRight', 'ArrowDown', 'End'];
    if (!back.includes(event.key) && !on.includes(event.key)) return;
    event.preventDefault();
    const [legendId, value] = legends[back.includes(event.key) ? 0 : 1];
    set(value);
    $(legendId).focus();
  });
}
bindSwitch('skinSwitch', 'skinTrack', SKIN_LEGENDS, setSkin);
bindSwitch('aircraftSwitch', 'aircraftTrack', AIRFRAME_LEGENDS, setAircraft);

// The portrait check goes after start(), because the layer's pause handler below needs the sortie
// running to take it, and a page that loaded in portrait fires no orientation change event.
$('start').onclick = () => { if (touch) touch.enter(); start(); touch?.pauseIfPortrait(); };
if (touch) {
  const watchRelease = (action) => {
    touchFollow=null;
    if(input.paused || input.devCamera) return;
    const previous=effects.lastMunition;
    action();
    if(effects.lastMunition!==previous) touchFollow={target:effects.lastMunition,age:0};
  };
  touch.on('bomb', () => watchRelease(()=>releaseBomb(engagement, effects, flight, aircraft, input.aimState)));
  touch.on('seeker', () => watchRelease(()=>flight.airframe==='wyvern'?engagement.launchRocket(flight):seekerPress(engagement, flight)));
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
$('pauseButton').onclick = () => {
  if (input.paused) input.requestLock();
  else { input.setPaused(true); input.exitLock(); }
};
$('sound').onclick = () => { $('sound').textContent = audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON'; };
$('skinChoice').onchange = (event) => setSkin(event.target.value);

window.addEventListener('resize', () => {
  // A collapsed or mid-rotation viewport can report zero: an aspect of Infinity or NaN would blank
  // every frame until the next good resize, and a 0 x 0 scene target is an incomplete framebuffer.
  if (!(innerWidth > 0 && innerHeight > 0)) return;
  renderer.setSize(innerWidth, innerHeight, false);
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
      gunTimer = flight.airframe === 'wyvern' ? .08 : .065;
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
  tick(now);
}

// One animation frame's work, apart from scheduling the next. Separate so tools/qa_black_frames.mjs
// can drive the real per-frame order with synthetic timestamps: headless Chrome throttles
// requestAnimationFrame to about once a second, too slow for the adaptive ratio ever to decide.
function tick(now) {
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  frameTimes.push(raw * 1000);
  if (frameTimes.length > 900) frameTimes.shift();
  const dt = Math.min(raw, 0.06);
  // The simulation runs only while the pointer is locked to the canvas, which is what makes the
  // pause state and the lock state impossible to disagree.
  const stepSim = running && !input.paused && input.locked;
  // Resize before drawing, never after. Resizing a WebGL canvas clears its drawing buffer, so the
  // old order (draw, then adapt the ratio) handed the compositor a cleared buffer for that frame:
  // one black frame every time the ratio stepped, which is what the random black flashes were.
  // The decision reads the previous frames' times, so the order changes nothing else.
  if (stepSim) adaptResolution(dt);
  try { frame(dt, stepSim); frameErrors = 0; }
  catch (error) {
    // Logged once, not sixty times a second; a run of failures says so on screen.
    if (frameErrors++ === 0) console.error(error);
    if (frameErrors === 120) hud.setStatus('RANGE STOPPED<small>Reload the page to fly again.</small>');
  }
  // The frame rate is a developer readout, not an instrument: shown with ?fps=1 or in the map camera.
  if (running && hudTimer < 0.02 && frameTimes.length > 8) {
    if (SHOW_FPS || input.devCamera) {
      const window90 = frameTimes.slice(-90);
      const mean = window90.reduce((a, b) => a + b, 0) / window90.length;
      hud.setFps(`${Math.round(1000 / mean)} FPS`);
    } else hud.setFps('');
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
  renderer.setSize(innerWidth, innerHeight, false);
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

// Upload the textures and compile every shader before ENTER lights, not on the first frames after
// it: that was a block of 3.5 to 4.6 seconds with an enabled ENTER already showing (measured with
// tools/qa_boot.mjs). Where the browser has KHR_parallel_shader_compile the programs build off the
// main thread and are polled here, so the gauge counts them. compile() walks hidden objects too, so
// the idle sprite pools are included and the first explosion does not stop to build its smoke.
// bootTimes keeps each phase's milliseconds for tools/qa_boot.mjs and a phone's own console.
const bootTimes = { parallelCompile: renderer.extensions.has('KHR_parallel_shader_compile') };
async function warmUp() {
  let t0 = performance.now();
  const textures = [...new Set(Object.values(library.textures))];
  const textureFrame = frameEvery100ms();
  for (let i = 0; i < textures.length; i++) {
    renderer.initTexture(textures[i]);
    await textureFrame(.88 + .04 * (i + 1) / textures.length, 'LOADING · TEXTURES');
  }
  bootTimes.textures = Math.round(performance.now() - t0);
  gauge(.92, 'COMPILING · SHADERS');
  await nextFrame();
  t0 = performance.now();
  // Object by object, so a browser without the extension (where each compile blocks) still moves
  // the gauge; with it, the loop below waits for the last program.
  const objects = [], materials = new Set(), compileFrame = frameEvery100ms();
  scene.traverse((object) => { if (object.material) objects.push(object); });
  for (let i = 0; i < objects.length; i++) {
    for (const material of renderer.compile(objects[i], camera, scene)) materials.add(material);
    await compileFrame(.92 + .04 * (i + 1) / objects.length, 'COMPILING · SHADERS');
  }
  bootTimes.compile = Math.round(performance.now() - t0);
  bootTimes.programs = materials.size;
  t0 = performance.now();
  const pending = [...materials];
  const ready = (material) => renderer.properties.get(material).currentProgram?.isReady() ?? true;
  for (let waited = 0; waited < 30000; waited += 30) {
    const count = pending.filter(ready).length;
    gauge(.96 + .03 * count / Math.max(1, pending.length), 'COMPILING · SHADERS');
    if (count === pending.length || document.hidden) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  bootTimes.compileWait = Math.round(performance.now() - t0);
}

// The window may have been resized or turned while the island was built, before the listener existed.
window.dispatchEvent(new Event('resize'));
chase.update(1 / 60, flight, null, false, true);
aircraft.update(0.016, flight, camera, 0);
world.update(0.016, flight, camera, 0);
await warmUp();
// The first frame draws here, behind the full gauge, so what is left of its cost (the shadow passes'
// own programs, the first buffer uploads) is paid before ENTER rather than after it.
gauge(.99, 'PREPARING · FIRST FRAME');
await nextFrame();
{
  const t0 = performance.now();
  frame(0, false);
  bootTimes.firstFrame = Math.round(performance.now() - t0);
}
bootTimes.world = world.buildTimes;
gauge(1);
await nextFrame();
$('loading').classList.add('hidden');
$('start').disabled = false;
started = true;
// Reaching this line means nothing that fired during loading was fatal, so clear any failure box.
$('error').classList.add('hidden');
lastFrame = performance.now(); // the first frame's time is that frame's, not the whole boot's
requestAnimationFrame(loop);

// Assigned last, once every await has settled, so a headless --eval that runs the moment the page
// loads either finds the whole object or none of it.
window.range = {
  flight, instructor, renderer, scene, camera, world, aircraft, effects, input, hud, engagement, touch, post,
  targets: effects.targets, bombs: effects.bombs,
  start, reset, stage, metrics, renderOnce, benchmark, stress, setAim, touchDemo, setSkin, setAircraft, tick, bootTimes,
  dropBomb: () => effects.dropBomb(flight, aircraft),
  fireGun: () => effects.fireGun(flight),
  explosion: (position, strength) => effects.explosion(position, strength),
  setPaused: (value) => input.setPaused(value),
  resume: () => input.setPaused(false),
  get paused() { return input.paused; },
  get followingMunition() { return munitionCamera.target; },
};
