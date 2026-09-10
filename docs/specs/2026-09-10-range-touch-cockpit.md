# RANGE touch cockpit: the phone layer as instrument glass

10 September 2026. Supersedes section 7 of `2026-09-10-range-mobile.md` (layout and design) and
nothing else in it. Everything here lives under `body.touch` or in the touch-only elements, in
`index.html` lines 74 to 138, `src/touch.js`, one call site in `src/hud.js`, `tools/build.py`,
`tools/test_touch.mjs` and `docs/DESIGN.md`. The desktop HUD is out of scope.
Section 10, appended after the phone build, adds four things Charles asked for: the intro pared back
under `body.touch`, the skin select replaced by a two-position switch, a screen wake lock, and a
render scale that can recover, which extend the same scope into `src/main.js` and a new
`src/quality.js`.

## 0. What it is

The phone layer stops being seven translucent blobs floating on a pale sky and becomes an aircraft
panel with a canopy over it. Two instrument panels are let into the frame, the throttle quadrant at
the left edge and the weapons bezel at the bottom right, both cut from one material: a matte
near-black film at 56 per cent over a 14 px blur, a soft-touch grain, a dark cut edge rather than a
bright hairline, and one light from above and slightly left that lifts the top rim and shades the
bottom. Only those two panel bodies carry `backdrop-filter`; the switch caps, the throttle slot, the
etched ticks and the machined lever are painted on them, which is how a real panel is built and
which removes the glass on glass the shipped build has. Everything that is not a control is HUD text
on the canopy: brand and objective at the top, the hint and three readouts at the bottom, both under
a measured veil rather than a text shadow, so nothing is near-white type on bright cloud. Colour is a
ladder that pays rent: monochrome at rest, phosphor green on the glyphs of a legend whose system is
actually running, `#f09676` when something is about to happen, amber for a countdown. A light on this
interface is always a legend that glows, never a dot. Words go: one destination instead of two, no
`THR` readout, no `MAX` mark, no `RELOAD`, no `OFF`, three-letter readout legends, one clause a hint,
and four hints that say nothing at all once the player has flown before. The face is Barlow
Condensed, embedded as two woff2 subsets of 6.7 KB with the tabular figures baked into `cmap`, which
is what stops iOS silently rendering the whole layer in Arial at sixty per cent more width. That
silent fallback is the cause of every overflow in the current render, and two build asserts plus one
runtime check now catch it.

## 1. Thesis amendment

Four sections of `docs/DESIGN.md` change: Touch material, Colour semantics, Type and the Registry.
One clause outside them is noted at the end and left for Charles to strike.

### 1.1 Touch material

From:

> The phone controls share one material, the lens: a clear dark tint (`rgba(14,22,28,.34)`) with a
> lit top rim and a shaded bottom edge (inset shadows, one light from above), a hairline, a two-stop
> drop shadow, a faint top sheen, and a low blur (8 px, saturation 150 %) so the ground reads through
> without going to frost. It is not glassmorphism: no milky panels, no glass on glass, no colour
> except on FIRE. Without `backdrop-filter`, and under reduced transparency, the tint goes heavier and
> the blur goes. The throttle is a quadrant in the same material: etched ticks every ten per cent,
> MIL marked at 100, the reheat band tinted above it, and a pale lever with a grip line. The keys are
> rounded squares of one family (GUN larger, the rest equal) with a small-caps name line and a
> numeral line, and press by deepening the tint and shrinking four per cent.

To:

> The phone controls share one material, the panel: a matte near-black film (`rgba(8,12,15,.56)`)
> over a 14 px blur at saturation 112 %, a soft-touch grain at five per cent, a dark cut edge
> (`0 0 0 1px rgba(0,0,0,.45)`) rather than a bright hairline, a lit top rim and a shaded bottom edge
> from one light above and slightly left, and a tight two-stop shadow, so the ground reads through
> without going to frost. There are exactly two panels on screen, the throttle quadrant and the
> weapons bezel, and only they carry `backdrop-filter`. Switch caps, the throttle slot, the etched
> ticks, the reheat hatch and the lever are painted on a panel and never given a blur of their own.
> A cap adds film, not blur: 22 per cent resting, 34 per cent when the control is unavailable, 40 per
> cent pressed. A cap presses by dropping 1 px, deepening the film, brightening the legend and
> inverting its rim, because it is now below the bezel under the same light. Radius family on touch:
> panels 15 px, caps 8 px set concentric inside the panel's 7 px bezel padding, the throttle slot
> 13 px, the lever 5 px, text none. Nothing on the touch layer is a circle. HUD text never sits on a
> panel: it sits on the canopy, two full-bleed gradient bands on `#hud` (top `rgba(6,12,16,.46)` held
> to 56 px, bottom `rgba(6,12,16,.48)` held to 72 px, both above the safe-area inset) with no edge and
> no rule. Without `backdrop-filter` the panel film goes to .74; under reduced transparency to .88
> with the blur off and the grain kept.

Reason: the clear .34 tint is the defect. Sampled from the staged frames with the HUD's own ink and
marker strokes excluded, the backdrop behind the touch controls reaches L 0.44 at the 95th percentile
that `tools/contrast.py` judges on. The current film composites that to sRGB (115,124,132), L 0.198,
which puts `#eceded` at 3.61:1 and every secondary grey below 3:1.
A .56 film of `rgba(8,12,15)` gives 6.5:1 at that percentile and still 4.8:1 against the brightest
genuine sky pixel in any frame. Contrast is bought with tint alpha alone, as the brief requires: no
`brightness()` in the filter, because a filter function that a browser cannot parse drops the whole
filter list while the `@supports` test still passes, which would leave the film carrying contrast it
was never specified to carry. Restricting `backdrop-filter` to two panel bodies removes glass on
glass, which this section already forbids, and cuts the blur layers from seven to two. The dark outer
ring matters more than it sounds: over a bright sky a light hairline outlines a sticker, while a dark
cut edge reads as a panel let into a surface, and the inset top rim then becomes the visible lit edge,
which is also the only edge the panel has at night.

### 1.2 Colour semantics

From:

> - Advisory amber `#d8cbb0` for the instructor and weapon state lines; the bomb diamond `#efc487`
>   and the laser mark `#e8c78b` are the same family.
> - Lock and threat `#f09676`: heat lock, the FIRE button, target marks `#ec8874`, the stall warning
>   `#ff9d72`. This is the only saturated colour and it means something is about to happen.
> - A resting control is never coloured.

To:

> - Lit `#bdf6d4` over an `rgba(74,214,132,.95)` fringe and an `rgba(53,196,106,.50)` bloom, with an
>   `rgba(53,196,106,.10)` wash on the cap behind it: a system that is live and powered. It is applied
>   to the glyphs of a legend, never to a fill and never to a dot, and only to the gun while it is
>   firing, the seeker while it is powered, and the reheat band while the lever is past the gate.
> - Lock and threat `#f09676`: the seeker lock, target marks `#ec8874`, the stall warning. It means
>   something is about to happen, and it is now the only meaning it carries, the reheat band having
>   left the family. On the touch layer `#f09676` is never a text fill: it does not clear 4.5:1 on any
>   film this design uses, so a locked legend is set in the lock core `#ffd9c6` with an `#f09676`
>   fringe and bloom, the warm twin of the lit ramp.
> - Advisory amber `#d8cbb0` for the instructor, weapon state and every reload countdown; the bomb
>   diamond `#efc487` and the laser mark `#e8c78b` are the same family.
> - A resting control is monochrome. A light on this interface is always a legend that glows.
> - On the touch layer there is one ink, `#eceded`. There is no secondary or tertiary grey text:
>   every grey step costs film alpha the bright-cloud backdrop cannot spare, so hierarchy is size,
>   tracking and position. A control that is unavailable dims its cap, not its legend.

Reason: the reference's defining feature is transilluminated legends, and there was no vocabulary
for "this system is live" short of borrowing the lock colour, which would have blunted it. Green is
confined to genuinely live systems, so it is off through most of a sortie and stays rare. The shipped
build already spent `#f09676` twice, on the lock and on `#throttleReheat`; moving reheat to the lit
green gives the lock colour back its single meaning. Dropping the grey ladder removes the whole class
of marginal contrast failures: `#adbdc7` measures 3.95:1 on the panel at the sampled 95th percentile
and would fail the gate in the reloading cell, and no exemption has to be argued for in
`tools/contrast.py`.

### 1.3 Type

From:

> - Arial or Helvetica; numerals in Bahnschrift or Segoe UI at weight 300. Labels 10 to 12 px, upper
>   case, letter-spacing .1 to .3 em. Numerals 26 to 30 px (21 px small). Tabular numerals.

To:

> - Desktop: Arial or Helvetica; numerals in Bahnschrift or Segoe UI at weight 300. Labels 10 to
>   12 px, upper case, letter-spacing .1 to .3 em. Numerals 26 to 30 px (21 px small).
> - Touch: Barlow Condensed (SIL OFL 1.1, no Reserved Font Name), embedded as a woff2 subset at
>   weights 400 and 500, with the tabular figures baked into `cmap` rather than left to a feature
>   setting. Legends 8 to 14 px, upper case, letter-spacing .08 to .26 em, weight 500. Numerals
>   15 to 22 px, weight 400. The hint is the one sentence-case line on the screen at 12 px weight 400:
>   capitals are the aircraft, sentence case is the instructor.
> - Tabular numerals everywhere a number changes.

Reason: Bahnschrift and Segoe UI exist on neither iOS nor macOS, so the phone has been rendering the
whole layer in Arial and the Windows screenshots have never shown what the player sees. Every measured
overflow is an Arial-width problem: `PAVEWAY`, `LOCKING`, `WARMING` and `RELOAD 15` are all about
sixty per cent wider in Arial than in the condensed face this document assumes. A face that is only
named is not a design decision; it has to ship in the bundle. Barlow Condensed's default figures are
proportional (Regular advances 256 to 444 per 1000 em, verified with fontTools 4.61), so tabular
figures are not decoration here, and baking them into `cmap` means a dropped `font-feature-settings`
cannot make a readout twitch.

### 1.4 Registry

From:

> | lens key | `#touch .key.lens` | touch only; 62 px, GUN 78 px; name line and numeral line |
> | throttle quadrant | `#touch #quadrant.lens` | touch only; ticks, MIL, reheat band, lever |

To:

> | panel | `#quadrant`, `#touchWeapons` | touch only; the one material; the only elements carrying `backdrop-filter`; radius 15, bezel padding 7 |
> | switch cap | `#touch .key` on a panel | touch only; 64 x 56, GUN 64 x 70, radius 8; legend line and numeral line; states resting, lit, locked, dim, pressed |
> | gate legend | `#quadrant .gate` | touch only; 8 px, etched on the panel beside the slot; lights only when its own gate is the live state |
> | throttle quadrant | `#quadrant.panel` | touch only; a 26 px slot cut into a panel, with etched ticks, the MIL detent, the reheat hatch, the fill and a metal lever |
> | canopy band | `body.touch #hud` | touch only; two full-bleed gradients; carries every HUD text block; no edge, no rule |
> | lit legend | `.lit`, `.locked` | a legend that glows: core colour, 1 px fringe, soft bloom, a wash on the cap behind it; never a dot |

Reason: the lens primitive is replaced by two, the panel that carries the material and the cap that
sits on it, and both the gate legend and the lit legend are genuinely new primitives used more than
once, so they are registered rather than minted quietly. The registry's `plain text control` row is
unchanged and still true: RECENTRE and PAUSE stay plain legends with no border and no background, on
the canopy band, which is also why the top right adds no third panel.

### 1.5 One clause outside the four sections

Geometry's `One radius family: text has none, touch discs are circles, panels are square-cornered`
was already false before this spec: the shipped code has rounded squares at 18 and 22 px and a 20 px
quadrant pill. The radius family above supersedes it. Striking the clause is a one-line edit and is
left to Charles, since the brief scopes the amendment to four sections.

## 2. Tokens

### 2.1 Colour

| token | value | meaning |
| --- | --- | --- |
| `--panel-tint` | `rgba(8,12,15,.56)` | The panel face. Near-black at 56 per cent: the matte A-10 panel and the smoked glass are one film. |
| `--panel-backdrop` | `blur(14px) saturate(112%)` | The bible's panel range is 10 to 20 px. No `brightness()`: contrast is the film's job. |
| `--cap-film` | `rgba(6,10,13,.22)` | A resting cap adds film, never blur. Combined with the panel, 65.7 per cent. |
| `--cap-film-dim` | `rgba(3,6,8,.34)` | The control is unavailable. Combined 71.0 per cent. |
| `--cap-film-press` | `rgba(3,6,8,.40)` | Pressed. Combined 73.6 per cent. The cap has gone below the bezel and takes less light. |
| `--slot-tint` | `rgba(3,5,7,.30)` | The throttle slot is a cut, so it is deeper than the face and its rim inverts. |
| `--veil-top` | `rgba(6,12,16,.46)` | The canopy above the coaming. Carries brand, objective, RECENTRE and PAUSE. |
| `--veil-bottom` | `rgba(6,12,16,.48)` | The canopy below. Carries the hint and the three readouts. |
| `--ink` | `#eceded` | The one ink. Every legend, every numeral, every readout. |
| `--advisory` | `#d8cbb0` | A countdown numeral, and the aircraft's own notice on the hint line. |
| `--lit-core` | `#bdf6d4` | The pale mint core of a transilluminated NVIS legend: this system is running. |
| `--lit-fringe` | `rgba(74,214,132,.95)` | The saturated fringe 1 px out from the glyph. Core to fringe is what reads as lit from behind. |
| `--lit-bloom` | `rgba(53,196,106,.50)` | The 6 px bloom, third stop of the phosphor ramp. |
| `--lit-wash` | `rgba(53,196,106,.10)` | A radial wash on the cap behind a lit legend: the lamp is behind the panel. |
| `--lock` | `#f09676` | Unchanged. Something is about to happen. Fringe and bloom only, never a fill on this layer. |
| `--lock-core` | `#ffd9c6` | The core of a locked legend and of the stall notice: the warm twin of `--lit-core`. |
| `--lock-wash` | `rgba(240,150,118,.15)` | The locked cap's wash, matching `--lit-wash`. |
| `--rim-top` | `rgba(233,240,242,.30)` | The one light, from above and slightly left. |
| `--rim-left` | `rgba(233,240,242,.10)` | Same light on the left edge. |
| `--rim-bottom` | `rgba(0,0,0,.42)` | The shaded bottom edge. Every cut thing inverts this pair. |
| `--cut` | `rgba(0,0,0,.45)` | The dark outer ring that replaces the bright hairline. |
| `--etch-dark` | `rgba(0,0,0,.50)` | The groove of an etched tick. |
| `--etch-light` | `rgba(233,240,242,.18)` | The lit lip under the groove. Two lines read as machined, one reads as a printed decal. |
| `--metal` | `#dde4e7 0, #b4bec3 38%, #8a949a 62%, #59615f 100%` | Cool machined aluminium under the one light. The lever is the only bright object on the layer. |

