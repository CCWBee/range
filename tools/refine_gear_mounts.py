"""Fit stores to the RAF mesh and correct the aft-retracting nose leg.

David Watson's Typhoon walkaround, frames 10, 16, 18, 20 and 41:
https://www.aircraftresourcecenter.com/awa01/701-800/awa714-Typhoon-Watson/00.shtm
"""
import bpy, math, json, shutil, datetime
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.context.window.scene=bpy.data.scenes['RANGE']
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(ROOT/'assets/RANGE.blend',ROOT/f'_archive/RANGE-before-mounts-{stamp}.blend')
h={'__name__':'range_assets','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),h)
verts=[];faces=[]
for o in bpy.data.collections['jet_body'].objects:
    if o.type!='MESH':continue
    offset=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices)
    faces.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
bvh=BVHTree.FromPolygons(verts,faces)
paint=h['material']('pylon_grey',(.42,.46,.48),.18,.55)
# Keep the non-carriage detail already present. Archive only obsolete pylon objects.
detail=bpy.data.collections['jet_detail']
archive=bpy.data.collections.new('archive_mounts_'+stamp);archive.use_fake_user=True
for o in list(detail.objects):
    if 'pylon' in o.name.lower() or 'rail' in o.name.lower():
        archive.objects.link(o);detail.objects.unlink(o)
positions=[]
for kind,x,z,drop in [('bomb',2.4,.75,.42),('bomb',3.55,1.85,.36),('missile',4.65,2.8,.25)]:
    for side in [-1,1]:
        x0=x*side;hits=[]
        for dz in [-.35,.35]:
            hit=bvh.ray_cast(Vector((x0,-4,z+dz)),Vector((0,1,0)),8)[0]
            if hit is None:raise RuntimeError(f'No wing at {x0},{z+dz}')
            hits.append(hit.y)
        top=min(hits);bottom=top-drop
        vs=[(x0+dx,y,z+dz) for dx in [-.075,.075] for y,dz in [(hits[0]-.015,-.35),(hits[1]-.015,.35),(bottom,.50),(bottom,-.48)]]
        h['mesh']('Individual suspension pylon',vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],paint)
        h['box']('Release rail',(x0,bottom-.04,z),(.14,.08,1.2),paint)
        positions.append(dict(kind=kind,position=[round(x0,3),round(bottom-(.15 if kind=='bomb' else .14),3),z]))
h['save_asset']('jet_pylons')
# Existing leg pivots are retained. Nose wheels fold aft, away from the nose cone.
for o in bpy.data.collections['jet_gear_nose'].objects:
    if o.type=='EMPTY' and 'axis' in o:
        axis,rng=h['hinge_from_directions']((0,.1,1),(0,-1,0))
        o['axis']=list(axis);o['range']=list(rng)
        o['note']='Aft retraction, Watson walkaround nose gear reference'
print('STORE_MOUNTS',json.dumps(positions))
(ROOT/'assets/store_mounts.json').write_text(json.dumps(positions,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
