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

Test on the phone as above, then settle the licence and the Typhoon question.

## Gotchas

- Two elements shared `id="throttle"` (the quadrant and the HUD readout), so the quadrant's
  listeners went to the hidden readout with no error. `tools/test_touch.mjs` asserts unique ids.
- The exporter runs `tools/pack_library.py` at the end; if `assets/meshes.bin` is newer than
  `library.bin`, `build.py` packs again. The dev page and the bundles read the packed library only.
- Phone sensors need HTTPS: test on the Pages URL, never on the LAN http server.
- A pure roll must read as zero pitch: `tiltFromUp` measures pitch against the in-plane magnitude.

The dated notes from 6 to 10 September are in `docs/notes/state-history.md`.
