# STATE history

The dated notes STATE.md carried from 6 to 10 September 2026, moved here verbatim on 10 September when STATE.md went back to its four headings.

# STATE

## 10 September 2026: the mobile tilt-to-fly version

Where it stands: built, tested and bundled (spec `docs/specs/2026-09-10-range-mobile.md`, design
`docs/DESIGN.md`). `src/touch.js` plus hooks in input, main, hud, world and post; the tilt is the
aim (azimuth relative to the path, elevation absolute above the horizon), a throttle slider, GUN,
PAVEWAY and one SEEKER button that reads FIRE on lock; gear, brakes and the laser are automatic.
`tools/test_touch.mjs` is chained from `test_flight.mjs` (48 PASS lines across the three suites).
`python tools/build.py` writes `dist/index.html` (37.2 MB, height grid now int16) and
`dist/mobile.html` (12.5 MB: 25 of 87 settlement chunks, thinned roads and land cover, smaller
textures, no heritage skin); the desktop page sends phones to the mobile one. The mobile tier draws
941k triangles at the cloud pose (from 2.7 M) with a stride-2 terrain, fewer trees and less
clutter. Headless frames: `screenshots/touch.png` (desktop bundle, `?touch=1`) and
`screenshots/touch-mobile.png` (the mobile bundle). Pages deploys on push, so
https://ccwbee.github.io/range/mobile.html carries it once the workflow has run.

Open threads: the one check only a phone can make. Open the Pages URL on the phone, grant motion,
hold it sideways: right edge down turns right, a pull climbs, the top of the slider lights reheat,
PAVEWAY drops with the laser message, SEEKER turns to FIRE on the MiG and launches. The feel lives
in the constants at the top of `src/touch.js` (deadzones, tilt limits, azimuth and elevation
ranges, smoothing). Frame rate on a phone is unmeasured, and desktop fps is still unmeasured in
Brave.

Next action: the phone check above, then adjust the tilt constants to taste. Correction to the
notes below: git shows those changes committed (`1078f46`, `fab715a`), pushed, and live at
https://ccwbee.github.io/range/ (the repository is public and Pages deploys on every push).

## 9 September 2026 skin and publishing update

The RAF FBX is integrated with its supplied 2048px grey atlas and bump map. The heritage
skin is selectable and now includes the upper fuselage and canards. Its generated source is
1254px; the generator did not deliver a genuine upscale. Both variants share the original UVs.
The updated heritage skin was inspected on the model in a Blender render.

GitHub Pages creation returned HTTP 422: the current plan does not support Pages for this
private repository. The prepared workflow deploys only when repository variable PAGES_ENABLED
is true. Visibility remains private pending the user's decision. The earlier status notes below
are retained as history; browser visual, listening and hardware FPS checks remain outstanding.

## 9 September 2026 update

Canonical project: `E:\claude-projects\range`, based on `8299af9`. The existing remote is
`https://github.com/CCWBee/range.git`. This refinement remains uncommitted and unpushed.

Jersey elevation and 795 OpenStreetMap main-road sections are bundled offline. The airport centre
and runway bearing follow the NATS EGJJ chart; the longer runway and military buildings remain
adapted for gameplay. Blender now contains the terrain and 354 disjoint pavement cells. The
previous scene is preserved under `_archive/RANGE-before-jersey-20260909-085410.blend`.

Controls now use I for help, U for the instructor and held Z for smooth zoom. World markers and
the steering circle project after the camera update on every frame. Direct pitch takes priority;
roll tuning is unchanged. Missiles use a moving-target proximity check, and destroyed aircraft
retain momentum with continued fire and smoke. Gun audio uses one loop per sustained burst.

Both `node tools/test_flight.mjs` and `node tools/test_engagement.mjs` passed with exit code 0.
`python tools/build.py` passed with exit code 0: 13,817,117 bytes, `networkAssets: 0`.
The ramp and help panel rendered before the final airport/roads export. Browser access then
became unavailable. Final in-flight visual checks, flicker verification, audio listening and
hardware FPS measurement remain open. No trustworthy FPS claim applies to this build.
The replacement aircraft reference has not been supplied, so the current jet remains in use.

The subsequent settlement pass adds 10,184 building footprints and 43 piers, breakwaters and
groynes from OpenStreetMap. Heights are estimated where absent, so these are simplified buildings,
not photogrammetry. Blender merges them into 88 spatial chunks; the library has 142 assets.
The harbour geometry was inspected in a Blender render. The browser result and frame rate remain
unverified. The offline bundle is approximately 30.4 MB after this addition. Source footprints and
licence attribution are in `assets/settlement.json`; conversion scripts are `tools/build_settlement.py`
and `tools/model_settlement.py`. These additions also remain uncommitted and unpushed.

The coastline smoothing pass doubles the terrain grid to 513 by 513 samples at 39.0625 m
spacing. Bilinear source sampling and one light separable smoothing pass reduce stepped coast
edges and slopes. Rendering and collision use the same elevation data; Blender terrain has
smooth normals, and settlement geometry was rebuilt against the updated ground. The harbour
geometry was checked in `_archive/jersey-harbour-smoothed.png` in the original Codex folder.
`node tools/test_flight.mjs` passed all flight and engagement checks with exit code 0.
`python tools/build.py` passed with exit code 0: 32,763,940 bytes, `networkAssets: 0`.
Browser control remains unavailable, so final in-game appearance and hardware FPS remain
unverified. These changes remain uncommitted and unpushed.

The notes below describe the earlier build and are retained as history.

## Where it stands

6 September 2026. Baseline `9daab90` is the demo as the Codex session left it: flying, 144 fps at
1080p, five staged screenshots, single-file bundle. The v2 spec (`docs/specs/2026-09-06-range-v2.md`)
is written: rigid-body flight model with FCS and wheel contacts, mouse-aim instructor, textured
aircraft with separate moving parts, grounded scene with clutter and lights, modular renderer.

## Open threads

- All three streams are in and committed. Physics and instructor: 29 assertions pass
  (`node tools/test_flight.mjs`). Blender assets: 50 assets, version 2 binary library, terrain
  matches the physics to 1e-6. Renderer: 10 src modules, single-file bundle 12.8 MB, no network
  assets. Notes in `docs/notes/stream-p.md`, `stream-b.md`, `stream-r.md`.
- Five staged frames render clean (no pause overlay, gear correct per stage) and read against the
  concepts: skinned Typhoon with roundels and nav lights, lit airfield, reheat plumes, wheel spray,
  a cloud deck at the break, range pads with a falling bomb, a lit threshold on landing.
- Triangles 260k to 411k per stage, far under budget. Real fps NOT measured this build: headless is
  software-rendered, and the Brave extension was disconnected. This is the one outstanding check.

## Next action

Measure fps in Brave: reconnect the Claude-in-Chrome extension (restart Chrome if needed), open
`http://127.0.0.1:8099/dist/index.html` (serve with `python -m http.server 8099` in the project),
and run `window.range.stage('cloud'); window.range.benchmark(240)` then
`window.range.stress(true); window.range.benchmark(240)` for the headroom number. Optionally a
build-review-fix pass over the integrated tree; and place the remaining spec 4.3 scenery counts
(PAPI, approach bars) if a closer look wants them. The old Codex folder mirror is refreshed with
`python tools/sync_codex.py`.

## Gotchas
