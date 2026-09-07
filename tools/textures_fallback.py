"""Procedural stand-ins for the generated textures of spec 4.4.

Writes every file in the table below that does not already exist, so a usage cap on the image
generator never stalls the asset stream. A generated file that lands later replaces the stand-in
by overwriting it; this script never overwrites anything. `concrete_normal.jpg` is not generated
by anyone: it is derived here from the luminance of `concrete.png` whenever it is missing.

    python tools/textures_fallback.py            # write what is missing
    python tools/textures_fallback.py --force    # rewrite the stand-ins (never the three originals)

Tiles are built on a periodic lattice so they repeat without a seam. Sprites are RGBA with the
clump sitting on the bottom edge, matching the keyed generations that replace them.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / 'textures'
ORIGINALS = {'concrete.png', 'airframe.png', 'sky.png'}
FORCE = '--force' in sys.argv
rng = np.random.default_rng(83)


def lattice(period, seed):
    """Random values on a periodic lattice, one per cell."""
    return np.random.default_rng(seed).random((period, period))


def value_noise(size, period, seed):
    """Tileable value noise: bilinear blend of a periodic lattice, smoothstep weights."""
    g = lattice(period, seed)
    u = np.linspace(0, period, size, endpoint=False)
    ix = np.floor(u).astype(int)
    fx = u - ix
    tx = fx * fx * (3 - 2 * fx)
    x0, x1 = ix % period, (ix + 1) % period
    a = g[np.ix_(x0, x0)]
    b = g[np.ix_(x0, x1)]
    c = g[np.ix_(x1, x0)]
    d = g[np.ix_(x1, x1)]
    tz = tx[:, None]
    txx = tx[None, :]
    return (a * (1 - txx) + b * txx) * (1 - tz) + (c * (1 - txx) + d * txx) * tz


def fbm(size, period, seed, octaves=6, gain=0.5):
    """Tileable fractal noise in 0..1."""
    out = np.zeros((size, size))
    amp, total = 1.0, 0.0
    for i in range(octaves):
        out += amp * value_noise(size, period * 2 ** i, seed + i * 17)
        total += amp
        amp *= gain
    return out / total


def seamless(img):
    """Blend a non-periodic image with its half-offset copy so the wrapped edges match."""
    h, w = img.shape[:2]
    shifted = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    y = np.abs(np.arange(h) - h / 2) / (h / 2)
    x = np.abs(np.arange(w) - w / 2) / (w / 2)
    # Weight 1 at the centre of the original, 0 on its edges, so the seam only ever shows
    # where the offset copy (whose seam sits at the centre) is fully blended out.
    wy = np.clip(1 - y, 0, 1)
    wx = np.clip(1 - x, 0, 1)
    m = np.minimum(wy[:, None], wx[None, :])
    m = m * m * (3 - 2 * m)
    if img.ndim == 3:
        m = m[..., None]
    return img * m + shifted * (1 - m)


def save_rgb(name, arr, quality=88):
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), 'RGB').save(
        TEX / name, quality=quality, optimize=True)


def save_rgba(name, rgb, alpha):
    a = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    rgb8 = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    Image.fromarray(np.dstack([rgb8, a]), 'RGBA').save(TEX / name, optimize=True)


def concrete_luminance(size):
    img = Image.open(TEX / 'concrete.png').convert('L').resize((size, size), Image.LANCZOS)
    return np.asarray(img, dtype=np.float64) / 255


def moor(size=1024):
    """Heather and rough grass: green and straw grass broken by brown heather and dark peat."""
    n1 = fbm(size, 4, 1)
    n2 = fbm(size, 16, 2)
    n3 = fbm(size, 64, 3, octaves=3)
    grass = np.array([0.36, 0.40, 0.22])
    straw = np.array([0.52, 0.47, 0.28])
    heather = np.array([0.30, 0.22, 0.20])
    peat = np.array([0.14, 0.12, 0.09])
    t = np.clip((n1 - 0.35) * 3, 0, 1)[..., None]
    col = grass * (1 - t) + heather * t
    s = np.clip((n2 - 0.55) * 4, 0, 1)[..., None]
    col = col * (1 - s) + straw * s
    p = np.clip((0.42 - n2) * 5, 0, 1)[..., None] * np.clip((n1 - 0.4) * 4, 0, 1)[..., None]
    col = col * (1 - p) + peat * p
    col *= (0.75 + 0.5 * n3)[..., None]
    col *= 0.85  # wet, dusk-neutral
    save_rgb('moor.jpg', col)


def tarmac(size=1024):
    """Darkened concrete with a fine aggregate grain and damp patches."""
    lum = seamless(concrete_luminance(size))
    grain = fbm(size, 128, 5, octaves=2)
    damp = fbm(size, 4, 6, octaves=4)
    v = 0.16 + 0.10 * lum + 0.05 * (grain - 0.5) - 0.05 * np.clip((damp - 0.5) * 3, 0, 1)
    col = np.dstack([v * 0.96, v, v * 1.04])
    save_rgb('tarmac.jpg', col)


def corrugated(size=1024):
    """Vertical corrugations with paint wear and rust streaks under fastener rows."""
    x = np.arange(size) / size
    ribs = 0.5 + 0.5 * np.sin(x * 2 * math.pi * 24)
    shade = (0.75 + 0.25 * ribs)[None, :].repeat(size, 0)
    wear = fbm(size, 8, 7)
    streaks = fbm(size, 32, 8, octaves=3)
    y = np.arange(size) / size
    rows = np.clip(1 - np.abs(((y * 4) % 1) - 0.08) * 12, 0, 1)[:, None]
    drip = np.clip(((y * 4) % 1) * 2.5, 0, 1)[:, None] * (streaks > 0.55)
    base = np.array([0.42, 0.46, 0.40])
    chalk = np.array([0.58, 0.60, 0.56])
    rust = np.array([0.36, 0.20, 0.10])
    w = np.clip((wear - 0.5) * 3, 0, 1)[..., None]
    col = base * (1 - w) + chalk * w
    r = np.clip(rows * 0.6 + drip * 0.5, 0, 1)[..., None]
    col = col * (1 - r) + rust * r
    col = col * shade[..., None]
    save_rgb('corrugated.jpg', col)


def grime(size=1024):
    """Mostly white mask with soft vertical streaks and darker smudges."""
    streak = fbm(size, 16, 9, octaves=4)
    # Stretch the streaks vertically by resampling a wide-period noise.
    vert = np.repeat(fbm(size, 64, 10, octaves=2)[:size // 8], 8, axis=0)[:size]
    smudge = fbm(size, 3, 11, octaves=5)
    v = 1 - 0.35 * np.clip((streak - 0.45) * 2.5, 0, 1) - 0.25 * np.clip((smudge - 0.55) * 4, 0, 1)
    v -= 0.15 * np.clip((vert - 0.5) * 3, 0, 1)
    v = np.clip(v, 0, 1)
    save_rgb('grime.jpg', np.dstack([v, v, v]))


def blades(size, count, height, colours, width, seed, curl=0.35):
    """Draw tapered blades fanning up from the bottom centre; returns (rgb, alpha) arrays."""
    r = np.random.default_rng(seed)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    base = (size / 2, size - 2)
    for _ in range(count):
        ang = r.uniform(-1.05, 1.05)
        length = size * height * r.uniform(0.55, 1.0)
        bend = r.uniform(-curl, curl)
        col = colours[r.integers(len(colours))]
        pts = []
        w = width * size * r.uniform(0.6, 1.2)
        for side in (1, -1):
            for t in (np.linspace(0, 1, 9) if side > 0 else np.linspace(1, 0, 9)):
                a = ang + bend * t * t
                x = base[0] + math.sin(a) * length * t + r.uniform(-1, 1) * 0.3
                y = base[1] - math.cos(a) * length * t
                nx, ny = math.cos(a), math.sin(a)
                half = w * (1 - t) * 0.5
                pts.append((x + nx * half * side, y + ny * half * side))
        d.polygon(pts, fill=tuple(int(c * 255) for c in col) + (255,))
    arr = np.asarray(img, dtype=np.float64) / 255
    return arr[..., :3], arr[..., 3]


def grass_tuft(size=512):
    rgb, a = blades(size, 60, 0.9, [(0.34, 0.40, 0.18), (0.44, 0.46, 0.22), (0.55, 0.50, 0.28),
                                    (0.28, 0.32, 0.14)], 0.018, 21)
    save_rgba('grass_tuft.png', rgb, a)


def gorse(size=512):
    rgb, a = blades(size, 140, 0.62, [(0.16, 0.22, 0.10), (0.20, 0.26, 0.12), (0.24, 0.28, 0.13)],
                    0.014, 22, curl=0.9)
    # A few yellow flower dots on the outside of the bush.
    img = Image.fromarray(np.dstack([np.clip(rgb * 255, 0, 255).astype(np.uint8),
                                     np.clip(a * 255, 0, 255).astype(np.uint8)]), 'RGBA')
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(23)
    for _ in range(40):
        x, y = r.uniform(size * 0.2, size * 0.8), r.uniform(size * 0.45, size * 0.9)
        if a[min(int(y), size - 1), min(int(x), size - 1)] > 0.5:
            d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(230, 200, 60, 255))
    img.save(TEX / 'gorse.png', optimize=True)


def tree_card(size=512):
    """Wind-bent conifer belt segment: a cluster of dark triangles leaning to the right."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(24)
    for i in range(9):
        x = size * (0.08 + i * 0.105) + r.uniform(-8, 8)
        h = size * r.uniform(0.55, 0.95)
        w = size * r.uniform(0.09, 0.14)
        lean = h * 0.18
        shade = r.uniform(0.7, 1.0)
        col = (int(28 * shade), int(40 * shade), int(30 * shade), 255)
        # Three stacked tiers give a conifer outline; the top tier leans downwind.
        for tier in range(3):
            y0 = size - 2 - h * (0.25 + tier * 0.25)
            y1 = size - 2 - h * tier * 0.28
            tw = w * (1.15 - tier * 0.3)
            d.polygon([(x - tw, y1), (x + tw, y1), (x + lean * (tier + 1) / 3, y0)], fill=col)
        d.rectangle((x - 3, size - h * 0.12, x + 3, size), fill=(35, 28, 22, 255))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(TEX / 'tree_card.png', optimize=True)


