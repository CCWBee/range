// Black-frame QA. Four checks, each reading the real framebuffer rather than trusting the code:
//  1. poses that can blank the view (zenith, nadir over water and land, vertical climb and dive);
//  2. an explosion a metre from the canopy, whose light can overflow the half-float scene target;
//  3. a real WebGL context loss and restore (the view must come back, with its environment map);
//  4. a live loop under load on the phone tier: no canvas resize may land after that frame's draw,
//     because resizing a WebGL canvas clears the buffer the browser is about to show.
// Dusk sky, sea and tarmac are never near-black, so a large near-black share is a defect.
// Run: node tools/qa_black_frames.mjs [--tier mobile]   (frames go to _archive/black-qa/)
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const mobile = process.argv.includes('--tier') && process.argv[process.argv.indexOf('--tier') + 1] === 'mobile';
const tier = mobile ? 'mobile' : 'desktop';
const out = new URL('../_archive/black-qa/', import.meta.url); mkdirSync(out, { recursive: true });
const size = mobile ? { width: 932, height: 430 } : { width: 1280, height: 720 };
const bundle = (query = '') => new URL(`../dist/${mobile ? 'mobile.html' : 'index.html'}${query}`, import.meta.url).href;
// Read the composited frame straight after rendering it, in the same task, so the drawing buffer is
// still valid without preserveDrawingBuffer. Returns the near-black share and the mean luminance.
const READ = `window.__black=(dt)=>{const r=range;r.renderOnce(dt);const gl=r.renderer.getContext();
  const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  let black=0,sum=0;for(let i=0;i<px.length;i+=4){const s=px[i]+px[i+1]+px[i+2];if(s<9)black++;sum+=s;}
  return {black:+(black/(w*h)).toFixed(5),luma:+(sum/(3*w*h)).toFixed(1)};}`;
const ready = async (page) => { for (let i = 0; i < 240 && !await page.eval('!!window.range'); i++) await sleep(250); await page.eval(READ); };
const errorsOf = (page) => page.logs.filter(l => l.startsWith('EXC') || l.startsWith('error'));

