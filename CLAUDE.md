# RANGE

A self-contained three.js flight demo: one Eurofighter Typhoon over Jersey at a wet dusk (Jersey
Airport, OpenStreetMap roads, buildings, harbour, sea walls and landmarks), a short sortie (take
off, fly the coast, gun, Paveways and IR missiles, land). Since 12 September 2026 a Westland Wyvern
S.4 (sixteen RP-3 rockets, a torpedo) is the alternative aircraft, and the practice traffic is a
MiG-15, a Tu-95 and a Mi-24 on scripted loops (`src/traffic.js`), all of which respawn. Every mesh
is authored in Blender, textures are generated or baked, and the deliverable is one HTML file with
no external assets. Started
5 September 2026 in the Codex app, moved here on 6 September 2026. Public at
https://ccwbee.github.io/range/ (Pages deploys on every push to master); the phone version is
`mobile.html` beside it. The specs live in `docs/specs/`: `2026-09-06-range-v2.md` is the base,
`2026-09-10-range-mobile.md` the tilt-to-fly touch version; `docs/DESIGN.md` holds the design
thesis, tokens and the primitive registry.

## Layout

- `index.html` loads `src/main.js` (dev). `dist/index.html` and `dist/mobile.html` are the bundled
  single files and `RANGE.zip` wraps the first with the three.js licence; all three are build
  outputs, gitignored, and GitHub Actions (`.github/workflows/pages.yml`) builds and publishes
  them on every push to `master`.
- `physics.js`: rigid-body flight model with a rate-command fly-by-wire loop and three wheel
  contacts. `control.js`: the mouse-aim instructor. `src/`: renderer modules (loader, world,
  aircraft, effects, engagement, camera, input, touch, hud, audio, post, main) and the Jersey data
  modules (jersey, roads, landcover, landmarks), which the bundler transforms per tier.
- `assets/RANGE.blend` (Git LFS) is exported by `tools/export_meshes.py` to `assets/meshes.json`
  plus `meshes.bin` (version 2, untracked), which `tools/pack_library.py` packs into
  `assets/library.json` plus `library.bin` (version 3, tracked, the one format the loader reads).
  `tools/model_range.py` and the `model_*.py` and `build_*.py` scripts author the meshes. The
  abandoned atlas bake lives in `_archive/abandoned-bake/`.
- `textures/`: generated tiles and sprites (`concepts/prompts.json` records the prompts),
  `tools/textures_fallback.py` writes procedural stand-ins for any that are missing.
- `concepts/`: the five concept frames the demo is matched against. `screenshots/`: the matching
  staged renders and `frame-timings.json`.
- `vendor/three.module.js`: three.js r160, the only runtime dependency, bundled by `tools/build.py`.

## Conventions

World +Y up, runway along −Z, heading 000 is −Z, coast at +X. Body +X right wing, +Y up, −Z nose;
meshes are authored in Blender directly in that frame. Aero signs (p, q, r, α, β, φ) and their
mapping to the body angular velocity are in the spec, section 0. British English, no em dashes,
no pill labels, no decorative dots, no emoji icons.

## Run

- Tests: `node tools/test_flight.mjs` (physics, instructor, engagement, touch, library and fleet
  acceptance tests, chained; every line prints `PASS`). This is the project's check command.
