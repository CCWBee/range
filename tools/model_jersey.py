"""Bring the runtime Jersey terrain into Blender and union the pavement rectangles."""
import bpy,json,subprocess,shutil,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
script="""import {JERSEY} from './src/jersey.js';import {terrainHeight,PAVEMENT} from './physics.js';
const j=JERSEY;const heights=[];for(let z=0;z<j.nz;z++)for(let x=0;x<j.nx;x++)heights.push(terrainHeight(j.originX+x*j.spacing,j.originZ+z*j.spacing));
console.log(JSON.stringify({grid:{nx:j.nx,nz:j.nz,originX:j.originX,originZ:j.originZ,spacing:j.spacing},heights,pavement:PAVEMENT}));"""
data=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
archive=ROOT/'_archive';archive.mkdir(exist_ok=True)
shutil.copy2(ROOT/'assets/RANGE.blend',archive/f'RANGE-before-jersey-{stamp}.blend')

def replace(name,vertices,faces,material):
    old=bpy.data.collections.get(name)
    if old:old.name=f'archive_{name}_{stamp}';old.hide_render=True;old.hide_viewport=True
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    mesh=bpy.data.meshes.new(name+'_jersey');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name+'_jersey',mesh);collection.objects.link(obj)
    if material:mesh.materials.append(material)
    return obj

g=data['grid'];n=g['nx'];m=g['nz'];s=g['spacing']
vertices=[(g['originX']+i*s,data['heights'][j*n+i],g['originZ']+j*s) for j in range(m) for i in range(n)]
faces=[(j*n+i,(j+1)*n+i,(j+1)*n+i+1,j*n+i+1) for j in range(m-1) for i in range(n-1)]
terrain=replace('terrain',vertices,faces,bpy.data.materials.get('moor'))
terrain['grid']=g
for polygon in terrain.data.polygons:polygon.use_smooth=True

# Partition the rectangle union into disjoint cells. No coincident top faces remain.
rects=data['pavement'];xs=sorted({r[k] for r in rects for k in ('x0','x1')});zs=sorted({r[k] for r in rects for k in ('z0','z1')})
vertices=[];faces=[]
for x0,x1 in zip(xs,xs[1:]):
    for z0,z1 in zip(zs,zs[1:]):
        x=(x0+x1)/2;z=(z0+z1)/2
        if any(r['x0']<=x<=r['x1'] and r['z0']<=z<=r['z1'] for r in rects):
            i=len(vertices);vertices.extend([(x0,0,z0),(x0,0,z1),(x1,0,z1),(x1,0,z0)]);faces.append((i,i+1,i+2,i+3))
replace('pavement',vertices,faces,bpy.data.materials.get('concrete'))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('Jersey terrain and non-overlapping pavement exported',len(faces),'pavement cells')
