import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = new URL('../_archive/pause-qa/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const mobile of [false, true]) {
 const chrome = await launch({ width: mobile ? 844 : 1200, height: mobile ? 390 : 800, gpu: true });
 try {
    const page = await chrome.page({ width: mobile ? 844 : 1200, height: mobile ? 390 : 800 });
    await page.goto(new URL(mobile ? '../dist/mobile.html?touch=1' : '../dist/index.html', import.meta.url).href);
    for (let i = 0; i < 180 && !await page.eval('!!window.range'); i++) await sleep(500);
    assert(await page.eval('!!window.range'), 'Bundle loads');
    await page.eval(`range.${mobile ? "touchDemo('cloud')" : "stage('cloud')"};range.input.setPaused(false);range.input.setPaused(true)`);
    const hud = await page.eval(`(()=>{
      const visible=id=>!!document.getElementById(id).getClientRects().length;
      return {menu:visible('returnMenu'),heading:visible('heading'),objective:visible('objective'),laser:visible('laserState'),instructor:document.getElementById('instructor').textContent};
    })()`);
    assert.deepEqual(hud, { menu: true, heading: false, objective: false, laser: false, instructor: '' });
    assert(await page.eval(`getComputedStyle(document.getElementById('markers')).display==='none'`), 'Pause menu hides flight markers');
    writeFileSync(new URL(mobile ? 'mobile-paused.png' : 'desktop-paused.png', out), await page.screenshot());
    const menu = await page.eval(`(()=>{
      document.getElementById('returnMenu').click();
      const shown=!document.getElementById('intro').classList.contains('hidden');
      document.getElementById('aircraftWyvern').click();
      return {shown,aircraft:range.aircraft.type,running:range.input.running,gun:range.input.gunHeld};
    })()`);
    assert.deepEqual(menu, { shown: true, aircraft: 'wyvern', running: false, gun: false });
    await page.eval(`document.getElementById('start').click()`);
    assert(await page.eval(`range.input.running && range.flight.airframe==='wyvern' && document.getElementById('intro').classList.contains('hidden')`), 'Restart in chosen aircraft');
    if(mobile){
      const power=await page.eval(`(()=>{
        range.touch.throttle=1.12;range.touch.maxThrottle=undefined;range.touch.update(0,range.flight);
        range.touch.renderThrottle();
        return {max:document.getElementById('quadrant').getAttribute('aria-valuemax'),power:range.flight.throttle,
          label:document.querySelector('#quadrant .gate.mil').textContent,
          reheat:document.getElementById('quadrant').classList.contains('reheat')};
      })()`);
      assert.deepEqual(power,{max:'100',power:1,label:'MAX',reheat:false});
    }
    await page.eval(`range.stage('cloud');range.renderOnce(0)`);
    assert(await page.eval(`document.getElementById('bombAim').getAttribute('visibility')==='hidden'`),'No misleading Paveway predictor on the Wyvern');
    const errors = page.logs.filter(l => l.startsWith('EXC') || l.startsWith('error'));
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS pause, clean HUD, menu, aircraft switch and restart', mobile ? 'mobile' : 'desktop');
 } finally { await chrome.close(); }
}
