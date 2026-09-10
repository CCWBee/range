// RANGE touch-layer QA: one headless Chrome per viewport, every stage and state staged in place,
// two screenshots per cell (the frame, and the same frame with the ink blanked so the backdrop
// behind every text box can be sampled), the text boxes and any overflow written beside them, and
// tools/contrast.py run over the lot at the end.
//
//   node tools/qa_touch.mjs [--url <bundle>] [--widths 667x375,844x390,932x430]
//                           [--stages cloud,ramp,landing] [--states resting,locked,reloading]
//                           [--stage-expr "window.range.touchDemo(STAGE, STATE)"]
//                           [--probe-roots "#hud,#touch,#status"] [--intro]
//                           [--out screenshots/qa] [--no-contrast]
//
// Run from PowerShell. The bundle defaults to dist/mobile.html?touch=1 over file://, the one page
// file:// can load (the dev page fetches the library). STAGE and STATE in --stage-expr are replaced
// by JSON strings; against a bundle whose touchDemo takes no state, pass
// --stage-expr "window.range.touchDemo(STAGE)" --states resting. --stage-expr none stages nothing,
// which is what the intro needs, since the intro is what the page shows before start().
//
// --intro is that pass, the one section 8 asks for beside the 27-cell product: it stages nothing,
// waits for the library the way every cell does, and probes #intro and #loading instead of the HUD.
// The switch's two positions are two states over the same screen:
//   node tools/qa_touch.mjs --out screenshots\qa\intro --intro --states grey,heritage
//     --stage-expr "window.range.setSkin(STATE)"
//
// Local QA only: it imports the shared harness at E:\claude-projects\design\tools\qa, so it does not
// run in CI. Exits 1 when contrast.py reports a failure.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch, sleep } from '../../design/tools/qa/cdp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : d }
const has = (k) => argv.includes(k)
const list = (k, d) => opt(k, d).split(',').map((s) => s.trim()).filter(Boolean)

const rawUrl = opt('--url', pathToFileURL(path.join(root, 'dist/mobile.html')).href + '?touch=1')
const url = /^[a-z]+:\/\//i.test(rawUrl) ? rawUrl : pathToFileURL(path.resolve(rawUrl)).href
const widths = list('--widths', '667x375,844x390,932x430').map((s) => s.split('x').map(Number))
// The intro is one screen with no weapon states, so it comes with its own defaults rather than a
// fourth stage in the 27-cell product: nothing staged, and the intro's own elements probed.
const intro = has('--intro')
const stages = list('--stages', intro ? 'intro' : 'cloud,ramp,landing')
const states = list('--states', intro ? 'plain' : 'resting,locked,reloading')
const stageExpr = opt('--stage-expr', intro ? 'none' : 'window.range.touchDemo(STAGE, STATE)')
const roots = list('--probe-roots', intro ? '#intro,#loading,#status' : '#hud,#touch,#status')
const out = path.resolve(opt('--out', path.join(root, 'screenshots/qa')))
mkdirSync(out, { recursive: true })

// The touch CSS, written out for the mechanical scan of section 8: scan.mjs reads .css files and
// RANGE's touch block is inline, so the block between the two markers in index.html goes to
// touch.css here and the :root declarations that head it go to tokens.css beside it. Two files
// rather than one, because a scanner cannot tell a token's own literal value from a colour
// hard-coded in a rule, and the palette's declarations are the tokens themselves.
function writeCss() {
  const page = readFileSync(path.join(root, 'index.html'), 'utf8')
  const marker = '/* touch:end */'
  const start = page.indexOf('/* touch:start */'), end = page.indexOf(marker)
  if (start < 0 || end < 0) throw new Error('index.html has no /* touch:start */ ... /* touch:end */ block')
  const block = page.slice(start, end + marker.length)
  const at = block.indexOf(':root{')
  let tokens = '', rules = block
  if (at > -1) {
    let depth = 0, i = block.indexOf('{', at)
    for (; i < block.length; i++) {
      if (block[i] === '{') depth++
      else if (block[i] === '}' && --depth === 0) break
    }
    tokens = `${block.slice(at, i + 1)}\n`
    rules = block.slice(0, at) + block.slice(i + 1)
  }
  writeFileSync(path.join(out, 'touch.css'), rules, 'utf8')
  writeFileSync(path.join(out, 'tokens.css'), tokens, 'utf8')
  console.log(`wrote ${path.join(out, 'touch.css')} and tokens.css beside it`)
}
writeCss()

