# STATE

## Where it stands

6 September 2026. Baseline `9daab90` is the demo as the Codex session left it: flying, 144 fps at
1080p, five staged screenshots, single-file bundle. The v2 spec (`docs/specs/2026-09-06-range-v2.md`)
is written: rigid-body flight model with FCS and wheel contacts, mouse-aim instructor, textured
aircraft with separate moving parts, grounded scene with clutter and lights, modular renderer.

## Open threads

- Stream P is done and committed (`ae20d2f`): rigid-body model, fly-by-wire, wheel contacts,
  mouse-aim instructor, 20 assertions passing. Interface and measured numbers in
  `docs/notes/stream-p.md`.
- Stream B (Blender: run the rewritten model script, unwrap, bake the jet atlases, write the v2
  exporter) is running as a background agent. The scenery library of spec 4.3 is NOT in it and
  needs a second pass after it lands.
- Stream R (renderer) is running as a background agent in parallel, coding to the spec 4.1 and 4.2
  contract with a loader that also reads the old v1 library.
- The old Codex workspace folder is now a mirror, refreshed with `python tools/sync_codex.py`, with
  `CODEX-NOTE.md` there explaining the move and what changed. Re-run the sync after each milestone.

## Next action

When B and R land: run the scenery pass (spec 4.3), then build-review-fix over the integrated tree
with `node tools/test_flight.mjs && python tools/build.py` as the check, then the visual gate
against the five concept frames, then measure fps in Brave with `window.range.metrics()` and
`window.range.stress(true)`. Resume handles:

- streams P + B first attempt: runId `wf_40b62b60-2ef` (all eight agents died on the Fable monthly
  spend limit; the session model is now Opus 5 and subagents run on opus). Do not resume it, the
  work has moved on; the scripts are in `tools/workflows/` for reference.
