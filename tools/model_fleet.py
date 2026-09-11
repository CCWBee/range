"""Blender-authored practice aircraft and Wyvern; simplified silhouettes, metre scale.
Torpedo reference: RAF Historical Society Journal 45, pp. 130-131, Mk XVII / MAT V.
All existing Typhoon and scenery collections are preserved.
"""
import bpy, math, shutil, datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
shutil.copy2(ROOT/'assets/RANGE.blend',ROOT/('_archive/RANGE-before-fleet-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.blend'))
h={'__name__':'fleet_helpers','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),h)
for n in ('material','loft','sphere','box','prism','cylinder','tube','save_asset','mesh'):globals()[n]=h[n]
grey=material('fleet_grey',(.36,.40,.42),.35,.46)
navy=material('wyvern_slate',(.16,.21,.23),.15,.52)
sky=material('wyvern_sky',(.55,.61,.49),.05,.65)
glass=material('fleet_glass',(.025,.065,.08),.25,.16)
black=material('fleet_rubber',(.025,.028,.025),0,.8)
metal=material('fleet_metal',(.43,.45,.42),.7,.4)
green=material('hind_olive',(.24,.28,.12),.05,.75)
red=material('fleet_red',(.6,.06,.025),0,.6)
yellow=material('fleet_yellow',(.85,.62,.12),0,.6)

def wing(name,span,root,tip,z,sweep,mat,thick=.18):
    for side in [-1,1]:
        rings=[]
        for x,chord,lead in [(.5,root,z),(span*.65,root*.6+tip*.4,z+sweep*.6),(span,tip,z+sweep)]:
            rings.append([(side*x,thick*math.sin(i*math.tau/16)*(.9 if x<span else .35),lead+chord*(1-math.cos(i*math.tau/16))/2) for i in range(16)])
        h['skin'](name,rings,mat,True)
def fin(name,z,height,length,mat):
    p=[(0,z),(.3*height,z+.08*length),(height,z+.56*length),(.94*height,z+.8*length),(0,z+length)]
    n=len(p);v=[(x,y,zz) for x in [-.065,.065] for y,zz in p]
    mesh(name,v,[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
def prop(name,radius,blades,axis='z'):
    for i in range(blades):
        a=i*math.tau/blades
        p=[(-.055,.18),(-.15,radius*.4),(-.11,radius*.92),(-.02,radius),(.09,radius*.95),(.16,radius*.35),(.07,.18)]
        v=[]
        for depth in [-.035,.035]:
            for x,y in p:
                xx=x*math.cos(a)-y*math.sin(a);yy=x*math.sin(a)+y*math.cos(a)
                v.append((xx,depth,yy) if axis=='y' else (xx,yy,depth))
        n=len(p);mesh('Propeller blade',v,[tuple(range(n)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)],black,True)
    cylinder('Propeller hub',(0,0,0),.22,.4,metal)
    save_asset(name)

# Tu-95: long fuselage, swept wing, four nacelles and paired propellers.
loft('Bear fuselage',[(-24,.2,.3,0),(-20,1.1,1.4,0),(-13,1.7,1.8,0),(10,1.6,1.8,0),(22,.25,.5,.6)],grey)
sphere('Bear flight deck',(0,1.2,-17),(1.25,.8,2.1),glass)
wing('Swept main wing',25,8,2,-6,12,grey,.55)
wing('Tailplane',9,4,1.8,15,4,grey,.3)
fin('Bear fin',13,8,9,grey)
for x in [-14,-7,7,14]:
    o=loft('Engine nacelle',[(-5,.2,.4,.1),(-3,.8,.9,.1),(5,.9,1,.1),(10,.3,.4,.1)],grey);o.location.x=x
    cylinder('Exhaust',(x,.2,8),.45,1,black)
save_asset('tu95');prop('bear_prop',2.8,4)

# Hind: tandem bubble cockpit, paired engines, stub wings, tail boom and rotor mast.
loft('Hind fuselage',[(-8,.2,.4,0),(-6,.7,1,0),(-3,1.1,1.4,0),(2,1.1,1.3,0),(5,.4,.5,.3),(11,.12,.2,1)],green)
sphere('Front canopy',(0,.8,-5.4),(.72,.78,1.3),glass)
sphere('Rear canopy',(0,1.25,-3.4),(.8,.85,1.2),glass)
for s in [-1,1]:
    o=loft('Engine housing',[(-3,.32,.35,1.1),(-2,.5,.5,1.1),(1,.45,.45,1.1),(2,.3,.3,1.1)],green);o.location.x=s*.65
    cylinder('Hind exhaust',(s*.7,1.2,2),.32,.65,black)
wing('Hind stub wing',3.25,2,.9,0,1,green,.22)
wing('Hind tailplane',1.6,1.5,.5,8,.3,green)
fin('Hind tail fin',8,3,3,green)
tube('Rotor mast',[(0,1,-.5),(0,2.2,-.5)],.18,metal)
for s in [-1,1]:
    tube('Gear leg',[(s*.8,-.6,1),(s*1.4,-1.8,1)],.08,metal)
    cylinder('Wheel',(s*1.4,-1.8,1),.35,.2,black,rotation=(0,math.pi/2,0))
save_asset('hind');prop('hind_rotor',8.65,5,'y')

# Wyvern S.4: deep Python nose, bubble canopy, broad tapered wings and finlets.
loft('Wyvern lower body',[(-6.6,.16,.2,-.05),(-5.6,.72,.86,0),(-2.3,.85,1.05,0),(1,.7,.75,.1),(5.1,.20,.35,.4),(6.4,.06,.12,.6)],sky)
loft('Wyvern upper decking',[(-5.9,.35,.36,.45),(-4,.66,.5,.55),(-1,.72,.45,.65),(1.5,.5,.36,.55),(5,.15,.15,.6)],navy)
sphere('Bubble canopy',(0,1.02,-1.2),(.58,.64,1.3),glass)
wing('Wyvern wing',6.72,4.1,1.8,-1.9,1.2,navy,.28)
wing('Wyvern tailplane',2.8,2,.95,3.9,.7,navy,.16)
fin('Wyvern fin',3.6,2.8,2.8,navy)
# Painted RAF roundels sit just above the upper wing skin and on the fuselage sides.
blue=material('fleet_roundel_blue',(.025,.07,.23),0,.65)
white=material('fleet_roundel_white',(.78,.8,.75),0,.65)
for s in [-1,1]:
    for r,mat_,lift in [(.60,blue,0),(.39,white,.006),(.20,red,.012)]:
        cylinder('Wing roundel',(s*4.6,.27+lift,.95),r,.012,mat_,rotation=(math.pi/2,0,0),vertices=32)
    for r,mat_,lift in [(.40,blue,0),(.27,white,.006),(.14,red,.012)]:
        cylinder('Fuselage roundel',(s*(.59+lift),.38,1.45),r,.012,mat_,rotation=(0,math.pi/2,0),vertices=28)
for s in [-1,1]:
    o=box('Tail finlet',(s*2,.55,5.35),(.09,1.15,1.2),navy)
    tube('Python exhaust',[(s*.6,.25,-3),(s*.93,.2,-2.1)],.22,metal)
    for x in [2,2.55]:tube('Hispano barrel',[(s*x,-.08,-1.7),(s*x,-.08,-2.8)],.05,black)
    # Eight RP-3 rails per wing, staggered in two tiers for clearance.
    for j in range(8):box('RP3 rail',(s*(2.3+(j%4)*.86),-.4-(j//4)*.32,.1),(.055,.06,2.0),metal)
box('Centreline carrier',(0,-1.04,0),(.16,.3,1.8),metal)
save_asset('wyvern_body');prop('wyvern_prop',2.0,4)
for side in [-1,1]:
    tube('Main oleo',[(side*2.2,-.1,0),(side*2.2,-1.25,.15)],.10,metal)
    cylinder('Main tyre',(side*2.2,-1.23,.15),.4,.25,black,rotation=(0,math.pi/2,0))
    box('Gear door',(side*2.35,-.65,.15),(.07,1.05,.55),sky)
tube('Tail oleo',[(0,.1,5.3),(0,-1.3,5.3)],.065,metal)
cylinder('Tailwheel',(0,-1.4,5.3),.22,.18,black,rotation=(0,math.pi/2,0))
save_asset('wyvern_gear')
loft('RP-3 body',[(-.9,.02,.02,0),(-.65,.076,.076,0),(-.18,.076,.076,0),(-.1,.038,.038,0),(.9,.038,.038,0)],green,16)
for a in [0,math.pi/2]:box('RP3 tail',(0,0,.68),(.28,.018,.3),metal,rotation=(0,0,a))
save_asset('rp3')
loft('Mk XVII body',[(-2.6,.03,.03,0),(-2.4,.225,.225,0),(1.8,.225,.225,0),(2.3,.10,.10,0),(2.55,.06,.06,0)],metal,24)
box('Monoplane air tail',(0,.22,2.0),(1.35,.07,.95),sky)
for s in [-1,1]:box('Air tail endplate',(s*.65,.17,2),(.035,.42,1.0),sky)
for a in [0,math.pi/2]:box('Torpedo tail fin',(0,0,2.2),(.5,.025,.6),metal,rotation=(0,0,a))
save_asset('torpedo17')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('FLEET EXPORT COMPLETE')