- Browser harnesses against the built desktop bundle, each asserting zero console errors:
  `node tools/qa_fleet.mjs` (Wyvern renders, rocket and torpedo release, the coastal views, into
  `_archive/expansion-qa/`), `node tools/qa_hud_feedback.mjs` (metric readouts, the kill
  confirmation at four widths, the chime's waveform, munition-view marker tracking) and
  `node tools/qa_east_coast.mjs` (Gorey and St Catherine views).
- Bundle: `python tools/build.py` (writes `dist/index.html` and `RANGE.zip`, then the lighter
  `dist/mobile.html`; `--tier desktop|mobile` writes one; prints the byte counts, asserts the size
  budgets and no external references; packs the library first when the Blender export is newer).
- Library: `python tools/pack_library.py` packs the Blender export into `assets/library.json` and
  `library.bin`; the exporter calls it itself at the end of `tools/export_meshes.py`.
- Touch layer on a desktop: open either bundle with `?touch=1` (drag aims; no sensors), inject a
  tilt with `window.range.touch.simulate(beta, gamma)`, or stage the overlay with
  `window.range.touchDemo('cloud')`. The layout frame: `node E:\claude-projects\design\tools\qa\shot.mjs --url "file:///E:/claude-projects/range/dist/mobile.html?touch=1" --out screenshots\touch-mobile.png --width 932 --height 430 --wait 3500 --eval "window.range.touchDemo('cloud')"`.
- Dev page: serve the folder over HTTP (`python -m http.server 8080` here) and open
  `http://localhost:8080/`; `file://` only works for `dist/index.html` because the dev page fetches
  the library.
- Screenshots: `node E:\claude-projects\design\tools\qa\shot.mjs --url E:\claude-projects\range\dist\index.html --out screenshots\ramp.png --width 1920 --height 1080 --wait 2500 --eval "window.range.stage('ramp')"`
  (run from PowerShell; stages: ramp, takeoff, cloud, bomb, landing). Headless frame rate is
  meaningless (software or throttled); measure fps in Brave through Claude-in-Chrome with
  `window.range.metrics()` and `window.range.stress(true)`.
- Touch-layer QA: `node tools/qa_touch.mjs --out screenshots\qa` runs the 27-cell matrix against
  `dist/mobile.html?touch=1`, writes the touch CSS out beside the cells as `touch.css` (the token
  block goes to `tokens.css`, which the scanner is told to ignore) and finishes with
  `python tools/contrast.py screenshots\qa --check`. The mechanical scan is
  `node E:\claude-projects\design\tools\qa\scan.mjs screenshots\qa\touch.css --tokens tools\qa\range-tokens.json --allow tools\qa\range-allow.txt --check`.
  The safe-area pass shims the four inset custom properties through the stage expression rather
  than a flag, into a folder under `screenshots\qa` so the two mirrored passes do not overwrite each
  other and `contrast.py`, whose glob is not recursive, still reads each on its own:
  `node tools/qa_touch.mjs --out screenshots\qa\inset-left --widths 667x375,844x390 --states resting --stage-expr "document.documentElement.style.setProperty('--sal','47px');document.documentElement.style.setProperty('--sab','21px');window.range.touchDemo(STAGE, STATE)"`,
  and again into `screenshots\qa\inset-right` with `--sar` for the mirrored notch. `touchDemo`'s
  states are resting, locked, reloading, firing, warming and searching; the last three are the only
  frames that photograph a lit legend.
- The intro pass, which stages nothing because the intro is what the page shows before `start()`,
  and photographs the skin switch in both positions in the same run:
  `node tools/qa_touch.mjs --out screenshots\qa\intro --intro --states grey,heritage --stage-expr "window.range.setSkin(STATE)"`,
  and the Wyvern intro (the skin switch absent) into its own folder:
  `node tools/qa_touch.mjs --out screenshots\qa\intro-wyvern --intro --states wyvern --stage-expr "window.range.setAircraft(STATE)"`.
  `--intro` probes `#intro` and `#loading` instead of the HUD; `--probe-roots` sets that by hand.
  Two more states worth staging by hand, neither of them in the 27-cell product, both of which have
  failed the contrast gate before: the stop screens,
  `--stage-expr "window.range.touchDemo(STAGE, STATE);window.range.hud.setStatus('PAUSED<small>Tap to continue.</small>')"`,
  and the stall notice at the dim step of its own flash,
  `--stage-expr "window.range.touchDemo(STAGE, STATE);window.range.flight.stall=true;setTimeout(()=>{const h=document.getElementById('hint');h.style.animation='none';h.style.opacity='.72';},120)"`.
- Icon: `python tools/icon_planform.py --icon --render --sheet` regenerates `assets/icon/` (the
  favicon SVG, the 180 px home-screen PNG, the 32 px PNG) and `screenshots/icon-sheet.png`; the
  planform is traced from the packed library. `build.py` inlines `favicon.svg` as a data: URL and
  copies `apple-touch-icon.png` beside the bundles, the one relative reference `DependencyCheck`
  allows, because iOS will not take a home-screen icon from a data: URL.
- Blender: `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" --python tools\start_blender.py`
  starts Blender with the MCP add-on on 127.0.0.1:9876; `python tools\blender_call.py <script.py>`
  runs a script inside it (no argument: prints the scene). Bakes run in a background process:
  `blender.exe -b assets\RANGE.blend -P tools\bake_jet.py`, never through the socket.
- Textures: `bash tools/gen_textures.sh` regenerates the v2 tiles and sprites through Codex
  image generation, one at a time, and post-processes them; `python tools/textures_fallback.py`
  writes stand-ins for anything missing.

## Gotchas

- The Blender session started on 5 September still holds two log files open in the old Codex
  workspace folder (`C:\Users\Charles\Documents\Codex\2026-09-05\paste-this-it-is-anshu-s\tools`).
  Harmless; they go when that Blender closes.
- A Cycles bake through the MCP socket blocks Blender's UI thread and the socket times out with
  no error. Model and screenshot through MCP, bake in `blender.exe -b`.
- The exporter must read UVs per loop, not per vertex, or the baked atlas maps to nonsense.
- The Claude-in-Chrome automation tab blocks `file://` (serve over HTTP instead) and force-darkens
  pages, so use the headless tool for images. It also freezes `requestAnimationFrame`, so
  `metrics()` returns `fps: null` there and no rAF-based timing is trustworthy: measure with
  `window.range.benchmark()`, which renders synchronously, and `stress(true)` before it for the
  headroom number.
- `frame-timings.json` at 6.94 ms every stage is the 144 Hz vsync interval, not GPU load. The
  headroom number is the stressed one (pixel ratio 2). `benchmark()` calls `gl.finish()` after
  each frame: without it a synchronous timing is the CPU's submission rate, not the GPU's frame
  time. Measured 10 September 2026 on the RTX 5070 Ti: 1.5 to 1.9 ms a frame at 2559 × 925, 1.8
  to 2.4 ms at pixel ratio 2.
- Phone sensors need a secure context: `deviceorientation` never fires over plain http, so the
  touch layer is tested on the Pages URL (or `cloudflared tunnel --url http://127.0.0.1:8099` for
  a local build), never over the LAN http server. iOS also needs
  `DeviceOrientationEvent.requestPermission()` inside the ENTER tap; `src/touch.js` does that.
- A control that paints but ignores touches: the page has two elements with the same id, and
  `getElementById` returns the first, so the listeners land on a hidden element with no error
  (the quadrant and the HUD's throttle readout both had `id="throttle"`). The unique-id check in
  `tools/test_touch.mjs` catches it; a headless run with synthetic `PointerEvent`s on the built
  bundle is how it was found.
- Every staged ramp screenshot showed a parked aircraft at full reheat, the lever hard against the
  top stop and the gate reading IDLE, beside IAS 0 KT. The cause is that `Touch.update()` writes the
  layer's own throttle back into `flight` on every frame, so the frame `stage()` paints restores the
  previous cell's lever before anything reads the pose. `stage()` therefore syncs the lever from the
  flight model immediately before its own `frame()` call, and `touchDemo()` enters the layer before
  staging so that sync covers the first cell too. The check: in a ramp cell the gate reads BRAKE,
  `#throttleValue` is 0 and `#throttleFill`'s height is 0%.
- HUD text that is plainly legible on the frame fails `tools/contrast.py` by the dozen after the
  canopy bands were removed. The cause is what the sampler measured: the brightest pixels anywhere
  in the element's box, which is mostly bare sky between the letters that a text halo never
  reaches. It now samples only under the strokes (where the frame and the ink-blanked frame differ)
  and keeps the HUD's text-shadow when blanking, while a cap legend's glow is stripped, since that
  is its lamp rather than its backdrop. The check: `screenshots/qa/contrast.md` lists a halo'd HUD
  box at well over 4.5:1 while the same box measured under 3:1 before the change.
- A pure roll of the phone must read as no pitch. Measuring pitch against the screen-up component
  alone shrinks it as the phone rolls; `tiltFromUp` measures it against the whole in-plane
  magnitude, and the test "right edge down is positive roll and no pitch" catches a regression.
- Paused, every instrument went grey while `contrast.py` reported the whole screen green. The cause
  is paint order: the stop veil was a `::before` on `#status`, which paints after `#hud` and `#touch`
  in tree order, so it covered the render and all of the text bar the status line itself, and the
  tool reads a box's ink off `getComputedStyle` rather than off the frame. The veil is now
  `#hud`'s own `background-color` under `body.touch:has(#status:not(:empty))`, which paints under its
  element's own text and under everything `#touch` draws. The check is a staged paused cell whose ink
  is read off the PNG, not off the style: `screenshots\qa\paused`, and the brand's rendered
  luminance there must match the running frame's (0.85, against 0.134 before).
- A rule written as `#touchWeapons .key` beats `.key.lit`, `.key.pressed` and `.key.locked` on
  specificity, so moving the cap material into an id-scoped rule silently kills every state the caps
  have. The material lives on `.key` itself, which is why the ENTER cap shares that selector rather
  than repeating the declarations.
- The desktop intro's skin switch painted but ignored clicks for a day, with no error. The cause:
  its bindings sat inside `if (touch) {}` in `src/main.js`, and `touch` is null on a desktop, while
  the hidden `<select>` kept working so nothing failed loudly. Intro controls bind outside that
  block (`bindSwitch`, one binding for every switch). The check: load `dist/index.html` headless
  with no touch layer, call `.click()` on a legend and read `range.aircraft.type` or the switch's
  `on` class.
- A new instructor test that leaves the aircraft on the runway at 85 m/s with crash `terrain` and
  no lift-off has almost certainly passed `{direction}` without `active: true`: the ground law only
  rotates for a live aim. The check is the `aimAt` helper at `tools/test_flight.mjs` line 228.
