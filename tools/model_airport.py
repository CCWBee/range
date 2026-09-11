"""Apply the manual/OSM airport plan without rebuilding the aircraft or island assets."""
import bpy,json,math,shutil,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.context.window.scene=bpy.data.scenes['RANGE']
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(ROOT/'assets/RANGE.blend',ROOT/f'_archive/RANGE-before-airport-{stamp}.blend')
h={'__name__':'range_assets','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),h)
data=json.loads((ROOT/'assets/airport_geometry.json').read_text());a=data['airport']
concrete=h['material']('concrete',(.33,.35,.34),.05,.73)
paint=h['material']('airport_marking',(.78,.79,.73),0,.82)
walls=h['material']('airport_render',(.58,.55,.47),0,.88)
roof=h['material']('airport_roof',(.25,.28,.28),.15,.72)
vertices=[];faces=[]
for triangle in data['triangles']:
    i=len(vertices);vertices.extend((x,.015,z) for x,z in triangle);faces.append((i+2,i+1,i))
h['mesh']('Mapped runway taxiways and aprons',vertices,faces,concrete)
for x,z in [(-950,-3900),(-1090,-4050),(-800,-4170),(-1040,-4300),(-1220,-4190),(-860,-4430)]:
    h['box']('Range pad',(x,-.06,z),(35,.12,45),concrete)
h['save_asset']('pavement')
cx,cz=a['centre'];length=a['lengthMetres']*a['scale'];width=a['widthMetres']*a['scale']
for side in [-1,1]:
    h['box']('Runway edge stripe',(cx+side*(width/2-.4),.035,cz),(.3,.012,length-30),paint)
for z in range(round(cz-length/2+90),round(cz+length/2-90),51):
    h['box']('Runway centre stripe',(cx,.035,z),(.45,.012,25),paint)
for end in [-1,1]:
    z=cz+end*(length/2-60)
    for side in [-1,1]:
        for n in range(5):h['box']('Threshold stripe',(cx+side*(3+n*2.4),.035,z),(1.4,.012,25),paint)
        h['box']('Aim point',(cx+side*9,.035,z-end*230),(5,.012,30),paint)
h['save_asset']('markings')
for f in data['buildings']:
    points=f['points'];points=points[:-1] if points[0]==points[-1] else points
    n=len(points);height=9 if f['tags'].get('aeroway')=='terminal' else 12
    vs=[(x,y,z) for y in [0,height] for x,z in points]
    fs=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    h['mesh'](f['tags'].get('name','Airport building'),vs,fs,walls)
    h['mesh']('Terminal roof',[(x,height+.15,z) for x,z in points],[tuple(range(n))],roof)
h['save_asset']('jersey_airport')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
