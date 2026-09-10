# RANGE design

## Thesis

RANGE is a cinematic flight demo that is watched as much as flown. The image is the product; the
interface is instrumentation laid over it. At the second-hundredth use the player glances at
numbers and markers while looking at the aircraft and the coast. Qualities: quiet, precise,
military, lonely. Nothing on screen competes with the frame.

## Geometry

- Inset 34 px on desktop, 18 px under 700 px wide, 18 px plus the safe-area inset in touch mode.
  Text blocks anchor to the corners; the centre carries markers only.
- Spacing scale 4, 8, 14, 22, 32 on the desktop, 4, 7, 14, 22, 32 on touch. Control height 44 px
  minimum on touch; discs 56 and 72 px.
- One radius family: text has none; on touch, panels 15 px, caps 10 px, the throttle slot 13 px, the
  lever 5 px. Nothing on the touch layer is a circle. (Replaces `touch discs are circles, panels are
  square-cornered`, which the shipped code never matched: it had rounded squares at 18 and 22 px and
  a 20 px quadrant pill.)

## Material

- The HUD is text with a 1 px text shadow over the render, plus a faint top and bottom gradient on
  `#hud` so type reads against sky and ground.
- Panels (help, the intro button, the touch controls) are the dark tint `rgba(12,22,29)` at .38 to
  .97 depending on how much must be read through them, with a hairline `rgba(214,229,237,.35)`.
  Backdrop blur is used on the touch discs only, off under `prefers-reduced-transparency`, with an
  opaque-enough fallback where `backdrop-filter` is unsupported.

## Touch material

Reasons and measurements: `docs/specs/2026-09-10-range-touch-cockpit.md`.

The phone controls share one material: a matte near-black film (`rgba(8,12,15,.52)`) over a blur at
saturation 112 %, a soft-touch grain at five per cent, a dark cut edge
(`0 0 0 1px rgba(0,0,0,.45)`) rather than a bright hairline, a lit top rim and a shaded bottom edge
from one light above and slightly left, and a tight shadow, so the ground reads through
without going to frost. There is one panel on screen, the throttle quadrant, and three caps in a
column down the opposite edge. The panel and each cap are glass of their own: the panel a .52 film
over a 14 px blur, a cap a .52 film over an 8 px blur, and nothing sits on glass. (Section 11.3 of
the spec sets both at .48 and names .52 as the fallback if the matrix fails: it did, on the locked
legend at 4.56:1, so both moved together and the material stays one.) The throttle slot, the etched
ticks, the reheat hatch and the lever are painted on the panel and never given a blur of their own.
A cap deepens its film when the control is unavailable (58 per cent) and when it is pressed (62).
A cap presses by dropping 1 px, deepening the film, brightening the legend and
inverting its rim, because it is now below the surface under the same light. Radius family on touch:
panels 15 px, caps 10 px, the throttle slot
13 px, the lever 5 px, text none. Nothing on the touch layer is a circle. HUD text never sits on a
panel: it stands on the bare frame with a tight near-black halo (text-shadow `0 0 2px`, `0 1px 2px`,
`0 0 7px`), no band, no box. (The first build carried two gradient bands on `#hud`; Charles read
them as faded bars and they went, spec section 12.) The throttle panel's film is .72, a cap's .52:
the panel is the thing the lever sits on and reads as a fixture, the caps stay glass. Without `backdrop-filter` the panel film goes to .74 and a cap's to .66; under reduced
transparency to .88 and .80, with the blur off and the grain kept.

## Colour semantics

- Ink `#eceded`; secondary `#c4cfd6` and `#c7d1d6`; tertiary `#adbdc7` and `#8f9ea7`.
- Lit `#bdf6d4` over an `rgba(74,214,132,.95)` fringe and an `rgba(53,196,106,.50)` bloom, with an
  `rgba(53,196,106,.10)` wash on the cap behind it: a system that is live and powered. It is applied
  to the glyphs of a legend and never to a dot, and only to the gun while it is
  firing, the seeker while it is powered, and the reheat band while the lever is past the gate. One
  fill takes it, and one only: the throttle fill above the idle gate lights with the reheat hatch,
  ruled on 10 September, because the lever covers about eleven of the hatch's seventeen pixels at the
  top stop and the fill is then the only cue that the reheat is lit.
