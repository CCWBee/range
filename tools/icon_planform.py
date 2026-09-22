"""Trace the Typhoon's true planform from the packed library, for the favicon.

The favicon is a top-down silhouette, so it should be the real aeroplane rather than a drawing from
memory. This reads assets/library.json plus library.bin (version 3, through pack_library.read_v3),
takes the airframe parts, drops every triangle onto the ground plane (world X across, world Z along,
nose at -Z drawn at the top), fills them into a 1024 px mask, mirrors that about the centreline so
the two halves are identical, and traces the outer contour into a closed SVG path.

Airframe parts used: jet_body (fuselage, intakes, wings, fin), jet_canard_l/r, jet_elevon_l/r,
jet_rudder, jet_nozzle_l/r. Left out: jet_canopy and jet_airbrake (both sit inside the fuselage
footprint, so they change nothing seen from above), jet_detail (pylon and sensor carriage rather
than airframe, despite one of its three materials being called `airframe`; projected on its own it
adds 570 mask pixels outside the airframe, small lumps beside the forward fuselage and under the
wing root), the gear legs and their doors, the stores (bomb, sidewinder) and the effects (flame,
blast).

The pivoted parts are exported pivot-relative, so each one is translated by its pivot point. Every
airframe pivot has rest angle 0 (canards and elevons about body X, rudder about Y, nozzles about Z,
each range starting at 0), so a translation is the whole job and no rotation is needed.

Outputs, both under assets/icon/:
  planform.png  the 1024 px mask, white silhouette on black, mirrored
  planform.svg  the raw trace, one orange path on transparent, viewBox 0 0 1000 1000

Run with `python tools/icon_planform.py`. It prints the bounding box in metres and the point count.

`python tools/icon_planform.py --icon` is the second job: it draws the shipped icon from the
parameters in the ICON section at the foot of this file (favicon.svg and icon-square.svg under
assets/icon/). That drawing is the trace read at 16 px rather than the trace itself, so the numbers
live here where they can be re-argued one at a time; the section's own comment says what was kept
from the trace and what was thickened, and why. The icon mode needs nothing but the standard
library, so it runs even where scipy or scikit-image are missing.
"""
import json
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy import ndimage
    from skimage import measure
except ImportError as exc:                                  # the icon mode below needs none of these
    TRACE_IMPORT_ERROR = exc
else:
    TRACE_IMPORT_ERROR = None

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_library import ROOT, read_v3  # noqa: E402

# The parts that make the silhouette, and the ones deliberately left out (see the docstring).
AIRFRAME = ['jet_body', 'jet_canard_l', 'jet_canard_r', 'jet_elevon_l', 'jet_elevon_r',
            'jet_rudder', 'jet_nozzle_l', 'jet_nozzle_r']
SIZE = 1024          # mask side in pixels
MARGIN = 12          # pixels of clear black at the nose and the tail
VIEW = 1000.0        # the SVG viewBox side
ORANGE = '#FF8A1F'   # placeholder for the icon's orange, so the raw trace is visible on its own
TARGET_POINTS = (60, 120)


def load_parts(library=ROOT / 'assets/library.json'):
    """Every airframe part as a float64 (n, 3) of world-frame vertices plus its uint index array."""
    manifest = json.loads(library.read_text(encoding='utf-8'))
    assert manifest.get('version') == 3, 'icon_planform reads the version 3 packed library'
    blocks = read_v3(manifest, library.with_suffix('.bin').read_bytes())
    pivots = manifest.get('pivots', {})
    out = []
    for name in AIRFRAME:
        assert name in blocks, f'{name} is missing from the packed library'
        offset = np.array(pivots[name]['point'], dtype=np.float64) if name in pivots else np.zeros(3)
        for part in blocks[name]:
            lo = np.array(part['bounds'][:3], dtype=np.float64)
            hi = np.array(part['bounds'][3:], dtype=np.float64)
            span = np.where(hi > lo, hi - lo, 1.0)
            position = lo + part['position'].astype(np.float64) / 65535.0 * span + offset
            out.append((name, position, np.asarray(part['index'], dtype=np.int64)))
    return out


