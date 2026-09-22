# Water tiling: brief

23 September 2026. Charles: "can we do something about the water tiling in looks eh, cant be too
hard to fix".

## What is wrong

The sea has no texture. Its surface normal comes from a handful of analytic waves in the ocean
fragment shader, `buildOcean()` in `src/world.js` (the block from `float a=` to
`vec3 normal=normalize(vec3(a*.045,1.,b));`):

- both tiers: `a = sin(x*.06 + t*.7) + sin(z*.093 - t*.5)`, `b = cos(x*.087 + z*.04 + t)*.06`;
- desktop (`OCEAN_HI`) adds two directional sines and one cosine;
- everything is multiplied by `waveFade = exp(-dist*.0007)`;
- a foam sparkle `smoothstep(.78,.95, noise(worldP.xz*.1 + t*.1))` on top.

Two of the main waves run along the world axes, so their sum is an egg-crate lattice that repeats
every 70 to 105 m. Rendered in Brave on 23 September (`_archive/water-qa/`, gitignored):

- from 350 to 430 m the whole sea is a regular grid of cells, and the phone (fewest waves) is a
  clean diagonal diamond lattice;
- towards the horizon the same waves alias into a moiré band;
- at 80 m the desktop shows straight parallel bands with a grid across them.

## What must survive

- The dusk look and its restraint: a dark teal body, the sky reflection (full cloudy sky on the
  desktop, the plain gradient on the phone), Fresnel, fog, the coast shelf and desktop breaker from
  `coastSDF`, the aircraft's wake `envelope` block, which perturbs `normal` after it is built.
- The low-sun glitter track (`pow(ndh,90.)` both tiers; 240 and 26 on the desktop). It is the
  strongest single cue at this light angle and depends on the normal's slope statistics, so the new
  normal needs slopes of the same order as today's (`a*.045` peaks near 0.09 on the desktop).
- Tier gating through the compile-time `OCEAN_HI` define, which is chosen at runtime from
  `this.tier`; both bundles carry the same source.
- No textures and no new uniforms unless a strong reason is given (the bundle is one HTML file; a
  normal-map texture is allowed only if it clearly beats the procedural options).

## Constraints

- WebGL 2 only (the page refuses to start without it), three.js r160 `ShaderMaterial`, so GLSL ES
  3.0 via three's compatibility layer: `dFdx`, `dFdy` and `fwidth` are available. `texture2D` is
  the spelling used in this file.
- Fragment precision is highp. World coordinates reach about 60 km (the plane is 120 km wide and
  follows the camera), and `time` grows without bound; keep phases numerically sane.
- Available in scope: `worldP`, `time`, `dist`, `eye`, `waveFade` (may be replaced), and from
  `NOISE_GLSL`: `hash(vec2)`, `noise(vec2)` (value noise, smoothstep-interpolated) and `fbm(vec2)`
  (five octaves, rotated by `mat2(1.6,1.2,-1.2,1.6)` per octave).
- Cost: the phone runs this at pixel ratio up to 2 with the sea filling much of a coastal frame. The
  phone path today is three trig calls plus one `noise` for the foam; a phone budget of roughly four
  to eight trig calls or two to three `noise` calls is reasonable. The desktop has headroom (1.5 to
  1.9 ms a whole frame on the RTX 5070 Ti).

## Acceptance

1. No visible period or lattice at any altitude from 30 m to 1,500 m, on either tier.
2. No moiré towards the horizon: detail fades with the pixel footprint, not with a fixed distance.
3. The glitter track is still there, and still breaks into sparkle.
4. It still reads as a calm dusk sea, not a storm and not glass.
5. Phone cost stays within the budget above; desktop cost is not a concern within reason.
6. Verified by rendering both bundles in Brave through the browser extension at fixed poses (80 m,
   350 m and 1,000 m over open sea; a low pass beside the coast), before and after. No headless
   Chrome (OPERATING_RULES, 22 September 2026).
