"""Extract existing public OSM geometry for airport and coastal structures, offline at runtime."""
import sys, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/python/osm'))
import osmium
a=math.radians(82.8);lon0=-2.1955555556;lat0=49.2080555556
def project(lon,lat):
    east=(lon-lon0)*73000*.85;north=(lat-lat0)*111320*.85
    return [round(east*math.cos(a)-north*math.sin(a),2),round(-east*math.sin(a)-north*math.cos(a)-1100,2)]
features=[]
class Extract(osmium.SimpleHandler):
    def way(self,w):
        t=dict(w.tags)
        interesting=t.get('aeroway') in ['runway','taxiway','apron','terminal','hangar'] or t.get('barrier')=='sea_wall' or t.get('man_made') in ['breakwater','groyne','pier']
        if not interesting:return
        pts=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
        if len(pts)<2 or not any(-2.27<x<-2.0 and 49.15<y<49.28 for x,y in pts):return
        features.append(dict(id=w.id,tags=t,points=[project(*p) for p in pts],closed=w.is_closed()))
Extract().apply_file(str(ROOT/'_archive/jersey-detail.osm.pbf'),locations=True)
(ROOT/'assets/map_refinement.json').write_text(json.dumps(features,separators=(',',':')))
print('Extracted',len(features),'airport and coastal features')
for f in features:
    if f['tags'].get('aeroway')=='runway' or 'Catherine' in f['tags'].get('name',''):print(f)
