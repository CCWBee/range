# Stream B: Blender assets, exporter, skin

What `tools/model_range.py`, `tools/export_meshes.py` and `tools/textures_fallback.py` deliver, for
the renderer. Spec: `docs/specs/2026-09-06-range-v2.md` sections 0, 1.1, 4. The aircraft, gear,
stores, airfield, scenery, terrain and effect primitives are authored in Blender in the renderer's
body frame and exported to `assets/meshes.json` (manifest) plus `assets/meshes.bin` (binary).

## The library

Version 2 format. 50 assets: the aircraft as separate hinged parts (`jet_body`, `jet_canopy`,
`jet_canard_l/r`, `jet_elevon_l/r`, `jet_rudder`, `jet_airbrake`, `jet_nozzle_l/r`), the gear
(`jet_gear_nose`, `jet_gear_main_l/r`, `jet_door_nose`, `jet_door_main_l/r`), `bomb`, and the
scenery (`hangar_arch`, `has`, `tower`, `fire_station`, `fire_tender`, `service_block`,
`fuel_tank`, `blast_fence`, `fence_post`, `sign`, `windsock`, `bowser`, `tractor`, `gpu_cart`,
`landrover`, `chocks`, `container`, `hesco`, `rock_1/2/3`, `groyne`, `target`, `target_hulk`,
`wreck`, `lamp`, `pavement`, `runway_markings`, `ocean`, plus the effect primitives `sky`, `quad`,
`flame`, `blast`). The manifest carries the `pivots` map (each `{point, axis, range}` in body
coordinates) and the terrain height grid (256 x 256 at 110 m spacing, origin -12000, -14000).

`assets/meshes.bin` holds the geometry as typed arrays at the manifest's byte offsets, welded and
indexed, UVs read per loop. The renderer decodes it with `atob`, since the bundle's CSP blocks
`fetch` of data URLs.

## The skin: a model plus a separate tiling paint, not a bake

The aircraft is a model with a swappable skin, per the correction on 6 September: no Cycles bake and
no per-mesh atlas. The jet parts carry an object-space projection so a tiling paint sheet runs
continuously across the fuselage, wings, fin and cans. The manifest's `airframe` material references
the shared files `airframe` (base colour), `airframe_normal` (seam and rivet relief, written by
`tools/textures_fallback.py` from the paint sheet's luminance) and a `uvScale` of 2 metres per uv
unit. Metallic and roughness are plain numbers per material. Markings (roundels, the fin code,
walkway stripes) are modelled as geometry with their own materials, which keeps the skin generic.

The abandoned bake script and its output are in `_archive/abandoned-bake/`.

## Pivots and hinge axes

Every moving part is exported pivot-relative, with a unit hinge axis chosen so a positive angle is
the sign the physics uses (elevons trailing edge down, canards leading edge up, rudder trailing edge
left, airbrake and doors opening, gear extending). `model_range.py` asserts each pivot's stowed pose
round-trips through its axis to within 1e-6 before export, so the renderer's
`setFromAxisAngle(axis, angle)` reconstructs the deflection without a gap at the hinge.

Main gear at x = ±1.935 (the real 3.87 m track), matching the physics after the taxi-rollover fix.

## Terrain agreement

`terrain_height(x, z)` in `model_range.py` is the byte-for-byte twin of `terrainHeight` in
`physics.js`: same integer noise hash, same coast formula. Checked at the five spec sample points,
the two agree to six decimals:

| x, z | height |
| --- | --- |
| 0, 0 | 0.000000 |
| -1000, -4200 | -0.514481 |
| 900, -3000 | -0.219076 |
| 3000, -4000 | -21.564293 |
| 5500, -4000 | 1.000000 |

## Deviations from the spec

- **No `bake_jet.py` and no jet atlas.** Replaced by the tiling skin above, per the user's
  correction. `tools/bake_scenery.py` for vertex AO was not needed either: the scenery reads well
  under the overcast light with modelled form and the contact and shadow passes, so a per-vertex AO
  bake was not run. If flat shading shows on a later pass, add it then.
- **Scenery not yet placed by count in every category.** The library has the assets; the renderer
  places them (stream R, section 5.5). Approach lighting, PAPI and edge lights are drawn by the
  renderer as instanced lamps rather than modelled here.

## Screenshots

Blender viewport captures of the aircraft are under `screenshots/blender/` (rear three-quarter,
side, top, front). The rear three-quarter reads as a Typhoon: delta wing, canards, single fin,
twin cans with petals, canopy.