- Lock and threat `#f09676`: the seeker lock, target marks `#ec8874`, the stall warning. It means
  something is about to happen, and it is now the only meaning it carries, the reheat band having
  left the family. On the touch layer `#f09676` is never a text fill: it does not clear 4.5:1 on any
  film this design uses, so a locked legend is set in the lock core `#ffd9c6` with an `#f09676`
  fringe and bloom, the warm twin of the lit ramp.
- Advisory amber `#d8cbb0` for the instructor, weapon state and every reload countdown; the bomb
  diamond `#efc487` and the laser mark `#e8c78b` are the same family.
- A resting control is monochrome. A light on this interface is always a legend that glows.
- On the touch layer there is one ink, `#eceded`. There is no secondary or tertiary grey text:
  every grey step costs film alpha the bright-cloud backdrop cannot spare, so hierarchy is size,
  tracking and position. A control that is unavailable dims its cap, not its legend.

## Type

- Desktop: Arial or Helvetica; numerals in Bahnschrift or Segoe UI at weight 300. Labels 10 to
  12 px, upper case, letter-spacing .1 to .3 em. Numerals 26 to 30 px (21 px small).
- Touch: Barlow Condensed (SIL OFL 1.1, no Reserved Font Name), embedded as a woff2 subset at
  weights 400 and 500, with the tabular figures baked into `cmap` rather than left to a feature
  setting. Legends 8 to 14 px, upper case, letter-spacing .08 to .26 em, weight 500. Numerals
  15 to 22 px, weight 400. The hint is the one sentence-case line on the screen at 12 px weight 400:
  capitals are the aircraft, sentence case is the instructor.
- Tabular numerals everywhere a number changes.

## Motion

- No decorative motion. The stall warning flashes at .7 s steps and is still under reduced motion.
  Every other movement on screen comes from the simulation.

## States

- Lock: colour. Stall: colour and flash. Paused or lost: centred status text. Reloading: a countdown
  in the label. Press, touch only: the tint deepens and the label brightens.

## Copy

- British English, no em dashes, middle dots as separators. Hints are one sentence, imperative, dry.
- On touch the hint line is empty while the sortie is paused or the aircraft is lost: `#status`
  already carries `Tap to continue.` and `Tap to fly again.`, and printing either a second time on
  the hint line is two treatments for one fact on a 375 px screen. It is a deliberate departure from
  the two paused and crashed rows of the spec's copy table.

## Per-screen module order

- Intro: title, three lines, ENTER, small print.
- Touch intro: title, one line, ENTER, the skin switch, one placard line.
- Play: markers; then brand and objective (top left), location (top right), telemetry (bottom
  left), systems (bottom right), the hint above the telemetry.
- Touch: markers; the slider (left); the weapons column (right, vertically centred against the
  slider); brand alone (top left; the objective line is desktop only); PAUSE and RECENTRE (top
  right); airspeed, altitude and heading (bottom left); weapon state and the hint.

## Registry

| primitive | where | notes |
| --- | --- | --- |
| corner text block | `#telemetry`, `#flightstate`, `#systems` | label, numeral, unit |
| marker | `#markers` SVG groups | one job each |
| status text | `#status` | paused, lost; on touch the stop veil is `#hud`'s own background colour, so it dims the render under the HUD's text and under everything `#touch` draws rather than over them |
| plain text control | `#buttons button`, `#touch .text` | no border, no background |
| panel | `#quadrant` | touch only; a .72 film over a 14 px blur; radius 15 |
| switch cap | `#touchWeapons .key`, `body.touch #start` | touch only; 62 x 62, radius 10, its own .52 film over an 8 px blur; a column of three, SEEKER, BOMB, GUN; legend line and numeral line; states resting, lit, locked, dim, reloading (the amber numeral), pressed |
| gate legend | `#quadrant .gate` | touch only; 8 px, etched on the panel beside the slot; monochrome, because the string is the signal and never a lit legend |
| throttle quadrant | `#quadrant.panel` | touch only; a 26 px slot cut into a panel, with etched ticks, the MIL detent, the reheat hatch, the fill and a metal lever |
| HUD halo | `body.touch #hud` text-shadow | touch only; the tight dark halo every HUD text block stands on; no band, no box |
| lit legend | `.lit`, `.locked` | a legend that glows: core colour, 1 px fringe, soft bloom, a wash on the cap behind it; never a dot |
| toggle switch | `#skinSwitch` | touch only; a 60 x 26 slot with a 26 px `--metal` knob at one end and a legend either side; monochrome, the knob's position is the state |
