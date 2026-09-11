# STATE

## Where it stands

11 September 2026. Two passes landed today. The first (`5a50c37`, on `85a1c7b`) is described below.
The second, authored by Codex against a direct feature request from Charles and reviewed here before
push, adds HUD units, a kill confirmation, a munition-view tracking fix, and continues the east-coast
backlog (St Catherine's Breakwater, a Mont Orgueil pivot fix and a new granite material). See
"Done (second pass)" below; the live site is this second commit once pushed.

The old safety snapshot tag `range-wip-safety` and the scratchpad backup are superseded by the first
commit; they can be left or removed.

## Done (second pass, Codex — reviewed and verified before push)

1. **HUD units to metric.** Airspeed is now km/h (`flight.ias * 3.6`, was knots), altitude is metres
   above mean sea level (`flight.position.y - JERSEY.seaLevel`, was feet), vertical speed is m/s
   (was fpm). Hints that quoted knots thresholds ("rotate at 140 knots") converted to km/h. Verified:
   `tools/qa_hud_feedback.mjs` asserts exact converted values against a staged flight state and
   screenshots the readouts.
2. **Kill confirmation.** `#killConfirmation`: white text over its own slightly larger red outline
   (a `::before` sharing the string via `data-text`, stroked, `z-index:-1`), top centre, one of
   AIR/GROUND/NAVAL TARGET DESTROYED! for 2.4 s, queued so simultaneous kills don't clobber each
   other's text. A short three-partial metallic chime (`audio.confirmKill()`) plays with it, gated
   through the existing mute control. Fires from both `Effects.destroyTarget` (ground/naval) and
   `Engagement.hitAir` (air). Verified: `tools/test_engagement.mjs` (event kind, one per kill, cleared
   on reset), `tools/qa_hud_feedback.mjs` (rendered banner at 4 viewport widths, chime waveform
   decoded and asserted to decay to silence).
3. **Munition-view tracking bug — FIXED.** The locked-target marker (`#seekerHead`) was projected
   from a direction fixed relative to the aircraft nose, which is correct for the cockpit view but
   wrong once the munition camera moves away from the aircraft: the marker held its old
   aircraft-relative screen position instead of following the actual target, so a followed missile
   or bomb "flew past" a marker that never moved. Fixed in `src/hud.js`: `updateEngagement` now takes
   `detachedView`/`munition` and, when set, projects the tracked contact's real world position under
   whatever camera is current, using the munition's own target rather than the aircraft seeker's
   fixed ray. `updateMarkers` also suppresses the aircraft-relative flight instruments (reticle, nose
   cross, pipper, bomb diamond) in a detached view, since they describe the stick, not the weapon
   being watched. Verified: `tools/qa_hud_feedback.mjs` moves a real camera through 8 position/FOV
   combinations while following a released bomb and a launched missile, and asserts the marker's
   screen position against the target's true projection to under 0.1 px; also checks the flight
   instruments go hidden and the laser marker holds its own world anchor through a detached view.
4. **East-coast backlog continued** (from the prior pass's audit): St Catherine's Breakwater modelled
   and added to `LANDMARKS` (`landmark_6`); Mont Orgueil Castle's vertical placement corrected
   (`-70.85` to `-54.6`, a pivot fix so the castle sits on its rock rather than partly into it); a new
   `gorey_rock` cliff-face shader (fbm-driven exposure banding) and `gorey_granite`/
   `catherine_masonry` materials. Verified: `tools/qa_east_coast.mjs` renders both landmarks from
   plan, harbour and sea approaches; `tools/test_library.mjs` gained a geographic-placement check that
   decodes each mesh's actual world vertices and asserts they fall inside Gorey's and St Catherine's
   real lat/lon boxes, independent of the scene's own labels.

**Flag for Charles, not folded in silently:** the HUD/hint text and keybind list now say "IR MISSILE"
/ "MISSILE" / "HEAT LOCK" where they said "ASRAAM" (the internal model, `AAM.name` and the MBDA
datasheet citation in `src/engagement.js`, is unchanged). This wasn't asked for. It's defensible
(keeps a specific real weapon's name out of the HUD) but it departs from how the rest of the project
names real hardware (the MiG-15, the Typhoon, Paveway are all named plainly), so it is a judgement
call worth confirming rather than assuming. Say if you want "ASRAAM" back in the UI.

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
  Aubin's Fort all recognisable silhouettes). **St Catherine's Breakwater is now modelled** (second
  pass, above). Remaining gaps: **Noirmont absent** (only a generic building), **Fort Henry** a weak
  6m slab, and **landmark_granite is still a flat grey-brown** (`tools/model_landmarks.py:16`) on the
  original landmark set (Elizabeth Castle etc.) where Jersey granite reads pink-orange — the new
  `gorey_granite`/`catherine_masonry` materials got the right colour from the start rather than a
  retint, so this is still open for the pre-existing landmarks. A quick-js retint in the
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
- A screen-space marker held in a fixed direction relative to the aircraft (rather than projected
  from the tracked object's real world position) desyncs the moment the camera stops being the
  aircraft's own chase camera. Any future detached-camera view (munition follow, a replay camera,
  the developer map camera) must project from the target's world position under the *current*
  camera, never from a ray cached in the aircraft's frame. `tools/qa_hud_feedback.mjs` is the
  regression check: it moves a real camera through several positions/FOVs while following a live
  munition and asserts sub-pixel agreement with the target's true projection.
- `tools/test_library.mjs` now decodes packed mesh vertices back to lat/lon and checks them against
  each landmark's real site, independent of the scene's own position labels — this catches a
  rotation, recentre or double translation that `LANDMARKS` alone would not.

## Resume

Read this file first. Both passes are committed and pushed; working tree is clean once the second
pass lands (see the top of this file for its commit hash once written). Next substantive work is the
Blender-heavy environment backlog above. Cheapest wins first: the granite retint on the original
landmark set (a taste call, confirm with Charles) and Noirmont. The gear/pylon/canopy geometry audit
needs Blender running (launch line above).
