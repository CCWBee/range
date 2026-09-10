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
# ICON. The shipped mark, drawn from the trace above rather than out of it.
#
# The icon lives at 16 px in a browser tab, where one device pixel is four units of the 64 unit
# viewBox, so every load-bearing edge sits on a multiple of four: an edge that lands mid-pixel
# renders half covered, and half-covered orange over teal is an olive that reads as dirt. The
# aeroplane is therefore laid out row by row on that grid, 14 rows of the 16 with one clear row
# top and bottom.
#
# Kept from the trace: the wing leading edge sweep (42 degrees off the centreline against the
# traced 39), the canard well forward of the wing with its trailing edge square to the axis, the
# fuselage that widens aft under the wing, and the order of the parts down the length.
# Thickened, because the trace vanishes at 16 px: the nose is blunted to a flat facet so the top
# row is a solid two pixel column rather than a translucent stalk; the canard is roughly doubled
# so its trailing rows are one solid six pixel bar; the span is widened to 46 units on 56 of
# length (0.82 against the aeroplane's true 0.70, which is the widest the planform takes before
# it reads squat); the rear fuselage is held at 16 units to the tail and the gap between the
# nozzles opened to 8 units, the narrowest slot that clears two whole pixels either side of the
# centreline, which is itself a pixel boundary. The fin is dropped: from above it is a line.
TEAL = '#0A6165'      # hue 182.6, saturation 82, mid-dark; 3.03:1 against the orange
ICON_ORANGE = '#FF8A1F'   # hue 28.7, fully saturated; the brief's own orange, not a quote of the HUD
VIEW_ICON = 64
CORNER = 14           # 21.9 per cent of the side

# Each shape is the right-hand half only, in viewBox units, y down and the nose at the top.
# `axis` shapes start and end on the centreline x = 32 and are closed by their own reflection;
# `wing` shapes are reflected into a separate subpath. Both reflections reverse the point order
# so every subpath winds the same way and the non-zero fill unions them instead of punching
# holes where they overlap.
BODY = [(32, 4), (34, 4), (36, 7), (36, 30), (40, 50), (40, 60),
        (36, 60), (36, 56), (32, 56)]                       # nose facet, side, flare, one nozzle
CANARD = [(34, 13), (44, 20), (44, 24), (34, 24)]           # root buried in the fuselage
WING = [(32, 29), (36, 29), (55, 50), (55, 52), (32, 52)]   # delta with a two unit cropped tip


def mirror(points, axis=True):
    """The shape closed by its own reflection, or reflected whole, winding preserved."""
    flipped = [(2 * 32 - x, y) for x, y in reversed(points)]
    return points + flipped[1:-1] if axis else flipped


def icon_path():
    """The whole silhouette as one `d`: body, two canards, wing, all wound the same way."""
    shapes = [mirror(BODY), mirror(CANARD, axis=False), CANARD, mirror(WING)]
    out = []
    for shape in shapes:
        head = f'M{shape[0][0]:g} {shape[0][1]:g}'
        out.append(head + ''.join(f'L{x:g} {y:g}' for x, y in shape[1:]) + 'Z')
    return ''.join(out)


def write_icon(out=None):
    """favicon.svg (rounded) and icon-square.svg (full bleed, for the home-screen raster)."""
    out = out or ROOT / 'assets/icon'
    out.mkdir(parents=True, exist_ok=True)
    d = icon_path()
    note = ('<!-- RANGE: the Typhoon from directly above, traced from assets/RANGE.blend via '
            f'tools/icon_planform.py; teal {TEAL}, orange {ICON_ORANGE}. -->')
    written = []
    for name, rx in (('favicon.svg', f' rx="{CORNER}"'), ('icon-square.svg', '')):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_ICON} {VIEW_ICON}">\n'
               f'{note}\n'
               f'<rect width="{VIEW_ICON}" height="{VIEW_ICON}"{rx} fill="{TEAL}"/>\n'
               f'<path fill="{ICON_ORANGE}" d="{d}"/>\n</svg>\n')
        path = out / name
        path.write_text(svg, encoding='utf-8', newline='\n')
        written.append((str(path), len(svg.encode('utf-8'))))
    return written


SHOT = r'E:\claude-projects\design\tools\qa\shot.mjs'
STRIPS = ('#f1f3f4', '#202124')   # the light and dark Chrome tab-strip greys


def inline_svg(path, px):
    """One of the shipped SVGs at a fixed pixel size, comment dropped, ready to drop into a page."""
    lines = Path(path).read_text(encoding='utf-8').split('\n')
    return f'<svg width="{px}" height="{px}"' + lines[0][len('<svg'):] + ''.join(lines[2:])