// Runs in the page. Measures every visible text-bearing element under the HUD, the touch layer
// and the status line, then blanks its ink so the next screenshot is the bare backdrop. Overflow is
// the text's own width against its parent's inner width (positioned elements are placed outside
// their parent on purpose and are exempt), plus anything that leaves the viewport.
function probe(rootSels = ['#hud', '#touch', '#status']) {
  const boxes = []
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  for (const rootSel of rootSels) {
    const rootEl = document.querySelector(rootSel)
    if (!rootEl) continue
    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      if (el instanceof SVGElement || !hasText(el)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      // opacity as well as display and visibility: #throttleValue is opacity:0 unless a finger is on
      // the lever, and it was reporting a box in every cell that is not in the frame.
      if (parseFloat(cs.opacity) === 0) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) continue
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      const parent = el.parentElement
      const pcs = parent ? getComputedStyle(parent) : null
      const pbox = parent ? parent.getBoundingClientRect() : rect
      const inner = pcs ? pbox.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) : rect.width
      const positioned = cs.position === 'absolute' || cs.position === 'fixed'
      boxes.push({
        id: el.id || (typeof el.className === 'string' && el.className) || el.tagName.toLowerCase(),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48),
        x: rect.left, y: rect.top, w: rect.width, h: rect.height,
        textWidth: text.width, boxWidth: inner,
        overflow: !positioned && parent && parent !== rootEl && text.width > inner + 0.5,
        offscreen: text.right > innerWidth + 0.5 || text.left < -0.5 || text.bottom > innerHeight + 0.5 || text.top < -0.5,
        color: cs.color, opacity: parseFloat(cs.opacity), fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily.split(',')[0].trim().replace(/"/g, ''), shadow: cs.textShadow,
      })
      el.setAttribute('data-qa-ink', '1')
    }
  }
  // The keys: content taller or wider than the key is the overflow the user sees.
  const keys = [...document.querySelectorAll('#touch .key, #touch .text')].map((el) => ({
    id: el.id, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    overflow: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
  }))
  // The ink goes; the HUD's text-shadow stays, because Chrome still paints a shadow under
  // transparent glyphs and that halo is what the reader sees the ink against. A cap legend's
  // shadow is its glow, the lamp rather than the backdrop, so there the shadow goes too and the
  // legend is judged against the cap's film.
  for (const el of document.querySelectorAll('[data-qa-ink]')) {
    el.style.setProperty('color', 'transparent', 'important')
    el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
    if (el.closest('.key')) el.style.setProperty('text-shadow', 'none', 'important')
  }
  return { boxes, keys, viewport: { w: innerWidth, h: innerHeight, scrollWidth: document.documentElement.scrollWidth } }
}

function restore() {
  for (const el of document.querySelectorAll('[data-qa-ink]')) {
    el.style.removeProperty('color')
    el.style.removeProperty('-webkit-text-fill-color')
    el.style.removeProperty('text-shadow')
    el.removeAttribute('data-qa-ink')
  }
  return true
}

const cells = []
for (const [width, height] of widths) {
  const chrome = await launch({ width, height, gpu: true })
  try {
    const page = await chrome.page({ width, height })
    await page.goto(url)
    await page.settle({ extra: 300 })
    // The bundle assigns window.range last, once the library is decoded and the world is built.
    const deadline = Date.now() + 90000
    while (Date.now() < deadline && !(await page.eval('!!(window.range && window.range.touchDemo)'))) await sleep(250)
    if (!(await page.eval('!!(window.range && window.range.touchDemo)'))) throw new Error(`${width}x${height}: window.range.touchDemo never appeared`)
    for (const stage of stages) {
      for (const state of states) {
        const name = `${width}x${height}-${stage}-${state}`
        const expr = stageExpr.replace('STAGE', JSON.stringify(stage)).replace('STATE', JSON.stringify(state))
        if (expr !== 'none') await page.eval(expr)
        await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
        await sleep(150)
        const frame = await page.screenshot()
        const measured = await page.eval(`(${probe.toString()})(${JSON.stringify(roots)})`)
        const backdrop = await page.screenshot()
        await page.eval(`(${restore.toString()})()`)
        writeFileSync(path.join(out, `${name}.png`), frame)
        writeFileSync(path.join(out, `${name}-backdrop.png`), backdrop)
        const cell = { name, width, height, stage, state, ...measured }
        writeFileSync(path.join(out, `${name}.json`), JSON.stringify(cell, null, 1))
        const overflow = [...cell.boxes.filter((b) => b.overflow || b.offscreen).map((b) => b.id), ...cell.keys.filter((k) => k.overflow).map((k) => k.id)]
        console.log(`${name}: ${cell.boxes.length} text boxes${overflow.length ? `  OVERFLOW ${overflow.join(' ')}` : ''}`)
        cells.push({ name, boxes: cell.boxes.length, overflow })
      }
    }
    const bad = page.logs.filter((l) => l.startsWith('EXC') || l.startsWith('error'))
    if (bad.length) console.log(`console ${width}x${height}:\n` + bad.slice(0, 8).join('\n'))
  } finally {
    await chrome.close()
  }
}
writeFileSync(path.join(out, 'index.json'), JSON.stringify({ url, cells }, null, 1))
console.log(`${cells.length} cells in ${out}`)

if (!has('--no-contrast')) {
  // No --large-px: section 8 says there is no such argument and no exemption to argue for, so raising
  // the large-text threshold has to be an edit to contrast.py's default and a line in the spec rather
  // than a flag in a command nobody reads back out of the log.
  const args = [path.join(root, 'tools/contrast.py'), out, '--check']
  const r = spawnSync('python', args, { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
