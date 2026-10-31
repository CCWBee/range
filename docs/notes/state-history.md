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

---

Moved here verbatim from `STATE.md` on 31 October 2026, when STATE.md went back to its four headings. The first block is the old "Where it stands" text (22 September 2026 and earlier); the sections after it are the Done, Earlier passes and Backlog sections as they stood.

### Old "Where it stands" (22 September 2026)

22 September 2026. RANGE is live at https://range.charlesbee.org through the `range-charlesbee`
proxy Worker (`deploy/worker/`, `MAINTENANCE.md`) and listed on the charlesbee.org hub. A pass on UI
consistency, the random black screens, performance, a loading screen and the audit's polish list is
committed and pushed to `master` (everything from `2412d91` to the commit carrying this file; detail
under "Done (22 September pass)"). An earlier hosting note here called nine modified files
unrecorded and not live: they were Codex's 17 September work, verified and committed as `2412d91`.

Verification: `node tools/test_flight.mjs` all pass; before the rule change, headless `qa_ui`,
`qa_black_frames` (desktop), `qa_pause_menu`, `qa_fleet` and all three contrast gates (27 cells, 480
boxes; intro 48; Wyvern intro 18; 0 failures) passed; since then verification is in Brave
(OPERATING_RULES, 22 September 2026), where `tools/check_polish.js` passes on both bundles with no
console errors. Not run to completion: `qa_hud_feedback` and the phone `qa_black_frames` (their last
headless runs failed to start Chrome under a saturated CPU); run them if Charles asks for the
headless harnesses.

Done 23 September, pushed with this file: (1) the favicon (`5b71e15`): the traced planform, flat
backlit orange `#FF9A1F` on flat HUD green `#2A9A14`, on the 32 unit, radius 6 construction of
Charles's other site favicons; the tool now rasterises with Pillow, no headless Chrome. (2) The sea's
lattice ("water tiling", brief `docs/specs/2026-09-23-water-tiling.md`): the two axis-aligned sines
are replaced by a directional spectrum of plane waves (10 desktop, 6 phone) with per-wave
anisotropic footprint fades, per-wave patch envelopes and crest bending from integer-hash gradient
noise, gradient-noise foam, and cat's-paw roughness on the desktop. Chosen by a design panel (run
`wf_ad44ed3c-8b4`: three Opus proposals, a gpt-5.6-sol one, two judges; the look judge's synthesis,
built on the directional spectrum). Verified in Brave at the fixed poses of `tools/check_water.js`
on both tiers, before and after in `_archive/water-qa/`: no lattice at 80, 350 or 1,000 m or on the
coastal pass, the glitter track intact and breaking into sparkle, both programs linked with empty
logs and no console errors. Then, at Charles's word that the phone "needs to run", the phone path
went lean: four randomly oriented waves, value-noise envelopes, no crest bending, no foam. Timed in
Brave as a full-screen 1080p sea pass on the RTX (median of 11 interleaved rounds): old sines 0.038
ms, the first spectrum 0.073 ms, lean 0.050 ms; four fixed waves with no patch field cost 0.038 ms but
brought back long regular bands (`_archive/water-qa/rejected-bare-*`), so the patch field stays.

Next action: an on-device phone check of the live build (`range.bootTimes` in the console: a
`compileWait` above 0 and a small `firstFrame` mean the parallel-compile path ran, which nothing
here could exercise), then the older "Deferred" list under the 17 September pass.

17 September 2026. A performance, correctness, water and visual polish pass landed on top of
`0f09752`, seven commits, all verified and pushed (see "Done (polish pass)"). It was guided by a
read-only audit fan-out (run `wf_f0887a38-50f`; the simplify dimension failed on an Opus content
filter false positive, so simplification was done by hand). Overview and per-feature renders are in
`_archive/polish-qa/` (gitignored).

## Done (22 September pass)

Charles asked for UI consistency across both tiers in the Liquid Glass plus cockpit
"military-spec" language (anchored on the phone throttle quadrant and weapon caps), switches that
toggle on a tap, performance, a fix for random black screens, an orange windsock, and then a
loading screen because the page sat frozen while it loaded.

1. **Codex's 17 September work (`2412d91`)**, verified and committed: the Wyvern at 100 % with no
   reheat, a bounded bomb predictor hidden on the Wyvern, the water depth channel, hedge lines, the
   meadow and farmland split, island-wide clutter, town lights sampled from real buildings. Codex
   also toned my turquoise shallow-water shelf down to a depth-gated teal; left as found, a taste
   call for Charles.
