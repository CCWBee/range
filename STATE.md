# STATE

## Where it stands

6 September 2026. Baseline `9daab90` is the demo as the Codex session left it: flying, 144 fps at
1080p, five staged screenshots, single-file bundle. The v2 spec (`docs/specs/2026-09-06-range-v2.md`)
is written: rigid-body flight model with FCS and wheel contacts, mouse-aim instructor, textured
aircraft with separate moving parts, grounded scene with clutter and lights, modular renderer.

## Open threads

- Spec review (four lenses, read-only) not yet run.
- Texture generation through Codex (`tools/gen_textures.sh`) not yet started.
- Streams P (physics, control, tests) and B (Blender) not yet launched. R (renderer) follows them.

## Next action

Run the spec review workflow, fold its findings into the spec, then launch P and B in parallel with
the texture loop in the background. Resume handles (fill in as they appear):

- spec review: scriptPath `<pending>`, runId `<pending>`
- streams P + B: scriptPath `<pending>`, runId `<pending>`
- stream R: `<pending>`
- build-review-fix: `<pending>`

## Gotchas

See `CLAUDE.md`. Blender is live on 127.0.0.1:9876 with `assets/RANGE.blend` open from the new
path (re-pointed with `save_as_mainfile` on 6 September).
