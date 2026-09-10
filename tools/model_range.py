"""Author every RANGE mesh in Blender (scene "RANGE", one collection per library asset).

Sections, each rebuilding its own collections and nothing else:

    materials   the shared node materials (the paint material carries the procedural skin)
    jet         the Typhoon: jet_body, jet_canopy, canards, elevons, rudder, airbrake, nozzles
    gear        jet_gear_*, jet_door_* with their retraction pivots
    uv          one shared UV atlas across every jet and gear part
    stores      bomb
    airfield    pavement, runway_markings, ocean, hangar, tower, target, wreck, lamp, scenery
    terrain     the 256 x 256 height grid of spec 1.1 as a mesh
    effects     sky, quad, flame, blast

Run everything:      "blender.exe" -b assets/RANGE.blend -P tools/model_range.py
Run one section in the live session through the MCP socket with a wrapper that sets STAGES
before executing this file (see tools/blender_call.py):

    exec(compile(open(path).read(), path, 'exec'), {'__name__': 'model_range', 'STAGES': {'jet'}})

Coordinates are the renderer's body frame written straight into Blender: +X right wing, +Y up,
-Z nose. Every object keeps its origin at the world origin so Object texture coordinates equal
body coordinates; a hinged part records its pivot on an empty named "pivot <asset>" carrying the
custom properties axis, range and check_point. Objects carry "check" (convex, concave or none)
for the exporter's normal tests and "tint" for the paint material's per-object colour.
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Quaternion

STAGES = globals().get('STAGES') or {'all'}
random.seed(83)

scene = bpy.data.scenes.get('RANGE')
if scene is None:
    for collection in list(bpy.data.collections):
        collection.hide_viewport = True
        collection.hide_render = True
    scene = bpy.data.scenes.new('RANGE')
if bpy.context.window:
    bpy.context.window.scene = scene

current = []
JET_PARTS = ['jet_body', 'jet_canopy', 'jet_canard_l', 'jet_canard_r', 'jet_elevon_l', 'jet_elevon_r',
             'jet_rudder', 'jet_airbrake', 'jet_nozzle_l', 'jet_nozzle_r']
GEAR_PARTS = ['jet_gear_nose', 'jet_gear_main_l', 'jet_gear_main_r', 'jet_door_nose',
              'jet_door_main_l', 'jet_door_main_r']


# ---------------------------------------------------------------- collections and materials

def drop_collection(name):
    """Keep replaced geometry in an unlinked archive collection for recovery."""
    coll = bpy.data.collections.get(name)
    if coll is None:
        return
    coll.name = 'archive_' + name
    coll.use_fake_user = True
    for parent in list(bpy.data.collections):
        if coll.name in parent.children: parent.children.unlink(coll)
    for sc in bpy.data.scenes:
        if coll.name in sc.collection.children: sc.collection.children.unlink(coll)


def material(name, colour, metallic=0, roughness=.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    if bs is None:
        m.node_tree.nodes.clear()
        bs = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs[0], out.inputs[0])
    bs.inputs['Base Color'].default_value = (*colour, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    m['colour'] = list(colour)
    m['metallic'] = metallic
    m['roughness'] = roughness
    return m


def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        raise RuntimeError(f'material {name} missing: run the materials section first')
    return m


# ---------------------------------------------------------------- mesh helpers

def finish(o, name, material_, smooth=False, check='none', tint=(1, 1, 1)):
    o.name = name
    o.data.name = name
    o.data.materials.clear()
    o.data.materials.append(material_)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    o['check'] = check
    o['tint'] = list(tint)
    current.append(o)
    return o


def from_bmesh(bm, name):
    data = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(data)
    bm.free()
    data.update()
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    return o


def mesh(name, vertices, faces, material_, smooth=False, check='none', tint=(1, 1, 1), bevel=0, segments=2):
    """Object from raw geometry; face normals are recalculated so winding never matters."""
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in vertices]
    bm.verts.ensure_lookup_table()
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass  # a degenerate or duplicate face from a collapsed section, harmless
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, affect='EDGES', clamp_overlap=True)
    o = from_bmesh(bm, name)
    return finish(o, name, material_, smooth, check, tint)


def box(name, loc, scale, material_, bevel=0, rotation=(0, 0, 0), check='convex', tint=(1, 1, 1), smooth=False):
    """Axis-aligned box of full size `scale` at `loc`, optional Euler rotation about its centre."""
    sx, sy, sz = [s / 2 for s in scale]
    vs = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    rot = Matrix.Rotation(rotation[0], 4, 'X') @ Matrix.Rotation(rotation[1], 4, 'Y') @ Matrix.Rotation(rotation[2], 4, 'Z')
    vs = [tuple((rot @ Vector(v)) + Vector(loc)) for v in vs]
    return mesh(name, vs, fs, material_, smooth, check, tint, bevel)


def cylinder(name, loc, radius, depth, material_, rotation=(0, 0, 0), vertices=24, radius2=None, check='convex',
             tint=(1, 1, 1), smooth=True, bevel=0):
    """Cylinder or cone along local Z, then rotated by Euler `rotation` and moved to `loc`."""
    r2 = radius if radius2 is None else radius2
    vs, fs = [], []
    for i in range(vertices):
        a = i * math.tau / vertices
        vs.append((radius * math.cos(a), radius * math.sin(a), -depth / 2))
    for i in range(vertices):
        a = i * math.tau / vertices
        vs.append((r2 * math.cos(a), r2 * math.sin(a), depth / 2))
    for i in range(vertices):
        j = (i + 1) % vertices
        fs.append((i, j, j + vertices, i + vertices))
    fs.append(tuple(range(vertices)))
    fs.append(tuple(range(vertices, 2 * vertices)))
    rot = Matrix.Rotation(rotation[0], 4, 'X') @ Matrix.Rotation(rotation[1], 4, 'Y') @ Matrix.Rotation(rotation[2], 4, 'Z')
    vs = [tuple((rot @ Vector(v)) + Vector(loc)) for v in vs]
    o = mesh(name, vs, fs, material_, smooth, check, tint, bevel)
    if smooth:
        # Keep the caps flat: smooth shading across a sharp cap edge reads as a dent.
        for p in o.data.polygons:
            if len(p.vertices) > 4:
                p.use_smooth = False
    return o


def sphere(name, loc, scale, material_, segments=24, rings=12, check='convex', tint=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1, calc_uvs=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(loc)
    o = from_bmesh(bm, name)
    return finish(o, name, material_, True, check, tint)


def skin(name, rings, material_, smooth=True, check='convex', tint=(1, 1, 1), close=True, caps=True):
    """Loft a list of equal-length point rings into a closed tube with flat end caps."""
    n = len(rings[0])
    vs = [tuple(p) for ring in rings for p in ring]
    fs = []
    for j in range(len(rings) - 1):
        for i in range(n):
            if not close and i == n - 1:
                break
            a = j * n + i
            b = j * n + (i + 1) % n
            fs.append((a, b, b + n, a + n))
    if caps:
        fs.append(tuple(range(n)))
        fs.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    return mesh(name, vs, fs, material_, smooth, check, tint)


def loft(name, sections, material_, segments=32, check='convex', tint=(1, 1, 1)):
    """Elliptical section series (z, rx, ry, cy) lofted along Z, as the old script did."""
    rings = []
    for z, rx, ry, cy in sections:
        rings.append([(rx * math.cos(a), cy + ry * math.sin(a), z)
                      for a in (i * math.tau / segments for i in range(segments))])
    return skin(name, rings, material_, True, check, tint)


def tube(name, points, radius, material_, sides=8, check='convex', tint=(1, 1, 1)):
    """Round tube along a polyline, rings oriented by the local tangent."""
    rings = []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < .9 else Vector((1, 0, 0))
        u = t.cross(ref).normalized()
        v = t.cross(u).normalized()
        rings.append([tuple(p + u * radius * math.cos(a) + v * radius * math.sin(a))
                      for a in (k * math.tau / sides for k in range(sides))])
    return skin(name, rings, material_, True, check, tint)


def prism(name, points, thickness, material_):
    n = len(points)
    vs = [(x, y + d, z) for d in [-thickness / 2, thickness / 2] for x, y, z in points]
    fs = [tuple(reversed(range(n))), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(name, vs, fs, material_)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def save_asset(name):
    """Move every object built since the last call into the collection `name` (replacing it)."""
    global current
    drop_collection(name)
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    for o in current:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    current = []
    return coll


def _record_pivot(asset, point, axis, rng, note):
    e = bpy.data.objects.new(f'pivot {asset}', None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.3
    e.location = point
    e['axis'] = [axis.x, axis.y, axis.z]
    e['range'] = list(rng)
    e['note'] = note
    scene.collection.objects.link(e)
    current.append(e)
    print(f'pivot {asset}: point {tuple(round(v, 4) for v in point)} '
          f'axis {tuple(round(v, 4) for v in axis)} range {[round(v, 4) for v in rng]} ({note})')
    return e


def pivot(asset, point, axis, rng, check_point=None, want=None):
    """Record a control-surface hinge on an empty. When `want` is given, `axis` is flipped
    unless rotating `check_point` by +0.1 rad about it moves the point along `want` (the spec's
    positive sense), so the manifest sign never depends on hand reasoning. The check is a
    first-order tangent test, so `check_point` must not sit on the axis and `want` must have a
    component along `axis x (check_point - point)`."""
    axis = Vector(axis).normalized()
    note = 'unchecked'
    if want is not None:
        p = Vector(check_point) - Vector(point)
        tangent = axis.cross(p)
        assert tangent.length > 1e-6, f'pivot {asset}: check point sits on the axis'
        if tangent.dot(Vector(want)) < 0:
            axis = -axis
            tangent = -tangent
        assert tangent.normalized().dot(Vector(want).normalized()) > 0.05, \
            f'pivot {asset}: the check point does not move along want, pick another'
        note = 'tangent check'
    return _record_pivot(asset, point, axis, rng, note)


def hinge_from_directions(stowed_dir, deployed_dir):
    """Axis and stowed angle for a part authored deployed: rotating by the negative angle
    about the axis takes the deployed direction back to the stowed one."""
    a = Vector(stowed_dir).normalized()
    b = Vector(deployed_dir).normalized()
    axis = a.cross(b).normalized()
    angle = a.angle(b)
    return axis, [-angle, 0.0]


def hinge_pivot(asset, point, stowed_dir, deployed_dir):
    """Record a retraction hinge for a part authored in the deployed pose. The axis and range
    come from the two directions, and the assertion is the one that matters: rotating the
    deployed direction by range[0] about the axis lands on the stowed direction. A tangent test
    is useless here because the leg lies along the radius it would sweep."""
    axis, rng = hinge_from_directions(stowed_dir, deployed_dir)
    landed = Quaternion(axis, rng[0]) @ Vector(deployed_dir).normalized()
    error = (landed - Vector(stowed_dir).normalized()).length
    assert error < 1e-6, f'pivot {asset}: stowed pose off by {error:.2e}'
    return _record_pivot(asset, point, axis, rng, f'stowed pose verified, error {error:.1e}')


# ---------------------------------------------------------------- materials (paint skin)

def build_paint():
    """One node material for every painted part. Panel lines, rivets, roundels, walkway
    stripes, soot and streaks are defined in object coordinates so they stay continuous over
    UV seams; the line mask also drives a Bump node so the tangent normal bake carries them."""
    m = material('airframe', (.318, .356, .394), .25, .55)
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links

    def node(t, **kw):
        n = N.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def plug(inp, v):
        if isinstance(v, bpy.types.NodeSocket):
            L.new(v, inp)
        else:
            inp.default_value = v

    def fn(op, a, b=None, c=None):
        n = node('ShaderNodeMath', operation=op)
        plug(n.inputs[0], a)
        if b is not None:
            plug(n.inputs[1], b)
        if c is not None:
            plug(n.inputs[2], c)
        return n.outputs[0]

    def sub(a, b): return fn('SUBTRACT', a, b)
    def add(a, b): return fn('ADD', a, b)
    def mul(a, b): return fn('MULTIPLY', a, b)
    def mx(a, b): return fn('MAXIMUM', a, b)
    def mn(a, b): return fn('MINIMUM', a, b)
    def absf(a): return fn('ABSOLUTE', a)
    def fract(a): return fn('FRACT', a)
    def gt(a, b): return fn('GREATER_THAN', a, b)
    def lt(a, b): return fn('LESS_THAN', a, b)
    def band(*xs):
        r = xs[0]
        for x in xs[1:]:
            r = mul(r, x)
        return r
    def sstep(lo, hi, x): return fn('SMOOTH_MIN', x, x) if False else _sstep(lo, hi, x)
    def _sstep(lo, hi, x):
        n = node('ShaderNodeMapRange')
        n.interpolation_type = 'SMOOTHSTEP'
        plug(n.inputs['Value'], x)
        plug(n.inputs['From Min'], lo)
        plug(n.inputs['From Max'], hi)
        return n.outputs['Result']
    def between(x, lo, hi): return band(gt(x, lo), lt(x, hi))
    def line(coord, period, width):
        # 1 on a line of `width` metres every `period` metres, 0 elsewhere (soft edges).
        d = mul(absf(sub(fract(fn('DIVIDE', coord, period)), 0.5)), period)
        return sub(1.0, _sstep(width * 0.5, width * 0.5 + 0.004, d))
    def mixc(a, b, t):
        n = node('ShaderNodeMix', data_type='RGBA')
        plug(n.inputs['Factor'], t)
        plug(n.inputs[6], a if isinstance(a, bpy.types.NodeSocket) else (*a, 1))
        plug(n.inputs[7], b if isinstance(b, bpy.types.NodeSocket) else (*b, 1))
        return n.outputs[2]
    def scale_rgb(c, s):
        n = node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        plug(n.inputs['Factor'], 1.0)
        plug(n.inputs[6], c)
        plug(n.inputs[7], s if isinstance(s, bpy.types.NodeSocket) else (s, s, s, 1))
        return n.outputs[2]
    def noise(vec, scale, detail=2.0, rough=0.5):
        n = node('ShaderNodeTexNoise')
        plug(n.inputs['Vector'], vec)
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']
    def combine(x, y, z):
        n = node('ShaderNodeCombineXYZ')
        plug(n.inputs[0], x)
        plug(n.inputs[1], y)
        plug(n.inputs[2], z)
        return n.outputs[0]

    tc = node('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    sep = node('ShaderNodeSeparateXYZ')
    L.new(obj, sep.inputs[0])
    x, y, z = sep.outputs
    ax = absf(x)
    geo = node('ShaderNodeNewGeometry')
    nsep = node('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Normal'], nsep.inputs[0])
    nx, ny, nz = nsep.outputs

    # Region masks in body coordinates.
    fuselage = lt(ax, 1.27)
    wing = band(gt(ax, 1.27), lt(absf(y), 0.45))
    fin = band(lt(ax, 0.25), gt(y, 0.85))
    top = gt(ny, 0.2)

    # Panel lines: frames every 0.9 m in z, stringers every 0.35 m around the fuselage,
    # ribs every 0.8 m along the span, and a seeded set of access panels.
    frames = line(z, 0.9, 0.018)
    ang = fn('ARCTAN2', y, x)
    stringers = line(mul(ang, 0.8), 0.35, 0.014)   # 0.35 m at the 0.8 m mean radius
    ribs = mul(line(x, 0.8, 0.016), fn('ADD', wing, 0.0))
    fin_ribs = mul(line(y, 0.8, 0.016), fin)
    cell_x = fn('FLOOR', fn('DIVIDE', add(x, 0.45), 0.9))
    cell_z = fn('FLOOR', fn('DIVIDE', z, 1.1))
    hash_ = noise(combine(mul(cell_x, 7.13), mul(cell_z, 3.71), 0.5), 1.0, 0.0)
    has_panel = gt(hash_, 0.62)
    dx = absf(sub(fract(fn('DIVIDE', add(x, 0.45), 0.9)), 0.5))
    dz = absf(sub(fract(fn('DIVIDE', z, 1.1)), 0.5))
    inside = band(lt(dx, 0.40), lt(dz, 0.40))
    edge_x = between(dx, 0.375, 0.40)
    edge_z = between(dz, 0.375, 0.40)
    panel_edge = band(has_panel, inside, mx(edge_x, edge_z))
    rivets = band(sub(1.0, _sstep(0.004, 0.010, absf(sub(fn('DIVIDE', fract(fn('DIVIDE', add(z, 0.45), 0.9)), 1.0), 0.05)))),
                  line(mul(ang, 0.8), 0.07, 0.02), fuselage)
    lines = mx(mx(mul(frames, mx(fuselage, fin)), mul(stringers, fuselage)), mx(mx(ribs, fin_ribs), panel_edge))

    # Grime: streaks running aft from each frame line, soot around the nozzles.
    aft = fract(fn('DIVIDE', sub(z, 0.45), 0.9))
    streak_n = noise(combine(mul(x, 12.0), mul(y, 12.0), mul(z, 1.2)), 3.0, 3.0, 0.6)
    streaks = band(_sstep(0.50, 0.72, streak_n), fn('EXPONENT', mul(aft, -2.5)), lt(ax, 5.6))
    soot = band(_sstep(3.4, 5.9, z), lt(ax, 1.5), sub(1.0, mul(0.5, gt(ny, 0.5))))
    belly_soot = band(_sstep(2.0, 5.5, z), lt(ny, -0.3), lt(ax, 1.5))
    soot = mx(soot, mul(belly_soot, 0.6))
    grime_n = noise(combine(mul(x, 2.0), mul(y, 2.0), mul(z, 2.0)), 1.5, 4.0, 0.55)

    # Edge wear from pointiness, only where the noise says so.
    wear = band(_sstep(0.55, 0.75, geo.outputs['Pointiness']), _sstep(0.45, 0.7, noise(obj, 25.0, 2.0)))

    # Base paint with the micro grain of airframe.png at 8x over the UV atlas.
    grain_img = bpy.data.images.get('airframe.png')
    if grain_img is None:
        grain_img = bpy.data.images.load(str(ROOT / 'textures' / 'airframe.png'))
    grain = node('ShaderNodeTexImage', image=grain_img)
    grain.image.colorspace_settings.name = 'Non-Color'
    uvscale = node('ShaderNodeVectorMath', operation='SCALE')
    L.new(tc.outputs['UV'], uvscale.inputs[0])
    uvscale.inputs['Scale'].default_value = 8.0
    L.new(uvscale.outputs[0], grain.inputs['Vector'])
    grain_f = fn('MULTIPLY_ADD', grain.outputs['Color'], 0.35, 0.72)   # 0.72..1.07 multiplier
    colour = scale_rgb((.318, .356, .394, 1), grain_f)
    colour = scale_rgb(colour, fn('MULTIPLY_ADD', grime_n, 0.18, 0.90))
    # Per-object tint (formation lights, dielectric panels, code letters).
    tint = node('ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='tint')
    colour = scale_rgb(colour, tint.outputs['Color'])

    # Radome and dielectric panels are darker and greener.
    radome = _sstep(-6.45, -6.65, z)
    dielectric = mx(band(fin, gt(y, 3.05)), band(lt(ax, 0.22), gt(y, 0.25), between(z, -6.2, -5.9)))
    colour = mixc(colour, (.075, .085, .082), mx(radome, dielectric))

    # Roundels: low visibility, pale blue ring and pink centre, wings and forward fuselage.
    dwing = fn('SQRT', add(fn('POWER', sub(ax, 3.3), 2.0), fn('POWER', sub(z, 2.45), 2.0)))
    dfus = fn('SQRT', add(fn('POWER', sub(y, 0.05), 2.0), fn('POWER', add(z, 2.5), 2.0)))
    wing_r = band(wing, gt(ax, 2.5))
    fus_r = band(between(ax, 0.7, 1.4), lt(absf(y), 0.6))
    ring = mx(band(wing_r, lt(dwing, 0.36)), band(fus_r, lt(dfus, 0.30)))
    centre = mx(band(wing_r, lt(dwing, 0.175)), band(fus_r, lt(dfus, 0.145)))
    colour = mixc(colour, (.10, .15, .27), ring)
    colour = mixc(colour, (.36, .12, .13), centre)

    # Walkway stripes along the wing roots, top surface only.
    walk = band(top, wing, between(z, -0.8, 4.1), mx(between(ax, 1.34, 1.40), between(ax, 1.86, 1.92)))
    colour = mixc(colour, (.09, .10, .11), walk)

    # Lines, streaks and soot darken the paint; wear lightens it towards bare metal.
    colour = scale_rgb(colour, sub(1.0, mul(lines, 0.45)))
    colour = scale_rgb(colour, sub(1.0, mul(streaks, 0.22)))
    colour = scale_rgb(colour, sub(1.0, mul(soot, 0.55)))
    colour = mixc(colour, (.45, .45, .44), mul(wear, 0.5))

    rough = add(0.50, mul(lines, 0.15))
    rough = add(rough, mul(soot, 0.25))
    rough = add(rough, mul(streaks, 0.10))
    rough = sub(rough, mul(wear, 0.15))
    rough = mn(mx(rough, 0.2), 0.95)
    metallic = add(0.25, mul(wear, 0.45))

    bump = node('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.02
    plug(bump.inputs['Height'], sub(sub(1.0, lines), mul(rivets, 0.6)))

    bsdf = node('ShaderNodeBsdfPrincipled')
    L.new(colour, bsdf.inputs['Base Color'])
    L.new(rough, bsdf.inputs['Roughness'])
    L.new(metallic, bsdf.inputs['Metallic'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    out = node('ShaderNodeOutputMaterial')
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def build_titanium():
    """Exhaust cans: dark titanium with heat banding and petal ridges."""
    m = material('titanium', (.17, .18, .19), .9, .35)
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sep.inputs[0])
    band = N.new('ShaderNodeMath'); band.operation = 'MULTIPLY'; band.inputs[1].default_value = 9.0
    L.new(sep.outputs[2], band.inputs[0])
    wave = N.new('ShaderNodeMath'); wave.operation = 'SINE'
    L.new(band.outputs[0], wave.inputs[0])
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 40.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = N.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = -1; ramp.inputs['From Max'].default_value = 1
    ramp.inputs['To Min'].default_value = 0.10; ramp.inputs['To Max'].default_value = 0.24
    L.new(wave.outputs[0], ramp.inputs['Value'])
    col = N.new('ShaderNodeCombineXYZ')
    L.new(ramp.outputs[0], col.inputs[0])
    g = N.new('ShaderNodeMath'); g.operation = 'MULTIPLY'; g.inputs[1].default_value = 1.05
    L.new(ramp.outputs[0], g.inputs[0]); L.new(g.outputs[0], col.inputs[1])
    b = N.new('ShaderNodeMath'); b.operation = 'MULTIPLY'; b.inputs[1].default_value = 1.15
    L.new(ramp.outputs[0], b.inputs[0]); L.new(b.outputs[0], col.inputs[2])
    rough = N.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = 0.28; rough.inputs['To Max'].default_value = 0.48
    L.new(noise.outputs['Fac'], rough.inputs['Value'])
    ang = N.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'
    L.new(sep.outputs[1], ang.inputs[0]); L.new(sep.outputs[0], ang.inputs[1])
    ridge_m = N.new('ShaderNodeMath'); ridge_m.operation = 'MULTIPLY'; ridge_m.inputs[1].default_value = 18 / math.tau
    L.new(ang.outputs[0], ridge_m.inputs[0])
    ridge = N.new('ShaderNodeMath'); ridge.operation = 'FRACT'
    L.new(ridge_m.outputs[0], ridge.inputs[0])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.01
    L.new(ridge.outputs[0], bump.inputs['Height'])
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Metallic'].default_value = 0.9
    L.new(col.outputs[0], bsdf.inputs['Base Color'])
    L.new(rough.outputs[0], bsdf.inputs['Roughness'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    out = N.new('ShaderNodeOutputMaterial')
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def build_rubber():
    """Tyres, intake ducts and nozzle interiors: near black, rough, with a tread bump."""
    m = material('rubber', (.018, .019, .020), 0, .82)
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 60.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.2; bump.inputs['Distance'].default_value = 0.005
    L.new(noise.outputs['Fac'], bump.inputs['Height'])
    rough = N.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = 0.72; rough.inputs['To Max'].default_value = 0.92
    L.new(noise.outputs['Fac'], rough.inputs['Value'])
    tint = N.new('ShaderNodeAttribute'); tint.attribute_type = 'OBJECT'; tint.attribute_name = 'tint'
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; col.blend_type = 'MULTIPLY'; col.inputs['Factor'].default_value = 1.0
    col.inputs[6].default_value = (.018, .019, .020, 1)
    L.new(tint.outputs['Color'], col.inputs[7])
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Metallic'].default_value = 0.0
    L.new(col.outputs[2], bsdf.inputs['Base Color'])
    L.new(rough.outputs[0], bsdf.inputs['Roughness'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    out = N.new('ShaderNodeOutputMaterial')
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def build_canopy():
    """Tinted glass as an opaque dark gloss: the renderer adds the transparency, and a
    transmission shader would bake its colour pass black."""
    m = material('canopy', (.05, .08, .10), .3, .08)
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sep.inputs[0])
    # A faint darker band along the sill where the frame seal sits.
    band = N.new('ShaderNodeMapRange'); band.inputs['From Min'].default_value = 0.72; band.inputs['From Max'].default_value = 0.60
    band.inputs['To Min'].default_value = 0.0; band.inputs['To Max'].default_value = 1.0
    L.new(sep.outputs[1], band.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'
    col.inputs[6].default_value = (.05, .08, .10, 1); col.inputs[7].default_value = (.02, .025, .03, 1)
    L.new(band.outputs[0], col.inputs['Factor'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.0
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Metallic'].default_value = 0.3
    bsdf.inputs['Roughness'].default_value = 0.08
    L.new(col.outputs[2], bsdf.inputs['Base Color'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    out = N.new('ShaderNodeOutputMaterial')
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def section_materials():
    build_paint()
    build_titanium()
    build_rubber()
    build_canopy()
    material('edge', (.23, .27, .30), .6, .37)
    material('marking', (.63, .66, .65), .05, .65)
    material('roundel_red', (.27, .052, .04), .1, .6)
    material('roundel_blue', (.055, .095, .14), .1, .5)
    material('metal', (.30, .32, .33), .8, .42)
    material('glass', (.06, .09, .11), .3, .10)
    material('dark', (.030, .031, .032), 0, .80)
    material('concrete', (.16, .18, .19), .08, .3)
    material('hangar', (.19, .22, .22), .48, .63)
    material('earth', (.105, .13, .115), 0, .96)
    material('target', (.19, .20, .17), .2, .72)
    material('wreck', (.035, .031, .026), .45, .9)
    print('materials built')


# ---------------------------------------------------------------- the jet

def lerp(a, b, t):
    return a + (b - a) * t


FUSELAGE_KEYS = [
    # z, cy, rxt, ryt, rxb, ryb, n, chine, spine, lobe
    (-8.00, 0.00, 0.02, 0.02, 0.02, 0.02, 2.0, 0.00, 0.00, 0.0),
    (-7.30, 0.02, 0.30, 0.30, 0.30, 0.28, 2.0, 0.00, 0.00, 0.0),
    (-6.50, 0.05, 0.52, 0.50, 0.52, 0.50, 2.1, 0.03, 0.00, 0.0),
    (-5.60, 0.05, 0.62, 0.50, 0.64, 0.62, 2.2, 0.05, 0.00, 0.0),
    (-4.60, 0.00, 0.70, 0.55, 0.72, 0.70, 2.3, 0.07, 0.00, 0.0),
    (-3.60, 0.00, 0.78, 0.60, 0.82, 0.70, 2.4, 0.08, 0.05, 0.0),
    (-2.40, -0.05, 0.95, 0.62, 1.05, 0.70, 2.5, 0.10, 0.14, 0.1),
    (-1.20, -0.08, 1.10, 0.60, 1.15, 0.72, 2.5, 0.10, 0.20, 0.3),
    (0.50, -0.10, 1.18, 0.58, 1.20, 0.70, 2.6, 0.08, 0.24, 0.6),
    (2.50, -0.10, 1.16, 0.55, 1.18, 0.68, 2.6, 0.05, 0.28, 0.8),
    (4.20, -0.10, 1.10, 0.50, 1.12, 0.62, 2.5, 0.00, 0.22, 0.95),
    (5.55, -0.10, 1.05, 0.46, 1.05, 0.58, 2.4, 0.00, 0.12, 1.0),
]
LOBE_D, LOBE_R = 0.55, 0.56


def fuselage_params(z):
    keys = FUSELAGE_KEYS
    if z <= keys[0][0]:
        return keys[0][1:]
    if z >= keys[-1][0]:
        return keys[-1][1:]
    for i in range(len(keys) - 1):
        if keys[i][0] <= z <= keys[i + 1][0]:
            t = smoothstep(keys[i][0], keys[i + 1][0], z)
            return [lerp(a, b, t) for a, b in zip(keys[i][1:], keys[i + 1][1:])]


def fuselage_ring(z, segments):
    cy, rxt, ryt, rxb, ryb, n, chine, spine, lobe = fuselage_params(z)
    ring = []
    for i in range(segments):
        a = i * math.tau / segments
        c, s = math.cos(a), math.sin(a)
        rx = rxt if s >= 0 else rxb
        ry = ryt if s >= 0 else ryb
        r = (abs(c / rx) ** n + abs(s / ry) ** n) ** (-1 / n)
        # Twin engine lobes: the distance along this ray to the union of two circles.
        rl = 0.0
        for d in (-LOBE_D, LOBE_D):
            uc = c * d
            disc = uc * uc - d * d + LOBE_R * LOBE_R
            if disc >= 0:
                rl = max(rl, uc + math.sqrt(disc))
        r = lerp(r, max(rl, r * 0.82), lobe)
        # Side chine: a narrow bump at the sides, slightly below the centreline.
        side = min(abs(a - 0.0), abs(a - math.tau), abs(a - math.pi))
        r += chine * math.exp(-(side / 0.18) ** 2)
        # Dorsal spine bump at the top.
        r += spine * math.exp(-((a - math.pi / 2) / 0.55) ** 2)
        ring.append((r * c, cy + r * s, z))
    return ring


def airfoil_half(s, t):
    """NACA four-digit symmetric half thickness for thickness `t` at chord fraction `s`."""
    return 5 * t * (0.2969 * math.sqrt(s) - 0.1260 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4)


def airfoil_rings(stations, samples):
    """Rings around an airfoil surface. Each station is (origin, chord_vector, up_unit, t, sa, sb):
    the ring runs along the upper surface from sb to sa and back along the lower surface."""
    rings = []
    for origin, chord, up, t, sa, sb in stations:
        origin, chord, up = Vector(origin), Vector(chord), Vector(up)
        ss = [sa + (sb - sa) * (1 - math.cos(math.pi * k / (samples - 1))) / 2 for k in range(samples)]
        upper = [origin + chord * s + up * airfoil_half(s, t) for s in reversed(ss)]
        lower = [origin + chord * s - up * airfoil_half(s, t) for s in ss]
        if sa < 1e-6:
            lower = lower[1:]        # shared leading edge point
        if sb > 1 - 1e-6:
            lower = lower[:-1]       # shared trailing edge point
        rings.append([tuple(p) for p in upper + lower])
    return rings


def wing_geometry(side):
    LE = lambda x: -1.6 + 1.28 * max(0.0, x - 0.9)
    TE = lambda x: 5.4 - 0.6 * (x - 0.9) / 4.4
    HZ = lambda x: TE(x) - 0.8
    T = lambda x: 0.36 - 0.28 * smoothstep(0.9, 5.25, x) ** 0.8
    Y = lambda x: -0.05 - 0.02 * max(0.0, x - 0.9)
    return LE, TE, HZ, T, Y


def build_wing(side):
    LE, TE, HZ, T, Y = wing_geometry(side)
    xs = [0.5, 0.9, 1.3, 1.8, 2.6, 3.4, 4.2, 4.8, 5.25]
    up = (0, 1, 0)
    stations = []
    for x in xs:
        chord = TE(x) - LE(x)
        sh = (HZ(x) - LE(x)) / chord
        stations.append(((side * x, Y(x), LE(x)), (0, 0, chord), up, T(x) / chord, 0.0, sh))
    skin('Wing', airfoil_rings(stations, 20), mat('airframe'), True, 'convex')
    # The root trailing edge inboard of the elevon, mostly inside the fuselage.
    stations = []
    for x in [0.5, 0.9, 1.31]:
        chord = TE(x) - LE(x)
        sh = (HZ(x) - LE(x)) / chord
        stations.append(((side * x, Y(x), LE(x)), (0, 0, chord), up, T(x) / chord, sh - 0.002, 1.0))
    skin('Wing root trailing edge', airfoil_rings(stations, 6), mat('airframe'), True, 'convex')


def build_elevon(side):
    LE, TE, HZ, T, Y = wing_geometry(side)
    xs = [1.32, 1.8, 2.6, 3.4, 4.2, 4.8, 5.2]
    stations = []
    for x in xs:
        chord = TE(x) - LE(x)
        sh = (HZ(x) - LE(x)) / chord
        stations.append(((side * x, Y(x), LE(x)), (0, 0, chord), (0, 1, 0), T(x) / chord, sh, 1.0))
    skin('Elevon', airfoil_rings(stations, 10), mat('airframe'), True, 'convex')
    inboard = Vector((side * 1.32, Y(1.32), HZ(1.32)))
    outboard = Vector((side * 5.2, Y(5.2), HZ(5.2)))
    pivot(f'jet_elevon_{"r" if side > 0 else "l"}', tuple(inboard), tuple(outboard - inboard), [-0.44, 0.44],
          (side * 3.0, Y(3.0), TE(3.0)), (0, -1, 0))


def build_canard(side):
    LE = lambda x: -5.4 + 1.0 * (x - 0.45)
    TE = lambda x: -3.5 + 0.24 * (x - 0.45)
    T = lambda x: 0.10 - 0.07 * (x - 0.45) / 1.9
    Y = lambda x: 0.15 + 0.05 * (x - 0.45)
    stations = []
    for x in [0.45, 0.8, 1.3, 1.8, 2.15, 2.35]:
        chord = TE(x) - LE(x)
        stations.append(((side * x, Y(x), LE(x)), (0, 0, chord), (0, 1, 0), T(x) / chord, 0.0, 1.0))
    skin('Canard', airfoil_rings(stations, 16), mat('airframe'), True, 'convex')
    pivot(f'jet_canard_{"r" if side > 0 else "l"}', (side * 0.55, 0.15, -4.35), (1, 0, 0), [-0.35, 0.3],
          (side * 1.4, Y(1.4), LE(1.4)), (0, 1, 0))


def fin_geometry():
    LE = lambda y: 1.5 + 1.08 * (y - 0.45)
    TE = lambda y: 5.5 - 0.05 * (y - 0.45)
    HZ = lambda y: TE(y) - (0.65 - 0.06 * (y - 0.45))
    T = lambda y: 0.18 - 0.11 * smoothstep(0.45, 3.35, y)
    return LE, TE, HZ, T


def build_fin():
    LE, TE, HZ, T = fin_geometry()
    ys = [0.45, 0.9, 1.6, 2.3, 2.9, 3.35]
    stations = []
    for y in ys:
        chord = TE(y) - LE(y)
        sh = (HZ(y) - LE(y)) / chord
        stations.append(((0, y, LE(y)), (0, 0, chord), (1, 0, 0), T(y) / chord, 0.0, sh))
    skin('Fin', airfoil_rings(stations, 18), mat('airframe'), True, 'convex')
    # Fin tip fairing with the ESM pod at its trailing end.
    loft('Fin tip pod', [(3.85, 0.02, 0.02, 3.37), (4.1, 0.09, 0.08, 3.38), (4.7, 0.11, 0.10, 3.40),
                         (5.3, 0.10, 0.09, 3.40), (5.75, 0.04, 0.04, 3.38)], mat('airframe'), 14)
    # Formation light strip on the fin.
    box('Fin formation light', (0, 2.2, 3.55), (0.24, 0.06, 0.9), mat('airframe'), tint=(.35, .45, .40))


def build_rudder():
    LE, TE, HZ, T = fin_geometry()
    ys = [0.55, 0.9, 1.6, 2.3, 2.9, 3.3]
    stations = []
    for y in ys:
        chord = TE(y) - LE(y)
        sh = (HZ(y) - LE(y)) / chord
        stations.append(((0, y, LE(y)), (0, 0, chord), (1, 0, 0), T(y) / chord, sh, 1.0))
    skin('Rudder', airfoil_rings(stations, 8), mat('airframe'), True, 'convex')
    root = Vector((0, 0.55, HZ(0.55)))
    top = Vector((0, 3.3, HZ(3.3)))
    pivot('jet_rudder', tuple(root), tuple(top - root), [-0.52, 0.52], (0, 2.0, TE(2.0)), (-1, 0, 0))


def build_fuselage():
    zs = []
    z = -8.0
    while z < 5.55:
        zs.append(z)
        z += 0.16 if -7.0 < z < 5.3 else 0.08
    zs.append(5.55)
    rings = [fuselage_ring(z, 64) for z in zs]
    skin('Fuselage', rings, mat('airframe'), True, 'convex')
    # Nose probe and blade antennas.
    cylinder('Pitot probe', (0, 0.02, -8.3), 0.018, 0.62, mat('titanium'), vertices=10, radius2=0.006)
    mesh('Dorsal antenna', [(-0.012, 0.70, -1.0), (0.012, 0.70, -1.0), (0.012, 0.70, -0.6), (-0.012, 0.70, -0.6),
                            (-0.012, 0.88, -0.62), (0.012, 0.88, -0.62), (0.012, 0.88, -0.75), (-0.012, 0.88, -0.75)],
         [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat('airframe'))
    mesh('Ventral antenna', [(-0.012, -0.80, -5.3), (0.012, -0.80, -5.3), (0.012, -0.80, -4.9), (-0.012, -0.80, -4.9),
                             (-0.012, -0.96, -5.28), (0.012, -0.96, -5.28), (0.012, -0.96, -5.1), (-0.012, -0.96, -5.1)],
         [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat('airframe'))
    # Tail fairing between the nozzles (brake chute housing).
    loft('Tail fairing', [(4.6, 0.30, 0.22, 0.32), (5.4, 0.28, 0.20, 0.32), (6.0, 0.20, 0.14, 0.30), (6.35, 0.03, 0.03, 0.28)],
         mat('airframe'), 16)
    for side in (-1, 1):
        # Formation light strips on the forward fuselage.
        box('Fuselage formation light', (side * 0.86, 0.32, -2.2), (0.04, 0.07, 0.9), mat('airframe'), tint=(.35, .45, .40))


def build_intake():
    """Chin intake: a rounded box lofted from the mouth back into the belly, with a dark duct."""
    keys = [(-3.70, -0.95, 0.86, 0.30), (-3.2, -0.93, 0.92, 0.33), (-2.0, -0.88, 0.98, 0.36),
            (-0.5, -0.78, 1.06, 0.36), (0.6, -0.68, 1.05, 0.32), (1.4, -0.55, 0.98, 0.24)]
    rings = []
    n = 3.6
    for z, cy, rx, ry in keys:
        ring = []
        for i in range(40):
            a = i * math.tau / 40
            c, s = math.cos(a), math.sin(a)
            r = (abs(c / rx) ** n + abs(s / ry) ** n) ** (-1 / n)
            ring.append((r * c, cy + r * s, z))
        rings.append(ring)
    skin('Intake', rings, mat('airframe'), True, 'convex')
    # Mouth lip and the duct behind it.
    duct = []
    for z, cy, rx, ry in [(-3.72, -0.95, 0.80, 0.24), (-3.4, -0.95, 0.78, 0.23), (-3.0, -0.95, 0.60, 0.18)]:
        ring = []
        for i in range(40):
            a = i * math.tau / 40
            c, s = math.cos(a), math.sin(a)
            r = (abs(c / rx) ** n + abs(s / ry) ** n) ** (-1 / n)
            ring.append((r * c, cy + r * s, z))
        duct.append(ring)
    skin('Intake duct', duct, mat('rubber'), True, 'convex', tint=(.5, .5, .5))
    # Splitter vane down the middle of the mouth.
    box('Intake splitter', (0, -0.95, -3.55), (0.05, 0.5, 0.36), mat('airframe'))


def build_canopy_frame():
    sill_l = [(-0.30, 0.56, -6.05), (-0.44, 0.56, -5.5), (-0.50, 0.55, -4.9), (-0.50, 0.55, -4.3), (-0.46, 0.57, -3.7),
              (-0.36, 0.61, -3.2), (-0.24, 0.66, -2.9)]
    sill_r = [(-x, y, z) for x, y, z in sill_l]
    tube('Canopy sill left', sill_l, 0.035, mat('airframe'), 8)
    tube('Canopy sill right', sill_r, 0.035, mat('airframe'), 8)
    arch = lambda z, w, h: [(w * math.cos(a), 0.55 + h * math.sin(a), z) for a in (k * math.pi / 12 for k in range(13))]
    tube('Windscreen arch', arch(-5.45, 0.46, 0.47), 0.035, mat('airframe'), 8)
    tube('Canopy rear arch', arch(-3.15, 0.38, 0.34), 0.03, mat('airframe'), 8)
    tube('Canopy spine bar', [(0, 1.02, -5.4), (0, 1.17, -4.9), (0, 1.21, -4.3), (0, 1.10, -3.7), (0, 0.89, -3.15)],
         0.022, mat('airframe'), 6)
    # Cockpit furniture under the glass so it is not an empty shell.
    box('Ejection seat', (0, 0.62, -3.85), (0.42, 0.62, 0.34), mat('rubber'), bevel=0.02, tint=(.6, .6, .6))
    box('Headrest', (0, 1.0, -3.8), (0.30, 0.20, 0.22), mat('rubber'), bevel=0.02, tint=(.4, .4, .4))
    box('Instrument coaming', (0, 0.60, -5.5), (0.74, 0.16, 0.5), mat('rubber'), bevel=0.02, tint=(.5, .5, .5))
    box('Cockpit floor', (0, 0.35, -4.6), (0.9, 0.02, 2.2), mat('rubber'), tint=(.5, .5, .5))


def build_canopy_glass():
    sections = [(-6.32, 0.06, 0.03), (-6.0, 0.30, 0.20), (-5.5, 0.44, 0.44), (-4.9, 0.50, 0.62), (-4.3, 0.50, 0.66),
                (-3.7, 0.46, 0.55), (-3.2, 0.37, 0.33), (-2.92, 0.24, 0.10)]
    rings = []
    n = 2.2
    for z, w, h in sections:
        ring = []
        for k in range(13):
            a = k * math.pi / 12
            c, s = math.cos(a), math.sin(a)
            r = (abs(c / w) ** n + abs(s / h) ** n) ** (-1 / n) if w > 0 and h > 0 else 0
            ring.append((r * c, 0.55 + r * s, z))
        ring.append((-w, 0.50, z))
        ring.append((w, 0.50, z))
        rings.append(ring)
    skin('Canopy glass', rings, mat('canopy'), True, 'convex')


def build_nozzle(side):
    cx, cy, cz = side * 0.55, -0.10, 5.95
    m = mat('titanium')
    loft('Nozzle collar', [(5.52, 0.54, 0.54, cy), (5.70, 0.51, 0.51, cy), (5.86, 0.48, 0.48, cy)], m, 36) \
        .location = (0, 0, 0)
    for o in current[-1:]:
        o.data.transform(Matrix.Translation((cx, 0, 0)))
    petals = 18
    for i in range(petals):
        a0 = i * math.tau / petals
        a1 = a0 + math.tau / petals * 1.12
        vs = []
        for (r, z) in ((0.485, 5.86), (0.40, 6.30)):
            for rr in (r, r - 0.025):
                for a in (a0, a1):
                    vs.append((cx + rr * math.cos(a), cy + rr * math.sin(a), z))
        fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
        mesh('Nozzle petal', vs, fs, m, False, 'none')
    # Dark interior: a cone into the can with a flat turbine face.
    rings = []
    for z, r in ((6.30, 0.395), (5.95, 0.34), (5.62, 0.30)):
        rings.append([(cx + r * math.cos(a), cy + r * math.sin(a), z) for a in (k * math.tau / 32 for k in range(32))])
    skin('Nozzle interior', rings, mat('rubber'), True, 'none', tint=(.35, .35, .35))
    # Not a hinge: the renderer scales the petal ring radially, so range is the nozzle
    # parameter 0 to 1 and the axis is only the can's own centreline.
    pivot(f'jet_nozzle_{"r" if side > 0 else "l"}', (cx, cy, cz), (0, 0, 1), [0, 1])


def build_airbrake():
    z0, z1 = -2.55, -1.15
    ytop = 0.74
    vs = [(-0.44, ytop - 0.05, z0), (0.44, ytop - 0.05, z0), (0.44, ytop - 0.05, z1), (-0.44, ytop - 0.05, z1),
          (-0.40, ytop, z0 + 0.02), (0.40, ytop, z0 + 0.02), (0.40, ytop, z1 - 0.02), (-0.40, ytop, z1 - 0.02)]
    fs = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh('Airbrake', vs, fs, mat('airframe'), False, 'convex', bevel=0.01)
    pivot('jet_airbrake', (0, ytop - 0.02, z0), (1, 0, 0), [0, 0.9], (0, ytop, z1), (0, 1, 0))


def build_pods_and_pylons():
    for side in (-1, 1):
        x = side * 5.4
        loft('Wingtip pod', [(2.85, 0.02, 0.02, -0.06), (3.1, 0.10, 0.10, -0.06), (3.5, 0.13, 0.13, -0.06),
                             (4.4, 0.13, 0.13, -0.06), (4.75, 0.07, 0.07, -0.06), (4.9, 0.02, 0.02, -0.06)],
             mat('airframe'), 16)
        current[-1].data.transform(Matrix.Translation((x, 0, 0)))
        box('Pod fin', (x, -0.06, 4.55), (0.02, 0.30, 0.25), mat('airframe'))
        for z in (0.3, 2.2):
            box('Bomb pylon', (side * 2.2, -0.36, z), (0.13, 0.40, 1.15), mat('airframe'), bevel=0.02)
            box('Pylon sway brace', (side * 2.2, -0.52, z), (0.30, 0.05, 0.35), mat('rubber'), tint=(.5, .5, .5))
        # Navigation light lens on the pod.
        box('Nav light', (x + side * 0.12, -0.06, 3.9), (0.03, 0.06, 0.16), mat('canopy'))


def build_fin_code():
    """Two-letter squadron code as thin letter geometry proud of the fin, mirrored per side."""
    curve = bpy.data.curves.new('fin code', 'FONT')
    curve.body = 'EB'
    curve.size = 0.55
    curve.extrude = 0.0
    curve.align_x = 'CENTER'
    holder = bpy.data.objects.new('fin code text', curve)
    scene.collection.objects.link(holder)
    deps = bpy.context.evaluated_depsgraph_get()
    ev = holder.evaluated_get(deps)
    data = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(holder, do_unlink=True)
    LE, TE, HZ, T = fin_geometry()
    for side in (-1, 1):
        d = data.copy()
        # Text +x reads towards the nose on either side: on the right that is -z, on the left +z.
        rot = Matrix.Identity(4)
        rot[0][0], rot[0][1], rot[0][2] = 0, 0, side * 1.0      # x_out = side * z_text (thickness)
        rot[1][0], rot[1][1], rot[1][2] = 0, 1, 0               # y_out = y_text
        rot[2][0], rot[2][1], rot[2][2] = -side, 0, 0           # z_out = -side * x_text
        d.transform(rot)
        y0, z0 = 1.85, 3.55
        half = T(y0) / 2 * (1 - 0.35) + 0.004
        d.transform(Matrix.Translation((side * half, y0 - 0.2, z0)))
        o = bpy.data.objects.new('Fin code', d)
        scene.collection.objects.link(o)
        finish(o, 'Fin code', mat('airframe'), False, 'none', tint=(.22, .23, .24))
    bpy.data.meshes.remove(data)
    bpy.data.curves.remove(curve)


def section_jet():
    drop_collection('jet')          # the v1 aggregate asset, replaced by the parts of spec 4.2
    for name in JET_PARTS:
        drop_collection(name)
    build_fuselage()
    build_intake()
    for side in (-1, 1):
        build_wing(side)
    build_fin()
    build_canopy_frame()
    build_pods_and_pylons()
    build_fin_code()
    save_asset('jet_body')
    build_canopy_glass()
    save_asset('jet_canopy')
    for side in (-1, 1):
        build_canard(side)
        save_asset(f'jet_canard_{"r" if side > 0 else "l"}')
        build_elevon(side)
        save_asset(f'jet_elevon_{"r" if side > 0 else "l"}')
    build_rudder()
    save_asset('jet_rudder')
    build_airbrake()
    save_asset('jet_airbrake')
    for side in (-1, 1):
        build_nozzle(side)
        save_asset(f'jet_nozzle_{"r" if side > 0 else "l"}')
    print('jet built:', triangle_report(JET_PARTS))


# ---------------------------------------------------------------- undercarriage

def wheel(name, centre, radius, width, tyre, hub, vertices=28):
    cylinder(name, centre, radius, width, tyre, (0, math.pi / 2, 0), vertices, bevel=0.06, check='convex')
    cylinder(name + ' hub', centre, radius * 0.55, width + 0.02, hub, (0, math.pi / 2, 0), 20, check='convex', tint=(.55, .58, .60))
    cylinder(name + ' axle', centre, radius * 0.16, width + 0.10, hub, (0, math.pi / 2, 0), 10, check='convex', tint=(.45, .47, .50))


def build_nose_gear():
    m = mat('titanium')
    top = (0, -0.62, -4.35)
    axle = (0, -1.57, -4.35)
    cylinder('Nose leg', (0, -0.98, -4.35), 0.062, 0.76, m, (math.pi / 2, 0, 0), 16, tint=(.8, .8, .8))
    cylinder('Nose oleo piston', (0, -1.42, -4.35), 0.045, 0.34, m, (math.pi / 2, 0, 0), 14, tint=(1.4, 1.4, 1.4))
    for side in (-1, 1):
        box('Nose fork', (side * 0.11, -1.50, -4.35), (0.04, 0.30, 0.12), m, bevel=0.008)
    box('Torque link', (0, -1.22, -4.44), (0.06, 0.34, 0.05), m, bevel=0.006, rotation=(0.35, 0, 0))
    cylinder('Nose drag stay', (0, -0.95, -4.05), 0.028, 0.72, m, (math.pi / 2 + 0.55, 0, 0), 10)
    box('Landing light', (0, -1.05, -4.44), (0.14, 0.14, 0.06), mat('canopy'))
    wheel('Nose tyre', axle, 0.26, 0.20, mat('rubber'), m)
    # Aft-retracting nose leg, as shown in David Watson's Typhoon walkaround.
    hinge_pivot('jet_gear_nose', top, (0, 0.10, 1), (0, -1, 0))


# Main wheel track 3.87 m, the real Typhoon figure. Stream P widened it from the spec's 1.15 m
# half-track on 6 September because the aircraft tipped at 0.61 g of lateral acceleration, below
# the tyre saturation, so full rudder on the taxiway rolled it past the attitude limit.
MAIN_AXLE_X = 1.935
MAIN_FOOT_X = 1.83
MAIN_TOP_X = 1.15
MAIN_TOP_Y = -0.26


def build_main_gear(side):
    m = mat('titanium')
    top = (side * MAIN_TOP_X, MAIN_TOP_Y, 1.2)
    foot = (side * MAIN_FOOT_X, -1.51, 1.2)
    axle = (side * MAIN_AXLE_X, -1.51, 1.2)
    mid = tuple((a + b) / 2 for a, b in zip(top, foot))
    length = math.dist(top, foot)
    # The tilt is a rotation about Y, not Z: cylinder() composes Rx @ Ry @ Rz and applies Rz
    # first, so a Z term leaves the leg vertical (it did until 6 September).
    tilt = math.atan2(foot[0] - top[0], top[1] - foot[1])
    cylinder('Main leg', mid, 0.085, length * 0.74, m, (math.pi / 2, tilt, 0), 18, tint=(.8, .8, .8))
    cylinder('Main oleo piston', tuple((a + 3 * b) / 4 for a, b in zip(top, foot)), 0.060, length * 0.48, m,
             (math.pi / 2, tilt, 0), 14, tint=(1.4, 1.4, 1.4))
    cylinder('Main drag stay', (side * 1.44, -0.92, 1.62), 0.032, 1.05, m, (math.pi / 2 - 0.60, 0, 0), 10)
    cylinder('Main side stay', (side * 1.10, -0.80, 1.2), 0.032, 0.80, m, (math.pi / 2, side * 1.13, 0), 10)
    box('Main torque link', (side * 1.75, -1.25, 1.32), (0.06, 0.34, 0.05), m, bevel=0.006, rotation=(-0.3, 0, 0))
    box('Brake unit', (side * 1.80, -1.51, 1.2), (0.07, 0.30, 0.30), m, bevel=0.01, tint=(.5, .5, .5))
    wheel('Main tyre', axle, 0.36, 0.28, mat('rubber'), m)
    # Folds inward: the leg lies flat under the belly when stowed.
    # Folds forward and inboard, as the real one does. A purely inboard fold would swing the
    # 1.42 m leg from x = 1.15 across the centreline and the two legs would intersect.
    deployed = Vector(foot) - Vector(top)
    stowed = Vector((-0.35 * side, 0.10, -0.93))
    hinge_pivot(f'jet_gear_main_{"r" if side > 0 else "l"}', top, stowed, deployed)


def build_doors():
    m = mat('airframe')
    # Nose door: hinged on the left edge of the bay, hanging down when open.
    hinge = (-0.30, -0.70, -4.35)
    box('Nose gear door', (-0.30, -1.0, -4.35), (0.03, 0.60, 1.25), m, bevel=0.008, check='convex')
    hinge_pivot('jet_door_nose', hinge, (1, 0, 0), (0, -1, 0))
    save_asset('jet_door_nose')
    for side in (-1, 1):
        hinge = (side * 0.72, -0.86, 1.2)
        box('Main gear door', (side * 0.72, -1.34, 1.2), (0.03, 0.96, 1.85), m, bevel=0.008, check='convex')
        hinge_pivot(f'jet_door_main_{"r" if side > 0 else "l"}', hinge, (side, 0, 0), (0, -1, 0))
        save_asset(f'jet_door_main_{"r" if side > 0 else "l"}')


def section_gear():
    for name in GEAR_PARTS + ['gear']:
        drop_collection(name)
    build_nose_gear()
    save_asset('jet_gear_nose')
    for side in (-1, 1):
        build_main_gear(side)
        save_asset(f'jet_gear_main_{"r" if side > 0 else "l"}')
    build_doors()
    print('gear built:', triangle_report(GEAR_PARTS))


# ---------------------------------------------------------------- the shared jet UV atlas

def uv_context():
    """A context override the UV operators accept in the live session and in `blender -b`."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                region = next((r for r in area.regions if r.type == 'WINDOW'), None)
                return {'window': window, 'screen': window.screen, 'area': area,
                        'region': region, 'scene': scene}
    return {'scene': scene}


