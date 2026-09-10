# RANGE mobile: tilt to fly

10 September 2026. Builds on `2026-09-06-range-v2.md`. A simplified touch version of the same
sortie for a phone held sideways, in the same codebase and on the same Pages site.

## 0. What it is

- Same world, same flight model, same instructor, same weapons. The phone's motion sensors replace
  the mouse, a throttle slider replaces Shift and Ctrl, and three translucent buttons carry the
  weapons. Gear, wheel brakes, laser designation and target selection are automatic. Nothing else is
  exposed.
- Ships as `dist/mobile.html`, a lighter bundle of the same code. The desktop `dist/index.html` sends
  coarse-pointer devices to it. `?touch=1` puts any bundle into touch mode for desktop testing;
  `?touch=0` forbids it; `?desktop=1` escapes the redirect.

## 1. Entry

- Touch mode when `(pointer: coarse)` matches and `(hover: hover)` does not, or `?touch=1`.
- The intro on touch reads "Tilt to fly · Hold the phone sideways · Headphones recommended". ENTER
  AIRCRAFT is the one gesture that does everything the platforms require inside a tap: asks iOS for
  motion permission (`DeviceOrientationEvent.requestPermission` where it is a function), tries
  fullscreen and a landscape lock on Android (failures ignored), starts the audio context, sets the
  virtual lock and starts the sortie.
- Neutral capture: the first orientation sample after entry is the neutral pose. RECENTRE recaptures
  it. If no sample arrives within 1.5 s, or permission is refused, the game falls back to drag aiming
  and the hint says so.
- Portrait shows "Turn the phone sideways" over the view and pauses the sim under it.
- Backgrounding pauses through the existing `visibilitychange` path. A tap on the view resumes, and
  resumes the audio context.

## 2. Sensor model

- Input: `deviceorientation` beta and gamma. Alpha, the compass, is unused: it says where the phone
  points, not how it is tilted, and steering by heading would need the player to turn around.
- Earth-up in the device frame is the third row of the W3C rotation matrix:
  `u = (−cos β · sin γ, sin β, cos β · cos γ)`. Checks: flat and screen-up gives (0, 0, 1); upright
  portrait gives (0, 1, 0); right edge down 90° gives (−1, 0, 0).
- The screen frame comes from the neutral sample, not from the orientation API: `sUp` is the
  normalised XY of `u0`, `sRight = (sUp.y, −sUp.x)`. Only when `|u0.xy| < 0.2` (a flat phone) does
  `screen.orientation.angle` decide the frame.
- For a sample u: `a = u · sRight`, `b = u · sUp`, `c = u.z`. `roll = atan2(−a, b)`, right edge down
  positive. `pitch = atan2(c, b) − atan2(u0.z, |u0.xy|)`, top edge away from the player positive.
- Smoothing: exponential, τ = 0.08 s. Deadzone 2° on each axis. Response `x' = 0.6x + 0.4x|x|` in
  normalised units. Limits: ±40° of roll tilt maps to ±50° of azimuth; ±25° of pitch tilt maps to
  ∓25° of elevation, so pulling the phone towards you raises the nose.

## 3. Aim semantics

- Azimuth is relative to the current path: a held roll tilt is a sustained turn, as a held mouse
  offset is.
- Elevation is absolute above the horizon: neutral is level flight, a held pull is a climb at that
  path angle and the aircraft does not pitch on past it. That is the "do not fall out of the sky"
  property. Relative elevation would make a held tilt a pitch rate, which loops.
- `aimFromTilt(flight, azimuth, elevation)`: the path heading (the body forward below 40 m/s) plus
  the azimuth, then the unit vector at that heading and elevation. `input.worldAim` is rewritten from
  it every frame while sensors are live, so the reticle shows it and the instructor steers to it
  unchanged.
- Drag fallback: a drag on the view feeds `input.pendingMouse` at 1.6 px per px, which rotates the
  saved aim exactly as the mouse does. Drag is ignored while sensors are live.

## 4. Throttle

- A vertical slider on the left edge: thumb 48 px, track 44 % of the height. Value 0 to 1.12; the top
  of the track is the reheat band, drawn hotter, with a tick at 100 %. The value is written with
  `flight.setThrottle` every frame; the keyboard rate path is unused.
- Wheel brakes: on the ground with the gear down and the slider at 0, the brake is on (the desktop's
  Ctrl-at-idle rule). There is no airbrake control.

## 5. Weapons

- GUN: hold. Sets `input.gunHeld`. The label shows the rounds, or the reload countdown.
- BOMB: tap. If the laser is off, designate first (`engagement.designate` finds the best ground
  target in front with line of sight; if there is none the message says so and the Paveway still
  releases ballistically to the diamond), then `effects.dropBomb`. Never call designate with the laser
  already on: that toggles it off. The label shows the Paveway count, or the reload countdown.
- SEEKER / FIRE: one button. Off: SEEKER, tap turns the seeker on. Warming: WARMING. Searching:
  SEARCH. Target inside the cone, not yet locked: LOCKING. Locked: FIRE, in the HUD's lock colour,
  tap launches. A tap while on and not locked turns the seeker off (the desktop toggle). After a
  launch the seeker stays on and the label falls back to SEARCH by itself. With no missiles left the
  label is the reload countdown and the tap does nothing.
- The labels come from a pure `seekerLabel(seeker, remaining, reloadTime)` so they can be tested.

## 6. Automatic gear