Measured contrast, film composited over the sampled backdrop in sRGB, then WCAG. The gate figure is
against L 0.44, the worst 95th percentile behind any control in any staged frame; the second figure
is against the brightest genuine sky pixel found anywhere, L 0.73, which `contrast.py` will never
judge on because a single specular pixel does not decide a box.

| ink on surface | at the gate (L 0.44) | worst pixel (L 0.73) |
| --- | --- | --- |
| `--ink` on the panel | 6.49:1 | 4.77:1 |
| `--ink` on a resting cap | 8.34:1 | 6.51:1 |
| `--lit-core` on a resting cap | 8.05:1 | 6.29:1 |
| `--lock-core` on a resting cap | 7.45:1 | 5.82:1 |
| `--advisory` on a dim cap | 6.97:1 | 5.67:1 |
| `--ink` on a pressed cap | 10.19:1 | 8.46:1 |
| `--lock` as a text fill on the panel | 3.38:1 | 2.48:1 |

The last row is why `#f09676` never fills text here, and why the lock core exists.

The canopy bands are judged against their own regions, which are not the same brightness. The worst
95th percentile behind the top band across the five staged frames is L 0.378 and behind the bottom
band L 0.200, because the bottom of the frame is always sea or ground. At `--veil-top` the ink
measures 5.50:1; at `--veil-bottom` the ink measures 8.09:1, the advisory amber 5.91:1 and the lock
core 7.23:1. Both bands are lighter than any of the three proposals asked for, and they are lighter
because the number was sampled rather than assumed.

Read-through at night, which is where a heavy film usually dies: over the landing stage the backdrop
behind the weapons panel measures L 0.009 at the 95th percentile. The .56 film transmits 44 per cent,
so the panel base sits at L 0.006 and a runway edge light at sRGB 190 behind it composites to L 0.101,
an eighteenfold luminance step. The ground still reads through. At night the dark outer ring
disappears into the image and the lit top rim is what defines the panel edge, which is correct: that
is what an unlit panel looks like from inside a cockpit.

### 2.2 Type

Face: Barlow Condensed. Widths below are measured from the shipped subsets, digits at the tabular
advance (434/1000 Regular, 457/1000 Medium), tracking included.

| role | face | size | weight | tracking | note |
| --- | --- | --- | --- | --- | --- |
| brand | Barlow Condensed | 14px | 500 | .26em | RANGE measures 50.1 px. Tracking up from .22em because the condensed face is narrower and the mark should keep its optical width. |
| objective | Barlow Condensed | 10px | 500 | .10em | Upper case, on the canopy. Longest string 136.9 px. |
| top control legend | Barlow Condensed | 9px | 500 | .14em | RECENTRE 42.4 px, PAUSE 26.3 px. |
| cap legend | Barlow Condensed | 10px | 500 | .14em | The Warthog legend register. Worst case WARMING at 42.2 px in 54 px of usable cap. |
| cap numeral | Barlow Condensed | 17px | 400 | .02em | Tabular. 150 measures 23.2 px. |
| gate legend | Barlow Condensed | 8px | 500 | .08em | MIL 11.2 px, IDLE 14.8 px, BRAKE 21.1 px in a 24 px column. |
| throttle numeral | Barlow Condensed | 15px | 400 | .02em | Transient. 112 measures 20.4 px. |
| readout legend | Barlow Condensed | 9px | 500 | .18em | SPEED 28.0 px, ALT 16.4 px, HDG 17.5 px, KT 11.4 px, FT 10.9 px. |
| readout numeral | Barlow Condensed | 22px | 400 | 0 | Tabular. 3276 measures 38.2 px against 53.4 px in Arial. |
| hint | Barlow Condensed | 12px | 400 | .01em | The one sentence case on the screen. Longest hint 162.4 px in a 300 px column. |
| notice | Barlow Condensed | 10px | 500 | .14em | The aircraft speaking. Longest 164.4 px. |
| status | Barlow Condensed | 22px / 12px | 400 | .10em / .02em | AIRCRAFT LOST measures 140.5 px. |
| rotate veil | Barlow Condensed | 13px | 500 | .18em | TURN THE PHONE SIDEWAYS measures 179.1 px. |
| intro title | Barlow Condensed | clamp(40px,10vh,72px) | 400 | .22em | Up from .17em, same reason as the brand. |
| intro prose | Barlow Condensed | 14px | 400 | .01em | Unchanged copy. |
| ENTER AIRCRAFT | Barlow Condensed | 13px | 500 | .16em | 103.9 px in a cap sized to its content. |

### 2.3 The material, state by state

```css
/* Resting. The gradient is the one light, not a decorative sheen: five per cent lift over the top
   third, ten per cent shade at the bottom. Elevation is tight because a panel sits in the aircraft,
   it does not float above it. */
.panel{position:absolute;border:0;border-radius:15px;
 background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0) 34%,rgba(0,0,0,.10)),var(--panel-tint);
 box-shadow:inset 0 1px 0 var(--rim-top),inset 1px 0 0 var(--rim-left),inset 0 -1px 0 var(--rim-bottom),
  0 0 0 1px var(--cut),0 1px 1px rgba(0,0,0,.50),0 8px 20px rgba(0,0,0,.36);
 transform:translateZ(0)}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
 .panel{-webkit-backdrop-filter:var(--panel-backdrop);backdrop-filter:var(--panel-backdrop)}}

/* Soft-touch grain: a 96 px stitched tile, static, about 400 bytes, and the one detail that makes
   the surface matte rather than plastic. A CSS background url() is img-src, which the CSP allows. */
.panel::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
 opacity:.05;mix-blend-mode:overlay;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='96' height='96' filter='url(%23n)'/%3E%3C/svg%3E")}

/* A switch cap: film, no blur. The 0 1px 0 rgba(233,240,242,.07) outer shadow is the bezel catching
   light just below the cap, which is what makes the cap sit IN the panel rather than on it. */
.key{border:0;border-radius:8px;padding:0;color:var(--ink);
 background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,0) 40%,rgba(0,0,0,.12)),var(--cap-film);
 box-shadow:inset 0 1px 0 rgba(233,240,242,.26),inset 1px 0 0 rgba(233,240,242,.08),
  inset 0 -1px 0 rgba(0,0,0,.50),0 1px 0 rgba(233,240,242,.07),0 2px 4px rgba(0,0,0,.45);
 transition:transform .07s ease,background-color .07s ease,box-shadow .07s ease}

/* Lit: the three text-shadow stops are the NVIS ramp read off the reference, and the radial wash is
   the lamp behind the panel warming the face around the legend. */
.key.lit{background-image:radial-gradient(120% 92% at 50% 64%,var(--lit-wash),transparent 68%),
 linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,0) 40%,rgba(0,0,0,.12))}
.key.lit .name{color:var(--lit-core);
 text-shadow:0 0 1px var(--lit-fringe),0 0 6px var(--lit-bloom),0 0 14px rgba(53,196,106,.26)}
.key.lit.warming .name{text-shadow:0 0 1px var(--lit-fringe),0 1px 2px rgba(0,0,0,.55)}

/* Pressed: four simultaneous signals and not one of them is colour. The cap drops 1 px, the film
   deepens 18 points, the legend brightens, and the rim inverts because the cap is now below the
   bezel under the same light. scale(.985), not .96: a four per cent shrink on a 70 px cap is a 3 px
   jump that reads as a web button. */
.key.pressed{background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,0) 45%,rgba(255,255,255,.04)),var(--cap-film-press);
 box-shadow:inset 0 2px 3px rgba(0,0,0,.55),inset 0 -1px 0 rgba(233,240,242,.14);
 transform:translateY(1px) scale(.985)}
.key.pressed .name{color:#f6fafb}

/* Dim: the cap darkens, the legend does not. Unavailable is a property of the control, not of the
   word on it, and the ink stays at 9.5:1. The countdown numeral is the amber. */
.key.dim{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0) 40%,rgba(0,0,0,.14)),var(--cap-film-dim);
 box-shadow:inset 0 1px 0 rgba(233,240,242,.16),inset 0 -1px 0 rgba(0,0,0,.50),0 1px 0 rgba(233,240,242,.05)}
.key.dim .value{color:var(--advisory)}
.key.dim.pressed{background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,0) 45%,rgba(255,255,255,.04)),var(--cap-film-press)}

/* Locked: the same grammar as the green, a different hue, so the ladder is legible. The outer glow
   is the cap itself lighting, which is the reference's lit switch tip; the top rim warms because the
   lamp is inside the cap. No flash: navigator.vibrate(8) already fires on lock and DESIGN.md
   reserves flashing for the stall. */
.key.locked{background-image:radial-gradient(120% 92% at 50% 64%,var(--lock-wash),transparent 68%),
 linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,0) 40%,rgba(0,0,0,.12));
 box-shadow:inset 0 1px 0 rgba(255,214,196,.34),inset 1px 0 0 rgba(233,240,242,.08),
  inset 0 -1px 0 rgba(0,0,0,.50),0 2px 4px rgba(0,0,0,.45),0 0 12px rgba(240,150,118,.20)}
.key.locked .name{color:var(--lock-core);
 text-shadow:0 0 1px rgba(240,150,118,.95),0 0 7px rgba(240,150,118,.55),0 0 16px rgba(240,150,118,.28)}
```

`.lit` and `.locked` differ in hue, so neither may ever be the only channel: the legend string always
changes with the state as well (SEEKER, WARMING, SEARCH, LOCKING, FIRE). That rule is binding and it
is asserted in section 7.

### 2.4 Geometry

Spacing scale 4, 7, 14, 22, 32. One radius family: panels 15, caps 8 (concentric inside the 7 px
bezel), slot 13, lever 5, text none.

| element | value |
| --- | --- |
| screen inset | `max(18px, calc(env(safe-area-inset-left) + 6px))` at the left, the same with `-right` at the right, so a notch never adds to a full 18 px margin |
| throttle panel | 70 x 46vh, min 176, max 248; radius 15; the whole panel is the pointer target, so the 44 px minimum is met by 70 |
| throttle internals | pad 6, slot 26 wide, gutter 8, legend column 24, pad 6 |
| throttle slot | `left 6; top 8; bottom 8; width 26`, radius 13; hosts the ticks, the hatch, the fill, the detent and the lever |
| throttle lever | 36 x 22 (overhangs the slot by 5 px each side, 3 px clear of the legend column), radius 5, `margin-bottom:-11px` |
| weapons panel | 149 x 147, padding 7, radius 15 |
| GUN cap | 64 x 70, `right 7; bottom 7` |
| BOMB cap | 64 x 56, `right 78; bottom 7` |
| SEEKER cap | 64 x 56, `right 7; bottom 84` |
| cap padding | 5 px each side, so a legend has 54 px of usable width |
| top controls | plain legends, `padding:14px 12px; min-height:44px`, gap 6 |
| brand | top `calc(14px + env(safe-area-inset-top))` |
| objective | top `calc(38px + env(safe-area-inset-top))` |
| readouts | left `calc(max(18px, env(safe-area-inset-left) + 6px) + 88px)`, the throttle panel's own left edge plus its 70 px width plus 18 px, so the two cannot drift apart on a notch; bottom `calc(16px + env(safe-area-inset-bottom))` |
| hint | the readouts' left, bottom `calc(52px + env(safe-area-inset-bottom))`, `max-width:min(46vw,300px)` |
| hairline | expressed as a dark outer ring plus a light inset rim, never as a `border` property |

Chrome at 667 x 375, the smallest verification size: 18 + 70 on the left and 18 + 149 on the right,
so 255 px of 667, 38.2 per cent of the width. As area it is 70 x 176 plus 149 x 147, 34,223 px of
250,125, 13.7 per cent of the frame, and both panels are translucent over moving ground. The
untouched image is a 430 px column down the centre at full height. Vertically the weapons panel is
147 px of 375, 39 per cent, and it is at the right edge; the clear band above it runs the full width.
That is the price, and it is stated so it can be argued with.

## 3. Per-element treatment

### 3.1 The canopy bands (`body.touch #hud`)

```css
body.touch #hud{background:
 linear-gradient(180deg,var(--veil-top) 0,var(--veil-top) calc(56px + env(safe-area-inset-top)),rgba(6,12,16,0) calc(84px + env(safe-area-inset-top))),
 linear-gradient(0deg,var(--veil-bottom) 0,var(--veil-bottom) calc(72px + env(safe-area-inset-bottom)),rgba(6,12,16,0) calc(104px + env(safe-area-inset-bottom)));
 text-shadow:0 1px 3px rgba(0,0,0,.85)}
```

States: one. Reason: this is the structural answer to white text on a light background, and it
replaces the shipped `.43/.21` gradient rather than adding an element. It holds its alpha flat for
the full depth the text occupies and only then decays, because a band that decays through its own
text is the failure the instrument proposal measured in its own render. Both stops carry the
safe-area inset, or the home indicator pushes the hint out of the held region on a real phone while
headless Chrome, where the inset is zero, passes it. It is a gradient across the whole width, so it
adds no boundary and no box. Paint order is structural: `#hud` is at `index.html:144` and `#touch` at
`:196`, both `position:absolute` with `z-index:auto`, so anything added to `#touch` paints over
`#brand`, `#objective`, `#telemetry` and `#hint`. The bands therefore live in the `#hud` tree, which
is `pointer-events:none`, and the two panels are laid out so they never overlap a text block.

### 3.2 Brand (`#brand`)

RANGE, 14 px weight 500 at .26em, `--ink`, on the top band. One state; hidden on the intro and in
portrait. Reason: it is identity, not instrument, so it belongs on the glass rather than on a panel.

### 3.3 Objective (`#objective`)

One destination at a time, 10 px weight 500 at .10em, `--ink`, directly under the brand.

`src/hud.js:112` becomes `updateObjective(flight, effects, options)` and the call at `:101` passes
`options`, which already carries `touch: true` from `hudOptions()` in `src/main.js:256`. The desktop
branch is the existing string, unchanged. The touch branch names one leg:

- on the ground before departure: `RUNWAY 08 · DEPARTURE`
- outbound: `COASTAL RANGE · 3.0 KM · 301°`
- inside the range: `COASTAL RANGE · HITS 2 / 7`
- returning: `AIRFIELD · 2.4 KM · 222°`
- down: `SORTIE COMPLETE · 5 / 7`

The leg boundaries must be the same constants the hint uses, or the two lines disagree at the
boundary, which is worse than either being wrong alone. `src/touch.js` already imports `RANGE_CENTRE`
from `src/hud.js`, so the constants go the same way, not the other: `hud.js` exports
`RANGE_LEG_RADIUS = 2600` and `returnLeg = (flight, effects) => !!effects && (effects.rangeHit > 0 ||
flight.bombs === 0)`, and `touch.hint()` imports both. A cycle in the other direction is not possible.

