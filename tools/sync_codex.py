"""Mirror the RANGE project into the old Codex app workspace folder.

    python tools/sync_codex.py [--dry-run]

E:\\claude-projects\\range is canonical. The Codex folder is a read-only mirror kept current so
that opening the project there shows the present state rather than the 5 September build. Anything
edited in the mirror is overwritten by the next run, so edit the canonical copy.

Skipped: .git, the vendored MCP client under tools/python (61 MB, and the mirror does not drive
Blender), textures/raw and the generation logs (intermediate), Blender's autosave .blend1, and the
two log files the running Blender session holds open in the mirror.
"""
import filecmp
import shutil
import sys
from pathlib import Path

SRC = Path(r'E:/claude-projects/range')
DST = Path(r'C:/Users/Charles/Documents/Codex/2026-09-05/paste-this-it-is-anshu-s')
SKIP_DIRS = {'.git', 'python', 'raw', 'gen-logs', '__pycache__', 'node_modules', 'scratch'}
SKIP_FILES = {'blender.log', 'blender-error.log', 'RANGE.blend1'}
dry = '--dry-run' in sys.argv

copied = skipped = failed = 0
for src in SRC.rglob('*'):
    rel = src.relative_to(SRC)
    if any(part in SKIP_DIRS for part in rel.parts):
        continue
    if src.is_dir():
        continue
    if src.name in SKIP_FILES:
        continue
    dst = DST / rel
    if dst.exists() and dst.stat().st_size == src.stat().st_size and filecmp.cmp(src, dst, shallow=True):
        skipped += 1
        continue
    if dry:
        print('would copy', rel)
        copied += 1
        continue
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
    except OSError as error:
        print('FAILED', rel, error)
        failed += 1

# Remove mirror files that no longer exist in the canonical copy, so a rename does not leave a
# stale twin behind. The note and the files we deliberately skip are left alone.
removed = 0
keep = {'CODEX-NOTE.md', 'MOVED.txt'}
for dst in DST.rglob('*'):
    rel = dst.relative_to(DST)
    if any(part in SKIP_DIRS for part in rel.parts) or dst.is_dir():
        continue
    if dst.name in SKIP_FILES or dst.name in keep:
        continue
    if not (SRC / rel).exists():
        if dry:
            print('would remove', rel)
        else:
            dst.unlink()
        removed += 1

print(f'{"would copy" if dry else "copied"} {copied}, unchanged {skipped}, removed {removed}, failed {failed}')
print('mirror:', DST)
