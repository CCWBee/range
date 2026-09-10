"""Subset Barlow Condensed to the two woff2 faces the touch layer embeds.

Spec: docs/specs/2026-09-10-range-touch-cockpit.md section 5. Run by hand, with the source TTFs
committed nowhere: fetch BarlowCondensed-Regular.ttf, BarlowCondensed-Medium.ttf and OFL.txt from
github.com/google/fonts/raw/main/ofl/barlowcondensed/ into a folder and point this at it.

  python tools/subset_fonts.py <folder holding the source TTFs and OFL.txt>

Writes assets/fonts/BarlowCondensed-Regular.woff2, BarlowCondensed-Medium.woff2 and
OFL-BarlowCondensed.txt, which tools/build.py then inlines as data URIs.

The one thing this does that a plain pyftsubset run does not: every cmap subtable's U+0030 to
U+0039 is pointed at the tabular <digit>.tf glyph before subsetting, and GSUB is dropped. Barlow
Condensed's default figures are proportional (Regular advances 444, 256, 402, 408, 415, 409, 410,
366, 422, 403 per 1000 em; Medium 447, 266, 415, 418, 440, 420, 420, 381, 429, 414), and its tnum
feature maps each digit to a .tf glyph at a single advance, 434 Regular and 457 Medium. Baking that
into cmap means the shipped file is unconditionally tabular: a font-feature-settings declaration
lost in the cascade, or ignored by iOS Safari, cannot make a readout twitch. Dropping GSUB is what
then lets the proportional figures fall out of the subset, since nothing reaches them.

Asserted on the files that ship, not on the sources: the ten digit advances are uniform in every
cmap subtable, GSUB is absent, and each face is under 16 KB (16,384 bytes), which is section 5's
budget.
"""
from pathlib import Path
import argparse, shutil
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
WEIGHTS = ('Regular', 'Medium')
DIGITS = range(0x30, 0x3A)
# The printable ASCII the intro, the hints and the status lines use, plus the degree sign and the
# middle dot from the objective, the ellipsis from 'Preparing aircraft and airfield…' and the
# copyright sign from the credits.
UNICODES = [*range(0x20, 0x7F), 0x00A9, 0x00B0, 0x00B7, 0x2026]
BUDGET = 16 * 1024


def tabular_cmap(font):
    """Point every cmap subtable's digits at their .tf glyphs. Every subtable, not the best one: a
    browser picks its own, and a Windows-only remap would leave iOS proportional. Two subtables of
    the same format can share one decompiled dict, so an already-tabular entry is a subtable that
    has been reached twice and not a second thing to fix."""
    order = set(font.getGlyphOrder())
    remapped = 0
    for table in font['cmap'].tables:
        for code in DIGITS:
            name = table.cmap.get(code)
            if name is None or name.endswith('.tf'):
                continue
            tabular = f'{name}.tf'
            assert tabular in order, f'{tabular} is missing: this is not the expected source font'
            table.cmap[code] = tabular
            remapped += 1
    assert remapped, 'no digits found in any cmap subtable'
    return remapped


def build(source, weight):
    """One weight, from the source TTF to the written woff2. Returns its size in bytes."""
    font = TTFont(source / f'BarlowCondensed-{weight}.ttf')
    remapped = tabular_cmap(font)
    options = subset.Options()
    options.layout_features = ['kern']          # GPOS kerning stays; GSUB goes entirely
    options.drop_tables = [*options.drop_tables, 'GSUB']
    options.hinting = False
    options.desubroutinize = True
    options.flavor = 'woff2'
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    out = root / 'assets/fonts' / f'BarlowCondensed-{weight}.woff2'
    out.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, out, options)
    print(f'{weight}: {remapped} digit codepoints remapped, {len(font.getGlyphOrder())} glyphs, '
          f'{out.stat().st_size} bytes')
    return out


def verify(path):
    """The three asserts, on the written file. Read back through cmap rather than by glyph name: the
    subsetter writes post format 3, so 'zero.tf' does not survive as a name."""
    font = TTFont(path)
    assert 'GSUB' not in font, f'{path.name} still carries GSUB'
    hmtx = font['hmtx']
    advances = set()
    for table in font['cmap'].tables:
        for code in DIGITS:
            name = table.cmap.get(code)
            assert name, f'{path.name} lost U+{code:04X} from a cmap subtable'
            advances.add(hmtx[name][0])
    assert len(advances) == 1, f'{path.name} digit advances are not uniform: {sorted(advances)}'
    size = path.stat().st_size
    assert size < BUDGET, f'{path.name} is {size} bytes, over the {BUDGET} byte font budget'
    print(f'{path.name}: {size} bytes, digit advance {advances.pop()}/1000 uniform, GSUB absent, '
          f'{len(font.getGlyphOrder())} glyphs')
    return size


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', help='folder holding BarlowCondensed-*.ttf and OFL.txt')
    args = parser.parse_args()
    source = Path(args.source)
    written = [build(source, weight) for weight in WEIGHTS]
    total = sum(verify(path) for path in written)
    licence = root / 'assets/fonts/OFL-BarlowCondensed.txt'
    shutil.copyfile(source / 'OFL.txt', licence)     # bytes, so the line endings are the licence's own
    print(f'{licence.name}: {licence.stat().st_size} bytes')
    print(f'assets/fonts: {total} bytes of woff2 in {len(written)} faces')


if __name__ == '__main__':
    main()
