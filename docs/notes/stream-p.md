# Stream P: flight model and instructor

What `physics.js` and `control.js` deliver, for the streams that consume them. Spec:
`docs/specs/2026-09-06-range-v2.md` sections 0, 1.1, 2, 3. Check: `node tools/test_flight.mjs`
(20 assertions, all passing).

## physics.js exports

`G0`, `RHO0`, `WING_AREA`, `SPAN`, `CHORD`, `MASS_FULL` (constants), `PAVEMENT` (the rectangle
list of spec 1.1), `onPavement(x, z)`, `terrainHeight(x, z)`, `groundHeight(x, z)` (pavement or
terrain, what the wheels stand on), `coast(z)`, `fbm2(u, v)`, `speedOfSound(h)`, `qMax(V)`
returning `{pull, push}` in rad/s, `pMax(V, bombs, gearPosition)` in rad/s, `class Flight`,
`bombStep(bomb, dt)`.

## Flight state the renderer reads

Every field is live after `step()`; units are metres, seconds, radians unless stated.

| field | meaning |
| --- | --- |
| `position`, `velocity` | world m and m/s |
| `attitude` | quaternion, body to world |
| `omega` | body angular velocity, `q = omega.x`, `r = -omega.y`, `p = -omega.z` |
| `basis()` | `{forward, up, right}` world unit vectors |
| `throttle`, `spool`, `reheat` | 0 to 1.12, 0 to 1.12, 0 to 1 (the lit fraction, drives the plume) |
| `gear`, `gearPosition` | commanded boolean, 0 up to 1 down |
| `brake`, `airbrake` | booleans as commanded |
| `onGround`, `grounded`, `landed`, `stopped` | any wheel touching; all three for 0.2 s; touched down after a real flight; stopped on the ground |
| `crashed`, `crashReason` | `'impact'`, `'gear'`, `'attitude'`, `'terrain'`, `'water'`, `'airframe'` |
| `alpha`, `beta`, `load` | rad, rad, load factor along body up |
| `ias`, `mach`, `verticalSpeed`, `qbar`, `rho` | indicated m/s, Mach, m/s, Pa, kg/m³ |
| `stallSpeed` | 1 g indicated stall speed at the current mass, 64.6 m/s clean at 15.2 t |
| `buffet`, `condensation`, `stall` | 0 to 1, 0 to 1, boolean |
| `bombs`, `rounds`, `mass`, `airborneTime`, `elapsed`, `impact` | counts, kg, s, s, last touchdown sink rate |
| `surfaces` | `{canardL, canardR, elevonL, elevonR, rudder, airbrake, nozzle, steering}` |
| `legs` | `[nose, left, right]` of `{contact, compression 0..1, load N, spin rad/s}` |

Surface signs, matching spec section 0 and the exported hinge axes: elevons positive trailing edge
down, canards positive leading edge up (they sit at −0.35 rad, drooped, with weight on the wheels),
rudder positive trailing edge left, `airbrake` and `nozzle` 0 to 1, `steering` rad positive right.
`compression` is a fraction of 0.35 m of travel; static rest is 0.20 nose, 0.225 mains, which puts
the centre of mass 1.645 m above the ground.

`step(dt, cmd)` takes `{pitch, roll, yaw, throttle, brake, airbrake}`: the first three are fly-by-wire
demands in −1..1 (pitch positive pull, roll positive right wing down, yaw positive nose right),
`throttle` is a rate in −1..1 integrated at 0.40 per second, the last two are booleans.
`setThrottle(value)` sets it outright, for staging. Fixed step: call it at 120 Hz.

## control.js exports

`class Instructor` with `mode` (`'assist'` or `'manual'`), `state`
(`{regime, bankDesired, stallGuard, alphaLimited, gLimited, active}`, where `regime` is one of
`ground`, `small`, `large`, `push`, `stall`, `level`, `manual`) and
`update(dt, flight, aim, keys)` returning the `cmd` for `Flight.step`.
`aim` is `{direction: Vector3 | null, active: boolean}`, the world unit vector of the camera ray
through the cursor. `keys` is `{pitch, roll, yaw, throttle, brake, airbrake}` from the keyboard.
Also `aimFromAngles(flight, azimuth, elevation)` (tests and staging) and `pathFrame(flight)`.

The instructor steers the **velocity vector**, not the nose, so the flight-path marker goes to the
reticle and the nose sits alpha above it. Errors are measured in an unbanked path frame, which is
why bank alone never becomes a pitch demand.

## Deviations from the spec, with reasons

- **`groundHeight` added to the exports.** The instructor needs the height above the runway for the
  flare relief below; the spec listed only `terrainHeight`, which ignores pavement.
- **The stall guard stands down in the flare.** With the gear down and below 25 m above ground the
  airspeed guard is switched off (`flaring` in `control.js`). The aircraft is meant to decelerate
  through its stall speed onto the runway; with the guard live it read the deceleration as a stall,
  latched, and pushed the nose into the runway from 15 m, arriving at 20 m/s. The hard alpha cap
  (12·(0.30 − alpha)) still prevents a real stall, and that is the protection that matters.
- **The flare aims level, not 3 degrees up.** Spec section 3.6 said to raise the aim to 3 degrees
  above the horizontal. That commands a climbing path: the aircraft ballooned from 8 m back up to
  15 m, ran out of speed and fell out. Holding the path level lets the speed decay onto the runway,
  which is what a flare is. The test now does that and touches down at 1.6 m/s.
- **Nose-lowering after touchdown.** Not in the spec: with the mains down and the nose wheel still
  off, the ground law commands a small nose-down rate so the nose wheel is placed rather than
  dropped.

## Numbers the model actually produces

| quantity | measured |
| --- | --- |
| take-off run to lift-off, reheat, pull at 74 m/s | 407 m, lift-off 92 m/s at 12.4 s |
| 1 g stall speed, indicated, 15.2 t | 61.3 m/s (predicted 64.6) |
| roll rate, clean, 200 m/s | 3.66 rad/s peak, 3 rad/s at 0.27 s |
| roll rate, gear down and four bombs, 75 m/s | 0.62 rad/s |
| 6 g turn at 250 m/s, throttle 0.8, 10 s | 19.5 m/s bled |
| parked settle | pitch −0.33°, creep 7 mm over 30 s |
| braking run from 60 m/s | 574 m |
| landing, 3° approach at 82 m/s with the flare | touchdown 1.61 m/s at 64.6 m/s, roll-out 641 m |

## Shared numbers (must match the Blender copy to 1e−6)

`terrainHeight` at the five spec sample points:

| x, z | height |
| --- | --- |
| 0, 0 | 0.000000 (pavement) |
| −1000, −4200 | −0.514481 |
| 900, −3000 | −0.219076 |
| 3000, −4000 | −21.564293 |
| 5500, −4000 | 1.000000 |

`coast(0) = 1600.0`. `fbm2` over 4000 samples spans −0.822 to 0.826, inside −1..1 as specified.