Reason: the shipped line is 46 glyphs of near-white on pale sky and names two places when only one is
the task. Naming the live leg cuts it to about 28 and removes the hint's need to say where the range
is. The score appears only where it can change and in the landed summary. The bearing stays absolute,
with the degree sign, because HEADING is kept and an absolute bearing is completable; cutting HEADING
to justify a relative turn would contradict section 7 of the mobile spec, which names heading among
the HUD elements the touch layer keeps.

### 3.4 RECENTRE and PAUSE (`#touchTop`, `#recentre`, `#pauseTouch`)

Plain legends, 9 px weight 500 at .14em, `--ink`, no border and no background, `padding:14px 12px`
with `min-height:44px`. States: resting, and pressed which brightens to `#f6fafb`; never lit, never
coloured. Reason: the registry defines them as plain text controls and the mobile spec names them as
plain small-caps text. The top band fixes their contrast for nothing, where a panel would add a third
dark box to a screen whose fourth banned tell is a wall of them. They measure 5.50:1 on the band at
the worst sampled top-of-frame percentile, against `#c4cfd6` on bare sky today, which is the worst
contrast anywhere in the current render.

### 3.5 Throttle quadrant (`#quadrant`)

A 70 px panel with a 26 px slot cut into it at the left and a 24 px legend column at the right.

```css
#quadrant{left:max(18px,calc(env(safe-area-inset-left) + 6px));top:50%;transform:translateY(-50%);
 width:70px;height:46vh;min-height:176px;max-height:248px;touch-action:none}
#throttleSlot{position:absolute;left:6px;top:8px;bottom:8px;width:26px;border-radius:13px;
 background:var(--slot-tint);
 box-shadow:inset 0 2px 3px rgba(0,0,0,.55),inset 1px 0 2px rgba(0,0,0,.35),inset 0 -1px 0 rgba(233,240,242,.14)}
```

The slot's shadow is at the top and its lit line at the bottom: the exact inverse of a cap, under the
same light. It is a child of the panel, so it inherits the blurred backdrop without a second
`backdrop-filter`.

The ticks are two lines each, a dark groove with a lit lip under it, so the scale reads as machined
into the face rather than printed on it:

```css
#throttleTicks{position:absolute;inset:0;border-radius:inherit;
 background:repeating-linear-gradient(to top,var(--etch-dark) 0 1px,var(--etch-light) 1px 2px,transparent 2px 8.929%)}
#throttleTick{position:absolute;left:-3px;right:-3px;bottom:89.29%;height:2px;
 background:linear-gradient(180deg,rgba(233,240,242,.62),rgba(0,0,0,.55))}
```

8.929 per cent is ten per cent of the 0 to 1.12 range, unchanged. The MIL detent overhangs the slot by
3 px each side and is 2 px and brighter, because a gate outranks a graduation.

The reheat band is the top 10.71 per cent of the slot, a diagonal hatch that is a permanent marking
in monochrome and lights green only while the lever is past the gate:

```css
#throttleReheat{position:absolute;left:0;right:0;top:0;height:10.71%;border-radius:13px 13px 0 0;
 background:repeating-linear-gradient(135deg,rgba(233,240,242,.16) 0 2px,rgba(233,240,242,0) 2px 5px)}
#quadrant.reheat #throttleReheat{background:
 radial-gradient(120% 100% at 50% 100%,var(--lit-wash),transparent 70%),
 repeating-linear-gradient(135deg,rgba(120,240,170,.45) 0 2px,rgba(120,240,170,0) 2px 5px);
 box-shadow:0 0 10px rgba(53,196,106,.30)}
#throttleFill{background:rgba(233,240,242,.10)}
#quadrant.reheat #throttleFill{background:rgba(53,196,106,.16)}
```

The lever is the only bright object on the layer:

```css
#throttleLever{position:absolute;left:-5px;right:-5px;height:22px;bottom:0;margin-bottom:-11px;
 border-radius:5px;background:linear-gradient(180deg,var(--metal));
 box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.80),
  inset 0 -1px 0 rgba(0,0,0,.60),0 2px 5px rgba(0,0,0,.55)}
#throttleLever::after{content:"";position:absolute;left:8px;right:8px;top:7px;height:8px;
 background:repeating-linear-gradient(90deg,rgba(18,24,28,.40) 0 1px,rgba(255,255,255,.22) 1px 2px,transparent 2px 4px)}
```

Four-stop vertical gradient reading top-lit and bottom-dark, a hard specular at the very top edge, a
1 px dark contour so it does not bleed into the slot, and knurling as alternating 1 px grooves rather
than one grey line. Radius 5, not 12: a machined lever is not a pill.

Two implementation notes that the shipped code will otherwise break on. `setThrottle` at
`src/touch.js:320` measures `el.track.getBoundingClientRect()` where `track = $('quadrant')`; with the
ticks, the fill and the lever now inside a slot padded 8 px top and bottom, that measurement must move
to `#throttleSlot`, or the lever lags the finger by up to 8 px at each end. The pointer listeners and
the asserted `quadrant` id stay where they are. Second, the `pointerdown` and `pointerup` handlers in
`bind()` toggle `#quadrant.sliding`, which is what reveals the transient numeral below.

States: resting; sliding (the numeral appears); reheat (the hatch lights and the fill goes green).
The panel itself never changes.

Reason: a quadrant is a panel with a slot in it, not a pill. Widening it to 70 px is what lets the
gate legends move onto the material, which is the fix for MIL and MAX being unreadable white on sky
today.

### 3.6 Gate legends and the transient throttle numeral

Three elements in the 24 px legend column, right aligned, 8 px weight 500 at .08em, `--ink`:

- `MIL` at 89.29 per cent, an etched, permanently unlit detent marking.
- The bottom gate, `#throttleLabel` repurposed at 0 per cent, reading `IDLE`, and reading `BRAKE`
  when the wheel brake is actually applied (on the ground, gear down, throttle at zero). It stays
  monochrome: the string change is the signal, and lighting it green would put a lit legend on a
  resting aircraft on the first frame of every sortie, which is the rung nearest DESIGN.md's line
  that a resting control is never coloured.
- `#throttleValue`, a new span at the top of the column where `MAX` used to be, 15 px weight 400
  tabular, `opacity:0` and `transition:opacity .12s`, going to 1 while `#quadrant.sliding`. It shows
  the commanded power as a bare number, 0 to 112.

`MAX` is deleted. The top of the track already labels the top of the track, and the reheat hatch sits
above the gate saying the same thing in a marking; two treatments for one fact.

Two writes, not one. `renderThrottle()` keeps its numeral write but sends it to `#throttleValue`
(`Math.round(this.throttle * 100)`, no `THR` prefix), so the constructor's `el` map gains
`throttleValue` alongside `throttleLabel`, which is kept and repurposed rather than deleted: the
constructor fetches it and removing the element would throw. The `IDLE` to `BRAKE` swap cannot live in
`renderThrottle()`, which takes no arguments and is called from `enter()` and from the `setThrottle`
closure with no flight reference; it goes in `render(flight, effects, engagement)`, beside the cap
classes, using the same predicate `throttleCommands()` already computes.

### 3.7 Weapons panel (`#touchWeapons`)

149 x 147, padding 7, radius 15, the same material as the quadrant, `pointer-events:none` on the
bezel with the caps taking their own. One state.

Class names, so the CSS above names elements that exist. A cap's two lines keep the shipped
`<span class="name">` and `<span class="value">`, and every rule here is written against `.name` and
`.value`; the constructor's `querySelector('.name')` and `value()` lookups at `src/touch.js:140-145`
are unchanged. In the quadrant, `<span class="mark mil">` becomes `<span class="gate mil">`, the
`mark max` span is deleted with the MAX legend, `#throttleLabel` keeps its id and takes
`class="gate idle"`, and `#throttleValue` is the new span. `.mark` then has no users and goes. Reason: three separate translucent keys floating on
the image are three cards; three caps set into one bezel are one dominant element, which is what the
banned wall-of-boxes tell asks for. The bezel showing to the left of GUN's upper half is deliberate:
it is what stops the cluster reading as a grid.

### 3.8 GUN cap (`#gunButton`)

64 x 70, largest and lowest right because it is held rather than tapped and the thumb rests there.
Legend `GUN`; numeral line the rounds remaining.

States: resting; pressed; lit while `this.input.gunHeld && flight.rounds > 0`, which is a genuinely
live system, so the legend takes the phosphor ramp and the cap the green wash; dim with an amber
countdown while reloading. A held empty gun is pressed and dim at once, and pressed wins the film
(.40) while dim keeps the amber numeral: press is geometry plus film, lit is colour, dim is the cap.

### 3.9 BOMB cap (`#bombButton`)

64 x 56, left of GUN. Legend `BOMB`; numeral line the Paveways remaining. States: resting; pressed;
dim on the ground or with none left; amber countdown while reloading. Never lit: it has no on state.

The legend reads BOMB while the munition is still called a Paveway everywhere it is named as a
munition, which is the release notice `PAVEWAY AWAY · LASER ON`, the desktop weapons line and the
mobile spec's own §5. That is the rule, written down so the next contributor does not "fix" one of
them: a cap carries the legend of its function, an inventory line carries the name of the store. The
seeker cap is the existing precedent, reading SEEKER while its missile is an AIM-9. It also keeps
`tools/test_touch.mjs:130` green, keeps the desktop untouched, and matches section 7 of the mobile
spec, which already names the key BOMB.

### 3.10 SEEKER cap (`#seekerButton`)

64 x 56, above GUN, the same width so the column aligns. The legend line carries the state and the
numeral line always carries a number.

`seekerLabel()` is untouched, so its five strings and its test stay exactly as they are. A second
pure function beside it does the mapping, so the split is testable rather than hidden in `render()`:

```js
// The two lines of the seeker cap. The vocabulary is seekerLabel's; this only decides which line
// each part goes on and which class the cap takes.
export function seekerParts(seeker, remaining, reloadTime = 0) {
  const label = seekerLabel(seeker, remaining, reloadTime);
  if (label.startsWith('RELOAD')) return { legend: 'SEEKER', value: label.slice(7), state: 'dim' };
  if (label === 'FIRE') return { legend: 'FIRE', value: String(remaining), state: 'locked' };
  if (label === 'SEEKER') return { legend: 'SEEKER', value: String(remaining), state: 'resting' };
  return { legend: label, value: String(remaining), state: label === 'WARMING' ? 'warming' : 'lit' };
}
```

| condition | legend | numeral | classes |
| --- | --- | --- | --- |
| no missiles | SEEKER | seconds, amber | `.dim` |
| off | SEEKER | missiles | none |
| warming | WARMING | missiles | `.lit .warming` |
| searching | SEARCH | missiles | `.lit` |
| target, not locked | LOCKING | missiles | `.lit` |
| locked | FIRE | missiles | `.locked` |

`render()` keeps its existing `.dim` toggle for a lock inhibited on the ground or below 45 m/s, so
the ramp cell of the verification matrix is a dimmed cap with a FIRE legend in the lock core. That is
intended and it is what the shipped build already means: the lock is real and the launch is inhibited.

Reason: the state moves from the numeral line to the legend line, so the numeral line is always a
number and the two-line grammar holds across all three caps. `LOCKING`, `WARMING` and `RELOAD 15` on
a 17 px numeral line are what overflow today. The numeral line then says something it never did: the
missiles remaining, which `OFF` was occupying.

### 3.11 Readouts (`#telemetry`)

Bottom left, on the bottom band, immediately right of the throttle panel. Three groups on one
baseline: legend 9 px weight 500 at .18em, numeral 22 px weight 400 tabular, unit 9 px in the same
legend style. `SPEED 373 KT`, `ALT 3276 FT`, `HDG 083`, laid out as three groups with 20 px between
them: 77.0, 74.5 and 52.1 px wide, 243.6 px in total, so the block runs from x 106 to x 350 and ends
150 px clear of the weapons panel's left edge at 667 px wide.

The word labels change on touch only. `index.html` gains two spans inside each `#telemetry label`,
`<span class="long">AIRSPEED</span><span class="short">SPEED</span>`, with `.short{display:none}` and
`body.touch .long{display:none} body.touch .short{display:inline}`. Two spans rather than a
`data-short` attribute printed through `::after`, because the attribute version needs the original
text suppressed and can strip the accessible name. The baseline layout is a `body.touch` rule on the
shared `#telemetry`; the desktop keeps its label above the numeral and its full words.

One state. Reason: DESIGN.md's per-screen order already puts these bottom left and the code centres
them, which parks numbers under the aircraft where the chase camera puts it, and is what collides with
the jet in the current render. The condensed tabular figures free the width to move them back.
AIRSPEED ALTITUDE HEADING is 24 glyphs for three numbers; SPEED ALT HDG is 11 and is what the
aircraft itself is labelled with.

### 3.12 Hint (`#hint`), in two voices

One line, bottom left, above the readouts, left aligned, `max-width:min(46vw,300px)`.

- The instructor: 12 px weight 400, sentence case, `--ink`. One clause.
- The aircraft: 10 px weight 500 at .14em, upper case, `--advisory`. This is the engagement notice
  and the sensor fallback.
- The stall: the aircraft's voice in `--lock-core` with the .7 s flash, which is DESIGN.md's rule for
  the stall and which the touch layer currently loses entirely because `#instructor` is hidden.

The mechanism, named so it is not invented twice. `touch.hint()` returns `{ text, voice }` where
`voice` is `undefined`, `'notice'` or `'warning'`; `hudOptions()` at `src/main.js:256` passes both as
`hint` and `hintVoice`; `updateHint` in `src/hud.js` sets
`this.el.hint.className = options.hintVoice || ''` just before it writes the text, and the existing
engagement override at `src/hud.js:174`, which already replaces the text when
`effects.engagement?.noticeTime > 0`, sets `'notice'` on the same line. One writer, so the class and
the string can never disagree.

The sensor fallback is one string, not two. `src/touch.js:213` fires
`'NO MOTION SENSORS · DRAG TO AIM'` once through the engagement notice and the hint branch at `:270`
repeats it in different words; both become `NO SENSORS · DRAG TO AIM`, which is 24 glyphs at 125.6 px
rather than 31 at 163.5 px.

```css
body.touch #hint.notice{font-size:10px;font-weight:500;letter-spacing:.14em;color:var(--advisory)}
body.touch #hint.warning{color:var(--lock-core);animation:stall-flash .7s steps(2,end) infinite}
@media (prefers-reduced-motion:reduce){body.touch #hint.warning{animation:none}}
```

Reason: two voices were sharing one element with no way to tell them apart, and the distinction costs
one class. Centred under the jet the hint competes with the reticle; left aligned above the numerals
it becomes the top line of one readout column.

### 3.13 Markers (`#markers`)

Geometry unchanged: reticle, flight-path marker, nose, pipper, bomb diamond, target marks, seeker
circles, laser mark. One addition, touch only:

