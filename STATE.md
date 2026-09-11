# STATE

## Where it stands

12 September 2026. Three passes have landed since `85a1c7b`:

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

## Resume

Read this file first. All three passes are committed and pushed; the working tree is clean. Next
substantive work is the backlog above, cheapest first: the on-device phone check, the granite
retint, Noirmont, then the sea-wall character pass with references per section.
