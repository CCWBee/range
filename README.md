# RANGE

One Eurofighter Typhoon over Jersey at a wet dusk. A self-contained three.js flight demo: take off
from Jersey Airport, fly the coast, gun and Paveway the practice range, chase a MiG with a
Sidewinder, bring it home. One HTML file, no external assets.

**Play it:** https://ccwbee.github.io/range/ on a desktop (mouse aim and keyboard). On a phone the
same address opens the tilt-to-fly version (https://ccwbee.github.io/range/mobile.html): hold the
phone sideways, tilt to steer, a slider for the throttle, three keys for the weapons. The offline
file is https://ccwbee.github.io/range/RANGE.zip (`RANGE.html` plus the three.js licence); it runs
from disk in any browser with hardware acceleration.

## Controls

Desktop: the aircraft flies towards the circle under the mouse, with an instructor keeping it off
the stall. Left mouse or Space fires the gun; 2 or 3 releases a Paveway (End selects a target, L
turns the laser on); Alt+X turns the Sidewinder seeker on and 5 launches when it locks. W and S
pitch, Shift and Ctrl work the throttle, Ctrl at idle brakes on the ground, A and D roll, Q and E
steer, G gear, B airbrake, hold U to follow the last munition, hold Z to zoom, hold C to look
round, V chase distance, R restart, I the full list, P pause.

Phone: tilt the phone like a wheel to turn (right edge down turns right); pull the top edge towards
you to climb, push it away to descend; RECENTRE recaptures the neutral pose. The throttle quadrant
on the left goes to MIL at the mark and into reheat above it. GUN is held, PAVEWAY designates the
target with the laser and releases, SEEKER turns the seeker on and reads FIRE when it locks. Gear,
brakes and the laser are automatic.

## How it is built

- `physics.js` is the rigid-body flight model (aerodynamic moments, a gain-scheduled fly-by-wire
  loop, three wheel contacts); `control.js` the mouse-aim instructor; `src/` the renderer, the
  weapons and the phone layer (`src/touch.js`).
- Every mesh is authored in Blender (`assets/RANGE.blend`, kept in Git LFS). `tools/export_meshes.py`
  exports it and `tools/pack_library.py` packs the export into `assets/library.json` and
  `library.bin`, the quantised runtime library. Textures were generated from prompts recorded in
  `concepts/prompts.json`.
- `python tools/build.py` writes `dist/index.html`, `RANGE.zip` and the lighter `dist/mobile.html`;
  GitHub Actions builds and publishes them on every push to `master`.
- `node tools/test_flight.mjs` runs the physics, instructor, engagement, touch and library checks.
- Specifications are in `docs/specs/`; the design thesis and tokens in `docs/DESIGN.md`.

## Credits and licences

- three.js r160, MIT (`vendor/THREE-LICENSE.txt`).
- Terrain: Mapzen Terrain Tiles. Europe terrain produced using Copernicus data and information
  funded by the European Union (EU-DEM); SRTM and GMTED2010 courtesy of USGS; ETOPO1 NOAA. Rendered
  at 85 per cent horizontal scale, with the airfield and the range flattened for gameplay.
- Roads, buildings, land cover, piers and harbour geometry: © OpenStreetMap contributors, ODbL 1.0
  (openstreetmap.org/copyright), from the Geofabrik Guernsey and Jersey extract of 10 September
  2026. Building heights are estimated where not supplied. The derived files (`assets/settlement.json`,
  `assets/landmarks.json`, `src/roads.js`, `src/landcover.js`) are shared under the same licence.
- Jersey Airport's position and runway bearing follow the NATS aerodrome chart; the runway length
  and the airfield buildings are adapted for gameplay.
- Typhoon airframe: adapted from the RAF's recognition model (raf.mod.uk, Crown copyright) with its
  supplied texture atlas. Permission to redistribute the adaptation has not been established; it
  stays here pending that.
- The code, the flight model, the authored scene and the generated textures carry no licence file
  yet, so the default applies: all rights reserved by the author.
