"""Pack the Blender export into RANGE's runtime library.

Blender's exporter (tools/export_meshes.py) writes assets/meshes.json and meshes.bin, version 2:
float32 everything, uint32 indices, a terrain block. This packs them into assets/library.json and
library.bin, version 3, the one format the loader reads: positions and uv as uint16 quantised
inside each part's bounds (3 cm across a 2 km chunk), normals as int8, vertex colour as uint8,
indices as uint16 where a part has 65,535 vertices or fewer. Under half the size. The terrain
block is dropped: physics and the world both read the grid from src/jersey.js.

The same writer serves tools/build.py, which repacks a subset for the mobile bundle. Run by hand
with `python tools/pack_library.py`; the exporter runs it at the end of an export.
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
VERSION = 3


def _view(binary, offset, dtype, count):
    return np.frombuffer(binary, dtype=dtype, count=count, offset=offset)


def read_v2(manifest, binary):
    """The exporter's parts as arrays: position and normal float32 (n, 3), uv float32 (n, 2) or
    None, colour uint8 (n, 3) or None, index uint32."""
    assets = {}
    for name, parts in manifest['assets'].items():
        out = []
        for p in parts:
            n = p['vertexCount']
            out.append({
                'material': p['material'],
                'position': _view(binary, p['position'], '<f4', n * 3).reshape(n, 3),
                'normal': _view(binary, p['normal'], '<f4', n * 3).reshape(n, 3),
                'uv': _view(binary, p['uv'], '<f4', n * 2).reshape(n, 2) if p.get('uv') is not None else None,
                'color': _view(binary, p['color'], np.uint8, n * 3).reshape(n, 3) if p.get('color') is not None else None,
                'index': _view(binary, p['index'], '<u4', p['indexCount']),
            })
        assets[name] = out
    return assets


def quantise(part):
    """One exporter part to its version 3 blocks."""
    p = part['position'].astype(np.float64)
    lo, hi = p.min(0), p.max(0)
    span = np.where(hi > lo, hi - lo, 1.0)
    q = {
        'material': part['material'], 'vertexCount': len(p), 'indexCount': len(part['index']),
        'bounds': [*map(float, lo), *map(float, hi)],
        'position': np.round((p - lo) / span * 65535).astype('<u2'),
        'normal': np.clip(np.round(part['normal'] * 127), -127, 127).astype(np.int8),
        'color': part['color'],
        'index': part['index'].astype('<u2' if len(p) <= 65535 else '<u4'),
        'uv': None, 'uvBounds': None,
    }
    if part['uv'] is not None:
        uv = part['uv'].astype(np.float64)
        ulo, uhi = uv.min(0), uv.max(0)
        uspan = np.where(uhi > ulo, uhi - ulo, 1.0)
        q['uvBounds'] = [*map(float, ulo), *map(float, uhi)]
        q['uv'] = np.round((uv - ulo) / uspan * 65535).astype('<u2')
    return q


def read_v3(manifest, binary):
    """Version 3 parts back as blocks, for repacking a subset."""
    assets = {}
    for name, parts in manifest['assets'].items():
        out = []
        for p in parts:
            n = p['vertexCount']
            q = dict(p)
            q['position'] = _view(binary, p['position'], '<u2', n * 3).reshape(n, 3)
            q['normal'] = _view(binary, p['normal'], np.int8, n * 3).reshape(n, 3)
            q['uv'] = _view(binary, p['uv'], '<u2', n * 2).reshape(n, 2) if p.get('uv') is not None else None
            q['color'] = _view(binary, p['color'], np.uint8, n * 3).reshape(n, 3) if p.get('color') is not None else None
            q['index'] = _view(binary, p['index'], '<u2' if p['indexBytes'] == 2 else '<u4', p['indexCount'])
            out.append(q)
        assets[name] = out
    return assets


def write_v3(assets, materials, pivots, blender=''):
    """Blocks to (manifest, binary), every block 4-byte aligned."""
    binary = bytearray()
    manifest = {'version': VERSION, 'blender': blender, 'materials': materials, 'assets': {}, 'pivots': pivots}

    def block(a):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(np.ascontiguousarray(a).tobytes())
        return offset

    for name, parts in assets.items():
        out = []
        for q in parts:
            out.append({
                'material': q['material'], 'vertexCount': q['vertexCount'], 'indexCount': q['indexCount'],
                'bounds': q['bounds'], 'uvBounds': q['uvBounds'],
                'position': block(q['position']), 'normal': block(q['normal']),
                'uv': block(q['uv']) if q['uv'] is not None else None,
                'color': block(q['color']) if q['color'] is not None else None,
                'index': block(q['index']), 'indexBytes': q['index'].dtype.itemsize,
            })
        manifest['assets'][name] = out
    return manifest, bytes(binary)


def part_bytes(q):
    return sum(a.nbytes for a in (q['position'], q['normal'], q['uv'], q['color'], q['index']) if a is not None)


def select(assets, budget, centre=(0.0, -900.0), prefix='settlement_'):
    """Every asset except the prefixed chunks, plus the chunks nearest the centre inside the budget."""
    keep = {n: p for n, p in assets.items() if not n.startswith(prefix)}
    chunks = []
    for name, parts in assets.items():
        if not name.startswith(prefix):
            continue
        lo = [min(p['bounds'][i] for p in parts) for i in range(3)]
        hi = [max(p['bounds'][i + 3] for p in parts) for i in range(3)]
        distance = (((lo[0] + hi[0]) / 2 - centre[0]) ** 2 + ((lo[2] + hi[2]) / 2 - centre[1]) ** 2) ** .5
        chunks.append((distance, sum(part_bytes(p) for p in parts), name, parts))
    total = kept = 0
    for distance, size, name, parts in sorted(chunks, key=lambda c: c[0]):
        if total + size > budget:
            continue
        total += size
        kept += 1
        keep[name] = parts
    print(f'{prefix}chunks: kept {kept} of {len(chunks)}, {total} bytes')
    return keep


def pack(source=ROOT / 'assets/meshes.json', target=ROOT / 'assets/library.json'):
    manifest = json.loads(source.read_text(encoding='utf-8'))
    assert manifest.get('version') == 2, 'pack_library reads the version 2 Blender export'
    binary = source.with_suffix('.bin').read_bytes()
    parts = read_v2(manifest, binary)
    assets = {n: [quantise(p) for p in ps] for n, ps in parts.items()}
    # The quantisation error is bounded by each part's span over 65535; report the worst.
    worst = 0.0
    for n, ps in parts.items():
        for p, q in zip(ps, assets[n]):
            lo = np.array(q['bounds'][:3]); hi = np.array(q['bounds'][3:])
            back = lo + q['position'] / 65535 * np.where(hi > lo, hi - lo, 1.0)
            worst = max(worst, float(np.abs(back - p['position']).max()))
    out, blob = write_v3(assets, manifest['materials'], manifest.get('pivots', {}), manifest.get('blender', ''))
    target.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    target.with_suffix('.bin').write_bytes(blob)
    print(json.dumps({'status': 'packed', 'assets': len(out['assets']), 'bytes': len(blob), 'from': len(binary), 'worstPositionError': round(worst, 4)}))
    return out, blob


if __name__ == '__main__':
    pack()
