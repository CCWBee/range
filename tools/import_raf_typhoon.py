"""Adapt the RAF recognition model to RANGE, preserving its supplied UV atlas.

Run with Blender -b assets/RANGE.blend -P tools/import_raf_typhoon.py -- source.fbx
Source: https://www.raf.mod.uk/aircraft/current-aircraft/typhoon-fgr41/
RAF Crown Copyright. Downloaded for the requested local adaptation; redistribution
permission has not been established. Original geometry remains in archive collections.
"""
import bpy, bmesh, sys, json, shutil
from pathlib import Path
from datetime import datetime
from mathutils import Matrix, Vector

root=Path(bpy.data.filepath).resolve().parent.parent
source=Path(sys.argv[sys.argv.index('--')+1]).resolve()
stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(root/'assets/RANGE.blend',root/'_archive'/f'RANGE-before-raf-{stamp}.blend')
scene=bpy.data.scenes['RANGE']
bpy.context.window.scene=scene
replaced=['body','canopy','canard_l','canard_r','elevon_l','elevon_r','rudder','nozzle_l','nozzle_r']
for part in replaced:
    old=bpy.data.collections.get('jet_'+part)
    if old:
        old.name=f'archive_raf_{stamp}_{old.name}'
        old.hide_render=True; old.hide_viewport=True
collections={}
for part in replaced:
    c=bpy.data.collections.new('jet_'+part);scene.collection.children.link(c);collections[part]=c

bpy.ops.import_scene.fbx(filepath=str(source))
objects=list(bpy.context.selected_objects)
body=next(o for o in objects if o.type=='MESH' and o.name.startswith('body_cut'))
glass=next(o for o in objects if o.type=='MESH' and o.name.startswith('Canopy'))
# FBX imports Z-up. Convert to Y-up, -Z forward, metres. Match the existing engine stations.
sx=11.09/116.95359; s=15.96/171.90285
convert=Matrix(((sx,0,0,0),(0,0,s,-.2),(0,-s,0,-.8),(0,0,0,1)))
for o in (body,glass):
    o.data.transform(convert@o.matrix_world);o.matrix_world=Matrix.Identity(4)
    o['preserve_uv']=True
    for c in list(o.users_collection):c.objects.unlink(o)
    collections['canopy' if o==glass else 'body'].objects.link(o)
    for p in o.data.polygons:p.use_smooth=True

mat=bpy.data.materials.new('raf_airframe');mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.48
images={}
for image in list(bpy.data.images):
    if image.packed_file and ('Eurofighter-body' in image.name or 'Body-bump' in image.name):
        stem='raf_typhoon_bump' if 'bump' in image.name else 'raf_typhoon_skin'
        image.filepath_raw=str(root/'textures'/f'{stem}.png');image.file_format='PNG';image.save();images[stem]=image
assert len(images)==2, 'RAF source must contain both texture maps'
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=images['raf_typhoon_skin']
mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
bumptex=mat.node_tree.nodes.new('ShaderNodeTexImage');bumptex.image=images['raf_typhoon_bump'];bumptex.image.colorspace_settings.name='Non-Color'
bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.018
mat.node_tree.links.new(bumptex.outputs['Color'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
body.data.materials.clear();body.data.materials.append(mat)
glass.data.materials.clear();glass.data.materials.append(bpy.data.materials['canopy'])

# Separate the source's existing disconnected surfaces without remapping their UVs.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
counts={p:0 for p in replaced}
for o in list(collections['body'].objects):
    if o.type!='MESH':continue
    o['preserve_uv']=True
    vs=[v.co for v in o.data.vertices]; lo=Vector([min(v[i] for v in vs) for i in range(3)]); hi=Vector([max(v[i] for v in vs) for i in range(3)])
    centre=(lo+hi)/2; side='r' if centre.x>0 else 'l'; part='body'
    if len(vs)<30 and lo.z<-4 and abs(centre.x)>1:part='canard_'+side
    elif len(vs)<50 and lo.z>3.5 and hi.z<4.8 and abs(centre.x)>1.2:part='elevon_'+side
    elif len(vs)==8 and lo.y>.6 and hi.y>2 and abs(centre.x)<.2:part='rudder'
    elif len(vs)==122 and lo.z>4.9:part='nozzle_'+side
    if part!='body':collections['body'].objects.unlink(o);collections[part].objects.link(o)
    counts[part]+=len(vs)
for part in replaced:
    if part in ('body','canopy'):continue
    c=collections[part]; vs=[v.co for o in c.objects if o.type=='MESH' for v in o.data.vertices]
    assert vs, f'No RAF geometry classified as {part}'
    lo=Vector([min(v[i] for v in vs) for i in range(3)]);hi=Vector([max(v[i] for v in vs) for i in range(3)])
    point=(lo+hi)/2; axis=(1,0,0)
    if part.startswith('canard'):point.x=lo.x if point.x>0 else hi.x
    elif part.startswith('elevon'):point.z=lo.z
    elif part=='rudder':point.z=lo.z;axis=(0,1,0)
    else:axis=(0,0,1)
    pivot=bpy.data.objects.new('RAF hinge '+part,None);c.objects.link(pivot);pivot.location=point;pivot['axis']=axis;pivot['range']=[0,1]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/RANGE.blend'))
exec(compile((root/'tools/export_meshes.py').read_text(),str(root/'tools/export_meshes.py'),'exec'))
print('RAF_IMPORT',json.dumps(counts))
