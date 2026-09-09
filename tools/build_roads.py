"""Convert an OpenStreetMap Overpass road extract to the airport-aligned offline map."""
from pathlib import Path
import json, math, sys
root=Path(__file__).resolve().parent.parent
data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
angle=math.radians(82.8)
lon0=-(2+11/60+44/3600);lat0=49+12/60+29/3600
roads=[]
for way in data['elements']:
    points=[]
    for p in way.get('geometry',[]):
        east=(p['lon']-lon0)*73000*.85;north=(p['lat']-lat0)*111320*.85
        points.append([round(east*math.cos(angle)-north*math.sin(angle),1),round(-east*math.sin(angle)-north*math.cos(angle)-1100,1)])
    if len(points)>1:roads.append(dict(id=way['id'],name=way.get('tags',{}).get('name',''),points=points))
out=root/'src/roads.js'
out.write_text('// Road data copyright OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright\n// Derived road database, distributed under ODbL 1.0. https://opendatacommons.org/licenses/odbl/1-0/\nexport const ROADS = '+json.dumps(roads,separators=(',',':'),ensure_ascii=True)+';\n',encoding='utf-8')
print(json.dumps(dict(roads=len(roads),path=str(out),bytes=out.stat().st_size)))
