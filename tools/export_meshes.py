"""Export the Blender scene as an indexed binary library with movable parts and a separate skin."""
import bpy, bmesh, json, struct, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(bpy.data.filepath).resolve().parent.parent
scene = bpy.data.scenes['RANGE']
binary = bytearray()
manifest = {'version': 2, 'blender': bpy.app.version_string, 'materials': {}, 'assets': {}, 'pivots': {}}

def block(values, kind):
    while len(binary) % 4: binary.append(0)
    offset = len(binary)
    binary.extend(struct.pack('<' + str(len(values)) + kind, *values))
    return offset

def material(m):
    if m.name in manifest['materials']: return m.name
    bs = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    d = {'colour': list(m.get('colour', m.diffuse_color[:3])),
         'metallic': float(m.get('metallic', bs.inputs['Metallic'].default_value if bs else 0)),
         'roughness': float(m.get('roughness', bs.inputs['Roughness'].default_value if bs else .6))}
    if m.name == 'airframe':
        d.update(colour=[.92,.96,1], metallic=.35, roughness=.42, map='airframe', normalMap='airframe_normal', grimeMap='grime', uvScale=2)
    if m.name == 'raf_airframe':
        d.update(colour=[1,1,1], metallic=.22, roughness=.48, map='raf_typhoon_skin', bumpMap='raf_typhoon_bump', bumpScale=.018, uvScale=1)
    if m.name == 'hangar': d.update(colour=[.65,.72,.72], map='corrugated', uvScale=1)
    manifest['materials'][m.name] = d
    return m.name

skip = {'jet', 'gear', 'terrain', 'hangar', 'scenery'}
deps = bpy.context.evaluated_depsgraph_get()
for coll in scene.collection.children:
    if coll.name in skip or coll.name.startswith('archive_'): continue
    pivot = next((o for o in coll.objects if o.type == 'EMPTY' and 'axis' in o), None)
    point = pivot.location.copy() if pivot else Vector((0,0,0))
    if pivot:
        manifest['pivots'][coll.name] = {'point':list(point), 'axis':list(pivot['axis']), 'range':list(pivot['range'])}
    groups = {}
    for o in coll.objects:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(deps); me = ev.to_mesh()
        me.calc_loop_triangles()
        normal_matrix = o.matrix_world.to_3x3().inverted().transposed()
        uv_layer = me.uv_layers.active
        tint = list(o.get('tint', [1,1,1]))
        for tri in me.loop_triangles:
            m = me.materials[tri.material_index] if len(me.materials) else bpy.data.materials['marking']
            name = material(m)
            g = groups.setdefault(name, {'p':[], 'n':[], 'uv':[], 'c':[], 'i':[], 'w':{}})
            face_n = (normal_matrix @ tri.normal).normalized()
            for li in tri.loops:
                vi = me.loops[li].vertex_index
                world = o.matrix_world @ me.vertices[vi].co
                pos = world - point
                norm = (normal_matrix @ (me.vertices[vi].normal if me.polygons[tri.polygon_index].use_smooth else tri.normal)).normalized()
                if (o.get('preserve_uv', False) or coll.name in ('sky','quad','flame','blast')) and uv_layer:
                    uv = tuple(uv_layer.data[li].uv)
                elif coll.name in ('pavement','runway','taxiway','apron','runway_markings','markings'):
                    uv = (world.x,world.z)
                else:
                    axis = max(range(3), key=lambda i:abs(face_n[i]))
                    uv = [(world.z,world.y),(world.x,world.z),(world.x,world.y)][axis]
                    if not coll.name.startswith('jet'): uv = (uv[0]*.25,uv[1]*.25)
                # Gentle grounding in the vertex colour; geometric contact shadows remain dynamic.
                ao = 1 if coll.name.startswith('jet') or coll.name in ('sky','quad','flame','blast','bomb') else .78 + .22*min(1,max(0,world.y)/3)
                colour = tuple(round(max(0,min(1,v*ao))*255) for v in tint)
                key = (*[round(v,4) for v in pos], *[round(v,3) for v in norm], *[round(v,5) for v in uv], *colour)
                if key not in g['w']:
                    g['w'][key] = len(g['p'])//3
                    g['p'].extend(pos); g['n'].extend(norm); g['uv'].extend(uv); g['c'].extend(colour)
                g['i'].append(g['w'][key])
        ev.to_mesh_clear()
    parts = []
    for name,g in groups.items():
        n = len(g['p'])//3
        if not n: continue
        bounds = [min(g['p'][i::3]) for i in range(3)] + [max(g['p'][i::3]) for i in range(3)]
        parts.append({'material':name,'vertexCount':n,'indexCount':len(g['i']), 'position':block(g['p'],'f'), 'normal':block(g['n'],'f'), 'uv':block(g['uv'],'f'), 'color':block(g['c'],'B'), 'index':block(g['i'],'I'), 'bounds':bounds})
    if parts: manifest['assets'][coll.name] = parts

terrain = bpy.data.collections['terrain'].objects[0]
grid = dict(terrain.get('grid', {'nx':256,'nz':256,'originX':-12000,'originZ':-14000,'spacing':110}))
assert len(terrain.data.vertices) == grid['nx'] * grid['nz'], 'Terrain grid dimensions disagree'
grid['heights'] = block([v.co.y for v in terrain.data.vertices], 'f')
manifest['terrain'] = grid
(ROOT/'assets/meshes.bin').write_bytes(binary)
(ROOT/'assets/meshes.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
print(json.dumps({'assets':len(manifest['assets']),'bytes':len(binary),'hinges':len(manifest['pivots']),'jetTriangles':sum(p['indexCount']//3 for k,ps in manifest['assets'].items() if k.startswith('jet') for p in ps)}))

# Pack the export into the runtime library the loader reads (assets/library.json and .bin).
import subprocess, sys
try: subprocess.run([sys.executable, str(ROOT/'tools/pack_library.py')], check=True)
except Exception as error: print('pack_library did not run, do it by hand with python tools/pack_library.py:', error)