def section_uv():
    """One atlas for every jet part, spec 4.2. Smart UV Project alone lays each object out from
    the same corner, so the islands of different parts sit on top of each other and the bake
    overwrites one part with another; pack_islands across the whole multi-object edit session is
    what gives them one uniform texel density and disjoint space."""
    objs = []
    for name in JET_PARTS + GEAR_PARTS:
        coll = bpy.data.collections.get(name)
        if coll is None:
            raise RuntimeError(f'{name} missing: run the jet and gear sections first')
        objs += [o for o in coll.objects if o.type == 'MESH']
    layer = bpy.context.view_layer
    for lc in layer.layer_collection.children:
        lc.hide_viewport = False
    for o in layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    layer.objects.active = objs[0]
    override = uv_context()
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(45), island_margin=0.004,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(margin=0.004, rotate=True, scale=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        o.select_set(False)
    print(f'uv atlas: {len(objs)} jet meshes unwrapped and packed')
    print(uv_overlap_report(objs))


def uv_overlap_report(objs, grid=512):
    """Rasterise every part's UV triangles into an occupancy grid and report any texel two
    different parts claim. The bake would blend them into each other."""
    owner = {}
    clashes = {}
    used = 0
    for o in objs:
        part = o.users_collection[0].name if o.users_collection else o.name
        me = o.data
        me.calc_loop_triangles()
        uvs = me.uv_layers.active.data
        for tri in me.loop_triangles:
            pts = [uvs[li].uv for li in tri.loops]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            for gx in range(max(0, int(min(xs) * grid)), min(grid, int(max(xs) * grid) + 1)):
                for gy in range(max(0, int(min(ys) * grid)), min(grid, int(max(ys) * grid) + 1)):
                    px, py = (gx + 0.5) / grid, (gy + 0.5) / grid
                    (ax, ay), (bx, by), (cx, cy) = pts[0], pts[1], pts[2]
                    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
                    if abs(d) < 1e-12:
                        continue
                    u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
                    v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
                    if u < 0 or v < 0 or u + v > 1:
                        continue
                    key = gx * grid + gy
                    prev = owner.get(key)
                    if prev is None:
                        owner[key] = part
                        used += 1
                    elif prev != part:
                        clashes[(prev, part)] = clashes.get((prev, part), 0) + 1
    total = grid * grid
    return {'gridTexels': total, 'claimed': used, 'coverage': round(used / total, 4),
            'partsSharingTexels': {f'{a} + {b}': n for (a, b), n in sorted(clashes.items())[:12]},
            'clashingPairs': len(clashes)}


# ---------------------------------------------------------------- stores

def section_stores():
    drop_collection('bomb')
    loft('Unguided bomb', [(-1.0, .015, .015, 0), (-.7, .16, .16, 0), (-.4, .2, .2, 0), (.45, .19, .19, 0), (.75, .11, .11, 0), (.95, .09, .09, 0)],
         mat('target'), 16)
    for i in range(4):
        a = i * math.pi / 2
        mesh('Tail fin', [(0, 0, .36), (.37 * math.cos(a), .37 * math.sin(a), .77), (.37 * math.cos(a), .37 * math.sin(a), 1.08), (0, 0, .97)],
             [(0, 1, 2, 3), (3, 2, 1, 0)], mat('edge'))
    save_asset('bomb')
    print('stores built:', triangle_report(['bomb']))


# ---------------------------------------------------------------- airfield and scenery (carried over)

def section_airfield():
    # Scenery uses its own metal, glass and dark materials. Sharing the jet's titanium, canopy
    # and rubber would put the jet atlas maps on scenery in the manifest, and the cube-projected
    # scenery UVs would sample the aircraft's texels.
    concrete, white, edge, dark, glass = mat('concrete'), mat('marking'), mat('edge'), mat('dark'), mat('glass')
    hangar, metal, targetmat, wreckmat, earth = mat('hangar'), mat('metal'), mat('target'), mat('wreck'), mat('earth')
    box('Runway', (0, -.16, -1100), (62, .28, 2800), concrete)
    box('Apron', (-150, -.17, -60), (280, .26, 370), concrete)
    box('Parallel taxiway', (-190, -.175, -1150), (20, .25, 2200), concrete)
    for z in [-250, -1100, -2050]:
        box('Link taxiway', (-90, -.17, z), (180, .26, 19), concrete)
    save_asset('pavement')
    for z in range(-2350, 231, 65):
        box('Centre stripe', (0, .005, z), (1.0, .018, 25), white)
    for side in [-1, 1]:
        box('Edge stripe', (side * 29, .002, -1100), (.45, .018, 2760), white)
        for x in [4.5, 7.5, 10.5, 13.5, 16.5, 19.5]:
            for z in [185, -2400]:
                box('Threshold', (side * x, .007, z), (1.7, .02, 30), white)
        for z in [-50, -2180]:
            box('Aiming point', (side * 17, .008, z), (5, .02, 40), white)
    save_asset('runway_markings')
    box('Water plane', (0, -7, 0), (100000, .1, 100000), concrete)
    save_asset('ocean')
    box('Hangar shell', (0, 5, 0), (38, 10, 45), hangar, .4)
    for x in [-17, 17]:
        box('Hangar buttress', (x, 4.5, -23), (1.1, 9, 1.4), concrete)
    box('Hangar door', (0, 4.4, -22.7), (32, 8.4, .13), edge)
    for x in range(-15, 16, 3):
        box('Door seam', (x, 4.4, -22.8), (.07, 8.4, .06), dark)
    mesh('Pitched roof', [(-20, 10, -24), (20, 10, -24), (0, 14, -24), (-20, 10, 24), (20, 10, 24), (0, 14, 24)],
         [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (2, 1, 4, 5)], hangar)
    save_asset('hangar')
    box('Tower base', (0, 7, 0), (10, 14, 12), concrete, .2)
    box('Tower cabin', (0, 15, 0), (15, 3, 15), glass, .2)
    box('Tower roof', (0, 16.8, 0), (16, 0.6, 16), hangar, .15)
    cylinder('Antenna', (0, 20, 0), .09, 6, metal, (math.pi / 2, 0, 0), 8)
    save_asset('tower')
    box('Target vehicle chassis', (0, .85, 0), (3.3, .6, 6.5), targetmat, .17)
    box('Target vehicle cab', (0, 1.8, -1.8), (3, 1.4, 2.2), targetmat, .12)
    box('Target vehicle cargo', (0, 1.75, 1.15), (3.15, 1.2, 3.6), targetmat, .12)
    box('Target windscreen', (0, 2, -2.92), (2.55, .6, .04), glass)
    for x in [-1.6, 1.6]:
        for z in [-1.9, 1.4, 2.4]:
            cylinder('Truck tyre', (x, .57, z), .57, .36, dark, (0, math.pi / 2, 0), 16)
    save_asset('target')
    for i in range(12):
        box('Burnt fragment', (random.uniform(-3, 3), random.uniform(.1, .8), random.uniform(-4, 4)),
            (random.uniform(.4, 2), random.uniform(.1, .7), random.uniform(.7, 2.5)), wreckmat, .04,
            rotation=(random.random(), random.random() * 3, random.random()))
    save_asset('wreck')
    cylinder('Airfield lamp', (0, .14, 0), .16, .26, metal, (math.pi / 2, 0, 0), 10)
    save_asset('lamp')
    # Service areas and range hardstands from the refine script, unchanged.
    box('Perimeter service road', (-660, -.11, -1150), (9, .15, 3100), concrete)
    for z in [290, -2630]:
        box('Perimeter cross road', (-125, -.11, z), (1080, .15, 9), concrete)
    for i in range(6):
        x = -330 - i % 2 * 120
        z = -130 - i // 2 * 330
        box('Hangar hardstand', (x, -.13, z + 40), (58, .15, 106), concrete)
    for i in range(7):
        x = -525
        z = -230 - i * 83
        box('Service building', (x, 2.4, z), (23, 4.8, 15), hangar)
        box('Service building roof', (x, 5, z), (24, .5, 16), edge)
        for w in range(4):
            box('Office window', (x + 11.55, 2.9, z - 5 + w * 3), (.1, 1.1, 1.5), glass)
    for x in [-570, -601]:
        for z in [-960, -997]:
            cylinder('Fuel storage tank', (x, 4, z), 9, 8, hangar, (math.pi / 2, 0, 0), 24)
            box('Tank bund', (x, .25, z), (24, .5, 24), concrete)
    for i in range(81):
        z = 390 - i * 39
        for x in [-690, 450]:
            box('Perimeter post', (x, 1.15, z), (.16, 2.3, .16), edge)
    for x in [-690, 450]:
        for y in [.65, 1.45, 2.15]:
            box('Perimeter wire', (x, y, -1170), (.035, .035, 3120), edge)
    for x, z in [(-950, -3900), (-1090, -4050), (-800, -4170), (-1040, -4300), (-1220, -4190), (-860, -4430)]:
        box('Range hardstand', (x, -.15, z), (35, .16, 45), concrete)
        box('Range backstop', (x, 1.9, z - 29), (42, 3.8, 8), earth)
    save_asset('scenery')
    print('airfield built:', triangle_report(['pavement', 'runway_markings', 'ocean', 'hangar', 'tower', 'target', 'wreck', 'lamp', 'scenery']))


# ---------------------------------------------------------------- terrain (spec 1.1 formula)

PAVEMENT = [
    (-31, -2500, 31, 300), (-290, -245, -10, 125), (-200, -2250, -180, -50),
    (-180, -259.5, 0, -240.5), (-180, -1109.5, 0, -1090.5), (-180, -2059.5, 0, -2040.5),
    (-664.5, -2700, -655.5, 400), (-665, 285.5, 415, 294.5), (-665, -2634.5, 415, -2625.5),
    (-200, -1000, -180, -50), (-460, -200, -200, -60), (-460, -380, -200, -240),
    (-620, -1020, -550, -940),
]
for _z in (-620, -740, -860, -980):
    PAVEMENT.append((-470, _z - 30, -380, _z + 30))
PAVEMENT.append((-380, -1010, -200, -590))
for _x, _z in ((-330, -130), (-450, -130), (-330, -460), (-450, -460), (-330, -790), (-450, -790)):
    PAVEMENT.append((_x - 29, _z - 13, _x + 29, _z + 93))
for _x, _z in ((-950, -3900), (-1090, -4050), (-800, -4170), (-1040, -4300), (-1220, -4190), (-860, -4430)):
    PAVEMENT.append((_x - 17.5, _z - 22.5, _x + 17.5, _z + 22.5))

M32 = 0xffffffff


def hash32(ix, iz, seed):
    n = ((ix * 73856093) & M32) ^ ((iz * 19349663) & M32) ^ ((seed * 83492791) & M32)
    n &= M32
    n = ((n ^ (n >> 13)) * 1274126177) & M32
    return n / 4294967296


def value_noise(u, v, seed):
    ix, iz = math.floor(u), math.floor(v)
    fx, fz = u - ix, v - iz
    tx, tz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b = hash32(ix, iz, seed), hash32(ix + 1, iz, seed)
    c, d = hash32(ix, iz + 1, seed), hash32(ix + 1, iz + 1, seed)
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz


def fbm2(u, v):
    n0 = value_noise(u, v, 7)
    n1 = value_noise(2 * u, 2 * v, 8)
    n2 = value_noise(4 * u, 4 * v, 9)
    return 2 * (n0 + 0.5 * n1 + 0.25 * n2) / 1.75 - 1


def coast(z):
    return 1600 + 350 * math.sin(0.0008 * z) + 180 * math.sin(0.0018 * z)


def pavement_distance(x, z):
    """0 inside any rectangle, else the distance to the nearest rectangle edge."""
    best = float('inf')
    for x0, z0, x1, z1 in PAVEMENT:
        dx = max(x0 - x, 0, x - x1)
        dz = max(z0 - z, 0, z - z1)
        d = math.hypot(dx, dz)
        if d < best:
            best = d
            if best == 0:
                return 0.0
    return best


def terrain_height(x, z):
    d = x - coast(z)
    if d <= -250:
        h = -0.34 + max(0, abs(x) - 2200) * 0.006 * (0.6 + 0.4 * math.sin(0.001 * z))
        h += 6 * fbm2(0.0009 * x, 0.0009 * z) * smoothstep(0, 1500, abs(x) - 700) * smoothstep(250, 600, -d)
    elif d <= 0:
        h = -0.34 - 6 * ((d + 250) / 250) ** 2
    elif d <= 1800:
        h = -6.34 - min(25, 0.01 * d)
    else:
        h = -7 + max(0, min(8, 0.012 * (d - 1800)))
    pd = pavement_distance(x, z)
    if pd < 60:
        h = h * smoothstep(0, 60, pd)
    return h


TERRAIN = {'nx': 256, 'nz': 256, 'originX': -12000, 'originZ': -14000, 'spacing': 110}
SAMPLE_POINTS = [(0, 0), (-1000, -4200), (900, -3000), (3000, -4000), (5500, -4000)]


def section_terrain():
    drop_collection('terrain')
    nx, nz, ox, oz, sp = TERRAIN['nx'], TERRAIN['nz'], TERRAIN['originX'], TERRAIN['originZ'], TERRAIN['spacing']
    vs, fs = [], []
    for iz in range(nz):
        z = oz + iz * sp
        for ix in range(nx):
            x = ox + ix * sp
            vs.append((x, terrain_height(x, z), z))
    for iz in range(nz - 1):
        for ix in range(nx - 1):
            a = iz * nx + ix
            fs.append((a, a + nx, a + nx + 1, a + 1))
    o = mesh('Coastal terrain', vs, fs, mat('earth'), True, 'none')
    o['grid'] = TERRAIN
    save_asset('terrain')
    for x, z in SAMPLE_POINTS:
        print(f'terrainHeight({x}, {z}) = {terrain_height(x, z):.6f}')
    print('terrain built:', triangle_report(['terrain']))


# ---------------------------------------------------------------- effects primitives

def section_effects():
    white = mat('marking')
    for name in ['sky', 'quad', 'flame', 'blast']:
        drop_collection(name)
    sphere('Atmosphere', (0, 0, 0), (1, 1, 1), white, 48, 24)
    save_asset('sky')
    mesh('Particle quad', [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [(0, 1, 2, 3)], white)
    save_asset('quad')
    cylinder('Reheat plume', (0, 0, 0), .42, 1, white, vertices=24, radius2=.025)
    save_asset('flame')
    sphere('Blast volume', (0, 0, 0), (1, 1, 1), white, 16, 8)
    save_asset('blast')
    print('effects built:', triangle_report(['sky', 'quad', 'flame', 'blast']))


# ---------------------------------------------------------------- reporting

def triangle_count(o):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    data = ev.to_mesh()
    data.calc_loop_triangles()
    n = len(data.loop_triangles)
    ev.to_mesh_clear()
    return n


def triangle_report(names):
    out = {}
    for name in names:
        coll = bpy.data.collections.get(name)
        if coll is None:
            continue
        out[name] = sum(triangle_count(o) for o in coll.objects if o.type == 'MESH')
    out['total'] = sum(out.values())
    return out


try:
    from pathlib import Path
    ROOT = Path(bpy.data.filepath).resolve().parent.parent if bpy.data.filepath else Path(r'E:/claude-projects/range')
except Exception:
    ROOT = None

def section_details():
    """Reusable arched shelters, support vehicles and small airfield furnishings."""
    c, h, m, d, g = mat('concrete'), mat('hangar'), mat('metal'), mat('dark'), mat('glass')
    def arch(name, width, depth, height):
        rings=[]
        for z in (-depth/2, depth/2):
            rings.append([(width/2*math.cos(i*math.pi/28), 1+height*math.sin(i*math.pi/28),z) for i in range(29)])
        skin('Arched corrugated roof',rings,h,True,'none',close=False,caps=False)
        for x in (-width/2,width/2): box('Concrete footing',(x,.65,0),(.6,1.3,depth),c,.1)
        box('Rear wall',(0,height*.38,depth/2),(width,.76*height,.35),h,.06)
        box('Dark interior',(0,height*.35,depth*.42),(width*.9,height*.7,.12),d)
        box('Partly open sliding door',(-width*.29,height*.37,-depth/2-.15),(width*.4,height*.74,.3),h,.08)
        for z in (-depth/2,depth/2):
            tube('Roof rib',[(width/2*math.cos(i*math.pi/28),1+height*math.sin(i*math.pi/28),z) for i in range(29)],.10,m,6,'none')
        save_asset(name)
    arch('hangar_arch',42,60,16)
    arch('has',22,32,8)
    box('Office', (0,2.4,0),(23,4.8,15),h,.15)
    box('Parapet',(0,4.9,0),(24,.35,16),m,.08)
    for x in range(-9,10,3): box('Window reveal',(x,2.8,-7.53),(1.65,1.2,.13),g,.05)
    save_asset('service_block')
    box('Fire station',(0,3.4,0),(24,6.8,18),h,.25)
    for x in (-6,6):
        box('Bay opening',(x,2.7,-9.1),(8,5.4,.2),d)
        box('Bay lintel',(x,5.55,-9.3),(8.4,.4,.5),c)
    save_asset('fire_station')
    cylinder('Fuel tank',(0,4,0),9,8,h,(math.pi/2,0,0),32)
    cylinder('Tank cap',(0,8.1,0),9.2,.25,m,(math.pi/2,0,0),32)
    for x in (-12,12): box('Bund wall',(x,.65,0),(.35,1.3,24),c)
    for z in (-12,12): box('Bund wall',(0,.65,z),(24,1.3,.35),c)
    tube('Feed pipe',[(0,1,-9),(0,1,-11),(7,1,-11)],.16,m,8,'none')
    save_asset('fuel_tank')
    for name,width,length,height in [('bowser',2.5,7,2.6),('tractor',2.2,3.6,1.6),('landrover',1.9,4.5,2),('fire_tender',2.7,7.2,3),('gpu_cart',1.2,2,1.1)]:
        box('Chassis',(0,.7,0),(width,.55,length),h,.16)
        box('Cab',(0,height*.65,-length*.3),(width*.94,height*.55,length*.28),h,.14)
        box('Windscreen',(0,height*.72,-length*.445),(width*.8,height*.24,.04),g)
        if name=='bowser': cylinder('Tanker',(0,1.75,length*.1),1.05,length*.6,h,vertices=24)
        else: box('Equipment body',(0,height*.57,length*.15),(width*.88,height*.5,length*.5),h,.1)
        for x in (-width*.48,width*.48):
            for z in (-length*.3,length*.3): cylinder('Tyre',(x,.46,z),.46,.26,d,(0,math.pi/2,0),12)
        save_asset(name)
    box('Container',(0,1.3,0),(2.45,2.6,6.1),h,.07)
    for x in (-1.25,1.25):
        for z in range(-14,15,2): box('Container rib',(x,1.3,z*.2),(.07,2.4,.07),m)
    save_asset('container')
    box('Gabion',(0,.65,0),(1.2,1.3,1.2),c,.12)
    save_asset('hesco')
    box('Hulk hull',(0,.9,0),(3.2,1.15,5.9),mat('target'),.25)
    for x in (-1.55,1.55): box('Track',(x,.45,0),(.55,.85,5.4),d,.18)
    cylinder('Turret',(0,1.6,0),1.1,.9,mat('target'),(math.pi/2,0,0),12)
    cylinder('Inert barrel',(0,1.8,-2.7),.12,3.8,m,vertices=8)
    save_asset('target_hulk')
    for i in range(3):
        o=sphere('Coastal rock',(0,.9,0),(2.4+i,.9+i*.35,1.8+i*.4),c,10,6)
        for v in o.data.vertices: v.co *= 1 + .12*math.sin(v.co.x*3+v.co.z*7)
        save_asset('rock_'+str(i+1))
    for z in range(-8,9,2): cylinder('Timber post',(0,.8,z),.19,2.7,d,(math.pi/2,0,0),8)
    box('Timber groyne',(0,.75,0),(.2,1.2,18),h)
    save_asset('groyne')
    box('Fence post',(0,1.2,0),(.13,2.4,.13),m)
    for y in (.6,1.4,2.2): box('Fence wire',(0,y,6),(.025,.025,12),m)
    save_asset('fence_post')
    cylinder('Windsock mast',(0,4,0),.08,8,m,(math.pi/2,0,0),8)
    cylinder('Windsock',(0,7.8,1.2),.42,2.4,mat('marking'),vertices=16,radius2=.16)
    save_asset('windsock')
    for x in range(-24,25,3): box('Blast panel',(x,1.8,0),(2.9,3.6,.22),h,.06,rotation=(.3,0,0))
    save_asset('blast_fence')
    box('Taxi sign',(0,.65,0),(2,1.1,.2),mat('marking'),.06)
    save_asset('sign')
    box('Wheel chock',(0,.13,0),(.4,.26,.5),mat('marking'),.06)
    save_asset('chocks')
    # Hardstands follow the same rectangles used by wheel contacts and clutter exclusion.
    for i,(x0,z0,x1,z1) in enumerate(PAVEMENT):
        box('Pavement rectangle',((x0+x1)/2,-.08,(z0+z1)/2),(x1-x0,.16,z1-z0),c)
    save_asset('pavement')
    print('Detailed scenery authored')

def section_livery():
    """Conforming low-visibility roundels, independent of the shared paint texture."""
    global current
    if bpy.data.objects.get('Wing roundel outer'): return
    outer=material('roundel_outer',(.12,.18,.23),.15,.6)
    centre=material('roundel_centre',(.28,.08,.065),.15,.6)
    for side in (-1,1):
        LE,TE,HZ,T,Y=wing_geometry(side)
        for radius,ma,offset,label in [(.46,outer,.009,'outer'),(.22,centre,.012,'centre')]:
            vs=[]
            for i in range(49):
                angle=i*math.tau/48
                x=3.25+radius*math.cos(angle);z=3.18+radius*math.sin(angle)
                chord=TE(x)-LE(x);s=(z-LE(x))/chord
                vs.append((side*x,Y(x)+airfoil_half(s,T(x)/chord)+offset,z))
            mesh('Wing roundel '+label,vs,[tuple(range(48))],ma)
    coll=bpy.data.collections['jet_body']
    for o in current:
        for c in list(o.users_collection):c.objects.unlink(o)
        coll.objects.link(o)
    current=[]

SECTIONS = {
    'materials': section_materials, 'jet': section_jet, 'gear': section_gear, 'uv': section_uv,
    'stores': section_stores, 'airfield': section_airfield, 'terrain': section_terrain,
    'effects': section_effects, 'details': section_details, 'livery': section_livery,
}
ORDER = ['materials', 'jet', 'gear', 'uv', 'stores', 'airfield', 'terrain', 'effects', 'details', 'livery']


def sweep_loose():
    """Every asset object belongs to a named collection. Anything left in the scene master
    collection is a leftover from an earlier library version and would be exported twice."""
    if scene.collection.objects:
        coll = bpy.data.collections.new('archive_loose')
        coll.use_fake_user = True
        for o in list(scene.collection.objects):
            coll.objects.link(o)
            scene.collection.objects.unlink(o)


def run(stages):
    sweep_loose()
    for name in ORDER:
        if 'all' in stages or name in stages:
            SECTIONS[name]()


run(STAGES)
if __name__ == '__main__' and 'all' in STAGES:
    bpy.ops.wm.save_mainfile(filepath=str(ROOT / 'assets/RANGE.blend'))
    print('saved', ROOT / 'assets/RANGE.blend')