- Raise: airborne more than 3 s, more than 50 m above the ground, climbing.
- Lower: airborne, below 200 m above the ground, indicated airspeed below 110 m/s, descending.
- On the ground the model extends the gear itself (`physics.js`, `if (this.onGround) this.gear = true`).

## 7. Layout and design

The thesis and the tokens are in `docs/DESIGN.md`. In touch mode:

- Landscape only, safe-area insets respected (`viewport-fit=cover`).
- Left: the throttle slider. Right, bottom-anchored: GUN, a 72 px disc, lowest and nearest the
  thumb; BOMB, 56 px, above and left of it; SEEKER/FIRE, 56 px, above it. Top right: PAUSE and
  RECENTRE as plain small-caps text with 44 px hit areas. The desktop `#buttons`, the help panel and
  the skin selector are hidden.
- HUD kept: brand, objective, airspeed, altitude, heading, weapon state, the hint, and every marker
  (reticle, flight-path marker, nose, pipper, bomb diamond, target marks, seeker circles, laser mark).
  Hidden: throttle, G, AOA, V/S, Mach, gear, instructor, LTD and fps lines; the slider and the
  button labels carry what matters from them.
- Material: translucent discs, `rgba(12,22,29,.38)` with a 6 px backdrop blur and a 1 px hairline
  `rgba(214,229,237,.35)`; an opaque-enough tint where `backdrop-filter` is unsupported; blur off
  under `prefers-reduced-transparency`. Type is the HUD's letter-spaced small caps. The three discs
  differ in size and behaviour; only FIRE takes colour (the lock colour `#f09676`). No pills, no dots,
  no icons, no emoji. Press: the tint deepens and the label brightens. `navigator.vibrate(8)` on
  lock and on release where the platform has it (iOS does not).
- `touch-action: none` on the view and the controls; no tap highlight, no text selection, no
  double-tap zoom.

## 8. Render tier

- `tier = mobile` when in touch mode or `?tier=mobile`: pixel ratio min(dpr, 1); one shadow map at
  1024 on the near light, the far light without a shadow; the scene target without MSAA; bloom at a
  quarter. The terrain mesh is built at every other grid point (257 × 257 at 78 m, a quarter of the
  triangles, every vertex still on the true height), the tree cap is 1,200 instead of 3,600 and
  the ground clutter counts are halved. Everything else, including the settlement chunk culling,
  is as on desktop.

## 9. Mobile bundle

- `python tools/build.py` writes both bundles: `dist/index.html` plus `RANGE.zip` as before, then
  `dist/mobile.html`. `--tier mobile` or `--tier desktop` writes one.
- Both tiers carry the height grid as a base64 int16 array (0.1 m) decoded into a `Float32Array`,
  in place of the 1.5 MB JSON text in `src/jersey.js`; `physics.js` only ever indexes it. The
  desktop bundle went from 38.1 MB to 37.2 MB on that alone.
- Asset diet, measured on 10 September: settlement chunks sorted by the distance of their bounds
  centre from the airfield (0, 0, −900) and kept while the running total stays under 3 MB of
  geometry (25 of 87 chunks); every other asset kept; the binary repacked with rewritten,
  4-byte-aligned offsets; the terrain block dropped from the manifest, since only the loader ever
  read it and nothing reads the loader's copy. Roads: footway, path, steps, track, bridleway,
  cycleway, raceway, construction, bus stop, busway and service ways dropped (they draw under a
  pixel on the 2048 road map) and the rest thinned to 8 m (63,655 points to 22,301 in 2,711 ways).
  Land cover rings thinned to 10 m (35,141 points to 30,589). Textures resized to at most 768
  (sprites 256), JPEG quality 80 for opaque images, PNG for alpha; the heritage skin dropped.
  Result: library 5.3 MB, textures 1.5 MB, page 12.5 MB against a 15 MB assert, byte counts
  printed.
- Redirect: the desktop bundle gets one inline script at the top of head, before the module script,
  that sends coarse-pointer no-hover devices on http(s) to `mobile.html` with the query string;
  `?desktop=1` escapes it; `file://` never redirects.
- The Pages workflow also checks that `dist/mobile.html` exists.

## 10. Tests and verification

- `tools/test_touch.mjs`, chained from `test_flight.mjs`: the three orientation poses; the neutral
  frame; roll and pitch signs and the deadzone; through the instructor on the airborne fixture, a
  right tilt gives a right roll command and a pull gives a pull, and a level aim holds the path angle
  within 3° over ten seconds; the seeker labels; the bomb rule leaves an active laser on; the gear
  rules; the throttle write and the brake rule; a tap on the view under the virtual lock is not a gun
  event.
- Headless renders at 932 × 430 (an iPhone 14 Pro sideways), staged in the air with the overlay
  showing through `window.range.touchDemo('cloud')`: `screenshots/touch.png` from the desktop
  bundle under `?touch=1`, and `screenshots/touch-mobile.png` from the mobile bundle itself, which
  is what proves the repacked library decodes.
- On the phone, which only the user can do: open the Pages URL, grant motion, hold sideways; right
  edge down turns right; a pull climbs; the top of the slider lights reheat; BOMB drops with the
  laser message; SEEKER turns to FIRE on the MiG and launches.

## 11. Out of scope

Portrait play, gamepads, an on-screen stick as the primary control, a separate mobile scene, sound
changes, and a manifest for installing to the home screen (an improvement for later).
