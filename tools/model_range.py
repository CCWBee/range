"""Author all RANGE meshes in Blender and export a compact browser mesh library."""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(r'E:/claude-projects/range')
random.seed(83)
# Keep the initial scene intact in its own collection.
for collection in list(bpy.data.collections):
    collection.hide_viewport = True
    collection.hide_render = True
scene = bpy.data.scenes.new('RANGE')
bpy.context.window.scene = scene
library = {}
current = []
materials = {}
def material(name, colour, metallic=0, roughness=.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*colour, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    materials[name] = {'colour': colour, 'metallic': metallic, 'roughness': roughness}
    return m
paint = material('airframe', (.38,.42,.46), .42,.38)
edge = material('edge', (.23,.27,.30), .6,.37)
metal = material('titanium', (.17,.18,.19), .88,.28)
dark = material('rubber', (.013,.018,.022), .08,.72)
glass = material('canopy', (.055,.095,.12), .8,.12)
white = material('marking', (.63,.66,.65), .05,.65)
red = material('roundel_red', (.27,.052,.04), .1,.6)
blue = material('roundel_blue', (.055,.095,.14), .1,.5)
concrete = material('concrete', (.16,.18,.19), .08,.3)
hangar = material('hangar', (.19,.22,.22), .48,.63)
earth = material('earth', (.105,.13,.115), 0,.96)
targetmat = material('target', (.19,.20,.17), .2,.72)
wreckmat = material('wreck', (.035,.031,.026), .45,.9)

def finish(o,name,mat,smooth=False):
    o.name=name
    o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons: p.use_smooth=True
    current.append(o)
    return o
def box(name,loc,scale,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Machined edges','BEVEL'); b.width=bevel; b.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=b.name)
    return finish(o,name,mat)
def sphere(name,loc,scale,mat,segments=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object; o.scale=scale
    return finish(o,name,mat,True)
def cylinder(name,loc,radius,depth,mat,rotation=(0,0,0),vertices=24,radius2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius2 is None else radius2,depth=depth,location=loc,rotation=rotation)
    return finish(bpy.context.object,name,mat,True)
def mesh(name,vertices,faces,mat,smooth=False):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o)
    return finish(o,name,mat,smooth)
def prism(name,points,thickness,mat):
    n=len(points); vs=[(x,y+d,z) for d in [-thickness/2,thickness/2] for x,y,z in points]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,mat)
def loft(name,sections,mat,segments=32):
    vs=[]; fs=[]
    for z,rx,ry,cy in sections:
        for i in range(segments):
            a=i*math.tau/segments; vs.append((rx*math.cos(a),cy+ry*math.sin(a),z))
    for j in range(len(sections)-1):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            fs.append((a,b,b+segments,a+segments))
    fs.extend([tuple(reversed(range(segments))),tuple(range((len(sections)-1)*segments,len(sections)*segments))])
    return mesh(name,vs,fs,mat,True)
def save_asset(name):
    global current
    # Merge by material, reducing draw calls while preserving named moving parts.
    groups={}
    for o in current: groups.setdefault(o.data.materials[0].name,[]).append(o)
    out=[]
    for matname,objs in groups.items():
        p=[]; n=[]; uv=[]
        for o in objs:
            deps=bpy.context.evaluated_depsgraph_get(); ev=o.evaluated_get(deps); data=ev.to_mesh(); data.calc_loop_triangles()
            normalmatrix=o.matrix_world.to_3x3().inverted().transposed()
            for tri in data.loop_triangles:
                for vi in tri.vertices:
                    vert=data.vertices[vi]; co=o.matrix_world@vert.co
                    no=(normalmatrix@(vert.normal if data.polygons[tri.polygon_index].use_smooth else tri.normal)).normalized()
                    p.extend(round(v,5) for v in co); n.extend(round(v,5) for v in no)
                    uv.extend([round(co.x*.35,5),round(co.z*.35,5)])
            ev.to_mesh_clear()
        out.append({'material':matname,'positions':p,'normals':n,'uv':uv})
    library[name]=out
    coll=bpy.data.collections.new(name); scene.collection.children.link(coll)
    for o in current:
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
    current=[]

# Typhoon: 15.96 m length, 10.95 m span. Local forward is negative Z.
loft('Fuselage', [(-8,.015,.02,.05),(-7.1,.30,.29,.08),(-5.6,.57,.54,.13),(-3.8,.70,.73,.1),(-1.4,.94,.77,0),(1,1.08,.72,0),(3.8,1.04,.57,-.02),(5.3,.97,.48,-.06),(6.05,.90,.42,-.05)],paint)
sphere('Canopy', (0,.82,-4.55),(.53,.59,1.55),glass,32,16)
loft('Dorsal spine',[(-3.1,.3,.23,.69),(-1.5,.34,.27,.69),(1,.30,.22,.68),(4.5,.14,.12,.58)],paint,20)
for side in [-1,1]:
    prism('Delta wing',[(side*.65,.02,-2.1),(side*5.48,-.04,3.68),(side*5.32,-.03,4.12),(side*1.0,.03,4.70)],.12,paint)
    prism('Elevon',[(side*1.5,.025,3.98),(side*5.25,-.025,3.57),(side*5.3,-.025,4.05),(side*1.4,.025,4.64)],.055,edge)
    prism('Canard',[(side*.53,.18,-5.1),(side*2.3,.2,-3.83),(side*2.1,.2,-3.15),(side*.58,.18,-3.76)],.075,paint)
    cylinder('Wingtip defensive pod',(side*5.38,0,3.8),.09,1.2,edge,vertices=16,radius2=.045)
    sphere('Engine fairing',(side*.54,-.15,3.05),(.61,.58,2.45),paint)
    cylinder('Nozzle collar',(side*.55,-.1,5.82),.48,.7,metal)
    cylinder('Exhaust darkness',(side*.55,-.1,6.19),.405,.045,dark)
    for i in range(16):
        a=i*math.tau/16
        petal=box('Nozzle petal',(side*.55+math.cos(a)*.451,-.1+math.sin(a)*.451,5.97),(.08,.035,.58),metal)
        petal.rotation_euler.z=a-math.pi/2
    # Chin intake mouth and ramp, twin rectangular openings.
    box('Intake ramp',(side*.46,-.58,-2.3),(.82,.37,2.6),paint,.055)
    box('Intake mouth',(side*.46,-.57,-3.64),(.67,.34,.04),dark,.015)
    for z in [0.3,2.2]: box('Bomb pylon',(side*2.2,-.22,z),(.13,.48,1.1),edge,.025)
    for radius,mat in [(.33,blue),(.21,white),(.105,red)]:
        cylinder('Low visibility roundel',(side*3.3,.085,2.45),radius,.012,mat,(math.pi/2,0,0),32)
    for z in [-.1,1.0,2.1,3.2]:
        stripe=box('Wing panel joint',(side*2.35,.093,z+1.2),(.012,.009,1.2),edge)
        stripe.rotation_euler.y=side*.38
# Single swept vertical fin as a thin solid, avoiding a fighter-like twin tail.
o=prism('Vertical stabiliser',[(0,.54,1.65),(0,3.24,4.0),(0,3.22,4.95),(0,.48,5.6)],.14,paint)
# Prism thickness is vertical by default; build correct fin explicitly.
current.remove(o); o.hide_render=True; o.hide_viewport=True
points=[(.54,1.65),(3.24,4.0),(3.22,4.95),(.48,5.6)]
mesh('Single vertical fin',[(x,y,z) for x in [-.075,.075] for y,z in points],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],paint)
box('Fin cap',(0,3.23,4.45),(.16,.045,.96),edge)
cylinder('Nose probe',(0,.04,-8.18),.017,.58,metal,vertices=10,radius2=.008)
save_asset('jet')

