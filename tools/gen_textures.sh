#!/usr/bin/env bash
# Generate the v2 tiles and sprites through Codex image generation, one at a time, and
# post-process them into textures/. Prompts live in concepts/prompts.json under "textures-v2".
# Usage: bash tools/gen_textures.sh [name ...]   (no names = every entry not yet generated)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="E:/claude-projects/_tools/codex-run.sh"
LOGDIR="$ROOT/tools/gen-logs"; mkdir -p "$LOGDIR"
names=$(python - "$ROOT" "$@" <<'EOF'
import json,sys,os
root=sys.argv[1]; want=sys.argv[2:]
d=json.load(open(os.path.join(root,'concepts/prompts.json'),encoding='utf-8'))
for e in d['textures-v2']:
    if want and e['name'] not in want: continue
    if not want and os.path.exists(os.path.join(root,e['out'])): continue
    print(e['name'])
EOF
)
for name in $names; do
  prompt=$(python - "$ROOT" "$name" <<'EOF'
import json,sys,os
root,name=sys.argv[1],sys.argv[2]
d=json.load(open(os.path.join(root,'concepts/prompts.json'),encoding='utf-8'))
e=[x for x in d['textures-v2'] if x['name']==name][0]
print("Use your built-in image_gen tool to generate ONE image. Do not write any files yourself and do not call the CLI fallback. Prompt: "+e['prompt'].replace('\n',' ')+" After generating, print the absolute path of the saved PNG on its own line prefixed with 'SAVED: '.")
EOF
)
  log="$LOGDIR/$name.log"
  echo "=== $name $(date +%H:%M:%S)"
  bash "$RUN" --dir "$ROOT" --prompt "$prompt" --sandbox read-only --effort low --timeout 420 --log "$log" > "$log.out" 2>&1
  rc=$?
  if [ $rc -eq 75 ]; then echo "USAGE CAP: stopping"; cat "$log.out" | tail -3; exit 75; fi
  src=$(grep -o 'SAVED: .*' "$log.final" 2>/dev/null | head -1 | sed 's/^SAVED: //' | tr -d '\r')
  [ -z "$src" ] && src=$(grep -o 'SAVED: .*' "$log.out" 2>/dev/null | head -1 | sed 's/^SAVED: //' | tr -d '\r')
  if [ -z "$src" ] || [ ! -f "$src" ]; then
    src=$(ls -t /c/Users/Charles/.codex/generated_images/*/*.png 2>/dev/null | head -1)
    # only accept a fallback newer than this run started
    if [ -n "$src" ] && [ "$src" -ot "$log.out" ]; then src=""; fi
  fi
  if [ -z "$src" ]; then echo "FAILED $name rc=$rc (no image)"; tail -3 "$log.out"; continue; fi
  python "$ROOT/tools/process_texture.py" "$ROOT" "$name" "$src" && echo "OK $name <- $src"
done
echo "=== done $(date +%H:%M:%S)"