let chrome = await launch({ ...size, gpu: true, timeout: 90000 });
const report = { tier, poses: [], explosion: null, context: null, live: null };
try {
  // 1. Poses.
  // The phone page opens as a phone: the touch layer (its virtual lock lets the sim step without
  // pointer lock) and a device pixel ratio of 2, so the adaptive ratio has room to step down.
  let page = await chrome.page(mobile ? { ...size, dsf: 2, mobile: true } : size);
  await page.goto(bundle(mobile ? '?touch=1' : ''));
  await ready(page);
  const pose = (eye, tgt) => `(()=>{const r=range;r.input.devCamera=true;r.camera.position.set(${eye});r.camera.up.set(0,1,0);r.camera.lookAt(${tgt});r.input.devLook={x:r.camera.rotation.y,y:r.camera.rotation.x};})()`;
  await page.eval('range.stage("cloud"); range.input.keys.clear();');
  const poses = {
    'zenith': ['0,800,-3000', '0,5000,-3000.01'],
    'zenith-offset': ['0,800,-3000', '3,5000,-2998'],
    'nadir-water': ['4000,300,-2000', '4000,-82.6,-2000.01'],
    'nadir-water-high': ['4000,1500,-2000', '4000,-82.6,-2000.01'],
    'nadir-land': ['500,600,-3000', '500,0,-3000.01'],
    'horizon-sea': ['4000,40,-2000', '9000,40,-2000'],
    'sun-glint': ['-1600,240,-2200', '1600,-78,-3400'],
  };
  for (const [name, [eye, tgt]] of Object.entries(poses)) {
    await page.eval(pose(eye, tgt));
    report.poses.push({ pose: name, ...await page.eval('__black(0.05)') });
    writeFileSync(new URL(`${tier}-${name}.png`, out), await page.screenshot());
  }
  for (const [name, pitch] of [['chase-vertical-climb', Math.PI / 2 - 0.001], ['chase-vertical-dive', -Math.PI / 2 + 0.001]]) {
    const s = await page.eval(`(()=>{const r=range;r.input.devCamera=false;const f=r.flight;
      f.position.set(4000,900,-3000);f.onGround=false;f.crashed=false;
      f.attitude.setFromAxisAngle({x:1,y:0,z:0},${pitch});
      let last;for(let i=0;i<12;i++){f.velocity.set(0,${pitch > 0 ? 180 : -180},0);last=__black(1/60);}return last;})()`);
    report.poses.push({ pose: name, ...s });
    writeFileSync(new URL(`${tier}-${name}.png`, out), await page.screenshot());
  }

  // 2. An explosion a metre over the canopy on the ramp, lit through one effects step.
  report.explosion = await page.eval(`(()=>{const r=range;r.stage('ramp');r.input.devCamera=false;
    const before=__black(0);const p=r.flight.position.clone();p.y-=1.9;p.z-=3.5;r.explosion(p,1.3);
    r.effects.update(1/60,r.flight,r.camera,0);const after=__black(0);return {before,after};})()`);
  writeFileSync(new URL(`${tier}-explosion-canopy.png`, out), await page.screenshot());

  // 3. Context loss and restore.
  report.context = await page.eval(`(async()=>{const r=range;const ext=r.renderer.getContext().getExtension('WEBGL_lose_context');
    if(!ext)return {skipped:true};r.stage('ramp');const before=__black(0);
    ext.loseContext();await new Promise(f=>setTimeout(f,400));
    const lostStatus=document.getElementById('status').textContent;
    ext.restoreContext();await new Promise(f=>setTimeout(f,800));
    r.stage('ramp');const after=__black(0);
    const env=r.scene.environment&&r.renderer.properties.get(r.scene.environment).__webglTexture!==undefined;
    return {before,after,lostStatus,statusAfter:document.getElementById('status').textContent,environmentUploaded:env};})()`);
  writeFileSync(new URL(`${tier}-context-restored.png`, out), await page.screenshot());
  report.errors = errorsOf(page).length;
  report.errorLines = errorsOf(page).slice(0, 4);

  // 4. The per-frame order under load, phone tier. range.tick(now) is the loop's own body, driven
  //    with synthetic timestamps 100 ms apart (headless throttles requestAnimationFrame to about one
  //    a second, too slow for the ratio to decide). A 100 ms median is load, so the adaptive ratio
  //    steps down; every canvas resize must land before that tick's draw, never after it.
  if (mobile) {
    await page.eval(`(()=>{const r=range;r.touchDemo('cloud');r.resume();
      window.__order={resizes:0,afterDraw:0};let drawn=false;const R=r.renderer,P=r.post;
      const setSize=R.setSize.bind(R),render=P.render.bind(P);
      R.setSize=(...a)=>{__order.resizes++;if(drawn)__order.afterDraw++;return setSize(...a);};
      P.render=(...a)=>{const x=render(...a);drawn=true;return x;};
      window.__drive=(n)=>{let t=performance.now();for(let i=0;i<n;i++){drawn=false;t+=100;r.tick(t);}};})()`);
    const startRatio = await page.eval('range.renderer.getPixelRatio()');
    for (let i = 0; i < 10; i++) await page.eval('__drive(25)');
    report.live = await page.eval(`({stepping:range.input.running&&range.input.locked&&!range.paused,startRatio:${startRatio},endRatio:range.renderer.getPixelRatio(),...__order})`);
  }
} finally { await chrome.close(); }

console.log(JSON.stringify(report, null, 1));
const bad = report.poses.filter(p => p.black > 0.02);
assert.equal(bad.length, 0, `near-black frames: ${JSON.stringify(bad)}`);
assert(report.explosion.after.black <= report.explosion.before.black + 0.005, `explosion blacked ${report.explosion.after.black} of the frame`);
if (!report.context.skipped) {
  assert(report.context.lostStatus.startsWith('GRAPHICS RESET'), 'a lost context says so');
  assert(report.context.environmentUploaded, 'the environment map is rebuilt after a restore');
  assert(report.context.after.luma > report.context.before.luma * 0.85, `restored frame dark: ${report.context.after.luma} vs ${report.context.before.luma}`);
  assert.equal(report.context.statusAfter, '', 'the reset line clears on restore');
}
if (report.live) {
  assert(report.live.stepping, 'live loop was stepping');
  assert(report.live.resizes > 0, 'the load made the adaptive ratio step at least once');
  assert.equal(report.live.afterDraw, 0, 'no resize after the frame was drawn');
}
assert.equal(report.errors, 0, report.errorLines.join('\n'));
console.log('PASS black-frame checks', tier);