for side in [-1,1]:
    cylinder('Main oleo',(side*.88,-.99,2.6),.055,1.45,metal,(math.pi/2,0,0),16)
    cylinder('Main tyre',(side*.94,-1.56,2.6),.31,.23,dark,(0,math.pi/2,0),24)
    cylinder('Main hub',(side*1.065,-1.56,2.6),.14,.02,metal,(0,math.pi/2,0),16)
    box('Gear door',(side*1.2,-.69,2.7),(.05,.74,.85),paint,.015)
cylinder('Nose oleo',(0,-1.06,-4.35),.042,1.30,metal,(math.pi/2,0,0),16)
cylinder('Nose tyre',(0,-1.59,-4.35),.24,.19,dark,(0,math.pi/2,0),20)
save_asset('gear')

loft('Unguided bomb',[(-1.0,.015,.015,0),(-.7,.16,.16,0),(-.4,.2,.2,0),(.45,.19,.19,0),(.75,.11,.11,0),(.95,.09,.09,0)],targetmat,16)
for i in range(4):
    a=i*math.pi/2
    mesh('Tail fin',[(0,0,.36),(.37*math.cos(a),.37*math.sin(a),.77),(.37*math.cos(a),.37*math.sin(a),1.08),(0,0,.97)],[(0,1,2,3),(3,2,1,0)],edge)
save_asset('bomb')

