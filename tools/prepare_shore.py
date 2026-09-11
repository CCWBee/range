"""Extract mapped coastline and coastal walls, preserving OSM ids and source tags."""
import sys,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/python/osm'))
import osmium
from prepare_east_coast import project
coast=[];walls=[];extra=[]
class Extract(osmium.SimpleHandler):
    def way(self,w):
        t=dict(w.tags)
        if 'building' not in t and t.get('natural')!='coastline' and t.get('barrier') not in ('wall','retaining_wall','sea_wall') and t.get('man_made')!='embankment':return
        p=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
        if not p or not any(-2.27<x<-2 and 49.15<y<49.28 for x,y in p):return
        pts=[project(*v) for v in p]
        if 'building' in t:
            lon=sum(v[0] for v in p)/len(p);lat=sum(v[1] for v in p)/len(p)
            if w.is_closed() and ((-2.177<lon<-2.16 and 49.185<lat<49.201) or (-2.13<lon<-2.08 and 49.174<lat<49.204)):
                try:height=float(t.get('height',float(t.get('building:levels',2))*3+1))
                except ValueError:height=7
                extra.append(dict(id=w.id,name=t.get('name',''),kind='building',closed=True,points=pts[:-1],height=max(2,min(60,height)),heightSource='OSM or estimated'))
            return
        if t.get('natural')=='coastline':coast.append(pts)
        else:
            # Keep all candidate walls locally. The Blender pass retains only coastal ones.
            walls.append(dict(id=w.id,tags=t,points=pts,lonlat=p))
Extract().apply_file(str(ROOT/'_archive/jersey-detail.osm.pbf'),locations=True)
(ROOT/'assets/shore.json').write_text(json.dumps(dict(coast=coast,walls=walls),separators=(',',':')))
(ROOT/'src/shore-data.js').write_text('// OpenStreetMap coastline; local snapshot, ODbL.\nexport const SHORE = '+json.dumps(coast,separators=(',',':'))+';\n')
print('Shorelines',len(coast),'candidate walls',len(walls))
path=ROOT/'assets/settlement.json';data=json.loads(path.read_text());ids={f['id'] for f in data['features']}
new=[f for f in extra if f['id'] not in ids];data['features']+=new
path.write_text(json.dumps(data,separators=(',',':')))
print('Additional mapped town buildings',len(new))
