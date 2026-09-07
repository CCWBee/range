# Stream R: the renderer

What `src/*.js` and `tools/build.py` deliver. Spec: `docs/specs/2026-09-06-range-v2.md` sections
1.1, 5, 6, 7, 8. `index.html` loads `src/main.js`; `python tools/build.py` bundles it to
`dist/index.html`, one file with no network assets.

## Modules

| module | job |
| --- | --- |
| `main.js` | bootstrap, the fixed-step loop, `window.range` (start, reset, stage, metrics, benchmark, stress, setAim) |
| `loader.js` | manifest plus binary to geometries; textures with a flat-colour fallback for any that are missing; the version 1 library still loads (the gear is one asset) if the version 2 parts are absent |
| `world.js` | sky, atmosphere and ocean shaders, terrain with the analytic coast, lighting, two shadow maps, instanced scenery at the section 1.1 coordinates, instanced lamps with a billboard glow, clutter kept off the pavement, the cloud decks |
| `aircraft.js` | assembles the parts at their pivots and animates the surfaces, gear, doors, nozzles and lights from `flight.surfaces`, `flight.gearPosition` and `flight.legs` |
| `effects.js` | bombs, gun, explosions, smoke, wheel spray, wrecks, craters |
| `camera.js` | the chase camera, aligned to the path with damping, load and buffet shake |
| `input.js` | keys, pointer lock, the cursor, the pause-on-unlock rule |
| `hud.js` | the typographic HUD, the three markers, the crash overlay |
| `audio.js` | engine, reheat and weapon sound from the Web Audio API |
| `post.js` | the scene target, bloom and the final grade, sized from the drawing buffer so `stress()` measures the real render |

## Bundling

`build.py` reads each module's imports, topologically sorts `physics`, `control` and the `src`
modules, and wraps each in a block that pulls its imports from a shared object and writes its
exports back, so `export`/`import` are stripped without a name clash and top-level `await` stays
legal. `three` is an inline module. The binary library is base64 in `window.RANGE_BIN`, decoded with
`atob`. Textures are data URIs. The build asserts no external `src`/`href` and `connect-src 'none'`.
Current bundle: 12.8 MB.

## Keys

Mouse aims (assist). Left mouse or Space fires the gun. B drops a bomb. W/S or Shift/Ctrl throttle.
A/D roll (and own the roll axis while held). Q/E rudder and nose wheel steering. Up/Down nudge the
pitch (Down pulls); Left/Right roll in manual mode. G gear, X airbrake and wheel brakes, I
instructor on and off, C camera, R restart, H help, P or Esc pause. A click while paused takes the
controls back and asks for pointer lock.

## Staging and metrics

`window.range.stage(name)` presents each of the five poses as a clean still: it clears the ground
flags before stepping an airborne pose (so the gear stays retracted) and clears the pause overlay.
`metrics()` reports the live figures; `benchmark(frames)` renders synchronously and times each frame
with `performance.now()`, which is the only trustworthy path since the automation tab freezes
`requestAnimationFrame`. `stress(true)` sets pixel ratio 2 and resizes the render targets for the
headroom number.

## Performance

Triangles per stage, at 1920 x 1080: ramp 411k, takeoff 405k, cloud 260k, bomb 275k, landing 402k,
all far under the 2.0 M budget.

Frame rate is not measured in this note. Headless Chrome renders this scene in software
(SwiftShader), so a synchronous benchmark there times the CPU rasteriser, not the RTX 5070 Ti, and
is meaningless. Real fps must be read in Brave through the Claude-in-Chrome extension with
`window.range.benchmark()` and `stress(true)`; the extension was disconnected when this build was
finished, so that reading is outstanding. The prior build held about 144 fps at 1080p in Brave on
this GPU with comparable geometry, so the target is expected to hold, but it has not been confirmed
for this build.

## Deviations from the spec

- **fps unmeasured this build** (above): needs Brave, extension currently disconnected.
- `metrics().calls` (draw calls) reads undefined in the one-shot staged render because
  `renderer.info` is not reset on that path; the triangle count is reported instead and the draw
  calls read correctly in the live loop.
