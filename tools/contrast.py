"""Contrast of every text box in the touch-layer QA matrix, sampled from the backdrop image.

tools/qa_touch.mjs writes, per cell, <cell>.png (the frame), <cell>-backdrop.png (the same frame
with the ink blanked) and <cell>.json (the text boxes with their computed colour and size). This
reads them, takes the worst backdrop pixel behind each box (the 95th percentile of luminance for
light ink, the 5th for dark; a single specular pixel does not decide it) and reports the WCAG
ratio against the 4.5:1 floor, or 3:1 where the type is large: 24 px, or 18.66 px at weight 700
and above (--large-px moves the size threshold; the spec may allow it for the readout numerals).
The backdrop is sampled only under the strokes, where the frame and the blanked frame differ, so a
text halo counts (the probe keeps the HUD's text-shadow when it blanks the ink) and the gap between
letters does not. The box's own opacity is folded into the ink's alpha and composited the same way.

One class of failure is out of this tool's reach and is written down rather than left to be
discovered: a layer painted OVER the text, such as the touch layer's paused and lost veil, dims
what the reader sees while getComputedStyle().color still reports the undimmed ink, so every box
under such a veil is reported as a pass. Measuring that needs the ink read off the frame image, not
off the computed style.

  python tools/contrast.py screenshots/qa [--large-px 24] [--floor 4.5] [--large 3.0] [--check]

Writes contrast.md and contrast.json beside the cells. --check exits 1 on any FAIL, overflow or
offscreen text.
"""
from pathlib import Path
import argparse, json, re, sys
from PIL import Image


def linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)


def parse_colour(text):
    m = re.match(r'rgba?\(([^)]+)\)', text or '')
    if not m:
        return (255, 255, 255, 1.0)
    parts = [p.strip() for p in re.split(r'[,/]', m.group(1)) if p.strip()]
    rgb = [float(p) for p in parts[:3]]
    alpha = float(parts[3]) if len(parts) > 3 else 1.0
    return (rgb[0], rgb[1], rgb[2], alpha)


def percentile(values, p):
    values = sorted(values)
    if not values:
        return None
    return values[min(len(values) - 1, int(round((len(values) - 1) * p)))]


INK_DELTA = 48