# Airfield and terrain are modelled here, with instance placement in the browser.
box('Runway',(0,-.16,-1100),(62,.28,2800),concrete)
box('Apron',(-150,-.17,-60),(280,.26,370),concrete)
box('Parallel taxiway',(-190,-.175,-1150),(20,.25,2200),concrete)
for z in [-250,-1100,-2050]: box('Link taxiway',(-90,-.17,z),(180,.26,19),concrete)
save_asset('pavement')
for z in range(-2350,231,65): box('Centre stripe',(0,.005,z),(1.0,.018,25),white)
for side in [-1,1]:
    box('Edge stripe',(side*29,.002,-1100),(.45,.018,2760),white)
    for x in [4.5,7.5,10.5,13.5,16.5,19.5]:
        for z in [185,-2400]: box('Threshold',(side*x,.007,z),(1.7,.02,30),white)
    for z in [-50,-2180]: box('Aiming point',(side*17,.008,z),(5,.02,40),white)
save_asset('runway_markings')

vs=[]; fs=[]; size=140; step=170
for iz in range(size+1):
    z=-11000+iz*step
    coast=1600+350*math.sin(z*.0008)+180*math.sin(z*.0018)
    for ix in range(size+1):
        x=-12000+ix*step
        h=-.34+max(0,abs(x)-2200)*.006*(.6+.4*math.sin(z*.001))
        if x>coast: h=-7-min(25,(x-coast)*.01)
        elif x>coast-250: h=-.34-6*((x-coast+250)/250)**2
        vs.append((x,h,z))
for iz in range(size):
    for ix in range(size):
        a=iz*(size+1)+ix; fs.append((a,a+size+1,a+size+2,a+1))
mesh('Coastal terrain',vs,fs,earth,True); save_asset('terrain')

box('Water plane',(0,-7,0),(100000,.1,100000),concrete); save_asset('ocean')
# Airbase buildings.
box('Hangar shell',(0,5,0),(38,10,45),hangar,.4)
for x in [-17,17]: box('Hangar buttress',(x,4.5,-23),(1.1,9,1.4),concrete)
box('Hangar door',(0,4.4,-22.7),(32,8.4,.13),edge)
for x in range(-15,16,3): box('Door seam',(x,4.4,-22.8),(.07,8.4,.06),dark)
mesh('Pitched roof',[(-20,10,-24),(20,10,-24),(0,14,-24),(-20,10,24),(20,10,24),(0,14,24)],[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5)],hangar)
save_asset('hangar')
box('Tower base',(0,7,0),(10,14,12),concrete,.2)
box('Tower cabin',(0,15,0),(15,3,15),glass,.2)
box('Tower roof',(0,16.8,0),(16,0.6,16),hangar,.15)
cylinder('Antenna',(0,20,0),.09,6,metal,(math.pi/2,0,0),8)
save_asset('tower')
box('Target vehicle chassis',(0,.85,0),(3.3,.6,6.5),targetmat,.17)
box('Target vehicle cab',(0,1.8,-1.8),(3,1.4,2.2),targetmat,.12)
box('Target vehicle cargo',(0,1.75,1.15),(3.15,1.2,3.6),targetmat,.12)
box('Target windscreen',(0,2,-2.92),(2.55,.6,.04),glass)
for x in [-1.6,1.6]:
    for z in [-1.9,1.4,2.4]: cylinder('Truck tyre',(x,.57,z),.57,.36,dark,(0,math.pi/2,0),16)
save_asset('target')
for i in range(12):
    o=box('Burnt fragment',(random.uniform(-3,3),random.uniform(.1,.8),random.uniform(-4,4)),(random.uniform(.4,2),random.uniform(.1,.7),random.uniform(.7,2.5)),wreckmat,.04)
    o.rotation_euler=(random.random(),random.random()*3,random.random())
save_asset('wreck')
cylinder('Airfield lamp',(0,.14,0),.16,.26,metal,(math.pi/2,0,0),10); save_asset('lamp')
sphere('Atmosphere',(0,0,0),(1,1,1),white,48,24); save_asset('sky')
mesh('Particle quad',[(-.5,-.5,0),(.5,-.5,0),(.5,.5,0),(-.5,.5,0)],[(0,1,2,3)],white); save_asset('quad')
cylinder('Reheat plume',(0,0,0),.42,1,white,vertices=24,radius2=.025); save_asset('flame')
sphere('Blast volume',(0,0,0),(1,1,1),white,16,8); save_asset('blast')

output={'materials':materials,'assets':library,'authoring':'All meshes authored in Blender through Blender MCP','blender':bpy.app.version_string}
(ROOT/'assets/meshes.json').write_text(json.dumps(output,separators=(',',':')),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
print(json.dumps({'status':'modelled','assets':len(library),'triangles':sum(len(part['positions'])//9 for asset in library.values() for part in asset),'export':str(ROOT/'assets/meshes.json')}))
