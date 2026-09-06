"""Post-process one generated image into its texture file.

Usage: python tools/process_texture.py <root> <name> <source.png>
Kinds (from concepts/prompts.json "textures-v2"): tile (seamless JPEG), sprite (chroma keyed
RGBA PNG), cloud (luminance to alpha PNG). Keeps the raw generation in textures/raw/.
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageChops, ImageFilter

root, name, src = sys.argv[1], sys.argv[2], sys.argv[3]
entries = json.load(open(os.path.join(root, 'concepts/prompts.json'), encoding='utf-8'))['textures-v2']
entry = [e for e in entries if e['name'] == name][0]
out = os.path.join(root, entry['out'])
os.makedirs(os.path.dirname(out), exist_ok=True)
raw_dir = os.path.join(root, 'textures/raw')
os.makedirs(raw_dir, exist_ok=True)
raw_copy = os.path.join(raw_dir, name + '.png')
if os.path.abspath(src) != os.path.abspath(raw_copy):
    shutil.copy(src, raw_copy)
kind = entry.get('kind', 'tile')
size = entry.get('size', 1024)


def make_seamless(img, band=96):
    """Blend the wrapped seams with an offset copy so the tile repeats without a hard line."""
    w, h = img.size
    shifted = ImageChops.offset(img, w // 2, h // 2)
    mask = Image.new('L', (w, h), 0)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            dx = min(abs(x - w // 2), band) / band
            dy = min(abs(y - h // 2), band) / band
            d = min(dx, dy)
            px[x, y] = int(255 * (1 - d) ** 2)
    mask = mask.filter(ImageFilter.GaussianBlur(band / 6))
    return Image.composite(img, shifted, mask)


if kind == 'tile':
    img = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    img = make_seamless(img)
    img.save(out, quality=88, optimize=True)
elif kind == 'sprite':
    raw = Image.open(src)
    has_alpha = raw.mode in ('RGBA', 'LA')
    transparent = 0
    if has_alpha:
        alpha = raw.getchannel('A')
        transparent = sum(1 for v in alpha.get_flattened_data() if v == 0) / (raw.width * raw.height)
    if has_alpha and transparent > 0.05:
        # The generator already returned a cut-out with real alpha: use it, and firm up the soft
        # halo so semi-transparent glow does not fringe the sprite in the scene.
        img = raw.convert('RGBA')
        alpha = img.getchannel('A').point(lambda v: int(255 * min(1.0, max(0.0, (v / 255 - 0.3) / 0.6))))
        img.putalpha(alpha)
    else:
        keyer = r'C:/Users/Charles/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py'
        tmp = os.path.join(raw_dir, name + '.keyed.png')
        subprocess.run([sys.executable, keyer, '--input', src, '--out', tmp, '--auto-key', 'border',
                        '--soft-matte', '--transparent-threshold', '12', '--opaque-threshold', '220',
                        '--despill'], check=True)
        img = Image.open(tmp).convert('RGBA')
    bbox = img.getchannel('A').getbbox() or (0, 0, img.width, img.height)
    img = img.crop(bbox)
    side = max(img.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.width) // 2, side - img.height))
    square.resize((size, size), Image.LANCZOS).save(out, optimize=True)
elif kind == 'cloud':
    img = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    lum = img.convert('L')
    # Fade to transparent towards the edges so the sprite never shows a square.
    w, h = lum.size
    vignette = Image.new('L', (w, h), 0)
    vp = vignette.load()
    for y in range(h):
        for x in range(w):
            r = (((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) ** 0.5
            vp[x, y] = int(255 * max(0.0, min(1.0, (1.05 - r) / 0.35)))
    alpha = ImageChops.multiply(lum, vignette)
    rgba = Image.merge('RGBA', (*img.split(), alpha))
    rgba.save(out, optimize=True)
print('wrote', out, kind, size)