```css
body.touch #markers{filter:drop-shadow(0 0 2px rgba(6,12,16,.85))}
```

Reason: the markers are the one thing that must stay on the bare image, so they cannot be given a
backdrop, and a 1 px `#e6ecee` stroke over bright cloud measures under 2:1 against the 3:1 floor for a
non-text graphic. `#markers` is rewritten every frame, so the filter is measured with
`window.range.benchmark()` and `stress(true)` in Brave, not in headless Chrome where
`requestAnimationFrame` is frozen; if it costs frame time, the fallback is a duplicated stroke layer
at `rgba(8,14,18,.6)` and 3.5 px under each group.

### 3.14 Status (`#status`)

Centred, 22 px weight 400 at .10em with the 12 px sub-line, `--ink`, over a full-screen veil at
`rgba(8,14,18,.60)` added under `body.touch` when paused or lost. States: PAUSED; AIRCRAFT LOST with
the reason and the tap line. Reason: the sim has stopped, so the frame stops being a live instrument
and becomes a poster. Darkening the whole screen guarantees the contrast at no cost and makes the
stop feel like a stop, where a box around the text would add a fifth dark rectangle. `#status` sits
at 29 per cent, in the clear window, which is exactly where nothing is allowed to sit while the sim is
running and exactly where the eye is when it is not.

### 3.15 Rotate veil (`#rotate`)

Full bleed `rgba(6,10,13,.94)` with an 18 px backdrop blur, one line: `TURN THE PHONE SIDEWAYS`,
13 px weight 500 at .18em, `--ink`, centred. Shown only in portrait; pauses the sim under it. Reason:
it is the only surface allowed to go nearly opaque, because nothing behind it is playable, and it is
the aircraft refusing to fly rather than the instructor advising, so it is set as a legend.

### 3.16 Intro (`#intro`, `#start`)

`body.touch` is added at `src/main.js:64`, at startup rather than on entry, so the face and this
treatment cover the intro, the loading line and the rotate veil, not only the sortie. Title in Barlow
Condensed at .22em, the three existing lines unchanged, and ENTER AIRCRAFT as a switch cap: radius 8,
the cap gradient and rim, legend 13 px weight 500 at .16em, pressed with the same rim inversion as
every other cap. Scoped under `body.touch`, so the desktop button is untouched.

States: disabled while loading; resting; pressed. Reason: the first control the player touches should
already be the instrument, and this is the screen a stranger from a QR code meets first. It is also
the moment the embedded face either loaded or silently did not, which is why the verification matrix
includes it.

## 4. Copy

### 4.1 The touch objective rule

One leg at a time, upper case, middle dots between fields, distance then bearing, and the score only
while it can change or in the landed summary. Never two destinations. The leg boundaries are
`RANGE_LEG_RADIUS` (2600 m) and `returnLeg(flight, effects)`, imported from `src/hud.js` by both the
objective and the hint.

| state | string | glyphs | width at 10px/.10em |
| --- | --- | --- | --- |
| ramp | `RUNWAY 08 · DEPARTURE` | 21 | 108.2 px |
| outbound | `COASTAL RANGE · 3.0 KM · 301°` | 29 | 136.9 px |
| in the range | `COASTAL RANGE · HITS 2 / 7` | 26 | 121.8 px |
| returning | `AIRFIELD · 2.4 KM · 222°` | 24 | 107.0 px |
| down | `SORTIE COMPLETE · 5 / 7` | 23 | 108.2 px |

The bombing range is `COASTAL RANGE` and never `RANGE` alone, because `#brand` reads RANGE 24 px
above it and the shipped line says RANGE twice in two lines meaning two different things. The
qualifier removes the collision without inventing a place that does not exist.

### 4.2 Hints, in sortie order

One clause, sentence case, imperative, dry. The branch conditions are the ones already in
`touch.hint()`. Coaching branches return an empty string for a player who has flown before; act-now
branches always speak. The veteran flag is read once at construction from `localStorage` inside a
`try/catch` (key `range.flown`, absent or unreadable meaning first flight) and written on the first
landing or crash. `touchDemo()` forces it false, so a previous QA run cannot blank the coaching lines
in the next run's screenshots.

| branch | string | voice |
| --- | --- | --- |
| paused | `Tap to continue.` | instructor |
| crashed | `Tap to fly again.` | instructor |
| ramp, stopped | `Slide the throttle up.` | coaching |
| ramp, under 130 kt | `Tilt to keep it straight.` | coaching |
| ramp, over 130 kt | `Pull the phone towards you.` | coaching |
| no sensors, first 8 s airborne | `NO SENSORS · DRAG TO AIM` | aircraft |
| airborne, gear still down | (silent) | none |
| stall or alpha over .28 | `HIGH ALPHA · PUSH THE PHONE AWAY` | aircraft, flashing |
| outside the coastal box | `Turn back towards the airfield.` | act now |
| range under 2600 m, bombs left | `Tap BOMB over the target.` | act now |
| range under 2600 m, no bombs | `Turn back to the airfield.` | act now |
| return leg, over 700 m, gear up | `Throttle back to descend.` | act now |
| return leg, under 700 m, gear up | `Slow to 215 knots for the gear.` | act now |
| finals, gear down, under 60 m | `Level the phone and let it settle.` | act now |
| following the coast past x > 900 | (silent) | none |
| airborne, nothing else to say | `Tilt to turn, pull to climb.` | coaching |
| down and rolling | `Throttle to idle for the brakes.` | act now |
| down and stopped | `Tap to fly again.` | instructor |

The longest instructor line is `Level the phone and let it settle.` at 134.3 px and the longest
aircraft line is `HIGH ALPHA · PUSH THE PHONE AWAY` at 171.7 px, both single lines inside the 300 px
column; today's longest hint is 62 characters and wraps to two. Two branches go silent outright
because they described the view rather than asking for anything; four more go silent for a veteran,
so the second-hundredth sortie has an empty hint line for most of its length.

### 4.3 Every key name and state string

At 667 x 375 the constraints are: 54 px of usable cap width for a legend, 54 px for a numeral, 24 px
for a gate legend, 300 px for the hint column, and about 470 px for the objective.

| string | role | glyphs | budget | measured |
| --- | --- | --- | --- | --- |
| `GUN` | cap legend | 3 | 8 | 18.6 px |
| `BOMB` | cap legend | 4 | 8 | 24.6 px |
| `SEEKER` | cap legend | 6 | 8 | 34.8 px |
| `WARMING` | cap legend | 7 | 8 | 42.2 px |
| `SEARCH` | cap legend | 6 | 8 | 35.1 px |
| `LOCKING` | cap legend | 7 | 8 | 39.5 px |
| `FIRE` | cap legend | 4 | 8 | 20.8 px |
| `150` | cap numeral | 3 | 3 | 23.2 px |
| `4`, `2` | cap numeral | 1 | 3 | 7.7 px |
| `12`, `25`, `20` | countdown numeral, amber | 2 | 3 | 15.4 px |
| `MIL` | gate legend | 3 | 5 | 11.2 px |
| `IDLE` | gate legend | 4 | 5 | 14.8 px |
| `BRAKE` | gate legend | 5 | 5 | 21.1 px |
| `112` | throttle numeral, transient | 3 | 3 | 20.4 px |
| `RECENTRE` | top control | 8 | 8 | 42.4 px |
| `PAUSE` | top control | 5 | 8 | 26.3 px |
| `SPEED` | readout legend | 5 | 5 | 28.0 px |
| `ALT`, `HDG` | readout legend | 3 | 5 | 16.4, 17.5 px |
| `KT`, `FT` | readout unit | 2 | 2 | 11.4, 10.9 px |
| `3276` | readout numeral | 4 | 5 | 38.2 px |
| `PAVEWAY AWAY · NO LASER TARGET` | notice | 30 | 30 | 164.4 px |
| `TURN THE PHONE SIDEWAYS` | rotate veil | 22 | none | 179.1 px |
| `ENTER AIRCRAFT` | intro cap | 14 | none | 103.9 px |
| `AIRCRAFT LOST` | status | 13 | none | 140.5 px |

The eight-glyph cap budget is a ceiling on the vocabulary, not a width guarantee: a glyph count is
not a width, and eight W's at 10 px with .14em would be 62.9 px, over the 54 px of usable cap. It is
set at eight because the measured worst in use, WARMING, is 42.2 px with 12 px to spare, and because a
future state word of ordinary capitals will fit at eight and will not at nine. The count is asserted
in section 7 and the real width is caught by `qa_touch.mjs`, which measures each text box against its
parent's inner width in every cell of the matrix. Both checks are needed; neither replaces the other.

### 4.4 Words removed

- `THR 112` as a permanent readout. The lever position and the gate legends already say it, the
  numeral now appears only while a finger is on the lever, and `aria-valuenow` still carries the exact
  figure for tests and assistive technology.
- `MAX`. The end of the track labels the end of the track.
- `RELOAD 12`, `RELOAD 25`, `RELOAD 20`. The word is redundant once the cap is dim and the numeral is
  amber, and those strings are what overflow worst today.
- `OFF` as the seeker's numeral line. A monochrome resting control already means off, and the line is
  more useful carrying the missile count.
- The second destination in the objective, about 21 glyphs naming a place that is not the task, and
  the running score outside the range.
- `AIRSPEED`, `ALTITUDE`, `HEADING` as readout legends: 24 glyphs down to 11.
- The trailing clause of nine hints: `Reheat is at the top of the slider`, `the aircraft flies towards
  the circle`, `The range is south-west`, `let the speed build`, and the rest. Each duplicated a
  legend, duplicated the objective's bearing, or explained what the next hint explains anyway.
- Two hint branches outright: `Following the coast. Tilt to turn.` described the view, and the gear
  retraction hint asked for nothing.
- The full stop and the sentence framing of the rotate veil: it becomes a legend, not prose.

Steady state, airborne, veteran, nothing to act on: RANGE, five objective fields, SPEED 373 KT, ALT
3276 FT, HDG 083, RECENTRE, PAUSE, MIL, IDLE, GUN 150, BOMB 4, SEEKER 2. Twenty-two tokens against
about forty-five today, and the hint line is empty.

## 5. Type and the font

**Face.** Barlow Condensed, from `github.com/google/fonts/raw/main/ofl/barlowcondensed/`. Its author
describes it as a slightly rounded, low-contrast grotesk, which is the closest OFL family to
MS33558's rounded condensed instrument lettering, and its capitals sit in the Univers Condensed class
the Warthog legends belong to. MS33558 itself is personal-use or CC BY-ND in every reproduction and
cannot ship in a public repo, so this is a near-equivalent, not the article.

**Licence.** SIL Open Font License 1.1. The copyright line of `OFL.txt` reads `Copyright 2017 The
Barlow Project Authors (https://github.com/jpt/barlow)` with no `with Reserved Font Name` clause, and
the only occurrence of the phrase in the file is line 33, the licence's own definitions section.
There is therefore no Reserved Font Name and the subset may keep the family name. The licence text
must travel with the font, and `RANGE.zip` reaches only the desktop tier, so the notice ships three
ways: `assets/fonts/OFL-BarlowCondensed.txt` in the repo, a line in the existing credits, and an HTML
comment above the `@font-face` rules, which is the only one of the three that reaches
`dist/mobile.html`. `tools/build.py` does not strip comments; assert that the string
`Barlow Project Authors` survives into both bundles.

**Tabular figures, verified rather than assumed.** With fontTools 4.61 on the source TTFs, the default
digit advances are proportional: Regular `[444, 256, 402, 408, 415, 409, 410, 366, 422, 403]`, Medium
`[447, 266, 415, 418, 440, 420, 420, 381, 429, 414]`. The font carries a real `tnum` feature whose
lookups map each digit to a `.tf` glyph at a single advance, 434/1000 Regular and 457/1000 Medium
(SemiBold is 475/1000, which is why any figure computed for a 600 weight elsewhere is wrong). Rather
than depend on `font-feature-settings:'tnum' 1` surviving the cascade and iOS Safari,
`tools/subset_fonts.py` rewrites every `cmap` subtable so the ten digits point at their `.tf` glyphs
and drops GSUB entirely: the shipped file is unconditionally tabular. Verified on the files that ship,
not on the source: 103 glyphs each, digit advances uniform at 434 and 457, GSUB absent, GPOS kerning
kept.

Ruled out on the same evidence, and worth recording so nobody re-opens it: Saira Condensed, Saira
SemiCondensed, Oswald and Chakra Petch have no `tnum` at all and proportional digits, so their
numerals can never be tabular; Share Tech is default-tabular but has one weight and a squared techno
character that reads as a games font; B612, the Airbus cockpit face, is default-tabular but not
condensed, at 0.650 em a digit against 0.434, and would not solve the overflow; Archivo Narrow and
Roboto Condensed are both genuinely default-tabular with `tnum` and are rejected on register rather
than on numerals, since they read as neutral web faces rather than instrument silkscreen.

**Weights.** 400 Regular for numerals, the hint and the intro prose; 500 Medium for every legend and
the brand, because a backlit legend should carry a little more mass than the running numerals. Two
files, no more.

**Subset.** `tools/subset_fonts.py`, run by hand and committed alongside the woff2, so the change is
reproducible:

```
python tools/subset_fonts.py
# per weight, after remapping U+0030-U+0039 in every cmap subtable to <digit>.tf:
#   pyftsubset BarlowCondensed-<W>.ttf \
#     --unicodes=U+0020-U+007E,U+00A9,U+00B0,U+00B7,U+2026 \
#     --layout-features=kern --drop-tables+=DSIG,GSUB \
#     --flavor=woff2 --no-hinting --desubroutinize \
#     --output-file=assets/fonts/BarlowCondensed-<W>.woff2
```

The range is the printable ASCII the intro, the hints and the status lines use, plus the degree sign
and the middle dot from the objective, the ellipsis from `Preparing aircraft and airfield…` and the
copyright sign from the credits. Measured: Regular 6,740 bytes, Medium 6,788 bytes, 103 glyphs each,
about 9.0 KB each once base64 encoded, so roughly 18 KB added to an 8.9 MB page against a 15 MB
assert. Budget: fail the build if either weight exceeds 16 KB as woff2.

**The `@font-face` rules**, at the top of the touch block in `index.html`, with the licence comment
above them:

```html
<!-- Barlow Condensed, SIL Open Font License 1.1. Copyright 2017 The Barlow Project Authors
     (https://github.com/jpt/barlow). Licence text: assets/fonts/OFL-BarlowCondensed.txt -->
<style>
@font-face{font-family:'Barlow Condensed';font-style:normal;font-weight:400;font-display:block;
 src:url(assets/fonts/BarlowCondensed-Regular.woff2) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-style:normal;font-weight:500;font-display:block;
 src:url(assets/fonts/BarlowCondensed-Medium.woff2) format('woff2')}
body.touch{font-family:'Barlow Condensed','Roboto Condensed','Arial Narrow',Arial,sans-serif}
body.touch #telemetry b,body.touch .key .value,body.touch #throttleValue{
 font-family:inherit;font-variant-numeric:tabular-nums}
</style>
```

