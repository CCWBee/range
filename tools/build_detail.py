"""Extract offline roads, land cover and landmark coordinates from Geofabrik OSM.

Source: https://download.geofabrik.de/europe/guernsey-jersey.html
OpenStreetMap contributors, ODbL 1.0. osmium is a build-time dependency only.
"""
import sys, json, math, re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/python/osm'))
import osmium
angle=math.radians(82.8)
lon0=-(2+11/60+44/3600);lat0=49+12/60+29/3600
def project(lon,lat):
    e=(lon-lon0)*73000*.85;n=(lat-lat0)*111320*.85
    return [round(e*math.cos(angle)-n*math.sin(angle),1),round(-e*math.sin(angle)-n*math.cos(angle)-1100,1)]
def inside(lon,lat):return -2.27<lon<-2.0 and 49.15<lat<49.28
roads=[];cover=[];landmarks=[]
pattern=re.compile(r'Fort Henry|Elizabeth Castle|Mont Orgueil|Fort Regent|Aubin.*Fort|Corbi.*Lighthouse',re.I)
class Extract(osmium.SimpleHandler):
    def node(self,n):
        tags=dict(n.tags)
        if inside(n.location.lon,n.location.lat) and pattern.search(tags.get('name','')):
            landmarks.append(dict(name=tags['name'],point=project(n.location.lon,n.location.lat),tags=tags))
    def way(self,w):
        tags=dict(w.tags)
        if not any(k in tags for k in ['highway','landuse','natural','name']):return
        pts=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
        if len(pts)<2 or not any(inside(*p) for p in pts):return
        points=[project(*p) for p in pts]
        if 'highway' in tags:
            roads.append(dict(id=w.id,name=tags.get('name',''),kind=tags['highway'],points=points))
        kind=tags.get('landuse',tags.get('natural',''))
        if kind in ['farmland','meadow','forest','orchard','wood','beach'] and len(points)>3:
            cover.append(dict(id=w.id,kind=kind,points=points))
        if pattern.search(tags.get('name','')):
            landmarks.append(dict(name=tags['name'],point=[round(sum(p[i] for p in points)/len(points),1) for i in [0,1]],points=points,tags=tags))
Extract().apply_file(str(ROOT/'_archive/jersey-detail.osm.pbf'),locations=True)
credit='// OpenStreetMap contributors, ODbL 1.0. Geofabrik Guernsey/Jersey extract, 10 September 2026.\n'
(ROOT/'src/roads.js').write_text(credit+'export const ROADS = '+json.dumps(roads,separators=(',',':'))+';\n')
(ROOT/'src/landcover.js').write_text(credit+'export const LANDCOVER = '+json.dumps(cover,separators=(',',':'))+';\n')
(ROOT/'assets/landmarks.json').write_text(json.dumps(landmarks,indent=2))
print(json.dumps(dict(roads=len(roads),landcover=len(cover),landmarks=[dict(name=l['name'],point=l['point']) for l in landmarks]),indent=2))
