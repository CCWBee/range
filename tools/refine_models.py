import bpy
import bmesh
import json
import math
from pathlib import Path
ROOT=Path(r'E:/claude-projects/range')
scene=bpy.data.scenes['RANGE'];bpy.context.window.scene=scene
terrain=bpy.data.collections['terrain'].objects[0]
vs=[];faces=[];nx=140;nz=230
for iz in range(nz+1):
    u=iz/nz*2-1
    z=u*12000+math.copysign(max(0,abs(u)-.72)**2*330000,u)
    coast=1600+350*math.sin(z*.0008)+180*math.sin(z*.0018)
    for ix in range(nx+1):
        # Last columns track the shoreline exactly instead of stair-stepping across a grid.
        t=ix/nx
        if ix<nx-3:
            x=coast-200-42000*(1-ix/(nx-3))**2
            h=-.34+max(0,abs(x)-2200)*.006*(.6+.4*math.sin(z*.001))
        else:
            x=coast-200+(ix-(nx-3))*100
            h=[-.34,-2.5,-7.8,-20][ix-(nx-3)]
        vs.append((x,h,z))
for iz in range(nz):
    for ix in range(nx):
        a=iz*(nx+1)+ix;faces.append((a,a+nx+1,a+nx+2,a+1))
new=bpy.data.meshes.new('Smooth coastal strip');new.from_pydata(vs,[],faces);new.update();new.materials.append(terrain.data.materials[0]);terrain.data=new
for polygon in new.polygons: polygon.use_smooth=True
# Author the small airfield service areas and range hardstands as one mesh group.
if 'scenery' not in bpy.data.collections:
    collection=bpy.data.collections.new('scenery');scene.collection.children.link(collection)
    def box(name,location,scale,mat):
        bpy.ops.mesh.primitive_cube_add(size=1,location=location)
        o=bpy.context.object;o.name=name;o.scale=scale
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        o.data.materials.append(bpy.data.materials[mat])
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o)
        return o
    box('Perimeter service road',(-660,-.11,-1150),(9,.15,3100),'concrete')
    for z in [290,-2630]:box('Perimeter cross road',(-125,-.11,z),(1080,.15,9),'concrete')
    for i in range(6):
        x=-330-i%2*120;z=-130-i//2*330
        box('Hangar hardstand',(x,-.13,z+40),(58,.15,106),'concrete')
    for i in range(7):
        x=-525;z=-230-i*83
        box('Service building',(x,2.4,z),(23,4.8,15),'hangar')
        box('Service building roof',(x,5,z),(24,.5,16),'edge')
        for w in range(4):box('Office window',(x+11.55,2.9,z-5+w*3),(.1,1.1,1.5),'canopy')
    for x in [-570,-601]:
        for z in [-960,-997]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=9,depth=8,location=(x,4,z),rotation=(math.pi/2,0,0))
            o=bpy.context.object;o.name='Fuel storage tank';o.data.materials.append(bpy.data.materials['hangar'])
            for c in list(o.users_collection):c.objects.unlink(o)
            collection.objects.link(o)
            box('Tank bund',(x,.25,z),(24,.5,24),'concrete')
    for i in range(81):
        z=390-i*39
        for x in [-690,450]:box('Perimeter post',(x,1.15,z),(.16,2.3,.16),'edge')
    for x in [-690,450]:
        for y in [.65,1.45,2.15]:box('Perimeter wire',(x,y,-1170),(.035,.035,3120),'edge')
    for x,z in [(-950,-3900),(-1090,-4050),(-800,-4170),(-1040,-4300),(-1220,-4190),(-860,-4430)]:
        box('Range hardstand',(x,-.15,z),(35,.16,45),'concrete')
        box('Range backstop',(x,1.9,z-29),(42,3.8,8),'earth')
for o in scene.objects:
    if o.type=='MESH':
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        if o==terrain:
            for face in bm.faces:
                if face.normal.y<0:face.normal_flip()
        bm.to_mesh(o.data);bm.free()
data=json.loads((ROOT/'assets/meshes.json').read_text())
data['assets'].setdefault('scenery',[])
for name in data['assets']:
    collection=bpy.data.collections[name];groups={}
    for o in collection.objects:groups.setdefault(o.data.materials[0].name,[]).append(o)
    parts=[]
    for matname,objs in groups.items():
        p=[];n=[];uv=[]
        for o in objs:
            deps=bpy.context.evaluated_depsgraph_get();ev=o.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();normalmatrix=o.matrix_world.to_3x3().inverted().transposed()
            for tri in mesh.loop_triangles:
                for vi in tri.vertices:
                    vert=mesh.vertices[vi];co=o.matrix_world@vert.co;no=(normalmatrix@(vert.normal if mesh.polygons[tri.polygon_index].use_smooth else tri.normal)).normalized()
                    p.extend(round(x,5)for x in co);n.extend(round(x,5)for x in no);uv.extend([round(co.x*.35,5),round(co.z*.35,5)])
            ev.to_mesh_clear()
        parts.append({'material':matname,'positions':p,'normals':n,'uv':uv})
    data['assets'][name]=parts
(ROOT/'assets/meshes.json').write_text(json.dumps(data,separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
print('RANGE normals and shoreline refined')