`font-variant-numeric` is belt and braces; the shipped file is tabular whatever the cascade does.

**`tools/build.py`.** Three changes, all in `build()`:

1. Inline the faces the way textures are inlined: read each file under `assets/fonts/`, base64 it, and
   replace `url(assets/fonts/<name>.woff2)` with `url(data:font/woff2;base64,<...>)` in the HTML
   before `DependencyCheck` runs.
2. Add `font-src data:` to the CSP string at the `csp=` line, which today has no `font-src` and
   therefore inherits `default-src 'none'`. Without it the faces fail with no error, every string
   reverts to Arial's much wider metrics, and the exact overflow this spec fixes comes straight back
   looking like a design that did not take.
3. Assert. `DependencyCheck` is an `HTMLParser` that only inspects `src` and `href` tag attributes, so
   a surviving `url(assets/fonts/...)` inside the inline `<style>` passes it unseen. Add
   `assert 'assets/fonts/' not in html`, `assert 'font-src data:' in csp` and
   `assert html.count('data:font/woff2;base64,') == 2`.

The dev page over HTTP reads the same two files from `assets/fonts/` through the plain `url()`, so
`index.html` and the bundle render identically apart from the CSP, which only the bundle carries.

## 6. Fallbacks

```css
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
 :root{--panel-tint:rgba(8,12,15,.74)}}
@media (prefers-reduced-transparency:reduce){
 :root{--panel-tint:rgba(8,12,15,.88)}
 .panel{-webkit-backdrop-filter:none;backdrop-filter:none}
 .panel::after{display:none}}
@media (prefers-reduced-motion:reduce){
 .key{transition:none}
 .key.pressed{transform:none}
 #throttleValue{transition:none}
 body.touch #hint.warning{animation:none}}
```

- **No `backdrop-filter`.** The film goes to .74, where the ink measures 10.3:1. The panel is a matte
  black panel first and glass second, so removing the glass costs the look nothing and the hierarchy
  nothing. Both `@supports` queries test the `-webkit-` prefix as well, which the shipped code at
  `index.html:133-136` already does and which no proposal kept.
- **Reduced transparency.** .88 and the blur off, the grain kept, because the panel is still a panel.
  Contrast goes up in every fallback, never down.
- **Reduced motion.** The press transform and every transition go; the film deepening and the rim
  inversion stay, so press feedback survives without movement. The stall flash stops, which is
  DESIGN.md's existing rule and which the touch layer would otherwise lose along with `#instructor`.
- **No font.** A documented degradation, not a designed state. If either build step is missed the
  page renders in Arial Narrow on Windows and Android and in Arial on iOS, where the capitals are
  about sixty per cent wider: `WARMING` goes from 42.2 px to about 59 px in a 54 px cap and overflows.
  Nothing in the layout is designed for it. It is caught by the three build asserts above and by the
  runtime check in section 8; there is deliberately no `overflow:hidden` on the caps, because it would
  clip the 14 px bloom of a lit legend, which extends only about 11 px past the glyphs at this cap
  width.

## 7. Tests

`tools/test_touch.mjs` runs from `node tools/test_flight.mjs`, the project's check command.

**Strings that change: none.** Both decisions that would have changed one were taken the other way and
for their own reasons. `seekerLabel()` keeps its exact vocabulary, so
`assert.equal(seekerLabel(s, 0, 5), 'RELOAD 15')` at line 98 stands and the split happens in
`seekerParts`. The release notice stays `PAVEWAY AWAY · LASER ON`, so line 130 stands, because the cap
legend names a function and the notice names a munition. Three assertions are added.

1. **The seeker mapping.** Drive `seekerParts` through all six rows of the table in section 3.10 and
   assert `legend`, `value` and `state` for each, including that the reloading row keeps the legend
   `SEEKER` and puts a bare number on the value line, and that `SEARCH` and `LOCKING` are different
   strings, which is the redundant channel that stops the lit and locked states differing by hue
   alone.
2. **The glyph budget.** Export the legend vocabulary from `src/touch.js`
   (`export const CAP_LEGENDS = ['GUN','BOMB','SEEKER','WARMING','SEARCH','LOCKING','FIRE']`) and
   assert that no entry exceeds 8 glyphs, that no gate legend exceeds 5 and that no cap numeral string
   the render can produce exceeds 3, so a future state word cannot be added that does not fit. Read
   the same list in `render()` rather than duplicating the strings.
3. **The ids the QA harness needs.** Extend the id list in the existing unique-id check with
   `throttleSlot`, `throttleValue` and `throttleLabel`, so the markup and the harness cannot drift.
   The `touchDemo` signature is checked in the headless run of section 8, not here: `test_touch.mjs`
   reads `index.html` as text and has no `window`, so the only node-side form would be a regex over
   `src/main.js` for `function touchDemo(name = 'cloud', state`, which is worth less than the
   headless call that actually stages a cell.

**`touchDemo(name, state, beta, gamma)`** in `src/main.js:436`. The state parameter goes second,
because `tools/qa_touch.mjs` already calls `window.range.touchDemo(STAGE, STATE)` and today that
string lands in `beta`. It stages, in terms of the fields `render()` actually reads:

- `resting`: as now.
- `locked`: `engagement.seeker = { enabled: true, warm: 1, locked: true, target: {} }`,
  `engagement.remaining = 2`, and the aircraft airborne above 45 m/s so the lock is not inhibited.
- `reloading`: `flight.rounds = 0`, `flight.bombs = 0`, `engagement.remaining = 0`,
  `effects.reload = { rounds: 5, bombs: 13 }` and `engagement.reloadTime = 5`, so the three countdowns
  read 7, 12 and 15 and every digit column is exercised.

It also forces the veteran flag false, so the coaching hints appear in the screenshots whatever a
previous run wrote to `localStorage`.

## 8. Verification

Nothing in sections 2 to 4 is believed before this runs. Widths are px, and headless Chrome reports a
zero safe-area inset, so one pass shims `env()`.

**The matrix.** `node tools/qa_touch.mjs --url dist/mobile.html?touch=1`, which is 27 cells: three
widths, 667 x 375, 844 x 390 and 932 x 430; three stages, cloud, ramp and landing; three states,
resting, locked and reloading. Two shots a cell, the frame and the same frame with the ink blanked, and
the text boxes written beside them.

**Contrast.** `python tools/contrast.py screenshots/qa --check`, which samples the backdrop behind
every text box at the 95th percentile of luminance and reports against the 4.5:1 floor. Every ink on
this layer is one colour on one of five surfaces and the worst case computed in section 2 is 5.50:1,
so there is no `--large-px` argument and no exemption to argue for: the readout numerals are 22 px and
are judged at 4.5:1, which they clear at 8.09:1. The run must exit 0. A FAIL is a design bug, not a
tool argument.

**Safe area.** One extra pass at 667 x 375 and one at 844 x 390 with the insets shimmed to 47 px at
the side and 21 px at the bottom, which is a notched iPhone in landscape, checking three things the
zero-inset run cannot: that the hint still sits inside the held part of the bottom band, that the
throttle panel has not been pushed 65 px into the image by an inset added to a full margin, and that
the readouts have not been clipped. The notch swaps sides between the two landscape orientations, so
run it mirrored as well.

**The font actually loaded.** In the same headless page, against `dist/mobile.html` and never
`index.html`, which carries no CSP at all:

```js
document.fonts.check('500 10px "Barlow Condensed"') === true
```

plus a measured advance: render `WARMING` at 10 px with .14em into a hidden span and assert the width
is under 46 px, which Arial cannot reach and Barlow Condensed measures 42.2 px. `getComputedStyle().
fontFamily` is not a check: it returns the declared stack whether or not the face loaded, so the
silent CSP failure would leave that assertion green.

**The face at true pixel size.** One specimen shot: the cap legend at 10 px, the gate legend at 8 px
and the hint at 12 px, over the composited panel grey and the composited band grey, at 1x and at 4x.
The 1x shot is the one that decides whether 12 px condensed lowercase holds; if it reads muddy the fix
is 13 px Regular, not a second face.

**The mechanical scan.** `E:\claude-projects\design\tools\qa\scan.mjs` reads CSS files, and RANGE's
touch CSS is inline, so the touch block is written out to `screenshots/qa/touch.css` by the same
step that runs the matrix, then:

```
node E:\claude-projects\design\tools\qa\scan.mjs screenshots\qa\touch.css ^
  --tokens tools\qa\range-tokens.json --allow tools\qa\range-allow.txt --check
```

`range-tokens.json` carries this spec's scale, so the scanner judges the design against its own
tokens rather than the generic default: font sizes 8, 9, 10, 12, 13, 14, 15, 17, 22; weights 400 and
500; spacing 4, 7, 14, 22, 32; radii 0, 5, 8, 13, 15. `range-allow.txt` carries the deliberate
exceptions with their reasons, one per line, and nothing else: the panel's five-stop shadow, the cap's
five-stop shadow, the three-stop text shadows of a lit and a locked legend, the `backdrop-filter` on
`.panel`, the `--metal` and canopy gradients, and the upper-case tracking on every legend. Exit 0 with
`--check`. A new suspect is either a mistake or a line for the allow file with a written reason; the
scanner is never widened.

**Frame cost.** Two 14 px `backdrop-filter` layers over a live WebGL scene on a phone GPU, plus a
`mix-blend-mode:overlay` pseudo-element on each and a `drop-shadow` filter on an SVG that is rewritten
every frame, is the one performance unknown in this spec. Measure it in Brave through
Claude-in-Chrome with `window.range.stress(true)` then `window.range.benchmark()`, never headless,
because the automation tab freezes `requestAnimationFrame` and `metrics()` returns `fps: null` there.
Compare against the same measurement on the shipped build. The fallback ladder, in order: delete
`.panel::after` (the grain is one rule and the panel reads correctly without it), drop the blur to
10 px, then raise the film to compensate and re-run `contrast.py`. The marker halo is measured in the
same pass, with its duplicated-stroke alternative as the fallback.

**Regression.** `node tools/test_flight.mjs`, every line printing PASS. Then
`python tools/build.py`, which must print the byte counts and pass its three new asserts.

**On the phone**, which only Charles can do: the Pages URL, sideways, in daylight and at dusk. The
questions are whether the panels read as let into the frame rather than floating on it, whether the
lit legends read as lamps rather than as coloured text, and whether the throttle lever is the first
thing the eye finds.

**The intro (section 10.1).** A separate pass rather than a fourth stage in the 27-cell product,
because the intro has no weapon states: three shots, one at each of 667 x 375, 844 x 390 and
932 x 430, with no `--eval` at all, since the intro is what the page shows before `start()`. The
check at each width is that the block ends clear of the bottom inset, that the prose is one line and
the placard is one line, and that `contrast.py` passes the whole column against the new flat veil.

**The switch (section 10.2).** Two more shots at 844 x 390, one in each position. The grey one is the
plain intro shot above; the heritage one is `--eval "window.range.setSkin('heritage')"`, which is why
`setSkin` is exposed on `window.range`. The pair must differ in the knob's position, in which legend
is weight 500, and in the aircraft's skin behind them.

**The wake lock (section 10.3).** `node tools/test_flight.mjs`, which now runs section 7's item 4:
the lock is requested on entry and on resume, released on pause, and an unsupported or refused lock
throws nothing. Whether a phone actually stays awake is Charles's check on the Pages URL, sideways,
for longer than the phone's own sleep timeout.

**The render scale (section 10.4).** The same run covers section 7's item 5, which drives
`nextPixelRatio` with synthetic 60 Hz and 120 Hz frame-time windows. On the phone,
`window.range.metrics()` over the Pages URL after a full sortie: `pixelRatio` should still be at the
device's ceiling and never at 1.0, and `slowFraction` under 0.05, which is the same one-and-a-half
medians test the adaptor now uses, so the number read on the phone is the number it acted on. If it
stutters, the base drops to 1.5 and the run is repeated.

Quote the exit codes and the paths in the reply. A stated px width or ratio that has not survived
`contrast.py` and the shot matrix is a claim, not a measurement.

## 9. Out of scope

The desktop HUD. Every rule here is scoped to `body.touch` or to a touch-only element, and the three
shared files are touched at exactly four points: `src/hud.js` gains an `options` argument on
`updateObjective` and one `classList.toggle` on the hint line, both branching on `options.touch`;
`index.html` gains the two spans inside each `#telemetry` label, hidden on the desktop; `src/main.js`
gains a state argument on `touchDemo`. Nothing else the desktop renders changes, and the desktop
screenshots are re-run to prove it.

Also out of scope: portrait play, an on-screen stick, sound, the render tier, and any change to the
flight model or the instructor.

One thing worth doing later, deliberately not done here. The desktop names Bahnschrift and Segoe UI
for its numerals, neither of which exists on macOS or iOS, so the desktop HUD is already falling back
to Arial on every Apple browser, and the two woff2 files this spec ships would fix it in one line.
The reason to hold off is that the desktop numerals are 26 to 30 px where the phone's are 17 to 22,
and a face chosen for a 10 px legend on a 375 px screen has not been judged at that size. It is a
separate look at a separate surface, not a find-and-replace.

## 10. Four additions

Charles flew the phone build and asked for four things: the opening screen is cluttered, two skins
should be a slider rather than a dropdown, the phone still falls asleep, and the resolution drops
further than the hardware deserves. Everything below is scoped the way sections 1 to 9 are, under
`body.touch` or on the mobile tier, except section 10.4's threshold change, which is a shared
function given a per-tier floor so the desktop keeps the numbers it has.

Four sentences elsewhere in this document go stale and are left standing rather than rewritten, the
way section 1.5 leaves the geometry clause: section 3.16's `the three existing lines unchanged` and
section 2.2's `Unchanged copy` on the intro prose row now describe the desktop only; section 7's
`Three assertions are added` should read five; and section 9's `the three shared files are touched at
exactly four points` should read five files and eight points, since `index.html`, `src/main.js`,
`tools/build.py` and the shared `#veil` element all take touch-scoped additions below. Striking them
is a four-line edit and is Charles's.

### 10.1 The intro on touch

The shipped intro puts a title, three lines of prose, a button and two lines of small print in the
top left of a screen that is 390 px tall, and hides the skin control entirely. Seven stacked items,
of which three describe the picture behind them.
`screenshots/qa-before/intro-844x390.png` is what that looks like.

What survives, in the screen's rank order: the title, one line of prose, ENTER AIRCRAFT as the
switch cap section 3.16 already specifies, the skin switch, and one placard line. Seven items down to
five, and one of the five is a control the phone never had.

**Copy.** Exact strings, and every one of them is a deletion argued rather than a rewrite.

