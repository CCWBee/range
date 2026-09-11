"""Coastal defence geometry from mapped shorelines and wall ways.
References: Jersey Shoreline Management Plan R.5/2020 (CMU 1.2, 1.3, 5.1, 6.3),
Jersey Heritage La Pulente walk and St Aubin's Bay casemates.
Wall profiles and heights are visual approximations; OSM material tags win where present.
"""
import bpy,math,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
h={'__name__':'shore_helpers','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),h)
for n in ('material','box','mesh','save_asset'):globals()[n]=h[n]
stone=material('jersey_seawall_granite',(.43,.35,.27),0,.96)
concrete=material('jersey_seawall_concrete',(.43,.43,.38),0,.98)
deck=material('jersey_promenade',(.36,.34,.30),0,.96)
d=json.loads((ROOT/'assets/shore.json').read_text());a=math.radians(82.8)
def ll(p):
    x,z=p
    return -2.1955555556+(x*math.cos(a)-(z+1100)*math.sin(a))/(73000*.85),49.2080555556+(-x*math.sin(a)-(z+1100)*math.cos(a))/(111320*.85)
def run(points,mat,width=1.5,height=4.7):
    for a,b in zip(points,points[1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
        if length<.2:continue
        # Battered toe, narrower coping; geometry remains below the water at the foot.
        nx,nz=-dz/length,dx/length
        v=[]
        for y,w in [(-85,width*1.15),(-78.1,width*.48)]:
            for p,s in [(a,-1),(b,-1),(b,1),(a,1)]:v.append((p[0]+nx*w*s,y,p[1]+nz*w*s))
        mesh('Seawall',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
        box('Coping',((a[0]+b[0])/2,-77.9,(a[1]+b[1])/2),(width*1.2,.32,length),mat,rotation=(0,math.atan2(dx,dz),0))
count=0
for w in d['walls']:
    lon,lat=ll(w['points'][len(w['points'])//2])
    if w['tags'].get('wall') in ('sea','seawall') and lon< -2.22:
        run(w['points'],stone);count+=1
    elif w['id']==166663888:run(w['points'],concrete,1.8);count+=1
# Shoreline sections with no separately mapped wall: narrow promenade defences, not piers.
# Keep the harbour openings open by selecting the bay shore north of the harbour mouth.
for line in d['coast']:
    for p,q in zip(line,line[1:]):
        lon,lat=ll(((p[0]+q[0])/2,(p[1]+q[1])/2))
        aubin=-2.172<lon<-2.117 and 49.1895<lat<49.1985
        brelade=-2.203<lon<-2.185 and 49.184<lat<49.1878
        if not(aubin or brelade):continue
        run([p,q],concrete if (aubin and -2.152<lon<-2.143) else stone,1.4)
        count+=1
# Root apron closes the short DEM gap at the landward end of St Catherine's mapped walkways.
v=[(-210,-85,-12145),(-165,-85,-12135),(-155,-85,-12030),(-205,-85,-12040)]
v += [(x,(-77.65 if i<2 else -74.2),z) for i,(x,y,z) in enumerate(v)]
mesh('St Catherine root apron',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone)
save_asset('coastal_defences')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('COASTAL DEFENCES',count)