def shoot(page, out, width, height):
    """One headless shot of a local page. Chrome floors the window at 500 px, so tiles go on a page."""
    import subprocess
    subprocess.run(['node', SHOT, '--url', str(page), '--out', str(out),
                    '--width', str(width), '--height', str(height), '--dsf', '1', '--no-gpu'],
                   check=True, capture_output=True, text=True)
    return Image.open(out).convert('RGB')


def sheet(out=None, shot=None):
    """The contact sheet: the mark at 16, 32, 64 and 180 px on both tab-strip greys, plus the square.

    The markup is inlined from the shipped files, so the sheet cannot drift from what is shipped.
    """
    import tempfile
    out = out or ROOT / 'assets/icon'
    shot = shot or ROOT / 'screenshots/icon-sheet.png'
    shot.parent.mkdir(parents=True, exist_ok=True)

    def tile(name, px, label):
        return (f'<figure><div class="t">{inline_svg(out / name, px)}</div>'
                f'<figcaption>{label}</figcaption></figure>')

    light = ''.join([tile('favicon.svg', 180, '180'), tile('icon-square.svg', 180, '180 square'),
                     tile('favicon.svg', 64, '64'), tile('favicon.svg', 32, '32'),
                     tile('favicon.svg', 16, '16')])
    dark = ''.join([tile('favicon.svg', 180, '180'), tile('favicon.svg', 64, '64'),
                    tile('favicon.svg', 32, '32'), tile('favicon.svg', 16, '16')])
    page = (f"<style>html,body{{margin:0;height:300px;"
            f"font:11px/1 ui-sans-serif,system-ui,'Segoe UI',sans-serif}}"
            '#sheet{display:flex;height:300px}'
            'section{display:flex;align-items:flex-end;gap:10px;padding:16px;height:268px}'
            f'.light{{background:{STRIPS[0]};color:#5f6368}}'
            f'.dark{{background:{STRIPS[1]};color:#9aa0a6;flex:1}}'
            'figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}'
            '.t{display:flex;align-items:flex-end;height:180px}svg{display:block}'
            'figcaption{letter-spacing:.04em}</style>'
            f'<div id="sheet"><section class="light">{light}</section>'
            f'<section class="dark">{dark}</section></div>')
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / 'sheet.html'
        source.write_text(page, encoding='utf-8')
        shoot(source, shot, 900, 300)
    return str(shot)


def render(out=None):
    """The two shipped rasters, through headless Chrome.

    Both tiles go on one harness page, because shot.mjs floors the browser window at 500 px. The
    page is shot twice, on white and on black, so the rounded square's transparent corners come
    back as real alpha: a plain shot would bake the ground into them and the favicon would carry
    white chips on a dark tab strip. `a = 1 - (white - black) / 255` per pixel, colour `black / a`.
    """
    import tempfile
    assert TRACE_IMPORT_ERROR is None, f'the render needs numpy and Pillow: {TRACE_IMPORT_ERROR}'
    out = out or ROOT / 'assets/icon'
    body = ''
    origins, x = [], 8
    for name, px in [('favicon.svg', 32), ('icon-square.svg', 180)]:
        body += inline_svg(out / name, px)
        origins.append((x, 8, px))
        x += px + 8

    with tempfile.TemporaryDirectory() as tmp:
        shots = {}
        for ground in ('ffffff', '000000'):
            page = Path(tmp) / f'{ground}.html'
            page.write_text(f'<style>html,body{{margin:0;background:#{ground}}}'
                            '#row{display:flex;align-items:flex-start;gap:8px;padding:8px}'
                            f'svg{{display:block}}</style><div id="row">{body}</div>',
                            encoding='utf-8')
            shots[ground] = shoot(page, Path(tmp) / f'{ground}.png', 260, 210)

        (ox, oy, px) = origins[0]
        box = (ox, oy, ox + px, oy + px)
        white = np.asarray(shots['ffffff'].crop(box), dtype=np.float64)
        black = np.asarray(shots['000000'].crop(box), dtype=np.float64)
        alpha = np.clip(1.0 - (white - black).mean(axis=2) / 255.0, 0.0, 1.0)
        colour = np.divide(black, np.maximum(alpha, 1e-6)[..., None]).clip(0, 255)
        rgba = np.concatenate([colour, alpha[..., None] * 255], axis=2).round().astype(np.uint8)
        rgba[alpha < 0.004] = 0
        Image.fromarray(rgba, 'RGBA').save(out / 'favicon-32.png')

        (ox, oy, px) = origins[1]
        shots['ffffff'].crop((ox, oy, ox + px, oy + px)).save(out / 'apple-touch-icon.png')
    return [str(out / 'favicon-32.png'), str(out / 'apple-touch-icon.png')]


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
