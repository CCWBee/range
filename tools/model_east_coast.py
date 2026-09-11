"""Replace only Gorey Castle and St Catherine's Breakwater, preserving the other Blender assets.

XY: OSM walls/buildings and paired breakwater footways in east_coast_geometry.json.
Heights are visual estimates from Jersey Heritage's aerial and harbour photographs, not a survey.
https://www.jerseyheritage.org/visit/places-to-visit/mont-orgueil-castle/
https://www.jerseyheritage.org/stay/weddings/mont-orgueil-castle/
https://www.jersey.com/things-to-do/points-of-interest/listings/st-catherines-bay/
The castle remains at 49.19935 N, 2.01927 W. St Catherine's is 2.4 km north of it on this scaled map.
"""
import bpy, json, math, shutil, datetime
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT = Path(__file__).resolve().parent.parent
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(ROOT/'assets/RANGE.blend', ROOT/f'_archive/RANGE-before-east-coast-{stamp}.blend')
bpy.context.window.scene = bpy.data.scenes['RANGE']
helpers = {'__name__':'range_assets', 'STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'), 'model_range.py', 'exec'), helpers)
for name in ('mesh','box','cylinder','save_asset','material'):
    globals()[name] = helpers[name]
features = {f['id']:f for f in json.loads((ROOT/'assets/east_coast_geometry.json').read_text())}
stone = material('gorey_granite', (.45,.35,.25), 0, .96)
rock = material('gorey_rock', (.29,.22,.16), 0, .98)
turf = material('gorey_turf', (.20,.27,.075), 0, .98)
roof = material('gorey_roof', (.40,.17,.07), 0, .94)
dark = material('gorey_opening', (.025,.028,.022), 0, 1)
quay = material('catherine_masonry', (.38,.32,.25), 0, .94)
deck = material('catherine_deck', (.53,.47,.38), 0, .98)
metal = material('catherine_iron', (.09,.11,.105), .35, .7)
sea = -82.6

def points(key):
    p = features[key]['points']
    return p[:-1] if p[0] == p[-1] else p

def latitude(p):
    a = math.radians(82.8)
    return 49.2080555556 + (-p[0]*math.sin(a)-(p[1]+1100)*math.cos(a))/(111320*.85)

def ward_height(p):
    return sea + 15 + max(0, min(1, (latitude(p)-49.19890)/.00105))*19

def solid(name, p, bottom, top, paint):
    n = len(p)
    heights = [top(v) if callable(top) else top for v in p]
    vertices = [(x,bottom,z) for x,z in p] + [(x,y,z) for (x,z),y in zip(p,heights)]
    faces = [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    vectors = [Vector((x,0,z)) for x,z in p]
    for tri in tessellate_polygon([vectors]):
        ids = [v if isinstance(v,int) else vectors.index(v) for v in tri]
        faces.append(tuple(i+n for i in ids)); faces.append(tuple(reversed(ids)))
    return mesh(name, vertices, faces, paint)

def wall(name, p, base, height, width, paint=stone, crenels=False):
    for a,b in zip(p,p[1:]):
        dx,dz = b[0]-a[0],b[1]-a[1]; length = math.hypot(dx,dz)
        if length < .3: continue
        y = base([(a[0]+b[0])/2,(a[1]+b[1])/2]) if callable(base) else base
        angle = math.atan2(dx,dz)
        box(name,((a[0]+b[0])/2,y+height/2,(a[1]+b[1])/2),(width,height,length+.12),paint,rotation=(0,angle,0))
        if crenels:
            for i in range(max(1,int(length/4))):
                t = (i+.5)/max(1,int(length/4))
                box('Wide spaced parapet', (a[0]+dx*t,y+height+.45,a[1]+dz*t),
                    (width,.9,1.5),paint,rotation=(0,angle,0))

# The long polygon and rising rock replace the old square enclosure and four matching towers.
outer = points(166410471)
cx,cz = 2180,-11853
expanded = [(cx+(x-cx)*1.09,cz+(z-cz)*1.09) for x,z in outer]
base = [(cx+(x-cx)*1.40,cz+(z-cz)*1.40) for x,z in outer]
n = len(outer)
v = [(x,sea-4,z) for x,z in base]+[(x,ward_height((x,z))-1.8,z) for x,z in expanded]
mesh('Sloping exposed Gorey rock',v,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],rock)
solid('Terraced lower wards',outer,sea-2,ward_height,turf)
wall('Outer curtain',outer+[outer[0]],lambda p:ward_height(p)-7,9,2.3,crenels=True)
for key in (211657067,211657068,270099949,870242400,870242404,870242407,870242412,870242413,870242415):
    wall('Mapped ward wall',points(key),ward_height,3.6,1.7)