| role | string | note |
| --- | --- | --- |
| title | `RANGE` | unchanged |
| prose | `Jersey. A short sortie. Bring it home.` | one line, sentence case |
| cap | `ENTER AIRCRAFT` | unchanged, section 3.16 |
| switch legends | `RAF GREY`, `HERITAGE` | section 10.2 |
| placard | `TILT TO FLY · HEADPHONES` | upper case, the aircraft's own voice |

`Clearing skies.` goes because the render behind the type is the clearing sky, and a line of copy
that describes the image is the thing this design has been cutting since section 4.2. `One aircraft.`
goes because there is one aircraft in the middle of the frame while the sentence is being read. What
is left names the place, the task and the ending, which is the whole demo in seven words.
`Hold the phone sideways` goes because section 3.15's rotate veil already refuses to run in portrait
and says `TURN THE PHONE SIDEWAYS` in the only situation where the instruction is needed; keeping it
on the intro is a second treatment for one fact, which section 3.6 already ruled against for `MAX`.
`Headphones recommended` loses its verb and joins the tilt line behind a middle dot: a placard states
two facts, it does not recommend.

The desktop keeps all three prose lines and both of its own small-print lines. The mechanism is the
one section 3.11 already establishes for the telemetry labels, so it costs no new CSS at all:

```html
<p><span class="long">Jersey. Clearing skies.<br>One aircraft. A short sortie.<br>Bring it home.</span><span class="short">Jersey. A short sortie. Bring it home.</span></p>
```

`.short{display:none}`, `body.touch .long{display:none}` and `body.touch .short{display:inline}` are
already written for section 3.11 and already global under `body.touch`. The placard needs nothing at
all: `#introTouch` at `index.html:143` exists for exactly this and its content becomes the one line.

**Sizes**, all from the section 2.2 table, with no new row:

| role | 2.2 row | size | weight | tracking |
| --- | --- | --- | --- | --- |
| title | intro title | `clamp(40px,10vh,72px)` | 400 | .22em |
| prose | intro prose | 14px | 400 | .01em |
| ENTER AIRCRAFT | ENTER AIRCRAFT | 13px | 500 | .16em |
| switch legend | cap legend | 10px | 500 / 400 | .14em |
| placard | top control legend | 9px | 500 | .14em |

The placard takes the top control legend row unchanged, because it is the aircraft's own lettering
rather than the instructor's, and because a second sentence-case line on the intro would put two of
them under section 1.3's rule that sentence case is the instructor. The prose is the instructor and
keeps the case; the placard is the airframe and takes capitals.

**Vertical rhythm.** The clamp's 40 px floor is what renders at both verification heights, since
10vh is 37.5 px at 375 and 39 px at 390; at 430 the title is 43 px. Margins come from the section 2.4
spacing scale.

| block | height | margin below |
| --- | --- | --- |
| `h1` | 40 (line-height 1) | 14 |
| `p` | 20 (14px at 1.45) | 22 |
| `#start` | 44 | 14 |
| `#skinSwitch` | 44 | 22 |
| `#introTouch` | 14 (9px at 1.5) | 0 |

234 px in total, anchored at `calc(22px + env(safe-area-inset-top))`, so the block ends at 256 and
leaves 119 px clear at 375 px tall, 134 px at 390 and 174 px at 430. The home indicator's 21 px inset
sits inside that clearance at every height, so nothing is pushed off the bottom by a notch, which is
the failure section 8's safe-area pass exists to catch.

```css
body.touch #intro{top:calc(22px + env(safe-area-inset-top));
 left:max(18px,calc(env(safe-area-inset-left) + 6px));width:min(300px,76vw)}
body.touch h1{font-size:clamp(40px,10vh,72px);letter-spacing:.22em;margin:0 0 14px}
body.touch #intro p{font-size:14px;line-height:1.45;letter-spacing:.01em;margin:0 0 22px;
 max-width:none;color:var(--ink)}
body.touch #start{display:inline-flex;align-items:center;margin:0 0 14px;padding:0 18px;
 min-height:44px;font-size:13px;font-weight:500;letter-spacing:.16em}
body.touch #intro #introTouch{margin:0;font-size:9px;font-weight:500;letter-spacing:.14em;
 line-height:1.5;color:var(--ink)}
body.touch #loading{left:max(18px,calc(env(safe-area-inset-left) + 6px));
 bottom:calc(22px + env(safe-area-inset-bottom));font-size:12px;color:var(--ink)}
```

The left inset is the section 2.4 screen-inset token rather than `6%`, so the intro column and the
throttle panel that replaces it a second later start at the same x. `#loading` follows it for the
same reason and because section 3.16 already claims this treatment covers the loading line.

Two cascade traps, since this block is overriding rules that already exist rather than writing on a
blank sheet. The placard's selector is `body.touch #intro #introTouch` and not
`body.touch #introTouch`, because `#intro small` at `index.html:24` and `body.touch #intro small` at
`:86` both carry two element selectors and would otherwise win on specificity and keep
`margin-top:12px` and `color:#a7b5bd`. And `body.touch #intro p` restates `color:var(--ink)`,
because `#intro p` sets `#c1cbd0`, a grey step section 1.2 removed from the touch build. Both greys
fail
on the new veil where the ink passes: measured on the prose band's sampled 95th percentile,
`--ink` is 5.86:1, `#c1cbd0` is 4.17:1 and `#a7b5bd` is 3.27:1. Inheriting either one would leave the
only two secondary greys on the touch build sitting on the first screen, under the gate, which is the
whole class of failure section 1.2 exists to have removed.

Derived widths, scaled from the measurements in section 2.2 rather than measured again here: the
title at 40 px and .22em is about 135 px, from the brand's 50.1 px at 14 px and .26em; the prose's
38 characters are about 175 px, from the hint's 134.3 px at 12 px for 34; the placard's 24 glyphs are
about 120 px, from the readout legends. All three are single lines inside a 300 px column with room
to spare. They are derived figures and section 8's rule applies to them: `qa_touch.mjs` measures
each text box against its parent's inner width in every cell, and that is the number that counts.

**The surface the intro sits on.** This is the part the shipped build gets wrong and nobody has
measured. The intro has no panel under it, so the veil is its surface, and the veil is a 90 degree
gradient that decays through its own text: `rgba(9,17,22,.6)` at the left, transparent at 58 per
cent, which at 844 px puts the end of the prose line on about .31. Sampled from
`dist/mobile.html?touch=1` at 844 x 390 with `#intro` hidden and `#veil` removed, the way section 2.1
samples the sortie, the raw render behind the column reaches L 0.474 at the 95th percentile behind
the prose and L 0.463 behind the ENTER cap. That is brighter than anything section 2.1 measured: the
worst backdrop behind the top canopy band is L 0.378. With the shipped veil composited in, `--ink`
would measure 3.58:1 behind the prose and 3.13:1 across the block, and the prose is not set in the
ink. The intro is the one surface in this design that fails its own gate today, and it is the first
screen a stranger from a QR code meets.

The fix is section 3.1's argument applied to the intro: a band that holds its alpha flat for the full
width the text occupies and only then decays.

```css
body.touch #veil{background:linear-gradient(90deg,var(--veil-intro) 0,var(--veil-intro) 260px,rgba(6,12,16,0) 420px)}
```

`#veil` is a shared element and not a touch-only one, so that rule is scoped under `body.touch` and
the desktop keeps its `rgba(9,17,22,.6)` gradient untouched. It is the fifth shared-file point in a
document whose section 9 counts four, which is why that sentence is named as stale at the top of this
section.

One token joins the section 2.1 family:

| token | value | meaning |
| --- | --- | --- |
| `--veil-intro` | `rgba(6,12,16,.54)` | The intro's surface. Heavier than the canopy bands because the intro's backdrop is the brightest region in the demo. |

Measured on the sampled 95th percentile, then WCAG, the same method as section 2.1:

| ink on surface | at the 95th percentile | brightest pixel in the band |
| --- | --- | --- |
| `--ink` on the intro veil, prose band | 5.86:1 | 5.54:1 |
| `--ink` on the intro veil, title band | 6.48:1 | 6.29:1 |
| `--ink` on the intro veil, whole column | 5.94:1 | 5.42:1 |
| `--ink` on a resting cap on the veil | 7.83:1 | 7.61:1 |
| `--ink` on a pressed cap on the veil | 10.02:1 | 9.82:1 |
| `--ink` on a dim cap on the veil (loading) | 9.28:1 | 9.07:1 |
| `--metal` top stop on the switch slot | 8.07:1 | 7.87:1 |

The consequence worth stating: at .54 the veil alone carries the whole column past 4.5:1, so the cap
and the slot use `--cap-film`, `--cap-film-press`, `--cap-film-dim` and `--slot-tint` unchanged, with
no intro-specific override. A resting cap on the intro composites to 64.1 per cent against 65.7 on a
panel, and the slot to 67.8 against 69.2. The veil is doing on the intro exactly what the panel film
does in the sortie, which is why the two land within a point and a half of each other, and it is the
answer to the question section 3.16 left open: what film a cap on no panel carries. Nothing else in
section 6's fallback ladder changes, since the veil is a plain gradient with no `backdrop-filter` and
a cap adds film rather than blur, so reduced transparency and a missing `backdrop-filter` leave the
intro alone.

**`docs/DESIGN.md`.** The per-screen module order's `Intro: title, three lines, ENTER, small print.`
gains a touch line beneath it: `Touch intro: title, one line, ENTER, the skin switch, one placard
line.` The desktop line is unchanged and still true.

### 10.2 The skin switch

Two skins exist, RAF grey and WWII heritage. Today they are a `<select id="skinChoice">` inside
`<label id="skinControl">`, hidden on the touch layer by `index.html:88` and hidden again on the
mobile tier by `src/main.js:66`, whose texture `tools/build.py:177` then throws away. Three separate
places conspire so that a phone has one skin and no way to know there were two.

A dropdown is also the wrong control. It is the only piece of native browser chrome anywhere in this
design, it opens a modal wheel over the render on iOS, and it names a choice that the player can see
on the aircraft twenty pixels away. A two-position switch shows both options at once, changes the
aircraft under the finger, and is the control a cockpit would actually carry.

**The object.** A real Warthog has silver toggle switches with white tips on a black panel. Here it
is a short slot cut into the intro's veil with a machined knob sitting at one end or the other and
the two legends etched either side, which is the section 3.5 quadrant in miniature: the slot is the
throttle slot's grammar, the knob is the throttle lever's, and the legends sit where the gate legends
sit, beside the slot, at the cap legend's size.

```html
<div id="skinSwitch" role="radiogroup" aria-label="Skin"><button type="button" id="skinGrey" class="skinLegend" role="radio" aria-checked="true" tabindex="0">RAF GREY</button><span id="skinTrack" aria-hidden="true"><span id="skinKnob"></span></span><button type="button" id="skinHeritage" class="skinLegend" role="radio" aria-checked="false" tabindex="-1">HERITAGE</button></div>
```

It goes into `#intro` at `index.html:143` immediately after `#skinControl`, which puts it below
ENTER AIRCRAFT in document order with no `order` property and no flex container, so the desktop
intro is untouched by construction rather than by a rule. `#skinControl` keeps its place in
`index.html:88`'s hidden list and keeps working on the desktop.

Below ENTER, not above it, for three reasons. The rank order of this screen is title, then the one
action, then the option, then the placard, and a control placed before ENTER reads as a step on the
way to it rather than a choice about it. Reading order and brightness then agree: the eye lands on
the largest element, the matte cap, before it finds the small bright knob. And it costs no CSS.

The knob is nonetheless the brightest object on the intro, exactly as the throttle lever is the
brightest object in the sortie, and that is deliberate: the machined face is the only thing that
tells a stranger this is a switch and not two labels.

**Geometry**, on the section 2.4 scale and radius family:

| element | value |
| --- | --- |
| `#skinSwitch` | `display:flex`, gap 10, `min-height:44px`, margin-bottom 22; about 168 px wide |
| `#skinTrack` | 56 x 26, radius 13, `--slot-tint`, the slot's inverted rim |
| `#skinKnob` | 26 x 22, radius 5, `--metal`, travelling from `left:2px` to `left:28px` |
| `.skinLegend` | 10 px legend, `min-height:44px`, about 46 px wide each |

```css
#skinSwitch{display:none}
body.touch #skinSwitch{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 0 22px;
 touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body.touch .skinLegend{border:0;background:transparent;padding:0 2px;min-height:44px;color:var(--ink);
 font-size:10px;font-weight:400;letter-spacing:.14em;white-space:nowrap}
body.touch .skinLegend[aria-checked="true"]{font-weight:500}
body.touch .skinLegend:active{color:#f6fafb}
body.touch .skinLegend:focus-visible{outline:2px solid #d7e5ed;outline-offset:3px}
body.touch #skinTrack{position:relative;flex:0 0 auto;width:56px;height:26px;border-radius:13px;
 background:var(--slot-tint);
 box-shadow:inset 0 2px 3px rgba(0,0,0,.55),inset 1px 0 2px rgba(0,0,0,.35),inset 0 -1px 0 rgba(233,240,242,.14)}
body.touch #skinKnob{position:absolute;top:2px;left:2px;width:26px;height:22px;border-radius:5px;
 background:linear-gradient(180deg,var(--metal));
 box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.80),
  inset 0 -1px 0 rgba(0,0,0,.60),0 2px 5px rgba(0,0,0,.55);
 transition:left .12s ease}
body.touch #skinKnob::after{content:"";position:absolute;left:8px;right:8px;top:7px;height:8px;
 background:repeating-linear-gradient(90deg,rgba(18,24,28,.40) 0 1px,rgba(255,255,255,.22) 1px 2px,transparent 2px 4px)}
body.touch #skinSwitch.heritage #skinKnob{left:28px}
body.touch #skinSwitch.sliding #skinKnob{transition:none;
 box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.80),
  inset 0 -1px 0 rgba(0,0,0,.60),0 3px 7px rgba(0,0,0,.60)}
```

The knob's shadow deepens from two stops to three while a finger is on it, which is the lift a lever
takes when it is held; that is the whole pressed state, because a metal lever under a thumb does not
change colour and does not shrink. Section 6's reduced-motion block gains one line,
`#skinKnob{transition:none}`, so the knob snaps rather than slides; it snaps during a drag anyway,
since `.sliding` kills the transition so the position cannot lag the finger.

**Lit or monochrome.** Monochrome, and the reason matters more than the rule. Section 1.2 bought
`--lit-core` a single meaning, a system that is live and powered, and confined it to three places:
the gun while firing, the seeker while powered, the reheat band past the gate. A skin is not a
running system, and the intro is the one screen where nothing is running at all. Lighting a legend
green there would make the first thing a stranger sees on this interface a lamp that means
"selected", which is not what it means forty seconds later on the weapons panel. It would also be the
fourth use of a colour whose value is its rarity. So the switch is monochrome, and the ladder keeps
its rungs.

