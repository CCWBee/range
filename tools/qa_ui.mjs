// UI QA across both tiers: a tap on each switch's knob must toggle it (it used to do nothing), and
// renders of the intro, flight HUD, pause screen and help sheet go to _archive/ui-qa/ for review.
// Run: node tools/qa_ui.mjs
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const out = new URL('../_archive/ui-qa/', import.meta.url); mkdirSync(out, { recursive: true });
const shots = [];
const tapKnob = (knob) => `(()=>{const k=document.getElementById('${knob}'),r=k.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  k.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,pointerId:7}));
  window.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,pointerId:7}));})()`;

for (const tier of ['desktop', 'mobile']) {
  const size = tier === 'mobile' ? { width: 932, height: 430 } : { width: 1440, height: 810 };
  const chrome = await launch({ ...size, gpu: true, timeout: 90000 });
  try {
    const page = await chrome.page(tier === 'mobile' ? { ...size, mobile: true } : size);
    await page.goto(new URL(`../dist/${tier === 'mobile' ? 'mobile.html?touch=1' : 'index.html'}`, import.meta.url).href);
    for (let i = 0; i < 240 && !await page.eval('!!window.range'); i++) await sleep(250);
    const shot = async (name) => { const f = `${tier}-${name}.png`; writeFileSync(new URL(f, out), await page.screenshot()); shots.push(f); };
    await page.eval('range.renderOnce(0)');
    await shot('intro');

    // Tap the knob of each switch: it must toggle, then toggle back.
    const state = () => page.eval(`({aircraft:range.aircraft.type||'typhoon',skin:range.aircraft.skinName||'grey',
      aircraftOn:document.getElementById('aircraftSwitch').classList.contains('on'),skinOn:document.getElementById('skinSwitch').classList.contains('on')})`);
    const before = await state();
    await page.eval(tapKnob('skinKnob')); await sleep(200);
    const skinTapped = await state();
    await page.eval('range.renderOnce(0)'); await shot('intro-heritage');
    await page.eval(tapKnob('skinKnob')); await sleep(150);
    await page.eval(tapKnob('aircraftKnob')); await sleep(200);
    const aircraftTapped = await state();
    await page.eval('range.renderOnce(0)'); await shot('intro-wyvern');
    await page.eval(tapKnob('aircraftKnob')); await sleep(200);
    const back = await state();
    assert.equal(before.skin, 'grey'); assert.equal(skinTapped.skin, 'heritage', 'a tap on the skin knob toggles it'); assert(skinTapped.skinOn);
    assert.equal(aircraftTapped.aircraft, 'wyvern', 'a tap on the aircraft knob toggles it'); assert(aircraftTapped.aircraftOn);
    assert.equal(back.aircraft, 'typhoon', 'a second tap toggles it back');

    // Flight HUD, pause screen, help sheet (desktop).
    if (tier === 'mobile') await page.eval(`range.touchDemo('cloud')`);
    else await page.eval(`range.stage('cloud')`);
    await page.eval('range.renderOnce(0)'); await shot('hud');
    await page.eval(`range.input.setPaused(false);range.input.setPaused(true);range.renderOnce(0)`); await shot('paused');
    const cap = await page.eval(`(()=>{const b=document.getElementById('returnMenu');if(!b)return null;const c=getComputedStyle(b);
      return {text:b.textContent,radius:c.borderTopLeftRadius,border:c.borderTopWidth,classes:b.className};})()`);
    assert(cap && cap.text === 'CHANGE AIRCRAFT' && cap.radius === '10px' && cap.classes.includes('key'), `pause control is a cap: ${JSON.stringify(cap)}`);
    if (tier === 'desktop') {
      await page.eval(`range.resume();range.hud.toggleHelp(true);range.renderOnce(0)`); await shot('help');
      const help = await page.eval(`({toggle:document.getElementById('helpToggle').textContent,expanded:document.getElementById('helpToggle').getAttribute('aria-expanded'),
        gap:document.getElementById('help').getBoundingClientRect().top-document.getElementById('buttons').getBoundingClientRect().bottom,
        font:getComputedStyle(document.body).fontFamily})`);
      assert.equal(help.toggle, 'HIDE CONTROLS · I'); assert.equal(help.expanded, 'true');
      assert(help.gap >= 0, `help sheet overlaps the button row by ${-help.gap} px`);
      assert(help.font.startsWith('"Barlow Condensed"'), `desktop family ${help.font}`);
    }
    const errors = page.logs.filter(l => l.startsWith('EXC') || l.startsWith('error'));
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS UI', tier, JSON.stringify({ skinTapped: skinTapped.skin, aircraftTapped: aircraftTapped.aircraft, cap: cap.text }));
  } finally { await chrome.close(); await sleep(2000); }
}
console.log('renders:', shots.join(', '));
