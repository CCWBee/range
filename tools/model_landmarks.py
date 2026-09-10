"""Blender silhouettes for Jersey landmarks, a practice ship and an instanced broadleaf tree.

Positions: OSM / Geofabrik, assets/landmarks.json. Simplified visual interpretations,
not architectural surveys. Fort Henry is in Grouville, not St Ouen.
"""
import bpy, math, json, subprocess, shutil, datetime
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(ROOT/'assets/RANGE.blend',ROOT/f'_archive/RANGE-before-landmarks-{stamp}.blend')
helpers={'__name__':'range_assets','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),helpers)
for name in ('loft','sphere','cylinder','box','mesh','prism','tube','save_asset','material'):
    globals()[name]=helpers[name]
stone=material('landmark_granite',(.40,.34,.28),0,.94)
rock=material('landmark_rock',(.26,.23,.19),0,.98)
roof=material('landmark_slate',(.15,.18,.19),0,.91)
white=material('landmark_white',(.78,.77,.69),0,.8)
dark=material('landmark_window',(.045,.08,.095),.1,.48)
green=material('tree_leaf',(.12,.23,.055),0,.98)
bark=material('tree_bark',(.20,.13,.075),0,.99)
data=json.loads((ROOT/'assets/landmarks.json').read_text())
selected=[next(l for l in data if l['name']==name) for name in ["Saint Aubin's Fort",'Elizabeth Castle','Mont Orgueil Castle','Corbière Lighthouse','Fort Henry','Fort Regent']]
points=[l['point'] for l in selected]
cmd="import {terrainHeight} from './physics.js';console.log(JSON.stringify("+json.dumps(points)+".map(p=>terrainHeight(...p))));"
heights=json.loads(subprocess.check_output(['node','--input-type=module','-e',cmd],cwd=ROOT,text=True))
locations=[]
def outcrop(x,z,rx,rz,top):
    vertices=[];faces=[];n=28
    for y,scale in [(top-18,1.12),(top-7,1),(top,.55)]:
        for i in range(n):
            a=i*math.tau/n;r=scale*(1+.16*math.sin(a*5+.4)+.09*math.cos(a*9))
            vertices.append((x+math.cos(a)*rx*r,y+math.sin(a*7)*1.1,z+math.sin(a)*rz*r))
    for layer in range(2):
        for i in range(n):faces.append((layer*n+i,layer*n+(i+1)%n,(layer+1)*n+(i+1)%n,(layer+1)*n+i))
    vertices.append((x,top+.2,z))
    for i in range(n):faces.append((2*n+i,2*n+(i+1)%n,3*n))
    mesh('Exposed granite ledges',vertices,faces,rock)
def tower(x,y,z,r,h):
    cylinder('Granite tower',(x,y+h/2,z),r,h,stone,rotation=(math.pi/2,0,0),vertices=20)
    cylinder('Parapet rim',(x,y+h,z),r+1,1.2,stone,rotation=(math.pi/2,0,0),vertices=20)
    for i in range(12):
        a=i*math.tau/12;box('Merlon',(x+math.cos(a)*r,y+h+1.4,z+math.sin(a)*r),(1.6,2,1.6),stone)
def wall(a,b,y,h=7,width=3):
    dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz)
    box('Curtain wall',((a[0]+b[0])/2,y+h/2,(a[1]+b[1])/2),(width,h,length),stone,rotation=(0,math.atan2(dx,dz),0))
    for i in range(max(1,int(length/5))):
        t=(i+.5)/max(1,int(length/5));box('Wall coping',(a[0]+dx*t,y+h+.8,a[1]+dz*t),(width+.4,1.6,2),stone)
def enclosure(x,y,z,w,d,h):
    pts=[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)]
    for a,b in zip(pts,pts[1:]+pts[:1]):wall(a,b,y,h)
    return pts