2. **Black frames (`887429d`).** Root cause: the adaptive resolution resized the canvas after the
   draw, which clears the drawing buffer, so the compositor showed an empty frame whenever the ratio
   stepped. `tick()` resizes first, with hysteresis. WebGL context loss is handled (status line,
   the PMREM environment rebuilt, post targets resized, a RELOAD cap after 5 s). The post chain
   scrubs NaN and Inf, and the sky, terrain and camera have their NaN sources guarded. A start-up
   failure shows a panel with RELOAD instead of a dead ENTER. The FPS readout shows only with
   `?fps=1` or in the map camera. Harness: `tools/qa_black_frames.mjs`.
3. **One cockpit UI on both tiers (`887429d`).** Barlow Condensed on the desktop too; `--ink-2`
   and `--ink-3` colour tokens instead of opacity steps; the stop screens' control is a `.key` cap
   (the pause cap reads CHANGE AIRCRAFT); the failure box is the panel material; the HUD halo on
   both tiers; desktop type sizes stepped up for the condensed face. Switches toggle on a tap and
   still follow a drag past 6 px. The windsock is orange (`tools/model_range.py` and a material
   swap in `world.js`). Harness: `tools/qa_ui.mjs`. Contrast gates: 27 cells (480 boxes), intro
   (48) and Wyvern intro (18), 0 failures.
4. **Hosting (`8b4ff86`, `0aa9b19`, `05c502a`)**, from the charlesbee.org session: the Worker
   forwards `If-None-Match` and `If-Modified-Since`, so a revisit is a 304. It forwarded `Range` too
   until `05c502a`: GitHub cut the range from its gzip stream and a resumed download got compressed
   bytes under a wrong total. MAINTENANCE.md describes it.
5. **Performance.** Exact terrain-query cuts: a bounding box ahead of the pavement tests, numeric
   shore bucket keys with a shared result, and `MAX_GROUND` (the highest ground anywhere) letting
   `clearSight` and `bombStep` skip samples above it. A guided bomb prediction, run ten times a
   second for the whole sortie, is about four times faster (53.7 to 16.9 ms, then 30.9 to 7.3 ms
   in Node) with identical impact points over 300 guided and 300 unguided drops; terrain and ground
   heights are identical to `ac51c8a` at 600,000 points. The water depth bake reuses its shore
   sample (identical bytes, twice as fast). On the phone: a cheaper sky shader (`SKY_LO`), sprite
   noise from three of the fbm's five octaves (`SPRITE_LO`; two taps of unrotated value noise were
   tried first and drew the lattice as visible squares, `_archive/ui-qa/mobile-smoke.png`), half the cloud sprites, fully transparent cloud fragments discarded, one sun
   at 1.5 instead of a shadowed and an unshadowed copy, one blast light, no tree shadow pass. Both
   tiers: idle sprite pools neither draw nor upload, the canvas has no depth or stencil buffer, the
   terrain roughness reuses the wet term instead of a second fbm.
6. **Loading screen.** A load gauge (`#loading`, registered in `docs/DESIGN.md`): the switch slot's
   material with a metal bar and a stage legend. The library and textures now arrive as classic
   data scripts ahead of the module (`tools/build.py`), so the download moves the gauge and decodes
   a slice at a time; the island builds in stages with a frame between them; textures upload and
   every shader compiles (hidden sprite pools included) before ENTER lights, and the first frame is
   drawn behind the full gauge. Measured with `tools/qa_boot.mjs` (headless, SwiftShader, a loaded
   machine): the longest freeze went from 6.9 s to 3.0 s on the desktop and from 8.2 s to 2.9 s on
   the four-times-throttled phone, and nothing blocks after ENTER any more (it was 4.6 s and 3.5 s).
   In a hidden tab the boot runs straight through (compile 0.45 s where the first version took
   63 s). `range.bootTimes` holds each phase for a real-device check.

## Done (22 September, polish from the audit)

From the read-only audit (run `wf_132e2bd8-6ae`, its `audit:polish` agent), in `150cf49`: target
labels that give way instead of piling up, with the distance under the object; directions from the
nose in words and kilometres; the Wyvern's own hints, rotation speed from its stall speed (about
215 km/h) and no designator; reloads shown in place on the weapons line; notices in capitals that fit
the tier (`HOLD U TO FOLLOW`, `HOLD THE CAP TO FOLLOW`); one crash instruction; Tab and Space free
off the flight; air-target names in capitals; no crater on water and wrecks that sink at sea; a
polygon offset on the runway markings; town lights off the walls, faded with distance; the Wyvern's
throttle ticks in tenths; the hint capped beside `#systems`; the intro switches unavailable until
ENTER lights. Not done from that list: a single `RANGE · 6` cluster label at distance (the greedy
give-way covers the overlap), and the under-700 px desktop layout of `#flightstate`.

