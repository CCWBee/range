"""Refine the existing Blender assets without replacing the RAF airframe or its UV layout.

ASRAAM silhouette: MBDA 2023 product sheet, 2.9 m by 166 mm.
Fort Regent: user's five roof photographs/plan and the OSM fort perimeter in landmarks.json.
Roof heights are visual estimates; the proposed landscaping in the plan is not modelled.
"""
import bpy, math, json, shutil, datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.context.window.scene=bpy.data.scenes['RANGE']
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(ROOT/'assets/RANGE.blend',ROOT/f'_archive/RANGE-before-refinement-{stamp}.blend')
h={'__name__':'range_assets','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),h)
for name in ('cylinder','sphere','box','mesh','save_asset','material'):
    globals()[name]=h[name]
white=material('asraam_white',(.68,.70,.69),.12,.42)
dark=material('asraam_seeker',(.035,.045,.05),.25,.19)
band=material('asraam_band',(.52,.32,.08),.1,.6)
# Four small tail controls, no Sidewinder's prominent forward canards.
cylinder('ASRAAM motor case',(0,0,.10),.083,2.70,white,vertices=24)
sphere('Imaging seeker dome',(0,0,-1.25),(.083,.083,.20),dark,24,12)
for z in [-.78,.28]:cylinder('Store identification band',(0,0,z),.084,.055,band,vertices=24)
for angle in [math.pi/4+i*math.pi/2 for i in range(4)]:
    vs=[]
    for r,z in [(.075,.91),(.23,1.06),(.23,1.43),(.075,1.43)]:
        vs.append((r*math.cos(angle),r*math.sin(angle),z))
    # A thin solid fin gives a silhouette from both sides.
    vs += [(x+.004,y+.004,z) for x,y,z in vs]
    mesh('Tail control',vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],white)
save_asset('asraam')

stone=material('landmark_granite',(.40,.34,.28),0,.94)
roof=material('landmark_white',(.78,.77,.69),0,.8)
glass=material('landmark_window',(.045,.08,.095),.1,.48)
rock=material('landmark_rock',(.30,.23,.19),0,.98)
sites=json.loads((ROOT/'assets/landmarks.json').read_text())
site=next(s for s in sites if s['name']=='Fort Regent' and s['tags'].get('historic')=='castle')
locations=json.loads((ROOT/'src/landmarks.js').read_text().split(' = ',1)[1].strip().rstrip(';'))
y=locations[5]['position'][1]
cx,cz=3190,-6329
def at(u,v,height):
    # Long axis is NW/SE in the geographic map, diagonal in runway coordinates.
    return (cx+u*.7071-v*.7071,y+height,cz+u*.7071+v*.7071)
perimeter=site['points']
for a,b in zip(perimeter,perimeter[1:]):
    dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
    box('Fort retaining scarp',((a[0]+b[0])/2,y-3,(a[1]+b[1])/2),(6,18,length),stone,rotation=(0,math.atan2(dx,dz),0))
    box('Rampart coping',((a[0]+b[0])/2,y+6.4,(a[1]+b[1])/2),(6.6,.9,length),stone,rotation=(0,math.atan2(dx,dz),0))
    box('Rock below curtain',((a[0]+b[0])/2,y-15,(a[1]+b[1])/2),(12,12,length),rock,rotation=(0,math.atan2(dx,dz),0))
# Swept saddle roof, pointed end gables and glazed skirt. Dome offset towards the south end.
vs=[];faces=[];rows=72;cols=16
for i in range(rows+1):
    u=-126+252*i/rows
    taper=max(.08,min(1,(126-abs(u))/38))
    width=38*taper
    for j in range(cols+1):
        f=-1+2*j/cols
        scallop=3.4*(.5+.5*math.cos((u+120)*math.pi/28))*abs(f)**3
        height=8+5*(abs(u)/126)**3+scallop+3.5*f*f
        vs.append(at(u,width*f,height))
for i in range(rows):
    for j in range(cols):
        a=i*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
obj=mesh('Scalloped parade roof',vs,faces,roof)
for p in obj.data.polygons:p.use_smooth=True
for side in [-1,1]:
    for i in range(rows):
        a=vs[i*(cols+1)+(cols if side>0 else 0)]
        b=vs[(i+1)*(cols+1)+(cols if side>0 else 0)]
        mesh('Glazed perimeter',[(a[0],y+3,a[2]),a,b,(b[0],y+3,b[2])],[(0,1,2,3),(3,2,1,0)],glass)
        box('Roof mullion',(a[0],(y+3+a[1])/2,a[2]),(.38,a[1]-y-3,.38),roof)
# Low ellipsoidal cap, not a full hemisphere intersecting the roof skirt.
vs=[];faces=[];n=64;rings=14
for ring in range(rings+1):
    radius=ring/rings
    for j in range(n):
        angle=j*math.tau/n
        vs.append(at(36+math.cos(angle)*38*radius,math.sin(angle)*34*radius,11+15*(1-radius*radius)**.6))
for i in range(rings):
    for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
obj=mesh('Offset shallow dome',vs,faces,roof)
for p in obj.data.polygons:p.use_smooth=True
save_asset('landmark_5')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
