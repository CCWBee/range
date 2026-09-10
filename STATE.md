# STATE

## Where it stands

10 September 2026. RANGE is public at https://ccwbee.github.io/range/ (desktop, 25 MB) with the
tilt-to-fly phone version beside it at `mobile.html` (8.9 MB). GitHub Actions builds both bundles
from source on every push to `master` and ships `RANGE.zip` next to them; nothing built is
committed. The runtime library is `assets/library.json` plus `library.bin` (version 3, quantised,
6.8 MB), packed by `tools/pack_library.py` from the Blender export, which is no longer tracked;
`assets/RANGE.blend` is in Git LFS. History was rewritten on 10 September to drop the build
outputs, the export, the old blend versions, the raw textures and the old screenshots; the
pre-rewrite history is kept in `_archive/range-history-before-slim-20260910.bundle`.

The phone version: tilt is the aim (azimuth relative to the path, elevation absolute above the
horizon), a throttle quadrant with MIL and the reheat band, GUN, PAVEWAY and one SEEKER key that
reads FIRE on lock; gear, brakes and the laser are automatic; the controls share the lens material
in `docs/DESIGN.md`. Sound claims a playback session on iOS so the ringer switch does not mute it.
`node tools/test_flight.mjs` runs five suites (physics and instructor, engagement, touch, the
packed library, the page's unique ids); all pass. Headless frames: `screenshots/touch.png` and
`screenshots/touch-mobile.png`.

## Open threads

- The phone check after this push: sound plays with the ringer switch either way; the quadrant
  follows the finger; the layout sits (brand and objective top left, hint and the three numerals
  centred at the bottom, quadrant left, keys right); the keys read as one material. Tilt already
  works. Report the feel: the tilt constants are the first lines of `src/touch.js`.
- Owner decisions: a licence file for the code (no public repo of yours has one except
  design-library, MIT); whether the Crown-copyright Typhoon adaptation may stay in a public repo
  (the RAF site refused automated reading of its terms, so nothing there was verified); whether the
  old Codex folder should still be mirrored now that Codex commits here.
- Desktop frame rate, measured 10 September in Brave on the RTX 5070 Ti with the GPU finished
  each frame: 1.5 to 1.9 ms a frame at 2559 × 925 (cloud 678 fps, bomb run 613, ramp 520) and 1.8
  to 2.4 ms at pixel ratio 2 (4654 × 1682); the live loop is vsync-bound at 144 Hz, so the 60 fps
  target holds by a factor of ten. The phone's frame rate is still unmeasured.

## Next action

In flight (10 September, evening): the touch layer's design pass. Charles's verdict on the phone
build: rough, text overflows, too many words on a small screen, white text on a light background,
and the register is wrong: not plain liquid glass but liquid glass fused with the Thrustmaster
HOTAS Warthog cockpit look (matte black, white condensed legends, backlit green). Reference
opened and read on 10 September. Plan: a design-panel workflow writes
`docs/specs/2026-09-10-range-touch-cockpit.md`; a second workflow implements it (index.html touch
CSS, `src/touch.js` copy, `src/hud.js` touch objective, `tools/build.py` font inlining and
`font-src data:`, `docs/DESIGN.md` amendments) and verifies with a shot matrix (667×375, 844×390,
932×430; cloud, ramp, landing; resting, locked, reload states), pixel-sampled contrast, `scan.mjs`
and `test_flight.mjs`. Design panel: run `wf_9667800f-32a`, script
`C:\Users\Charles\.claude\projects\E--claude-projects-range\9d648607-248d-4ebf-8b97-8563727faad4\workflows\scripts\range-touch-cockpit-design-wf_9667800f-32a.js`
(resume with `Workflow({scriptPath, resumeFromRunId: "wf_9667800f-32a"})`): done, the spec is
written, with section 10 added afterwards for Charles's four additions (intro clean-up, the skin
switch, the wake lock, the render scale). Taste rulings on the spec's open calls: reheat lights
green, the cap reads BOMB, the airspeed legend is IAS not SPEED, the range leg is TARGETS not
COASTAL RANGE, the skin switch stays monochrome. Implementation workflow: two writers on disjoint
files (fonts and build.py; the touch UI, tests and DESIGN.md), then verify (build, tests,
`tools/qa_touch.mjs` matrix with `tools/contrast.py`, scan), three refuting reviewers, one fixer,
looped until dry: run `wf_f92f4738-095`, script
`C:\Users\Charles\.claude\projects\E--claude-projects-range\9d648607-248d-4ebf-8b97-8563727faad4\workflows\scripts\range-touch-cockpit-build-wf_f92f4738-095.js`
(resume with `Workflow({scriptPath, resumeFromRunId: "wf_f92f4738-095"})`). Favicon (Charles, 10
September evening: an orange top-down Typhoon silhouette on a teal rounded square, traced from
the mesh): run `wf_f1484e8c-f82`, script
`C:\Users\Charles\.claude\projects\E--claude-projects-range\9d648607-248d-4ebf-8b97-8563727faad4\workflows\scripts\range-favicon-wf_f1484e8c-f82.js`,
writing only `assets/icon/` and `tools/icon_planform.py`; the wiring (`<link rel="icon">` as a data:
URI in `index.html`, `build.py` inlining plus a DependencyCheck exemption for `rel="apple-touch-icon"`,
and `pages.yml` copying `assets/icon/apple-touch-icon.png` into `dist/`) waits until the build run
has released those files. Charles's verdict on the first build (21:10): the weapons caps are a box
in a box, too dark, and skewed; then "equal, in a row single file along the side". Written as spec
section 11 (bezel gone, three equal 62 px caps in a column down the right edge with their own .48
glass at 8 px blur, the quadrant film to .48 to match). Section 11 is now built (10 September,
22:30): the bezel is gone, `#touchWeapons` is a flex column of three 62 x 62 caps at radius 10, each
its own glass, and the film is .52 rather than .48 on both the caps and the quadrant, because at .48
the locked legend measured 4.56:1 against the 4.5 floor and section 11.3 names .52 as the figure to
fall back to. Also in that pass: the reheat fill lights green, ENTER AIRCRAFT takes the cap glass,
the stop veil moved to `#hud`'s background colour so the paused screen no longer dims every
instrument to 2.2:1, the bomb diamond is hidden rather than clamped below the coaming, and the stall
flash dips to .72 rather than .35. Gates: `test_flight.mjs` exit 0, `build.py` exit 0, the 27-cell
matrix 561 boxes 0 failures, the scan clean. The build run was stopped by hand at 22:54 after its second fix pass, before a third
review round, to get the result in front of Charles; the icon is wired (`index.html` links,
`build.py` inlines `favicon.svg` and copies `apple-touch-icon.png` into `dist/`, `DependencyCheck`
allows that one href), the desktop intro placard leak (`#intro small` outranking `#introTouch`) is
fixed, and the gate re-run by hand at 23:00: tests exit 0 (56 PASS), build exit 0 (mobile 9.24 MB,
desktop 28.7 MB), matrix 27 cells 561 boxes 0 failures. Then Charles's five corrections on the second build, done by hand as spec section 12 (23:20 to
23:45): throttle panel film .72, objective line hidden on touch, pitch down to 55 degrees against
25 up (`ELEVATION_DOWN` in `src/touch.js`), swipe-to-look on the view with tilt still steering
(`input.touchLook`, the C-key return decay), and the two canopy bands replaced by a text halo,
with the QA probe now keeping the shadow so the matrix measures ink against halo. Final gate on the pushed bundle (10 September, 23:30): tests exit 0, build exit 0 (mobile
9.24 MB, desktop 28.7 MB), matrix 27 cells 534 text boxes 0 failures with the sampler now judging
under the strokes. Pushed to master at Charles's instruction with the concurrent model pass
included. Left: Charles's phone checks (frame cost with four blur layers is unmeasured, since
headless Chrome freezes rAF; the swipe look and the 55-degree push are untested by hand; the
black square at the intro on the mobile tier belongs to the model pass). Separately, a Codex
session started at 22:00 on 10 September edited the model and world (`assets/RANGE.blend`,
`library.bin`, `src/aircraft.js`, `camera.js`, `effects.js`, `engagement.js`, `world.js`, the
model tools); with that model, the mobile render tier draws a black square beside the aircraft at
the intro pose (`dist/index.html?tier=mobile&touch=0` at 844 x 390 shows it, `?tier=desktop` does
not, and the pre-22:00 model did not), which is that session's to resolve.
Baseline evidence: `screenshots/qa-before/contrast.md` (88 of 198
text boxes under 4.5:1), now un-ignored in `.gitignore` so the frames the documents cite can reach
the repo. Pushing to master deploys Pages, so the push waits for Charles.

Then: test on the phone as above, then settle the licence and the Typhoon question.

## Gotchas

- Two elements shared `id="throttle"` (the quadrant and the HUD readout), so the quadrant's
  listeners went to the hidden readout with no error. `tools/test_touch.mjs` asserts unique ids.
- The exporter runs `tools/pack_library.py` at the end; if `assets/meshes.bin` is newer than
  `library.bin`, `build.py` packs again. The dev page and the bundles read the packed library only.
- Phone sensors need HTTPS: test on the Pages URL, never on the LAN http server.
- A pure roll must read as zero pitch: `tiltFromUp` measures pitch against the in-plane magnitude.

The dated notes from 6 to 10 September are in `docs/notes/state-history.md`.