## Done (polish pass, 17 September 2026)

Seven commits, `2067510` through `f09c0e2`, each verified before the next:

1. **Codex's steering/HUD/pause work (`2067510`), picked up and verified.** Banked and inverted
   mouse steering (`control.js` aims in body axes past ~80 degrees bank, with a rudder assist),
   HUD declutter (objective, INSTRUCTOR ON, LTD state and the heading readout removed), and a
   "Back to aircraft selection" pause button (`returnToMenu()` in `src/main.js`). It was left
   uncommitted; 67 PASS incl. a banked-pull convergence test, `tools/qa_pause_menu.mjs` green.
2. **Performance (`e65d7ee`).** Mobile stutter is heap churn, not draw calls. `Flight.step` reuses
   module scratch for its world force/torque accumulators and other non-retained temporaries (a
   7200-step cruise now allocates 5.25 MB, down from 7.92); `basis()` left alone. `hud.js`
   caches the target-marker terrain-occlusion ray at 10 Hz behind the on-screen test and reuses
   scratch, and the bomb predictor's loop cap drops 2400 to 1200. `effects.js` lifts the
   gun-collision centres out of the per-shot loop and hoists the smoke-drift constant. `world.js`
   precomputes the sun's shadow-snap basis. Numbers identical across 69 PASS. Bench:
   `scratchpad/perf_bench.mjs` (not in repo).
3. **Sea walls with land behind them (`3c3b90f`).** `shore.js` classified the coast side from the
   single nearest segment, which flips at concave corners and harbour mouths and raised land on the
   seaward side; it now averages neighbour segment normals at a shared vertex. The inland ramp is
   capped below the wall coping so terrain no longer climbs over walls. Missed air-to-air missiles
   now detonate at the sea surface. New `tools/test_shore.mjs` (chained): raise never exceeds the
   coping over 15,120 samples; across 1,385 corners the sides classify oppositely 96% with 1%
   seaward wrongly raised.
4. **Water (`15b0913`).** Tier-gated via a compile-time `OCEAN_HI` define (verified in on desktop,
   out on mobile at runtime). Sun specular glint (both tiers, sharper on desktop), desktop cloud
   reflection (skyColour), a baked 512-texel signed coast-distance field for a shallow turquoise
   shelf (both tiers) and a desktop breaker, extra desktop wave octaves, and the whole-sea wake fbm
   short-circuited to the strip behind the aircraft.
5. **Dusk mood and life (`97ddb65`).** A dusk split-tone colour grade (warm shadows/mids, cool
   highlights) replacing the flat cool tint, warmed fog, emissive lit windows (a hashed third,
   distance-faded), and Jersey pink-granite retint of the landmark and cliff granite. Grade is
   contrast-gated: the 27-cell touch matrix (480 boxes) and intro cells (48 boxes) both 0 failures.
6. **Simplification (`f09c0e2`).** Removed the dead `billboard` placement option and the unused
   `this.billboards`; the dead coast-surf/coastX path was dropped from the ocean shader in `15b0913`.

Verification across the pass: `node tools/test_flight.mjs` 69 PASS; both tiers build (desktop
29.6 MB, mobile 11.1 MB, 0 network assets); `tools/qa_fleet.mjs`, `tools/qa_hud_feedback.mjs`,
`tools/qa_pause_menu.mjs` green; both contrast gates 0 failures; renders in `_archive/polish-qa/`.

**Deferred (named, not done):** field/hedge boundary lines and a meadow vs farmland colour split
(shader, both tiers, safe next wins); spreading ground clutter and gorse beyond the airfield disc
(the `y < -1.5` gate bars the lowlands and the radius is 1800 m; needs an island-wide LANDCOVER-keyed
pass); relocating the town-light billboards to settlement centroids for twinkle from altitude;
Noirmont and Fort Henry geometry and the St Ouen wall re-placement onto the coastline (all Blender +
the LFS blend); a proper simplification sweep (the audit agent for it was blocked, so re-run it on a
non-Opus model).

## Earlier passes

12 September 2026. Three passes had landed since `85a1c7b`:

- `5a50c37` (11 Sep): the polish pass: airport chrome-mirror, the mobile black square, desktop UI on
  the mobile Liquid Glass system, the intro copy. Detail under "Done (first pass)".
- `5b320b3` (11 Sep): metric HUD, kill confirmation with a chime, the munition-view tracking fix,
  St Catherine's Breakwater and the Mont Orgueil pivot. Detail under "Done (second pass)".
