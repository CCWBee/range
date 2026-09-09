"""Prepare OpenStreetMap building and harbour geometry for Blender, without runtime downloads."""
from pathlib import Path
import json,math,sys,re
root=Path(__file__).resolve().parent.parent
raw=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
angle=math.radians(82.8);lon0=-(2+11/60+44/3600);lat0=49+12/60+29/3600
features=[]
for item in raw['elements']:
    tags=item.get('tags',{});points=[]
    for p in item.get('geometry',[]):
        east=(p['lon']-lon0)*73000*.85;north=(p['lat']-lat0)*111320*.85
        point=[round(east*math.cos(angle)-north*math.sin(angle),2),round(-east*math.sin(angle)-north*math.cos(angle)-1100,2)]
        if not points or point!=points[-1]:points.append(point)
    closed=len(points)>3 and points[0]==points[-1]
    if closed:points.pop()
    if len(points)<2:continue
    building='building' in tags
    if building and not closed:continue
    # Preserve the existing playable airfield layout, avoiding intersecting duplicate buildings.
    cx=sum(p[0] for p in points)/len(points);cz=sum(p[1] for p in points)/len(points)
    if building and -850<cx<600 and -2900<cz<1700:continue
    kind=tags.get('building','') if building else tags.get('man_made','pier')
    value=tags.get('height','');match=re.match(r'^([0-9.]+)',value)
    if match:height=float(match[1])*(.3048 if 'ft' in value else 1);source='height'
    elif re.match(r'^\d+(\.\d+)?$',tags.get('building:levels','')):height=float(tags['building:levels'])*3+1.5;source='levels'
    else:height=4 if kind in ('garage','garages','shed') else 8 if kind in ('industrial','warehouse') else 7;source='estimated'
    features.append(dict(id=item['id'],name=tags.get('name',''),kind='building' if building else kind,closed=closed,points=points,height=max(2,min(70,height)),heightSource=source))
out=root/'assets/settlement.json'
out.write_text(json.dumps(dict(attribution='Copyright OpenStreetMap contributors, ODbL 1.0. Derived database distributed under ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/. Source https://www.openstreetmap.org/copyright; Overpass extract 2026-09-09. Building heights estimated where absent.',features=features),separators=(',',':'),ensure_ascii=True),encoding='utf-8')
print(json.dumps(dict(features=len(features),buildings=sum(f['kind']=='building' for f in features),harbour=sum(f['kind']!='building' for f in features),bytes=out.stat().st_size)))