def measure(image, box, floor, large, large_px, large_bold_px, frame=None):
    x0 = max(0, int(box['x'])); y0 = max(0, int(box['y']))
    x1 = min(image.width, int(box['x'] + box['w'] + 0.999)); y1 = min(image.height, int(box['y'] + box['h'] + 0.999))
    if x1 <= x0 or y1 <= y0:
        return None
    raw = image.crop((x0, y0, x1, y1)).convert('RGB').tobytes()
    pixels = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
    # Judge the backdrop under the strokes, not the whole box: where the frame and the blanked
    # frame differ, ink was painted. A box is mostly the gap between letters, and a halo never
    # reaches the gap. Boxes with too little ink to mask fall back to the whole box.
    if frame is not None:
        fraw = frame.crop((x0, y0, x1, y1)).convert('RGB').tobytes()
        inked = [pixels[i // 3] for i in range(0, len(raw), 3)
                 if max(abs(fraw[i] - raw[i]), abs(fraw[i + 1] - raw[i + 1]), abs(fraw[i + 2] - raw[i + 2])) > INK_DELTA]
        if len(inked) >= 12:
            pixels = inked
    lums = [luminance(p) for p in pixels]
    r, g, b, a = parse_colour(box.get('color'))
    # The element's own opacity multiplies the ink's alpha: a box at opacity .5 in white ink is the
    # same reader's problem as white at alpha .5.
    opacity = box.get('opacity')
    a *= 1.0 if opacity is None else float(opacity)
    ink = luminance((r, g, b))
    median = percentile(lums, 0.5)
    light = ink >= median
    worst = percentile(lums, 0.95 if light else 0.05)
    if a < 1:
        # Translucent ink sits on the worst pixel; composite it there.
        idx = max(range(len(lums)), key=lambda i: lums[i]) if light else min(range(len(lums)), key=lambda i: lums[i])
        pr, pg, pb = pixels[idx]
        ink = luminance((r * a + pr * (1 - a), g * a + pg * (1 - a), b * a + pb * (1 - a)))
    ratio = (ink + 0.05) / (worst + 0.05) if light else (worst + 0.05) / (ink + 0.05)
    weight = box.get('fontWeight') or '400'
    weight = 700 if weight in ('bold', 'bolder') else int(float(weight)) if str(weight).replace('.', '').isdigit() else 400
    size = float(box.get('fontSize') or 0)
    need = large if size >= large_px or (size >= large_bold_px and weight >= 700) else floor
    return {'ratio': round(ratio, 2), 'need': need, 'ink': round(ink, 4), 'backdrop': round(worst, 4), 'light': light, 'pass': ratio >= need}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('folder')
    parser.add_argument('--floor', type=float, default=4.5)
    parser.add_argument('--large', type=float, default=3.0)
    parser.add_argument('--large-px', type=float, default=24.0)
    parser.add_argument('--large-bold-px', type=float, default=18.66)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    folder = Path(args.folder)
    cells = sorted(p for p in folder.glob('*.json') if p.name not in ('index.json', 'contrast.json'))
    if not cells:
        print(f'no cells in {folder}'); sys.exit(2)
    report = []; failures = []; lines = ['# Touch-layer contrast', '']
    for cell_path in cells:
        cell = json.loads(cell_path.read_text(encoding='utf-8'))
        backdrop = folder / f"{cell['name']}-backdrop.png"
        if not backdrop.exists():
            print(f'{cell["name"]}: no backdrop image'); failures.append(f'{cell["name"]}: no backdrop'); continue
        image = Image.open(backdrop)
        frame_path = folder / f"{cell['name']}.png"
        frame = Image.open(frame_path) if frame_path.exists() else None
        rows = []
        lines += [f"## {cell['name']}", '', '| id | text | px | weight | ink L | backdrop L | ratio | need | result |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
        for box in cell['boxes']:
            m = measure(image, box, args.floor, args.large, args.large_px, args.large_bold_px, frame)
            if not m:
                continue
            flags = []
            if not m['pass']: flags.append('FAIL')
            if box.get('overflow'): flags.append('OVERFLOW')
            if box.get('offscreen'): flags.append('OFFSCREEN')
            result = ' '.join(flags) or 'pass'
            rows.append({**box, **m, 'result': result})
            if flags:
                failures.append(f"{cell['name']} {box['id']} '{box['text']}' {result} ratio {m['ratio']} need {m['need']}")
            lines.append(f"| {box['id']} | {box['text']} | {box['fontSize']:.0f} | {box.get('fontWeight')} | {m['ink']:.3f} | {m['backdrop']:.3f} | {m['ratio']:.2f} | {m['need']} | {result} |")
        for key in cell.get('keys', []):
            if key.get('overflow'):
                failures.append(f"{cell['name']} {key['id']} key content {key['scrollWidth']}x{key['scrollHeight']} in {key['clientWidth']}x{key['clientHeight']} OVERFLOW")
                lines.append(f"| {key['id']} | (key content) | | | | | | | OVERFLOW {key['scrollWidth']}x{key['scrollHeight']} in {key['clientWidth']}x{key['clientHeight']} |")
        lines.append('')
        report.append({'name': cell['name'], 'boxes': rows, 'keys': cell.get('keys', [])})
    total = sum(len(c['boxes']) for c in report)
    summary = f'{len(report)} cells, {total} text boxes, {len(failures)} failures'
    lines = [lines[0], '', summary, ''] + lines[2:]
    if failures:
        lines += ['## Failures', ''] + [f'- {f}' for f in failures] + ['']
    (folder / 'contrast.md').write_text('\n'.join(lines), encoding='utf-8', newline='\n')
    (folder / 'contrast.json').write_text(json.dumps({'summary': summary, 'failures': failures, 'cells': report}, indent=1), encoding='utf-8', newline='\n')
    print(summary)
    for f in failures:
        print('  ' + f)
    print(f'wrote {folder / "contrast.md"}')
    if args.check and failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