for i,(site,h) in enumerate(zip(selected,heights)):
    x,z=site['point'];name=site['name'];y=max(h,-78)
    if i in (0,1,3):
        y=-74 if i==1 else -72
        outcrop(x,z,48 if i==1 else 28,100 if i==1 else 30,y-.5)
    if i==0:
        corners=enclosure(x,y,z,40,52,7)
        box('Square keep',(x,y+12,z),(18,24,20),stone)
        enclosure(x,y+24,z,18,20,2)
        box('Barracks',(x-10,y+4,z+16),(11,8,22),white)
    elif i==1:
        enclosure(x,y,z,55,155,7)
        box('Upper ward rock',(x,y+6,z-46),(44,12,45),stone,bevel=4)
        tower(x,y+12,z-46,13,21)
        box('Governor house',(x-15,y+7,z+5),(19,14,34),white)
        box('Slate roof',(x-15,y+14.5,z+5),(21,2,36),roof)
        for dz in [40,63]:box('Garrison quarters',(x+8,y+5,z+dz),(30,10,14),white)
        for side in [-1,1]:tower(x+side*22,y,z+65,8,9)
    elif i==2:
        outcrop(x,z,45,49,y-.5)
        corners=enclosure(x,y,z,62,70,14)
        for a,b in corners:tower(a,y,b,8,19)
        box('High keep',(x+6,y+23,z-6),(24,46,27),stone)
        enclosure(x+6,y+46,z-6,24,27,2)
        tower(x-16,y+12,z-19,10,30)
        box('Lower ward',(x,y+6,z+49),(40,12,22),stone)
    elif i==3:
        box('Lighthouse keeper base',(x,y+3,z),(22,6,16),white)
        cylinder('White lighthouse',(x,y+14,z),5,23,white,rotation=(-math.pi/2,0,0),radius2=3.3,vertices=24)
        cylinder('Lantern gallery',(x,y+25,z),5.2,1,white,rotation=(math.pi/2,0,0),vertices=24)
        cylinder('Lantern glass',(x,y+27,z),3.2,4,dark,rotation=(math.pi/2,0,0),vertices=16)
        sphere('Lantern cap',(x,y+29.3,z),(3.9,1.5,3.9),white,16,8)
        for n in range(12):
            a=n*math.tau/12;box('Gallery rail',(x+math.cos(a)*4.7,y+26,z+math.sin(a)*4.7),(.18,1.7,.18),white)
    elif i==4:
        enclosure(x,y,z,43,38,4)
        box('Low coastal gun platform',(x,y+1,z),(42,2,36),stone)
        box('Battery magazine',(x,y+3,z+13),(22,6,8),stone)
        for dx in [-12,0,12]:
            cylinder('Historic cannon',(x+dx,y+4,z-9),.5,5,dark,vertices=12)
    else:
        enclosure(x,y,z,120,165,10)
        box('Regent hall',(x,y+9,z),(85,18,120),white)
        sphere('White vaulted Regent roof',(x,y+17,z),(44,26,62),white,40,20)
        for dx in [-45,45]:box('Fort barracks',(x+dx,y+7,z),(16,14,130),stone)
    asset='landmark_'+str(i)
    save_asset(asset)
    locations.append(dict(name=name,asset=asset,position=[x,y,z]))

# Low triangle tree, repeated by the renderer inside measured woodland boundaries.
cylinder('Trunk',(0,2.8,0),.28,5.6,bark,rotation=(math.pi/2,0,0),vertices=7)
for x,y,z,r in [(0,6.8,0,3),(-1.8,5.2,.4,2),(1.6,5.8,1,2.2),(.5,5,-1.8,2.1)]:
    sphere('Broadleaf crown',(x,y,z),(r,r*.86,r),green,8,5)
save_asset('jersey_tree')

# An unarmed 62 m practice coaster. Geometry uses the same -Z forward convention as the jet.
ship=material('ship_hull',(.18,.23,.25),.35,.75)
deck=material('ship_deck',(.32,.28,.22),.1,.9)
red=material('ship_red',(.28,.07,.04),.1,.83)
vs=[(-6,-3,25),(6,-3,25),(6,-3,-20),(0,-3,-31),(-6,-3,-20),(-7,4,27),(7,4,27),(7,4,-20),(0,4,-34),(-7,4,-20)]
mesh('Coaster hull',vs,[(0,1,2,3,4),(5,9,8,7,6),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,9,4),(4,9,5,0)],ship)
box('Working deck',(0,4.1,-1),(12,.3,48),deck)
box('Bridge superstructure',(0,8,17),(11,8,12),white)
box('Wheelhouse',(0,13,17),(12,3,13),white)
for x in [-4,-2,0,2,4]:box('Bridge window',(x,13,10.45),(1.5,1.2,.1),dark)
box('Funnel',(0,15,23),(3,6,3),red)
cylinder('Mast',(0,17,11),.2,12,white,rotation=(math.pi/2,0,0),vertices=8)
for z in [-17,-4]:box('Cargo hatch',(0,5,z),(9,1.5,10),ship)
for x in [-6.5,6.5]:
    tube('Deck rail',[(x,5.5,-22),(x,5.5,25)],.09,white)
    for z in range(-20,26,5):box('Rail stanchion',(x,4.8,z),(.12,1.5,.12),white)
save_asset('practice_ship')
(ROOT/'src/landmarks.js').write_text('// OSM positions; simplified Blender landmark models.\nexport const LANDMARKS = '+json.dumps(locations,separators=(',',':'))+';\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('Landmarks, tree and practice ship exported')