- The third pass (12 Sep, this commit): Codex's expansion from Charles's own brief to it (a Tu-95, a
  roving Hind, respawning targets, a Wyvern with 16 RP-3 and a torpedo, plainer intro copy, the
  waterline, the breakwater root, St Ouen's beach, sea walls, denser town). Codex's session ended
  mid-verification with its Wyvern test failing and the aircraft picker shipped as a native
  dropdown; both were completed here, plus a desktop switch regression found on the way. Detail
  under "Done (third pass)". The live site is this commit once Pages deploys.

## Done (third pass, Codex from Charles's brief; completed, verified and pushed here)

1. **Practice traffic and respawns.** `src/traffic.js` holds three scripted routes: the MiG-15
   (hp 6), a Tu-95 Bear (hp 18, four nacelles with paired counter-rotating props) and a Mi-24 Hind
   (hp 8, low and slow, rotor and tail rotor animated). Air targets respawn 45 s after destruction
   with `<NAME> BACK ON THE RANGE`; any missile still holding a stale reference is cleared first.
   Ground and naval targets respawn after 60 s (wreck removed, ship back at its mooring). Verified:
   `tools/test_fleet.mjs` (three air targets, respawn restores hp, no re-acquire through a stale
   reference), renders `_archive/expansion-qa/bear.png` and `hind.png`.
2. **The Wyvern S.4 as a second aircraft.** `Aircraft.setType`, an `airframe` branch in
   `physics.js` (mass 9500 kg plus 850 for the torpedo, CD0 .035, propeller thrust
   `min(42 kN, 2.7 MW / V)`, no reheat term), four 20 mm cannon (400 rounds), sixteen RP-3 on the
   seeker key and cap (20 s reload), a Mk XVII torpedo on the centreline on the bomb key (drop low
   and level: water entry needs |Vy| under 48 m/s and V under 150 m/s, then a 21 m/s straight run
   that sinks a ship within 25 m). Modelled in `tools/model_fleet.py`: deep Python nose, bubble
   canopy, finlets, roundels, contra-rotating props, the torpedo's long horizontal air tail. The
   skin switch hides for it. Verified: `test_fleet.mjs` (take-off at 21.6 s to 431 m, IAS under
   220 m/s; sixteen rockets then reload; torpedo water entry, run and ship kill),
   `tools/qa_fleet.mjs` (rocket and torpedo release from the built bundle, zero console errors,
   renders `wyvern-side/front/below.png`).
3. **Shore and waterline.** `src/shore.js` buckets the OpenStreetMap coastline
   (`src/shore-data.js`, ODbL) and `shoreHeight` lifts mapped dry land within 250 m of the coast to
   at least 2.8 m above the sea and exposes mid-tide beach in the western and southern bays. It is
   applied inside `terrainHeight`, and `src/world.js` samples `terrainHeight` per vertex, so the
   physics and the visual mesh agree. `tools/model_shore.py` builds the `coastal_defences` asset:
   St Ouen's mapped walls (OSM tags `barrier=wall` + `wall=seawall`, which the old extractor missed)
   in granite, the St Aubin's and St Brelade's bay shore in concrete and granite, and a root apron so
   St Catherine's Breakwater meets the land. Building bases are now at least 2.9 m above the sea
   (`tools/model_settlement.py`), so nothing stands in the water, and the mobile tier keeps one
   town building in two in St Helier and St Aubin (was one in six). Verified: renders `ouen.png`
   (beach and wall), `aubin.png`, `helier.png`, `catherine.png` (the root touches the shore).
4. **Intro copy** is Charles's wording: "Fly around Jersey. See the sights. Blow up the targets."
   (short: "Fly around, see Jersey, blow up the targets."). Meta description to match.
5. **Completed here, after Codex stopped:**
   - `test_fleet.mjs` failed (the Wyvern ran off the runway at 85 m/s, crash `terrain`, no
     rotation). Cause: the instructor's ground law rotates only for a live aim, and the test passed
     `{direction}` without `active:true`, unlike every other instructor test. Fixed the test, moved
     its result line onto the `PASS` pattern, chained it into `tools/test_flight.mjs` (62 PASS).
   - The aircraft picker was a native `<select>`, which Charles had already rejected for the skin.
     It is now the glass switch: one `.switch` primitive (`.switchLegend`, `.switchTrack`,
     `.switchKnob`, state class `on`) shared by `#aircraftSwitch` and `#skinSwitch`, the first legend
     68 px wide so the two slots stand in one column. Order: ENTER, aircraft, skin, placard.
   - **Desktop skin switch had been inert since `5a50c37`**: its legend, drag and keyboard bindings
     lived inside `if (touch) {}` in `src/main.js`, which is null on a desktop, so only the hidden
     select worked. One `bindSwitch` outside that block now serves both switches on both tiers.
     Verified by a headless probe on `dist/index.html` with no touch layer: clicking each legend
     changes `range.aircraft.type` and the skin state, aria-checked and the `on` class follow, the
     skin row hides for the Wyvern and returns, zero console errors.

**Retraction of the second-pass flag.** The HUD's "IR MISSILE" / "MISSILE" / "HEAT LOCK" wording was
not an unrequested change: Charles asked Codex to "rename amraam to sidewinder or something a
normie will understand". Codex chose the generic word over "Sidewinder". Only open if Charles wants
the word "Sidewinder" specifically.

Numbers: `node tools/test_flight.mjs` 62 PASS; `python tools/build.py` desktop 29.5 MB, mobile
10.9 MB (were 28.7 and 9.24; the fleet meshes and the coastline data); `tools/qa_touch.mjs --intro`
six cells (two skins) 0 contrast failures, plus three Wyvern cells 0 failures.

## Done (second pass, `5b320b3`)

1. **HUD units to metric.** km/h, metres above mean sea level, m/s. Hints converted.
2. **Kill confirmation.** `#killConfirmation`, white over a slightly larger red outline, top
   centre, AIR/GROUND/NAVAL TARGET DESTROYED! for 2.4 s, queued; a short metallic chime
   (`audio.confirmKill()`) through the mute control. Fires from `Effects.destroyTarget` and
   `Engagement.hitAir`.
3. **Munition-view tracking bug fixed.** `#seekerHead` was projected from a direction fixed to the
   aircraft nose; it now projects the tracked contact's world position under the current camera,
   and the aircraft-relative instruments hide in a detached view. `tools/qa_hud_feedback.mjs`
   asserts sub-pixel agreement through eight camera poses following a live missile and bomb.
4. **East coast.** St Catherine's Breakwater (`landmark_6`), Mont Orgueil's vertical placement,
   `gorey_rock` / `gorey_granite` / `catherine_masonry` materials; `tools/test_library.mjs` decodes
   the packed vertices to lat/lon and checks each sits on its real site.

## Done (first pass, `5a50c37`)

1. **Airport chrome-mirror.** The baked pavement asset left the 08 threshold with no triangles over
   the terrain discard; the pavement is now engine-built from `AIRPORT.pavement` in `world.js`.
2. **Mobile black square at the intro.** The contact shadow on a non-MSAA half-float post target;
   the mobile post target carries `samples: 2`. Mechanism not isolated; the sample count was the
   only variable that moved it. Confirm phone fps on-device.
3. **Desktop UI on the mobile Liquid Glass system**: glass ENTER cap, ink HUD with the token ramp,
   glass help panel, ink button legends, the shared stop veil, the glass skin switch.
4. **Intro copy** (since replaced by the third pass's wording).
5. Verified in-game the previous session's water wake, missile-launch FX, gear compression and
   settlement coverage.

## Backlog

- **Sea walls, character by section.** Charles described the Napoleonic and WW2 German walls as
  different and asked for references per section. What shipped is one battered profile per
  material (granite for the mapped St Ouen's walls, concrete for the St Aubin's promenade run);
  no per-section reference was consulted. Open.
- **Landmarks**: Noirmont absent, Fort Henry a slab, and `landmark_granite` still a flat grey-brown
  on the original landmark set (a quick retint in the `world.js` material hook; taste call).
- **Wyvern fidelity.** It borrows the Typhoon's aero coefficients, wing area and three-leg gear
  contact model (the tailwheel is visual only), so take-off and landing are not tuned to a
  tail-dragger; IAS tops out near 135 m/s (486 km/h; the real S.4 did 616). The HUD prints
  THROTTLE 112 % at the reheat gate, which a piston aircraft has no use for; cosmetic. Rockets kill
  through the explosion radius (18 m ground, 26 m ships) with no hp model.
- **Generic buildings, cliffs, harbour refinement** per the earlier audit; the gear/pylon/canopy
  Blender audit of the Typhoon.
- **On-device phone check** of everything since `85a1c7b`: the two stacked switches, the Wyvern's
  props and cockpit column (ROCKET and TORPEDO caps), swipe-to-look feel, frame cost.
- Owner decisions: a licence file; the Crown-copyright Typhoon question.

Blender launch when needed:
`"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" --python tools\start_blender.py`
