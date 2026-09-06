# RANGE

A self-contained three.js flight demo: one Eurofighter Typhoon, a wet North Sea airbase at dusk,
a short sortie (take off, fly the coastal box, gun and bomb the range, land). Every mesh is
authored in Blender, textures are generated or baked, and the deliverable is one HTML file with
no external assets. Started 5 September 2026 in the Codex app, moved here on 6 September 2026.
The specs live in `docs/specs/`; the current one is `2026-09-06-range-v2.md`.

## Layout

- `index.html` loads `src/main.js` (dev). `dist/index.html` is the bundled single file; `RANGE.zip`
  wraps it with the three.js licence.
- `physics.js`: rigid-body flight model with a rate-command fly-by-wire loop and three wheel
  contacts. `control.js`: the mouse-aim instructor. `src/`: renderer modules (loader, world,
  aircraft, effects, camera, input, hud, audio, post, main).
- `assets/meshes.json` (manifest) + `assets/meshes.bin` (binary library) are exported from
  `assets/RANGE.blend` by `tools/export_meshes.py`; `tools/model_range.py` authors every mesh.
  `tools/bake_jet.py` bakes the aircraft atlases (`textures/jet_*`).
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

- Tests: `node tools/test_flight.mjs` (physics and instructor acceptance tests; every line prints
  `PASS`). This is the project's check command.
- Bundle: `python tools/build.py` (prints the byte count, asserts no external references, writes
  `dist/index.html` and `RANGE.zip`).
- Dev page: serve the folder over HTTP (`python -m http.server 8080` here) and open
  `http://localhost:8080/`; `file://` only works for `dist/index.html` because the dev page fetches
  the library.
- Screenshots: `node E:\claude-projects\design\tools\qa\shot.mjs --url E:\claude-projects\range\dist\index.html --out screenshots\ramp.png --width 1920 --height 1080 --wait 2500 --eval "window.range.stage('ramp')"`
  (run from PowerShell; stages: ramp, takeoff, cloud, bomb, landing). Headless frame rate is
  meaningless (software or throttled); measure fps in Brave through Claude-in-Chrome with
  `window.range.metrics()` and `window.range.stress(true)`.
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
- The Claude-in-Chrome automation tab blocks `file://` and force-darkens pages; use the headless
  tool for images and the Brave tab only for frame timings.
- `frame-timings.json` at 6.94 ms every stage is the 144 Hz vsync interval, not GPU load. The
  headroom number is the stressed one (pixel ratio 2).
