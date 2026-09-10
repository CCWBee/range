# RANGE design

## Thesis

RANGE is a cinematic flight demo that is watched as much as flown. The image is the product; the
interface is instrumentation laid over it. At the second-hundredth use the player glances at
numbers and markers while looking at the aircraft and the coast. Qualities: quiet, precise,
military, lonely. Nothing on screen competes with the frame.

## Geometry

- Inset 34 px on desktop, 18 px under 700 px wide, 18 px plus the safe-area inset in touch mode.
  Text blocks anchor to the corners; the centre carries markers only.
- Spacing scale 4, 8, 14, 22, 32. Control height 44 px minimum on touch; discs 56 and 72 px.
- One radius family: text has none, touch discs are circles, panels are square-cornered.

## Material

- The HUD is text with a 1 px text shadow over the render, plus a faint top and bottom gradient on
  `#hud` so type reads against sky and ground.
- Panels (help, the intro button, the touch controls) are the dark tint `rgba(12,22,29)` at .38 to
  .97 depending on how much must be read through them, with a hairline `rgba(214,229,237,.35)`.
  Backdrop blur is used on the touch discs only, off under `prefers-reduced-transparency`, with an
  opaque-enough fallback where `backdrop-filter` is unsupported.

## Colour semantics

- Ink `#eceded`; secondary `#c4cfd6` and `#c7d1d6`; tertiary `#adbdc7` and `#8f9ea7`.
- Advisory amber `#d8cbb0` for the instructor and weapon state lines; the bomb diamond `#efc487`
  and the laser mark `#e8c78b` are the same family.
- Lock and threat `#f09676`: heat lock, the FIRE button, target marks `#ec8874`, the stall warning
  `#ff9d72`. This is the only saturated colour and it means something is about to happen.
- A resting control is never coloured.

## Type

- Arial or Helvetica; numerals in Bahnschrift or Segoe UI at weight 300. Labels 10 to 12 px, upper
  case, letter-spacing .1 to .3 em. Numerals 26 to 30 px (21 px small). Tabular numerals.

## Motion

- No decorative motion. The stall warning flashes at .7 s steps and is still under reduced motion.
  Every other movement on screen comes from the simulation.

## States

- Lock: colour. Stall: colour and flash. Paused or lost: centred status text. Reloading: a countdown
  in the label. Press, touch only: the tint deepens and the label brightens.

## Copy

- British English, no em dashes, middle dots as separators. Hints are one sentence, imperative, dry.

## Per-screen module order

- Intro: title, three lines, ENTER, small print.
- Play: markers; then brand and objective (top left), location (top right), telemetry (bottom
  left), systems (bottom right), the hint above the telemetry.
- Touch: markers; the slider (left); the weapons (right); brand and objective (top left); PAUSE and
  RECENTRE (top right); airspeed, altitude and heading (bottom left); weapon state and the hint.

## Registry

| primitive | where | notes |
| --- | --- | --- |
| corner text block | `#telemetry`, `#flightstate`, `#systems` | label, numeral, unit |
| marker | `#markers` SVG groups | one job each |
| status text | `#status` | paused, lost |
| plain text control | `#buttons button`, `#touch .text` | no border, no background |
| translucent disc | `#touch .disc` | touch only; sizes 56 and 72 |
| slider | `#touch #throttle` | touch only |