def fill_mask(parts):
    """Drop every triangle onto the ground plane and fill it into the mask.

    Uniform scale, set by the length along Z so the aeroplane spans SIZE - 2 * MARGIN rows. World
    x = 0 lands on the exact centre column, which is what lets the mirror be a plain flip.
    """
    zs = np.concatenate([p[:, 2] for _, p, _ in parts])
    zmin, zmax = float(zs.min()), float(zs.max())
    scale = (SIZE - 2 * MARGIN) / (zmax - zmin)
    centre = SIZE / 2.0

    image = Image.new('L', (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(image)
    triangles = 0
    for _name, position, index in parts:
        col = position[:, 0] * scale + centre
        row = (position[:, 2] - zmin) * scale + MARGIN
        screen = np.stack([col, row], axis=1)
        for a, b, c in index.reshape(-1, 3):
            draw.polygon([tuple(screen[a]), tuple(screen[b]), tuple(screen[c])], fill=255)
            triangles += 1

    mask = np.asarray(image) > 127
    mask |= mask[:, ::-1]                                   # mirror about the centre column
    mask = ndimage.binary_fill_holes(mask)
    labels, count = ndimage.label(mask)
    if count > 1:                                           # keep the airframe, drop stray slivers
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        mask = labels == (int(np.argmax(sizes)) + 1)
        print(f'dropped {count - 1} disconnected sliver(s)')
    return mask, scale, zmin, zmax, triangles


def right_half(contour):
    """The contour arc from the nose to the tail down the right-hand side.

    Douglas-Peucker on the whole loop would not pick mirrored vertices, so the path would come out
    slightly lopsided even from a perfectly symmetric mask. Simplifying one half and reflecting it
    keeps the two sides identical, which matters because this trace is the drawers' reference.
    """
    if np.allclose(contour[0], contour[-1]):
        contour = contour[:-1]
    rows, cols = contour[:, 0], contour[:, 1]

    def end(target):
        near = np.flatnonzero(np.abs(rows - target) <= 0.5)
        return int(near[np.argmax(cols[near])])

    contour = np.roll(contour, -end(rows.min()), axis=0)
    rows, cols = contour[:, 0], contour[:, 1]
    bottom = end(rows.max())
    forward = contour[:bottom + 1]
    backward = np.concatenate([contour[bottom:], contour[:1]])[::-1]
    return forward if forward[:, 1].mean() > backward[:, 1].mean() else backward


def simplify(arc, low, high):
    """Douglas-Peucker with the tolerance bisected until the closed path lands in `low`..`high`."""
    lo, hi = 0.05, 40.0
    best = measure.approximate_polygon(arc, lo)
    for _ in range(48):
        mid = (lo + hi) / 2
        points = measure.approximate_polygon(arc, mid)
        total = 2 * len(points) - 2                         # the mirror shares nose and tail
        if total > high:
            lo = mid
        else:
            best, hi = points, mid
            if total >= low:
                break
    return best


def build_path(arc, centre_col):
    """The simplified right half, reflected, as a closed loop in the 0..1000 viewBox."""
    arc = arc.copy()
    arc[0, 1] = arc[-1, 1] = centre_col                     # pin the nose and the tail on the axis
    mirrored = arc[::-1][1:-1].copy()
    mirrored[:, 1] = 2 * centre_col - mirrored[:, 1]
    loop = np.concatenate([arc, mirrored])
    k = VIEW / SIZE
    return np.stack([loop[:, 1] * k, loop[:, 0] * k], axis=1)   # (x, y), y down, nose at the top


def to_d(points):
    body = ' '.join(f'{x:.1f} {y:.1f}' for x, y in points[1:])
    return f'M {points[0][0]:.1f} {points[0][1]:.1f} L {body} Z'


def main():
    out = ROOT / 'assets/icon'
    out.mkdir(parents=True, exist_ok=True)
    assert TRACE_IMPORT_ERROR is None, f'the trace needs numpy, Pillow, scipy and scikit-image: {TRACE_IMPORT_ERROR}'
    parts = load_parts()
    mask, scale, zmin, zmax, triangles = fill_mask(parts)
    Image.fromarray((mask * 255).astype(np.uint8)).save(out / 'planform.png')

    padded = np.pad(mask, 1)                                # a ring of zeros so the contour closes
    contours = measure.find_contours(padded.astype(float), 0.5)
    contour = max(contours, key=len) - 1.0
    arc = simplify(right_half(contour), *TARGET_POINTS)
    points = build_path(arc, SIZE / 2.0)
    d = to_d(points)

    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n'
           '<!-- RANGE: the Typhoon planform traced from assets/library.json by '
           'tools/icon_planform.py. Raw trace, nose at the top. -->\n'
           f'<path fill="{ORANGE}" d="{d}"/>\n</svg>\n')
    (out / 'planform.svg').write_text(svg, encoding='utf-8')

    half = float(np.abs(points[:, 0] - VIEW / 2).max()) / (VIEW / SIZE) / scale
    print(json.dumps({
        'triangles': triangles,
        'contours': len(contours),
        'points': len(points),
        'bboxMetres': {'x': round(2 * half, 2), 'z': round(zmax - zmin, 2)},
        'bboxViewBox': {
            'x': [round(float(points[:, 0].min()), 1), round(float(points[:, 0].max()), 1)],
            'y': [round(float(points[:, 1].min()), 1), round(float(points[:, 1].max()), 1)],
        },
        'pixelsPerMetre': round(scale, 2),
        'png': str(out / 'planform.png'),
        'svg': str(out / 'planform.svg'),
    }, indent=2))
    print(d)


# --------------------------------------------------------------------------------------------
# ICON. The shipped mark: the traced planform itself, on the portfolio's favicon construction.
#
# Charles, 23 September 2026: an incandescent backlit orange jet on a HUD-green tile, "two tone ...
# no outline or gradient", in the simplicity and ratios of his other sites' favicons, with the jet as
# the one custom shape because no character stands in for it. Those favicons (charlesbee.org,
# Caesar, scam-aware.org) share one construction, copied here: a 32 unit tile with corner radius 6,
# two flat colours, one centred mark 38 to 54 per cent of the side. The jet stands 18 of 32 tall
# (56 per cent, level with Caesar's strokes) at the trace's own proportions: the span is 0.70 of the
# length, the leading edge 39 degrees off the centreline, the canards and wingtip pods as modelled.
# The earlier drawing widened, blunted and doubled parts of the trace to land edges on a 16 px grid,
# and read as a generic delta. Only the fin is dropped: from above it is a hairline stalk behind the
# nozzles, and at 16 px a dirty pixel.
#
# The green is a HUD phosphor green leaning yellow (hue 108), not the blue-leaning Christmas green;
# the brighter #34B81C was tried and left the jet at 1.18:1 luminance against the tile, which blurs
# at 16 px, where #2A9A14 holds 1.66:1. The orange is a backlit switch legend's, flat.
TILE = '#2A9A14'
JET = '#FF9A1F'
VIEW_ICON = 32
CORNER = 6
MARK_HEIGHT = 18
STRIPS = ('#f1f3f4', '#202124')   # the light and dark Chrome tab-strip greys


def icon_points():
    """The traced planform (assets/icon/planform.svg, viewBox 1000) minus the fin, fitted centred
    into the 32 unit tile at MARK_HEIGHT."""
    import re
    source = (ROOT / 'assets/icon/planform.svg').read_text(encoding='utf-8')
    numbers = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', re.search(r' d="([^"]+)"', source).group(1))]
    points = list(zip(numbers[0::2], numbers[1::2]))
    nozzle = max(y for x, y in points if abs(x - VIEW / 2) > 30)   # the aft-most point off the centreline
    points = [(x, y) for x, y in points if not (y > nozzle + 2 and abs(x - VIEW / 2) < 30)]
    xs, ys = [x for x, _ in points], [y for _, y in points]
    k = MARK_HEIGHT / (max(ys) - min(ys))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    half = VIEW_ICON / 2
    return [(half + (x - cx) * k, half + (y - cy) * k) for x, y in points]


