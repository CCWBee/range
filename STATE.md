# STATE

## Where it stands

31 October 2026. RANGE is live at https://range.charlesbee.org through the `range-charlesbee` proxy
Worker (`deploy/worker/`, `MAINTENANCE.md`) and at https://ccwbee.github.io/range/, and is listed on
the charlesbee.org hub. Everything up to `908f05b` is committed and pushed (the sea's directional
wave spectrum and its lean phone path, the traced-Typhoon favicon, the 22 September UI, black-frame,
performance and loading-screen passes). Codex's 17 September work (`2412d91`: hedge lines, the
meadow and farmland split, island-wide clutter, town lights, the Wyvern's throttle wording and
power) shipped and is verified.

The audit fixes of 31 October (spec `docs/specs/2026-10-31-audit-fixes.md`: an allowlist, method
limits, edge caching and security headers on the proxy Worker, pinned CI dependencies, a
`NOTICE.txt` in `RANGE.zip`, this file and `MAINTENANCE.md`) are written and uncommitted. A push
redeploys Pages and the Worker needs `npx wrangler deploy` from `deploy/worker/`; neither is done,
both wait for Charles.

Verification: `node tools/test_flight.mjs`, `node deploy/worker/test-worker.mjs` and
`python tools/build.py` pass. Visual checks run in Brave (OPERATING_RULES, 22 September 2026):
`tools/check_polish.js` passes on both bundles with no console errors.

The history of every earlier pass, with its numbers and run ids, is in `docs/notes/state-history.md`.

## Open threads

- **On-device phone check** of the live build: `range.bootTimes` in the phone's console (a
  `compileWait` above 0 and a small `firstFrame` mean the parallel-compile path ran, which nothing
  here can exercise), the two stacked switches, the Wyvern's props and cockpit column (ROCKET and
  TORPEDO caps), swipe-to-look feel, frame cost.
- **Blender items**, all in the LFS blend: Noirmont is absent, Fort Henry is a slab, and the St Ouen
  sea wall needs re-placing onto the coastline (with the character of each section, Napoleonic and
  WW2 German, which no reference has been consulted for).
- **Harnesses not run to completion**: `tools/qa_hud_feedback.mjs` and the phone run of
  `tools/qa_black_frames.mjs` (their last headless runs failed to start Chrome under a saturated
  CPU). Run them only if Charles asks for the headless harnesses.
- **og:video link preview, held on branch `og-video`** (`f43274b`, 31 October 2026): the museum
  Typhoon's loop and poster in `social/`, the og and twitter tags early in both bundles, byte ranges
  for `/social/*.mp4` in the proxy. Kept off `master` because Pages publishes `master` on every push
  and the media show the Typhoon adaptation: merge it only after the licence decision below.
- **Typhoon licence decision** (owner): whether the Crown-copyright adaptation may stay in a public
  repo, and a licence file for the rest.
- **Favicon redraw** and the **look pass**: both in progress on 31 October, each on its own page.
- **Parked backlog**, not shipped by `2412d91` and kept in `docs/notes/state-history.md` ("Backlog" and the
  17 September "Deferred" paragraph): Wyvern fidelity (borrowed Typhoon aero and three-leg gear model,
  IAS ceiling near 135 m/s against the real 616 km/h, rockets with no hp model), the `landmark_granite`
  retint, generic buildings, cliffs and harbour refinement, the Typhoon gear, pylon and canopy Blender
  audit, and a simplification sweep.

## Next action

The on-device phone check above; then Charles approves the push and the `wrangler deploy` for the
audit fixes.

## Gotchas

- An instructor test must pass `{direction, active: true}`. With `active` false the ground law never
  rotates, and the aircraft runs off the runway at 85 m/s with crash `terrain` and `liftoff: null`
  while every physics check still passes. `tools/test_flight.mjs` line 228 is the pattern.
- Anything bound inside `if (touch) {}` in `src/main.js` does not exist on a desktop, where `touch`
  is null, and the failure is silent because the hidden select keeps working. Intro controls bind
  outside the block. The check is a headless click on a legend of `dist/index.html` followed by a
  read of the state; see the probe in `docs/notes/state-history.md`, under "Done (third pass ...)".
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
