"""Build geographically registered Jersey buildings and harbour structures in Blender."""
import bpy,json,math,subprocess,shutil,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.context.window.scene=bpy.data.scenes['RANGE']
features=json.loads((ROOT/'assets/settlement.json').read_text())['features']
sites=json.loads((ROOT/'assets/landmarks.json').read_text()) if (ROOT/'assets/landmarks.json').exists() else []
replacement_radii={"Saint Aubin's Fort":30,'Elizabeth Castle':80,'Mont Orgueil Castle':46,'Corbière Lighthouse':20,'Fort Henry':30,'Fort Regent':75}
replaced={}
for site in sites:
    if site['name'] in replacement_radii and site['name'] not in replaced:replaced[site['name']]=site['point']
script="""import fs from 'node:fs';import {terrainHeight} from './physics.js';
const f=JSON.parse(fs.readFileSync('assets/settlement.json')).features;
console.log(JSON.stringify(f.map(f=>f.points.map(p=>terrainHeight(...p)))));"""
heights=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S');archive=ROOT/'_archive';archive.mkdir(exist_ok=True)
shutil.copy2(ROOT/'assets/RANGE.blend',archive/f'RANGE-before-settlement-{stamp}.blend')
for collection in list(bpy.context.scene.collection.children):
    if collection.name.startswith('settlement_'):
        collection.name=f'archive_{collection.name}_{stamp}';collection.hide_render=True;collection.hide_viewport=True

def material(name,colour):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color=(*colour,1);m['colour']=colour;m['roughness']=.9;m['metallic']=0
    return m
wall=material('jersey_render',(.58,.55,.48));roof=material('jersey_roof',(.24,.20,.17));quay=material('jersey_quay',(.30,.31,.30))
palette=[material('jersey_render_granite',(.40,.33,.28)),material('jersey_render_cream',(.64,.59,.46)),
         material('jersey_render_ochre',(.53,.40,.28)),material('jersey_render_grey',(.41,.43,.41))]
chunks={}
def prism(points,base,top,chunk,harbour=False,pitched=False,wall_index=0):
    if len(points)<3:return
    area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
    if abs(area)<1:return
    if area<0:points=list(reversed(points))
    vertices,faces,materials=chunks.setdefault(chunk,([],[],[]));offset=len(vertices);n=len(points)
    vertices.extend((x,base,z) for x,z in points);vertices.extend((x,top,z) for x,z in points)
    if pitched and n==4:
        # Ridge follows the longer footprint edge. No per-house objects or draw calls.
        lengths=[math.dist(points[i],points[(i+1)%4]) for i in range(4)]
        edge=max(range(4),key=lambda i:lengths[i])
        p=[points[(edge+i)%4] for i in range(4)]
        ridge0=((p[0][0]+p[3][0])/2,(p[0][1]+p[3][1])/2)
        ridge1=((p[1][0]+p[2][0])/2,(p[1][1]+p[2][1])/2)
        rise=min(4,max(1.4,math.dist(p[0],p[3])*.32))
        a=len(vertices);vertices.extend([(ridge0[0],top+rise,ridge0[1]),(ridge1[0],top+rise,ridge1[1])])
        q=[offset+n+(edge+i)%4 for i in range(4)]
        faces.extend([(q[0],a,a+1,q[1]),(q[2],a+1,a,q[3]),(q[3],a,q[0]),(q[1],a+1,q[2])])
        materials.extend([1,1,wall_index,wall_index])
    else:
        faces.append(tuple(offset+n+i for i in reversed(range(n))));materials.append(2 if harbour else 1)
    for i in range(n):
        j=(i+1)%n;faces.append((offset+i,offset+n+i,offset+n+j,offset+j));materials.append(2 if harbour else wall_index)

for feature,ground in zip(features,heights):
    points=feature['points'];cx=sum(p[0] for p in points)/len(points);cz=sum(p[1] for p in points)/len(points)
    chunk=f'settlement_{math.floor(cx/1200)}_{math.floor(cz/1200)}'
    if feature['kind']=='building':
        if any(math.hypot(cx-point[0],cz-point[1])<replacement_radii[name] for name,point in replaced.items()):continue
        base=max(-83.6,min(ground)-1);top=max(-80.6,max(ground))+feature['height']
        clean=points[:-1] if points[0]==points[-1] else points
        area=abs(sum(clean[i][0]*clean[(i+1)%len(clean)][1]-clean[(i+1)%len(clean)][0]*clean[i][1] for i in range(len(clean)))/2)
        family=int(abs(cx*7+cz*13))%5
        wall_index=0 if family==0 else 2+family
        pitched=len(clean)==4 and area<700 and feature['height']<13
        prism(clean,base,top,chunk,pitched=pitched,wall_index=wall_index)
        if pitched and area<250 and family%2==0:
            px,pz=clean[0];px=px*.3+cx*.7;pz=pz*.3+cz*.7
            prism([[px-.5,pz-.4],[px+.5,pz-.4],[px+.5,pz+.4],[px-.5,pz+.4]],top,top+3.8,chunk,wall_index=wall_index)
    elif feature['closed']:
        prism(points,-85.6,-79.6,chunk,True)
    else:
        width=8 if feature['kind']=='breakwater' else 2.2
        for a,b in zip(points,points[1:]):
            dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz)
            if length<.1:continue
            rx=-dz/length*width/2;rz=dx/length*width/2
            prism([[a[0]+rx,a[1]+rz],[b[0]+rx,b[1]+rz],[b[0]-rx,b[1]-rz],[a[0]-rx,a[1]-rz]],-85.6,-79.6,chunk,True)
for name,(vertices,faces,materials) in chunks.items():
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    for m in [wall,roof,quay]+palette:mesh.materials.append(m)
    for polygon,index in zip(mesh.polygons,materials):polygon.material_index=index
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('Settlement exported:',len(features),'features in',len(chunks),'spatial chunks')
