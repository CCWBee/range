# STATE

## Where it stands

11 September 2026. A polish pass continuing the previous session's uncommitted work (it hit a usage
wall mid-pass). This session carried the spine through to completion and verified it with renders.
Not yet committed at the time of writing; lands as one commit, then a push (authorised by Charles).
Live site is still `85a1c7b`.

Safety: the whole working tree is snapshotted at git tag `range-wip-safety` (refreshed through the
session) and the untracked files are copied to the session scratchpad `wip-untracked-backup/`. Never
`git reset --hard` / `git clean` without checking that tag.

## Done this session (verified by render + tests)

1. **Airport chrome-mirror — FIXED.** Root cause: the terrain shader discards fragments under the
   AIRPORT polygon, but the Blender-baked `pavement` asset's triangulation
   (`shapely.triangulate` + `covers()` in prepare_airport.py) left the 08 threshold with zero
   triangles, so the discarded terrain showed the reflected sky/ocean through the gap. Fix in
   `src/world.js` `buildAirportSurface()`: the pavement is now built in-engine from
   `AIRPORT.pavement` (the same polygons the discard uses, faces reversed to face up) and the six
   range pads as boxes; the gappy library `pavement` asset is no longer loaded. Verified ground +
   air: proper wet runway, no mirror.
2. **Black square at intro on the mobile tier — FIXED.** It was the aircraft contact shadow: with
   no MSAA on the mobile half-float post target the normal-blended shadow quad renders as a hard
   black square instead of a soft falloff (starkest under headless software GL / SwiftShader, and a
   risk on GPUs without half-float blend). **Observed, not explained:** every shader-level fix tried
   on the shadow failed (texture map, premultiplied alpha, polygon offset, multiply-blended texture);
   the only variable that resolved it was the sample count, so the exact mechanism is not isolated.
   Fix in `src/main.js`: the mobile post target now carries `samples: 2` (was 0), which also resolves
   the aliased alpha clutter the phone tier was drawing jagged. The shadow itself is back to its
   original clean form. **Perf note for Charles:** 2x MSAA is a modest mobile cost, cheap on the
   tile-based GPUs the touch build targets; confirm phone fps on-device, and if any device struggles
   it can drop back to 0 (the square is a software-GL artefact there anyway).
3. **Desktop UI parity with the mobile Liquid Glass system — DONE (core).** The shared tokens were
   already global; the divergence was in the desktop element rules (flat old generation). Now
   consolidated onto the shared system without disturbing the tuned `body.touch` rules:
   - Intro: glass ENTER cap (the shared `.key` material, with a mouse hover lift), ink text, the
     glass skin **switch** replacing the native `<select>` (the switch styles were un-gated from
     `body.touch` so both tiers share them), and new copy (below).
   - HUD: ink colour + `--halo` shadow + the token state ramp (advisory / lock); desktop keeps its
     fuller layout and the secondary readouts the phone hides.
   - `#help` is now a glass panel; `#buttons` are ink legends with hover; `#status` uses the shared
     stop veil (screen dims on pause, text stays lit).
   Verified at 1920, 1366 and the mobile 932/844 widths; mobile cockpit + intro unregressed.
4. **Intro copy rewritten** (Charles's request): "One Typhoon over Jersey. Fly the coast, see the
   island, flatten the range." (short: "One Typhoon over Jersey. Fly, look, flatten the range.")
   Replaces the "Clearing skies / Bring it home" copy.
5. **Verified the previous session's four other in-progress systems in-game:** water low-pass wake
   (restrained aft disturbance over sea, correct), missile-launch FX (compact glow + exhaust, not an
   explosion), gear compression (passes tests, sits correctly on the ground), settlement coverage
   (rural field patchwork + buildings render).

`node tools/test_flight.mjs` green (56 PASS); `python tools/build.py` green (desktop 28.7 MB, mobile
9.24 MB, 0 network assets). Mobile touch contrast matrix (`tools/qa_touch.mjs`) re-run after the
shared-CSS change — see result before committing.

## Backlog (audit-and-refine; NOT done this pass — mostly Blender-heavy, and Blender was not running)

From the read-only env audit (workflow wf_2a11f0ea-633; full result in the run's journal):
- **Landmarks are already good** (Fort Regent, Mont Orgueil, Elizabeth Castle, La Corbière, St
  Aubin's Fort all recognisable silhouettes). Gaps: **St Catherine's Breakwater absent** (clipped by
  the OSM extract bbox at lon -2.0 in `tools/extract_coastal_airport.py`), **Noirmont absent** (only
  a generic building), **Fort Henry** a weak 6m slab, and **landmark_granite is a flat grey-brown**
  (`tools/model_landmarks.py:16`) where Jersey granite reads pink-orange — a quick-js retint in the
  `src/world.js` material hook is the cheapest recognisability win (taste call, so left for Charles).
- **Generic buildings**: plain boxes, no pitched-roof/granite vocabulary (settlement coverage is
  good). **Cliffs/coast**: check slope-based rock exposure and geographic colour variation. **Sea
  walls** (St Ouen's, St Aubin's) and **harbour refinement**: per the brief.
- **Aircraft gear / pylons / canopy**: the deeper reference-based geometry audit (underside/side,
  clipping, pivots, track width) needs Blender; the compression rework is sound. Canopy: no obvious
  dot-patch seen in renders this pass; re-check on-device.
- **HUD altitude reads 0 FT over open sea** (pre-existing) — minor, worth a look.
- Owner decisions still pending: a code licence file; the Crown-copyright Typhoon question.

Blender launch when needed:
`"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" --python tools\start_blender.py`

## Gotchas (this pass)

- Airport pavement is engine-built now (like roads/terrain/landcover), from `AIRPORT.pavement`.
  `THREE.ShapeUtils.triangulateShape` winds clockwise when x,z map straight to the ground, so faces
  must be reversed or the surface back-face culls into the same sky/ocean hole.
- A normal-blended transparent quad (the contact shadow) renders as a hard fill, not a soft
  falloff, on a non-MSAA half-float post target. Mechanism not isolated: shader-level fixes on the
  quad all failed and only the sample count moved it, so mobile post now carries `samples: 2`.
- The design tokens live at bare `:root` inside the `/* touch:start */`..`/* touch:end */` region,
  which ships in BOTH bundles; build.py does not strip it. So desktop can use every token; only the
  touch INPUT surfaces (`#touch`, `#quadrant`, `#touchWeapons`, `#rotate`) stay gated on `body.touch`.
- Verify visual work by rendering the built bundle via `design\tools\qa\shot.mjs` (SwiftShader
  software GL — some artefacts, e.g. the contact-shadow square, are worse there than on real HW).
  Full `file://` URLs keep a query string; the path form escapes the `?`.

## Resume

Read this file first. If not yet committed: run `node tools/test_flight.mjs` and
`python tools/build.py`, confirm the touch contrast matrix is clean, then `git add -A` and one
commit covering the whole pass, then push. Next substantive work is the Blender-heavy environment
backlog above (start with the granite retint quick-win and St Catherine's Breakwater).