That leaves the state to three channels, none of them colour and none of them a grey step, which
section 1.2 forbids. The knob's position is the state, which is what a toggle switch is and what the
26 px of bright metal is for. `aria-checked` carries it for assistive technology and for the tests.
The live legend is weight 500 and the dead one weight 400, both at full `--ink`: section 1.2 names
size, tracking and position as the hierarchy when grey is unavailable, and weight is the same family.
The weight cue is marginal at 10 px, and it is written down as marginal rather than sold as a
distinction. It is a third channel, not the channel, and it exists so the two legends are not
literally identical in the 1x specimen shot.

A resting legend brightening on press is `.skinLegend:active` rather than the `.pressed` class the
caps use, because these two are ordinary buttons driven by `click` and never go through the `press()`
helper at `src/touch.js:293`. One less class, and the state cannot be left stuck on.

**It is a real control.**

- Tap either legend: the legend is a real `<button>` and its `click` sets the skin, which gets
  keyboard activation for nothing.
- Tap the track: `pointerdown` on `#skinSwitch`, not on `#skinTrack`, so the 9 px bands above and
  below the 26 px slot are live and the whole 44 px row is the target. The position is read from
  `#skinTrack.getBoundingClientRect()`, so a tap left of the slot's midpoint is grey and right of it
  is heritage.
- Drag the knob: the same window-level pointer pattern the throttle uses at `src/touch.js:326`, which
  deliberately avoids pointer capture because some browsers refuse it, so a finger that drifts off
  the row keeps working and a `pointercancel` still ends the drag. The knob does not track the finger
  continuously; it snaps to the end the finger has crossed into. A toggle switch has two positions
  and no intermediate one, and snapping keeps one writer for the knob's position, the `.heritage`
  class, rather than a `style.left` that would then have to be unwound on release.
- Keyboard, which is what a desktop running `?touch=1` gets: ArrowLeft, ArrowUp and Home select grey,
  ArrowRight, ArrowDown and End select heritage, and focus follows the selection with a roving
  `tabindex`, which is the radiogroup pattern rather than a re-invention of it.

`role="radiogroup"` with two `role="radio"` legends rather than `role="switch"`: a switch is on or
off, and neither skin is off. The group's accessible name is `Skin` and each radio's is its own
legend, so a screen reader says "Skin, RAF grey, selected, one of two".

**The wiring**, in `src/main.js`. Line 173, `$('skinChoice').onchange = (event) =>
aircraft.setSkin(event.target.value);`, becomes one writer that both controls go through, so the
select, the switch and the aircraft cannot disagree. This is the same move section 3.12 makes for the
hint's class and string.

```js
// One writer for the skin. The choice lives in aircraft.skinName for the life of the page: no
// localStorage, so it is the session and nothing longer.
const SKINS = ['grey', 'heritage'];
function setSkin(name) {
  if (!SKINS.includes(name) || name === aircraft.skinName || !aircraft.setSkin(name)) return false;
  $('skinChoice').value = name;
  $('skinSwitch').classList.toggle('heritage', name === 'heritage');
  for (const [id, wanted] of [['skinGrey', 'grey'], ['skinHeritage', 'heritage']]) {
    $(id).setAttribute('aria-checked', String(name === wanted));
    $(id).tabIndex = name === wanted ? 0 : -1;
  }
  return true;
}
$('skinChoice').onchange = (event) => setSkin(event.target.value);
```

The `name === aircraft.skinName` guard is what makes a drag cheap: the commit fires as the knob
crosses the middle, so the aircraft changes under the finger rather than on release, and a swipe
back and forth across the midpoint costs one `material.map` assignment each way. `setSkin` at
`src/aircraft.js:65` already caches the cloned texture in `this.skinMaps`, so only the first swap
builds anything.

The listeners go inside the existing `if (touch)` block at `src/main.js:157`, because the switch is
visible only under `body.touch` and that is exactly when `touch` exists. `src/touch.js` stays about
flying: it does not learn what a skin is.

```js
const skinSwitch = $('skinSwitch'), skinTrack = $('skinTrack');
const nearest = (clientX) => {
  const r = skinTrack.getBoundingClientRect();
  return clientX < r.left + r.width / 2 ? 'grey' : 'heritage';
};
let skinSliding = null;
skinSwitch.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
skinSwitch.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.skinLegend')) return;   // the legend's own click handles it
  event.preventDefault();
  skinSliding = event.pointerId;
  skinSwitch.classList.add('sliding');
  setSkin(nearest(event.clientX));
});
window.addEventListener('pointermove', (event) => {
  if (skinSliding !== null && event.pointerId === skinSliding) setSkin(nearest(event.clientX));
});
const endSkinSlide = (event) => {
  if (event.pointerId !== skinSliding) return;
  skinSliding = null;
  skinSwitch.classList.remove('sliding');
};
window.addEventListener('pointerup', endSkinSlide);
window.addEventListener('pointercancel', endSkinSlide);
$('skinGrey').onclick = () => setSkin('grey');
$('skinHeritage').onclick = () => setSkin('heritage');
skinSwitch.addEventListener('keydown', (event) => {
  const back = ['ArrowLeft', 'ArrowUp', 'Home'], on = ['ArrowRight', 'ArrowDown', 'End'];
  if (!back.includes(event.key) && !on.includes(event.key)) return;
  event.preventDefault();
  const name = back.includes(event.key) ? 'grey' : 'heritage';
  setSkin(name);
  $(name === 'grey' ? 'skinGrey' : 'skinHeritage').focus();
});
```

`window.range` gains `setSkin` alongside `stage` and `touchDemo`, which is what lets section 8
photograph the switch in both positions.

The switch is an intro control and nothing moves it into a toolbar, because the touch layer has no
toolbar. `start()` at `src/main.js:110` still does `$('buttons').prepend($('skinControl'))` for the
desktop; on touch both elements are inside `#intro`, which takes `.hidden`, so the choice is made
before ENTER and then stands for the sortie.

**The tier stops throwing the texture away.** Two deletions and one print.

1. `src/main.js:66`, `if (MOBILE) $('skinControl').classList.add('hidden');`, is deleted. The select
   is still hidden under `body.touch` by `index.html:88`, so a phone sees the switch and not the
   dropdown; a desktop at `?tier=mobile` now sees a working select rather than a hidden one.
2. `tools/build.py:177`, `if tier=='mobile':stems.discard('raf_typhoon_heritage')`, is deleted, and
   the module docstring's `the heritage skin left out` at line 6 goes with it.
3. `build()` records each stem's encoded size and, on the mobile tier, prints the heritage skin's own
   figure beside the existing `library ... textures ... page ...` line, so a regression in the source
   PNG cannot quietly eat the budget.

The cost, measured rather than estimated by running the tier's own `encode_texture` over
`textures/raf_typhoon_heritage.png`: the source is 1254 x 1254 RGB and 1,586,762 bytes on disk; at
the mobile tier's 768 px LANCZOS downscale and JPEG q80 it is **79,044 bytes**, and **105,392 bytes**
as base64 in the page. `dist/mobile.html` is 8,886,173 bytes today, so it becomes about 8,991,600
against `MOBILE_BUDGET` of 15,000,000, leaving 6.0 MB of headroom. The build must print both the new
total and the heritage figure, and the reply must quote them.

**`docs/DESIGN.md`.** The registry gains one row, because section 1.4's rule is that a primitive used
more than once is registered rather than minted quietly, and this one is a new object on the layer:

> | toggle switch | `#skinSwitch` | touch only; a 56 x 26 slot with a `--metal` knob at one end and a legend either side; monochrome, the knob's position is the state |

### 10.3 Screen wake lock

Tilt play touches nothing, so the phone's idle timer never resets and the screen dims in the middle
of a sortie. `navigator.wakeLock.request('screen')` is the fix and it needs a user gesture, which is
why it goes inside the ENTER tap.

**Where.** `Touch.enter()` at `src/touch.js:157`, after `this.unlockAudio()` at line 171 and before
`this.renderThrottle()`. `unlockAudio` is synchronous, so the gesture is still live at that point;
that is the whole reason for the ordering. The constructor gains `this.wakeLock = null`,
`this.wakePending = null` and `this.wakeWanted = false` beside `this.fallbackNoted`.

```js
// The screen sleeps during tilt play because nothing touches it. Requested inside the ENTER tap,
// which is the gesture Safari asks for, and again whenever the sortie resumes. Every path is
// wrapped: an unsupported or a refused lock changes nothing and says nothing.
requestWakeLock() {
  // wakePending, not just wakeLock: request() is asynchronous, and the resume path asks directly
  // inside the tap while update() asks again on the very next frame. With only the resolved handle
  // guarding it, the second call lands while the first is still pending and the phone takes two
  // locks, of which release() then frees one.
  if (!this.active || this.wakeLock || this.wakePending) return this.wakePending || Promise.resolve(this.wakeLock);
  try {
    this.wakePending = Promise.resolve(navigator.wakeLock?.request('screen')).then((lock) => {
      if (!lock) return null;
      // A pause or a hide that arrived while the request was in flight: hand the lock straight
      // back rather than storing one nothing will release.
      if (!this.wakeWanted) { try { lock.release?.()?.catch?.(() => {}); } catch { /* gone */ } return null; }
      this.wakeLock = lock;
      // The browser drops the lock itself when the page hides; without this the instance still
      // holds a dead handle and the re-request on resume does nothing.
      lock.addEventListener?.('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
      return lock;
    }).catch(() => null);
    // A settled request must clear the flag whichever way it went, or a refusal locks the layer
    // out of ever asking again.
    return this.wakePending.finally(() => { this.wakePending = null; });
  } catch { this.wakePending = null; return Promise.resolve(null); }
}

releaseWakeLock() {
  const lock = this.wakeLock;
  this.wakeLock = null;
  try { lock?.release?.()?.catch?.(() => {}); } catch { /* already gone */ }
}

// One place, so every pause source is covered: the PAUSE cap, portrait, a hidden tab, a crash and
// the restart. The edge is detected here and update() calls it every frame.
syncWakeLock(paused) {
  const want = this.active && !paused;
  if (want === this.wakeWanted) return Promise.resolve(this.wakeLock);
  this.wakeWanted = want;
  if (want) return this.requestWakeLock();
  this.releaseWakeLock();
  return Promise.resolve(null);
}
```

**When.** Four call sites, all inside `src/touch.js`, so `src/input.js` and the desktop are untouched.
One invariant binds them: `this.wakeWanted` is the intent, and every direct call to
`requestWakeLock()` sets it true first. It is what the edge detector compares against and what the
in-flight branch above checks, so a call that skips it would hand its own lock straight back.

1. `enter()`, after `unlockAudio()`: `this.wakeWanted = true; this.requestWakeLock();`. Setting the
   flag first stops the edge detector re-requesting on the next frame.
2. `update()` at `src/touch.js:209`, one line after the early return:
   `this.syncWakeLock(this.input.paused);`. `loop()` at `src/main.js:259` calls `frame()` on every
   animation frame and `frame()` calls `touch.update()` unconditionally, whatever `stepSim` is, so
   this runs while paused and the release actually happens. That was worth checking rather than
   assuming: had the frame been skipped while paused, the lock would have been held through every
   pause and the release would have been dead code.
3. The resume branch in `bind()` at `src/touch.js:338`,
   `if (input.paused) { this.fire('resume'); return; }`, gains
   `this.wakeWanted = true; this.requestWakeLock();` before the return. The edge detector would catch
   it on the next frame anyway, but the tap is a live gesture and the frame after it is not, and a
   browser that has begun requiring a gesture for the re-request is the one this line is for.
4. A `visibilitychange` listener of the touch layer's own, added in `bind()` beside the portrait
   listener, so `src/input.js:131` keeps doing exactly what it does now:

```js
document.addEventListener('visibilitychange', () => {
  if (!this.active) return;
  if (document.visibilityState !== 'visible') { this.wakeWanted = false; this.releaseWakeLock(); }
  else if (!this.input.paused) { this.wakeWanted = true; this.requestWakeLock(); }
});
```

`src/input.js:131` pauses on hidden, and it runs first because `Input` is constructed at
`src/main.js:50` and `Touch` at `:63`. The listener above reads `document.visibilityState` rather
than the paused flag on the hidden path, so the order cannot matter.

**Support floor, and what happens below it.** Chrome and Edge from 85, Android WebView with them.
Safari on iOS lists support from 16.4, but MDN records the feature as Baseline newly available only
from March 2025, which is Safari 18.4: on a phone between 16.4 and 18.3 the request may be honoured
only in a web app installed to the Home Screen. RANGE is opened from a QR code in a browser tab, so
those phones keep sleeping. There is no video-loop fallback and there will not be one: a hidden
looping muted video is the pre-wake-lock trick and it runs a decode pipeline beside a live WebGL
scene on the same phone GPU, which is a real frame-time cost paid by every phone to help the old
ones. This is a documented degradation, not a designed state, in the same sense as section 6's
missing font.

Nothing is announced when the lock is refused. A hint that says the screen may sleep is a line of
copy about the browser rather than about the aircraft, and section 4.4 has been deleting those.

**The test**, section 7's new item 4, in `tools/test_touch.mjs`, driven through
`Touch.prototype.<method>.call(stub)` exactly as `tools/test_engagement.mjs:157` drives `setSkin`,
so it needs no DOM and no phone. One mechanical note first, because it costs an hour otherwise: node
21 and later define `navigator` as a getter-only global, so `globalThis.navigator = {}` throws
`TypeError: Cannot set property navigator of #<Object> which has only a getter`. The stub goes in
with `Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })`.
The neighbouring `globalThis.window ||=` at `tools/test_touch.mjs:23` works only because node has no
`window`.

> **The wake lock.** With `globalThis.navigator` stubbed to record every `request('screen')` and
> return a lock object that records its own release: `requestWakeLock` on an active layer asks once
> for `'screen'`; `syncWakeLock(true)` releases it and clears the handle; `syncWakeLock(false)` asks
> again; and `syncWakeLock` called twice with the same value asks once, which is the edge detector.
>
> Then the race, which is the assertion that earns its place. With a `request` that returns a promise
> the test resolves by hand, call `requestWakeLock` twice before resolving it, the way the resume tap
> and the frame after it do, and assert that `'screen'` was asked for **once**: a guard on the
> resolved handle alone passes this test only because a stub resolves in a microtask, and on a phone
> it takes two locks and releases one. Then resolve, and assert one lock held.
>
> Then the pause that lands mid-flight: `wakeWanted` false while a request is outstanding, resolve
> it, and assert the lock was released and `this.wakeLock` is null.
>
> Then the phones that cannot: with `globalThis.navigator = {}`, and again with a `request` that
> rejects, both calls resolve to `null`, throw nothing, and leave `wakePending` null so the next call
> can still ask. That last clause is the one that stops a single refusal locking the layer out for
> the rest of the sortie.

### 10.4 Render scale on the phone

