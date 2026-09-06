# STATE

## Where it stands

6 September 2026. Baseline `9daab90` is the demo as the Codex session left it: flying, 144 fps at
1080p, five staged screenshots, single-file bundle. The v2 spec (`docs/specs/2026-09-06-range-v2.md`)
is written: rigid-body flight model with FCS and wheel contacts, mouse-aim instructor, textured
aircraft with separate moving parts, grounded scene with clutter and lights, modular renderer.

## Open threads

- Spec review done (workflow `wf_1d71b4a6-5bd`; its 65 verifier agents died on the session usage
  limit, so the 76 lens findings were judged by the session and folded into the spec by hand;
  commit "Spec revision after the four-lens review").
- Texture generation through Codex (`tools/gen_textures.sh`): first attempt at 10:36 hit the
  Codex usage cap (reset 14:23 on 6 Sep) and a CRLF bug in the script, both fixed; rerun it.
- Streams P (physics, control, tests) and B (Blender) launching next. R (renderer) follows them.

## Next action

Launch P and B in parallel (script in the session scratchpad,
`range-streams-pb.workflow.js`) with the texture loop in the background; when both streams have
committed, launch R, then build-review-fix with `node tools/test_flight.mjs` as the check, then
the visual gate. Resume handles (fill in as they appear):

- streams P + B: scriptPath `<pending>`, runId `<pending>`
- stream R: `<pending>`
- build-review-fix: `<pending>`

## Gotchas

See `CLAUDE.md`. Blender is live on 127.0.0.1:9876 with `assets/RANGE.blend` open from the new
path (re-pointed with `save_as_mainfile` on 6 September).
