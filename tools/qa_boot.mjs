// Boot timeline: how long each tier takes from navigation to an enabled ENTER, and how long the main
// thread is ever blocked on the way (the page cannot repaint or take a tap inside a block). The phone
// run is CPU-throttled four times. Prints the #loading text as it changes, the long tasks, and the
// longest gap in a 50 ms heartbeat. Run: node tools/qa_boot.mjs [--tier desktop|mobile] [--throttle 4]
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const tiers = arg('--tier') ? [arg('--tier')] : ['desktop', 'mobile'];

const PROBE = `(() => {
  const t0 = performance.timeOrigin, now = () => Math.round(performance.now());
  const boot = window.__boot = { longtasks: [], loading: [], gaps: [], enter: null };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) boot.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  let last = performance.now();
  setInterval(() => { const t = performance.now(); if (t - last > 150) boot.gaps.push([Math.round(last), Math.round(t - last)]); last = t; }, 50);
  const watch = () => {
    const el = document.getElementById('loading'), start = document.getElementById('start');
    if (!el || !start) return setTimeout(watch, 20);
    const note = () => { const s = el.classList.contains('hidden') ? '(hidden)' : el.textContent.trim(); if (boot.loading.at(-1)?.[1] !== s) boot.loading.push([now(), s]); };
    note(); new MutationObserver(note).observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    new MutationObserver(() => { if (!start.disabled && boot.enter === null) boot.enter = now(); }).observe(start, { attributes: true });
  };
  watch();
})();`;

for (const tier of tiers) {
  const mobile = tier === 'mobile';
  const size = mobile ? { width: 844, height: 390 } : { width: 1440, height: 810 };
  const chrome = await launch({ ...size, gpu: true, timeout: 120000 });
  try {
    const page = await chrome.page(mobile ? { ...size, mobile: true, dsf: 2 } : size);
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE }, page.sessionId);
    const throttle = mobile ? Number(arg('--throttle', 4)) : 1;
    if (throttle > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate: throttle }, page.sessionId);
    const url = new URL(`../dist/${mobile ? 'mobile.html?touch=1' : 'index.html'}`, import.meta.url).href;
    const t = Date.now();
    await page.goto(url, { timeout: 180000 });
    for (let i = 0; i < 1200 && !(await page.eval('window.__boot?.enter !== null && !!window.range')); i++) await sleep(250);
    await sleep(1500);
    const boot = await page.eval(`({...window.__boot, nav: performance.getEntriesByType('navigation')[0]?.toJSON(), paint: performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]),
      parallel: range.renderer.extensions.has('KHR_parallel_shader_compile'), stages: range.bootTimes || null, gl: (() => { const g = range.renderer.getContext(), d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })()})`);
    const worst = [...boot.gaps].sort((a, b) => b[1] - a[1])[0] || [0, 0];
    const blocked = boot.longtasks.filter(([s]) => s < (boot.enter ?? Infinity)).reduce((sum, [, d]) => sum + d, 0);
    console.log(`\n${tier}${throttle > 1 ? ` (CPU x${throttle})` : ''}: ENTER at ${boot.enter} ms; domInteractive ${Math.round(boot.nav?.domInteractive)} ms; ${boot.paint.map(p => p.join(' ')).join(', ')}; wall ${Date.now() - t} ms`);
    console.log(`  longest main-thread gap ${worst[1]} ms at ${worst[0]} ms; long tasks before ENTER total ${blocked} ms`);
    console.log('  long tasks > 100 ms:', boot.longtasks.filter(([, d]) => d > 100).map(([s, d]) => `${s}+${d}`).join(' '));
    console.log(`  parallel shader compile ${boot.parallel}; ${boot.gl}; boot phases ${JSON.stringify(boot.stages)}`);
    console.log('  #loading:', boot.loading.map(([s, text]) => `${s} ${text}`).join(' | '));
    const errors = page.logs.filter(l => l.startsWith('EXC') || l.startsWith('error'));
    if (errors.length) console.log('  errors:', errors.join('\n'));
  } finally { await chrome.close(); await sleep(1500); }
}