def icon_path():
    """The silhouette as one closed `d`."""
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in icon_points()) + 'Z'


def write_icon(out=None):
    """favicon.svg (rounded) and icon-square.svg (full bleed, for the home-screen raster)."""
    out = out or ROOT / 'assets/icon'
    out.mkdir(parents=True, exist_ok=True)
    d = icon_path()
    note = ('<!-- RANGE: the Typhoon from directly above, traced from assets/RANGE.blend via '
            f'tools/icon_planform.py; HUD green {TILE}, backlit orange {JET}. -->')
    written = []
    for name, rx in (('favicon.svg', f' rx="{CORNER}"'), ('icon-square.svg', '')):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_ICON} {VIEW_ICON}">\n'
               f'{note}\n'
               f'<rect width="{VIEW_ICON}" height="{VIEW_ICON}"{rx} fill="{TILE}"/>\n'
               f'<path fill="{JET}" d="{d}"/>\n</svg>\n')
        path = out / name
        path.write_text(svg, encoding='utf-8', newline='\n')
        written.append((str(path), len(svg.encode('utf-8'))))
    return written


def raster(px, rounded=True, ground=None, supersample=16):
    """The mark as an RGBA image `px` square, drawn with Pillow at `supersample` times and reduced.

    Two flat shapes need no browser: the tile (with its rounded corners as real alpha, or on
    `ground` when given) and the jet polygon, both from the same numbers as the SVG.
    """
    assert TRACE_IMPORT_ERROR is None or 'PIL' not in str(TRACE_IMPORT_ERROR), 'the raster needs Pillow'
    from PIL import Image, ImageDraw
    big = px * supersample
    k = big / VIEW_ICON
    image = Image.new('RGBA', (big, big), ground or (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=CORNER * k, fill=TILE)
    else:
        draw.rectangle((0, 0, big - 1, big - 1), fill=TILE)
    draw.polygon([(x * k, y * k) for x, y in icon_points()], fill=JET)
    return image.resize((px, px), Image.LANCZOS)


def render(out=None):
    """The two shipped rasters: the 32 px tab icon with transparent corners, and the 180 px
    home-screen icon full bleed (iOS masks it with its own corners)."""
    out = out or ROOT / 'assets/icon'
    raster(32).save(out / 'favicon-32.png')
    raster(180, rounded=False).convert('RGB').save(out / 'apple-touch-icon.png')
    return [str(out / 'favicon-32.png'), str(out / 'apple-touch-icon.png')]


def sheet(shot=None):
    """The contact sheet: the mark at 180, 64, 32 and 16 px on both tab-strip greys, plus the
    square, composed from the same rasters as the shipped files."""
    from PIL import Image
    shot = shot or ROOT / 'screenshots/icon-sheet.png'
    shot.parent.mkdir(parents=True, exist_ok=True)
    sizes = (180, 64, 32, 16)
    width = 16 + sum(s + 16 for s in sizes) + 196
    canvas = Image.new('RGB', (width * 2, 212), STRIPS[0])
    canvas.paste(Image.new('RGB', (width, 212), STRIPS[1]), (width, 0))
    for side in (0, 1):
        x = side * width + 16
        tiles = [(raster(180, rounded=False), 180)] if side == 0 else []
        for tile, size in tiles + [(raster(s), s) for s in sizes]:
            canvas.paste(tile, (x, 196 - size), tile.convert('RGBA'))
            x += size + 16
    canvas.save(shot)
    return str(shot)


if __name__ == '__main__':
    flags = sys.argv[1:]
    if {'--icon', '--render', '--sheet'} & set(flags):
        if '--icon' in flags:
            for path, size in write_icon():
                print(f'{size:>5} bytes  {path}')
        if '--render' in flags:
            for path in render():
                print(f'{Path(path).stat().st_size:>5} bytes  {path}')
        if '--sheet' in flags:
            path = sheet()
            print(f'{Path(path).stat().st_size:>5} bytes  {path}')
    else:
        main()
