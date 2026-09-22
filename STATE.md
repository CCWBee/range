# STATE

## Where it stands

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
logs and no console errors. The phone's sea pass costs more (the panel measured about 1.7 times on
the RTX for the spectrum alone, before the gradient noise); judge it in the on-device check.

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

## Gotchas

- An instructor test must pass `{direction, active: true}`. With `active` false the ground law never
  rotates, and the aircraft runs off the runway at 85 m/s with crash `terrain` and `liftoff: null`
  while every physics check still passes. `tools/test_flight.mjs` line 228 is the pattern.
- Anything bound inside `if (touch) {}` in `src/main.js` does not exist on a desktop, where `touch`
  is null, and the failure is silent because the hidden select keeps working. Intro controls bind
  outside the block. The check is a headless click on a legend of `dist/index.html` followed by a
  read of the state; see the probe in the third-pass notes above.
- The visual terrain samples `terrainHeight` per vertex, so a height edit in `src/shore.js` reaches
  both physics and the mesh. Baked meshes do not follow it: buildings and harbour geometry are
  authored from `assets/settlement.json` by `tools/model_settlement.py`, which is why the waterline
  fix also raised building bases there.
- Airport pavement is engine-built from `AIRPORT.pavement`; `THREE.ShapeUtils.triangulateShape`
  winds clockwise, so faces must be reversed or the surface back-face culls into the sky hole.
- A normal-blended transparent quad (the contact shadow) renders as a hard fill on a non-MSAA
  half-float post target; mobile post carries `samples: 2`.
- The design tokens live at bare `:root` inside the `/* touch:start */`..`/* touch:end */` region,
  which ships in both bundles; only the touch input surfaces stay gated on `body.touch`.
- Verify visual work by rendering the built bundle (`design\tools\qa\shot.mjs` or the cdp harness);
  SwiftShader exaggerates some artefacts. Full `file://` URLs keep a query string.
- A screen-space marker held in a fixed direction relative to the aircraft desyncs the moment the
  camera stops being the aircraft's own; project from the target's world position under the current
  camera. `tools/qa_hud_feedback.mjs` is the regression check.
- `tools/test_library.mjs` decodes packed vertices back to lat/lon against each landmark's real site.
- Node ESM on Windows: an import of an absolute path needs a `file:///E:/...` URL, or the loader
  fails with `Received protocol 'e:'`.
- `Flight.step` uses module-level scratch vectors (`_force`, `_torque` etc.) reused each call to cut
  GC churn. Safe only because step is never re-entrant. If step is ever made to call itself or run
  concurrently, that breaks; and `basis()` must keep returning fresh vectors (the camera and HUD
  hold them). A new physics change that shifts the takeoff/landing/turn numbers is the aliasing
  tell; the suite pins them exactly.
- The ocean shader is tier-gated by a compile-time `#define OCEAN_HI`, chosen at runtime from
  `this.tier`. Both bundles carry the same source (the tier is a runtime flag, not a build strip),
  so grepping the bundle for `OCEAN_HI` proves nothing; check
  `range.world.oceanMaterial.fragmentShader.includes('#define OCEAN_HI')` in a running page instead.
- The water's shoreline foam and shallow tint read a baked 512-texel signed coast-distance field
  (`shoreSample` over the island bounds) built once in `buildOcean`; it must use `LinearFilter`
  (39 m per texel) or the foam band steps.
- Any colour-grade or fog change must re-run both contrast gates (`tools/qa_touch.mjs` 27-cell and
  `--intro`), because the HUD stands on the bare frame and the touch layer only just clears 4.5:1.

## Resume

Read this file first. Everything is committed and pushed. Next is the on-device phone check under
"Where it stands", then the older "Deferred" list (the Blender items: Noirmont, Fort Henry, the St
Ouen wall re-placement).
