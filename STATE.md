# STATE

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
