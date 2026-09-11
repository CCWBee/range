"""Jersey's surveyed runway and OSM apron/taxiway plan, at the map's existing 0.85 scale.

Baseline: Jersey Aerodrome Manual V7 July 2025, pages 62 and 67.
https://cdn.ports.je/web/Jersey-Aerodrome-Manual.pdf
"""
import json,math
from pathlib import Path
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union,triangulate
ROOT=Path(__file__).resolve().parent.parent
data=json.loads((ROOT/'assets/map_refinement.json').read_text())
scale=.85;length=1705*scale;width=45*scale;cx=11.3;cz=-1115.9
# The map frame was rotated to 082.8 degrees; retain the surveyed 082.74 degree runway.
angle=math.radians(82.8-82.74)
def point(x,z):return [round(cx+x*math.cos(angle)-z*math.sin(angle),3),round(cz+x*math.sin(angle)+z*math.cos(angle),3)]
runway=[point(x,z) for x,z in [(-width/2,-length/2),(width/2,-length/2),(width/2,length/2),(-width/2,length/2)]]
surfaces=[Polygon(runway)];buildings=[]
for f in data:
    pts=f['points'];x=sum(p[0] for p in pts)/len(pts);z=sum(p[1] for p in pts)/len(pts)
    if not -100<x<700 or not -2000<z<-200:continue
    kind=f['tags'].get('aeroway')
    if kind=='taxiway' and len(pts)>1:surfaces.append(LineString(pts).buffer(23*scale/2,quad_segs=2))
    elif kind=='apron' and f['closed']:surfaces.append(Polygon(pts).buffer(0))
    elif kind in ('terminal','hangar'):buildings.append(f)
union=unary_union(surfaces).buffer(0)
polys=list(union.geoms) if union.geom_type=='MultiPolygon' else [union]
records=[];triangles=[]
for p in polys:
    records.append({'points':[[round(x,3),round(z,3)] for x,z in p.exterior.coords[:-1]],
        'holes':[[[round(x,3),round(z,3)] for x,z in ring.coords[:-1]] for ring in p.interiors],
        'bounds':list(p.bounds)})
    for t in triangulate(p):
        if p.covers(t):triangles.append(list(t.exterior.coords)[:-1])
result={'scale':scale,'lengthMetres':1705,'widthMetres':45,'bearing':82.74,'centre':[cx,cz],
    'spawn':[cx,cz+length/2-85],'runway':runway,'pavement':records}
(ROOT/'src/airport.js').write_text('// Jersey Aerodrome Manual V7, July 2025; OSM taxiways and aprons. See tools/prepare_airport.py.\nexport const AIRPORT = '+json.dumps(result,separators=(',',':'))+';\n')
(ROOT/'assets/airport_geometry.json').write_text(json.dumps({'triangles':triangles,'buildings':buildings,'airport':result}))
print('Airport plan:',len(triangles),'pavement triangles,',len(buildings),'mapped terminal/hangar footprints')