# Irregular upper keep, the adjoining great hall and round observation posts.
upper = points(270099950)
solid('Irregular upper keep',upper,sea+29,sea+53,stone)
wall('Upper keep parapet',upper+[upper[0]],sea+53,1.2,1.1,crenels=True)
hall = points(870242402)
solid('Great hall',hall,sea+27,sea+43,stone)
solid('Great hall tiled roof',hall,sea+43,sea+44,roof)
# Pitched hall roof over its broad western span, oriented in the mapped frame.
p = [(2162,-11864),(2170,-11859),(2180,-11878),(2172,-11883)]
v = [(x,sea+44,z) for x,z in p]
v += [((p[0][0]+p[1][0])/2,sea+50,(p[0][1]+p[1][1])/2),
      ((p[2][0]+p[3][0])/2,sea+50,(p[2][1]+p[3][1])/2)]
mesh('Great hall pitched tiles',v,[(0,4,5,3),(1,2,5,4),(0,1,4),(3,5,2),(0,3,2,1)],roof)
for key,base,top in ((870242414,29,44),(870242410,53,61),(870242411,53,60),(270099945,53,63),
                      (870242408,15,20),(870242409,19,24)):
    p = points(key); solid('Mapped tower',p,sea+base,sea+top,stone)
    x,z = sum(x for x,z in p)/len(p),sum(z for x,z in p)/len(p)
    r = sum(math.hypot(a-x,b-z) for a,b in p)/len(p)
    cylinder('Tower coping',(x,sea+top+.35,z),r+.24,.7,stone,rotation=(math.pi/2,0,0),vertices=16)
    if base > 50:
        for i in range(5):
            a = i*math.tau/5
            box('Observation slit',(x+math.cos(a)*(r+.025),sea+top-1.2,z+math.sin(a)*(r+.025)),
                (1.1,.45,.045),dark,rotation=(0,math.pi/2-a,0))
for key in (211655908,185751159):
    p = points(key); y = sum(ward_height(v) for v in p)/len(p)
    solid('Lower ward building',p,y,y+3.4,stone);solid('Lower ward roof',p,y+3.4,y+3.9,roof)
save_asset('landmark_2')

# Both mapped footways run along the same structure, in opposite node order. Joining them
# preserves the real bend and breadth instead of rotating a generic pier at a guessed bearing.
north = points(175072229)
south = list(reversed(points(301125693)))
def offset_path(p, distance):
    result=[]
    for i,(x,z) in enumerate(p):
        a,b=p[max(0,i-1)],p[min(len(p)-1,i+1)]
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
        result.append((x-dz/length*distance,z+dx/length*distance))
    return result
# OSM footways are walking centre lines, not the masonry edges. The sheltered lower deck
# occupies most of the width in the reference photographs; the raised north walk is narrow.
north = offset_path(north,-1.5)
south = list(reversed(offset_path(south,5)))
outline = north + south
solid('St Catherine breakwater masonry',outline,sea-7,sea+4.8,quay)
solid('Breakwater walking deck',outline,sea+4.8,sea+5.05,deck)
wall('North sea parapet',north,sea+5.05,2.7,1.65,quay)
wall('Southern coping',list(reversed(south)),sea+5.05,.32,.7,quay)
for a,b in zip(south,south[1:]):
    length = math.dist(a,b)
    for i in range(int(length/25)):
        t = (i+.5)/max(1,int(length/25));x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
        cylinder('Quay bollard',(x,sea+5.5,z),.20,.7,metal,rotation=(math.pi/2,0,0),vertices=8)
tip = north[-1]
cylinder('Breakwater head beacon',(tip[0]+1,sea+8.3,tip[1]-1),.3,4,deck,rotation=(math.pi/2,0,0),vertices=10)
# Verlcut slipway curves back towards the shore on the sheltered bay side.
wall('Verlcut slipway',points(170333854),sea-.8,2.8,5.5,quay)
save_asset('landmark_6')

path = ROOT/'src/landmarks.js';text = path.read_text()
sites = json.loads(text.split('export const LANDMARKS = ',1)[1].strip().rstrip(';'))
sites = [s for s in sites if s['asset'] != 'landmark_6']
for s in sites:
    if s['asset']=='landmark_2':s['position']=[2188.6,sea+28,-11848.9]
sites.append(dict(name="St Catherine's Breakwater",asset='landmark_6',position=[north[0][0],sea+5,north[0][1]]))
path.write_text('// OSM positions; simplified Blender landmark models.\nexport const LANDMARKS = '+json.dumps(sites,separators=(',',':'))+';\n')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('Gorey and St Catherine geometry exported',flush=True)