Four numbers in `src/main.js` conspire to make a phone look worse than it is.
`basePixelRatio()` at line 35 caps the mobile ratio at 1. `adaptResolution()` at lines 83 to 99 steps
the ratio down by 0.1 to a floor of 0.6 whenever the p95 frame time over the last 120 frames exceeds
20 ms, and steps it back up only when p95 is under 9 ms. A 60 Hz phone's frames are 16.7 ms by
definition, so p95 under 9 ms is a state it can never report: **the recovery branch is unreachable on
every 60 Hz device**, and the first rough patch of a sortie takes the phone to 0.6 for the rest of
it. Charles is right on both counts, and the second one is a bug rather than a taste call.

**The three changes.**

1. `src/main.js:35` becomes `const basePixelRatio = () => Math.min(devicePixelRatio, MOBILE ? 2 : 1.5);`
2. The floor becomes per-tier: 1.0 on mobile, 0.6 on the desktop, which is what it has today.
3. The decision moves out of `adaptResolution` into a pure exported function and its thresholds are
   expressed against the measured frame interval rather than against absolute milliseconds.

Base 2 on a phone and 1.5 on a desktop looks inverted until the pixels are counted. At 844 x 390 CSS
a ratio of 2 is 1688 x 780, 1.32 Mpx. A desktop at 2560 x 1080 and ratio 1.5 is 3840 x 1620,
6.22 Mpx. The phone at its new ceiling draws 21 per cent of the pixels the desktop draws, on a screen
whose physical pixels are a quarter the size, which is why a phone needs the higher ratio and can
afford it. The floor of 1.0 is the point below which the markers' 1 px strokes and the sky's gradient
break up; 0.6 is 36 per cent of the pixels and looks like a video call, which is what Charles saw.

**The decision function.** A new module, `src/quality.js`, because `src/main.js` top-level-awaits the
library and cannot be imported by node, and because a pure decision belongs where a test can reach
it. `tools/build.py:128` globs `src/*.js` and `bundle_code` walks the import graph from `main.js`, so
the new module joins the bundle with no change to the build.

```js
// Adaptive resolution, the decision only. The vsync interval is the median of the window, not a
// constant: 16.7 ms on a 60 Hz phone, 11.1 on a 90 Hz one and 8.3 on a 120 Hz one, and no absolute
// threshold serves all three. A frame worse than one and a half medians is the definition of a slow
// frame that window.range.metrics() already reports, so the number Charles reads on the phone is the
// number this function acts on.
export const SLOW_MS = 22;

export function nextPixelRatio(times, ratio, base, floor = 1) {
  if (times.length < 60) return ratio;
  const sorted = times.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const median = at(0.5), p95 = at(0.95);
  // Round every step: 2 - 0.1 is 1.9000000000000001, and an unrounded ladder never lands on its base.
  const step = (value) => Math.round(value * 10) / 10;
  if ((p95 > median * 1.5 || median > SLOW_MS) && ratio > floor) return Math.max(floor, step(ratio - 0.1));
  if (p95 < median * 1.15 && median <= SLOW_MS && ratio < base) return Math.min(base, step(ratio + 0.1));
  return ratio;
}
```

`adaptResolution` keeps its two-second cadence, its `stressed` guard and its 60-sample minimum, and
loses its arithmetic:

```js
const next = nextPixelRatio(frameTimes.slice(-120), pixelRatio, basePixelRatio(), MOBILE ? 1 : 0.6);
```

**The numbers, and why each one.**

- **1.5 times the median, to step down.** A phone that is hitting its refresh rate reports a p95
  equal to its median, so p95 over median is 1.00 and the test is nowhere near tripping. A phone
  dropping one frame in twenty reports a p95 of two medians. 1.5 sits between them and is the same
  constant `metrics()` already uses for `slowFraction`, so there is one definition of a slow frame in
  the project rather than two.
- **1.15 times the median, to step up.** The gap between 1.15 and 1.5 is the dead band, and it is
  what stops the pixel ratio oscillating on a device sitting on the boundary. A clean 60 Hz phone
  reports 1.00 and recovers; a clean 120 Hz phone reports 1.00 and recovers. That is the branch that
  is unreachable today.
- **22 ms, both ways.** One constant guards the pathology the median rule cannot see on its own: a
  phone whose every frame takes 40 ms reports a p95 within a few per cent of its median, so it would
  otherwise be judged healthy and would climb. A median over 22 ms is under 45.5 frames a second
  sustained, which is
  below every panel rate a phone ships with: 120 Hz is 8.3 ms, 90 Hz is 11.1, 60 Hz is 16.7 and a
  variable panel's 48 Hz floor is 20.8, all of them clear. So `median > 22` means load, not a
  refresh rate, and it steps down and blocks the climb.
- **A step of 0.1 and a window of 120 frames.** Unchanged, because neither was the problem.

The known and accepted behaviour: a 120 Hz phone that settles at a locked 60 fps has a median of
16.7 ms and will climb, converging on the highest ratio that holds a stable 60. For a demo whose
thesis is that the image is the product, stable 60 at ratio 2 is the better answer than stable 120 at
ratio 1.2, and the alternative, estimating the panel interval from the fastest frames rather than the
median, misreads an ordinarily jittery 60 Hz phone as a degraded 120 Hz one and never lets it
recover. The trade is stated so it can be argued with.

**The test**, section 7's new item 5, in `tools/test_touch.mjs`:

> **The render scale.** Drive `nextPixelRatio` with synthetic windows of 120 frame times and assert
> the decision: 120 frames of 16.7 ms steps a 60 Hz phone up; 108 of 16.7 with 12 of 33.4 steps it
> down; 120 frames of 8.3 ms steps a 120 Hz phone up; 108 of 8.3 with 12 of 25 steps it down; 120
> frames of 40 ms steps down on the `SLOW_MS` guard alone, since a flat window's p95 equals its
> median; the same 40 ms window at the floor returns the floor rather than going under it; a healthy
> window at the base returns the base rather than going over it; 120 frames of 20.8 ms, a variable
> panel's 48 Hz floor, still recovers; and fewer than 60 samples returns the ratio untouched. Assert
> the returned values exactly, so the 0.1 rounding is covered too: 2 minus 0.1 is 1.9, not
> 1.9000000000000001.

**Section 7's item 3** gains the five ids this section and 10.2 add, so the markup and the harness
cannot drift: `skinSwitch`, `skinGrey`, `skinTrack`, `skinKnob`, `skinHeritage`.

**What to measure on the phone afterwards**, which only Charles can do: the Pages URL sideways, a
full sortie, then `window.range.metrics()`. The three numbers that decide it are `pixelRatio`, which
should still be at the device's ceiling and never at 1.0; `slowFraction`, which should be under 0.05;
and `p95Ms` against `meanMs`. If it stutters, the fallback is one number: `basePixelRatio()` goes to
`MOBILE ? 1.5 : 1.5`, which is 0.74 Mpx at 844 x 390, still more than double what the phone renders
today, and the measurement is repeated before anything else is changed.

## 11. The caps, second pass

Written after Charles saw the first build (`screenshots/touch-cockpit-844x390.png`, 10 September,
evening). His words: "The control buttons need work, they are box in box so take that under box
away and like too dark I guess? Not translucent enough? Also not equal it's a lil skewed?
Otherwise better." Then: "Maybe equal, in a row single file along the side?" Three faults, one
component. This section supersedes 3.7, the cap geometry rows of 2.4, the "two panels" sentences of
1.1 and 2.3, and the registry rows for `panel` and `switch cap`. Everything else stands.

### 11.1 The bezel goes

`#touchWeapons` loses the `panel` class and every visual property: no film, no blur, no grain, no
rim, no shadow. It is a positioning box (`pointer-events:none`; the caps keep their own). The caps
stand on the frame, and the caps are the glass. Reason: a cap on a bezel is a box in a box, which is
what Charles saw, and the stacked films (.56 panel plus .22 cap, 66 per cent combined) are why the
caps read as too dark. One layer of glass per control, no glass on glass.

### 11.2 One column down the right edge

Three equal caps, 62 x 62, radius 10, in single file down the right edge, mirroring the throttle
panel on the left. Order top to bottom: SEEKER, BOMB, GUN; GUN is lowest because it is held and the
thumb rests there. Laid out with flex, not offsets, so nothing can skew:

```css
#touchWeapons{position:absolute;right:max(18px,calc(var(--sar) + 6px));top:50%;transform:translateY(-50%);
 display:flex;flex-direction:column;gap:8px;width:62px;pointer-events:none}
#touchWeapons .key{position:static;width:62px;height:62px;border-radius:10px;pointer-events:auto}
```

The column is 202 px tall. At 375 px it spans y 86 to 288; `#touchTop` (RECENTRE, PAUSE) ends by
y 54 with a zero inset, so there is 32 px between them; at 390 px, 40 px. The DOM order of the
three buttons already is SEEKER, BOMB, GUN, so the markup does not change. GUN's larger size goes:
equal means equal, and held-versus-tapped is carried by the lit state, not by size. Usable width per
cap is 52 px at 5 px padding; WARMING measures 42.2 px, so every legend in 4.3 still fits with 9 px
to spare. Reason: the L-shaped cluster read as skewed because GUN was 70 tall and its neighbours 56;
a column of equals cannot.

### 11.3 The cap is its own glass, and lighter

```css
:root{--cap-glass:rgba(8,12,15,.48);--cap-glass-dim:rgba(6,10,13,.58);--cap-glass-press:rgba(4,8,10,.62)}
#touchWeapons .key{background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,0) 40%,rgba(0,0,0,.12)),var(--cap-glass);
 box-shadow:inset 0 1px 0 var(--rim-top),inset 1px 0 0 var(--rim-left),inset 0 -1px 0 var(--rim-bottom),
  0 0 0 1px var(--cut),0 1px 1px rgba(0,0,0,.50),0 6px 16px rgba(0,0,0,.34);transform:translateZ(0)}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
 #touchWeapons .key{-webkit-backdrop-filter:blur(8px) saturate(112%);backdrop-filter:blur(8px) saturate(112%)}}
#touchWeapons .key.dim{background-color:var(--cap-glass-dim)}
#touchWeapons .key.pressed{background-color:var(--cap-glass-press)}
```

Blur 8 px, the bible's small-control range, against 14 px on the quadrant panel. The lit, locked,
dim and pressed grammar of 2.3 is unchanged (the wash, the fringe and bloom, the rim inversion on
press); only the films change. `.key::after` carries the grain as `.panel::after` does, at the same
five per cent, and is the first thing to drop if the frame cost says so.

The film figure is not a taste number. Composited in sRGB, which is how the browser does it, over
the sampled worst backdrop behind a control (sRGB about 180, L 0.44 at the 95th percentile), a .48
film of (8,12,15) gives sRGB about 97, L 0.12, and `--ink` reads 5.3:1; at .40 it is sRGB 111, L
0.16, 4.2:1, a fail. The blur pulls the 95th-percentile peak lower still, so the measured figure
will sit above 5.3; the matrix decides. .48 is therefore the lightest film that clears the gate
with the ink this layer uses, and it is one layer where the first build stacked two at 66 per cent,
which is the translucency Charles asked for.

The quadrant panel takes the same film, `--panel-tint:rgba(8,12,15,.48)`, so the two controls are
one material; its 8 px gate legends read 5.3:1 by the same arithmetic. If the matrix fails the
quadrant alone, it goes back to .52 and the caps hold .48, and the reason is written here.

### 11.4 The intro

ENTER AIRCRAFT takes the cap glass above, blur included, so the first control the player touches is
the same material as the caps. The switch track keeps its slot tint; the knob is unchanged.

### 11.5 Blur count and cost

During play: the quadrant and three caps, four `backdrop-filter` layers, against two in the first
build and seven in the shipped build. The fallback ladder of section 8 holds: grain first, then the
cap blur to 6 px, then the film up and the matrix re-run.

### 11.6 DESIGN.md

Touch material: "There are exactly two panels on screen, the throttle quadrant and the weapons
bezel, and only they carry `backdrop-filter`. Switch caps ... are painted on a panel and never given
a blur of their own. A cap adds film, not blur" becomes: "There is one panel on screen, the throttle
quadrant, and three caps in a column down the opposite edge. The panel and each cap are glass of
their own: the panel a .48 film over a 14 px blur, a cap a .48 film over an 8 px blur, and nothing
sits on glass." The radius family: panels 15, caps 10, slot 13, lever 5, text none. Registry: the
`panel` row is `#quadrant` alone; the `switch cap` row reads "`#touchWeapons .key`; touch only;
62 x 62, radius 10, its own blur; a column of three, SEEKER, BOMB, GUN; states resting, lit, locked,
dim, pressed".

### 11.7 Verification

The 27-cell matrix of section 8, exit 0, plus one geometry assertion the verifier makes in the page
at 667 x 375 and 844 x 390: `#touchWeapons` top is at least 8 px below `#touchTop` bottom and its
bottom at least 16 px above the frame edge. The look review compares each cell against the first
build's frame and answers Charles's three points in order: no box in a box; visibly lighter and
see-through; three equal squares on one line.

## 12. Five corrections, second build

Charles, 10 September, late, on the second build, and his instruction was to keep it simple and
do it. Each item is one change; none of them reopens the rest of this document.

1. **The throttle panel is more opaque.** `--panel-tint` goes from .52 to .72. The caps keep .52.
   The quadrant is the only element carrying the `panel` class since section 11, so the token
   change reaches nothing else. His words: "more opacity on the throttle box, not the slider itself
   but the thing it sits on".
2. **The objective line is gone on touch.** `body.touch #objective{display:none}`; `updateObjective`
   still writes it, the desktop still shows it. The hints carry the sortie. His words: the copy under
   RANGE did not read right.
3. **Pitch down reaches further.** `ELEVATION_DOWN = 55°`; a push maps the tilt to an elevation of
   minus 55 where a pull still maps to plus 25 (`ELEVATION_MAX`). The asymmetry is the point: a held
   pull past 25 degrees loops, a held push to 55 is a dive the instructor flies. Section 2 of the
   mobile spec said ∓25 and is superseded on the down side.
4. **Swipe to look.** With sensors live, a drag on the view swings the camera (`input.look`,
   `LOOK_GAIN` .006 rad per px, the desktop's clamps of ±2.9 and ±1.1) while the tilt keeps steering;
   `input.touchLook` holds `freeLook` true for the drag, and on release the camera eases back through
   the `returningLook` decay the C key already uses. Without sensors a drag still aims. The desktop
   free-look wording does not replace the touch hint.
5. **The canopy bands are gone.** `body.touch #hud` no longer paints the two gradients; HUD text
   stands on the frame with a tight dark halo (`0 0 2px`, `0 1px 2px`, `0 0 7px`, near-black).
   The QA probe now keeps the text-shadow when it blanks the ink, so the matrix measures the ink
   against the halo the reader sees rather than against the bare sky. His words: the top and bottom
   bars read as faded and were not the vibe.

Verification is section 8's matrix as before; the contrast figures for HUD text are now against
the halo, which is stated in `tools/contrast.py` and `tools/qa_touch.mjs`.