def cloud(index, size=512):
    """Soft puff: fractal density with a radial fade, luminance doubling as alpha."""
    n = fbm(size, 3, 40 + index, octaves=6, gain=0.55)
    yy, xx = np.mgrid[0:size, 0:size] / size * 2 - 1
    rad = np.sqrt(xx * xx + (yy * 1.35) ** 2)
    fade = np.clip((1.0 - rad) / 0.55, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    dens = np.clip((n - 0.30) * 2.2, 0, 1) * fade
    rgb = np.dstack([0.62 + 0.3 * dens, 0.66 + 0.3 * dens, 0.72 + 0.26 * dens])
    save_rgba(f'cloud_{index}.png', rgb, dens)


def concrete_normal(size=1024):
    """Tangent-space normal map from the luminance of concrete.png (Sobel gradients)."""
    lum = concrete_luminance(size)
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1.0)), dtype=np.float64) / 255
    dx = np.roll(blur, -1, axis=1) - np.roll(blur, 1, axis=1)
    dy = np.roll(blur, -1, axis=0) - np.roll(blur, 1, axis=0)
    strength = 6.0
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(dx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.dstack([nx / length, ny / length, nz / length]) * 0.5 + 0.5
    save_rgb('concrete_normal.jpg', normal, quality=92)


TABLE = [
    ('moor.jpg', moor), ('tarmac.jpg', tarmac), ('corrugated.jpg', corrugated),
    ('grime.jpg', grime), ('grass_tuft.png', grass_tuft), ('gorse.png', gorse),
    ('tree_card.png', tree_card), ('cloud_1.png', lambda: cloud(1)),
    ('cloud_2.png', lambda: cloud(2)), ('cloud_3.png', lambda: cloud(3)),
    ('concrete_normal.jpg', concrete_normal),
]


def main():
    TEX.mkdir(exist_ok=True)
    written, kept = [], []
    for name, fn in TABLE:
        path = TEX / name
        if name in ORIGINALS:
            continue
        if path.exists() and not FORCE:
            kept.append(name)
            continue
        fn()
        written.append(f'{name} ({path.stat().st_size} bytes)')
    print('written:', ', '.join(written) or 'nothing')
    print('kept:', ', '.join(kept) or 'nothing')


if __name__ == '__main__':
    main()
