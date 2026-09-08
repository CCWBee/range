"""Blender-authored sortie assets and Typhoon surface details. Keeps replaced collections archived."""
import bpy, math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parent.parent
helpers={'__name__':'range_assets','STAGES':{'helpers'}}
exec(compile((ROOT/'tools/model_range.py').read_text(encoding='utf-8'),'model_range.py','exec'),helpers)
for name in ('loft','sphere','cylinder','box','mesh','prism','tube','save_asset','material'):
    globals()[name]=helpers[name]

white=material('weapon_white',(.66,.68,.66),.22,.44)
olive=material('weapon_olive',(.14,.17,.10),.28,.53)
metal=material('weapon_metal',(.20,.23,.24),.75,.32)
dark=material('weapon_dark',(.026,.035,.039),.32,.35)
band=material('weapon_band',(.62,.43,.07),.08,.57)
silver=material('mig_aluminium',(.49,.53,.56),.65,.37)

def fins(prefix,z0,z1,root,span,paint):
    for i in range(4):
        angle=math.pi/4+i*math.pi/2
        pts=[(root,0,z0),(span,0,z0+.15),(span,0,z1-.10),(root,0,z1)]
        rot=Matrix.Rotation(angle,4,'Z')
        vs=[tuple(rot@Vector((x,y+d,z))) for d in [-.009,.009] for x,y,z in pts]
        mesh(prefix+str(i),vs,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],paint,bevel=.006)

# Paveway IV silhouette: seeker head, guidance canards, Mk 82 body and tail wing kit.
loft('Paveway IV body',[(-1.50,.035,.035,0),(-1.34,.083,.083,0),(-1.12,.14,.14,0),(-.85,.136,.136,0),(-.60,.136,.136,0),(.54,.136,.136,0),(.86,.095,.095,0),(1.34,.075,.075,0)],olive,32)
sphere('Laser seeker window',(0,0,-1.49),(.035,.035,.032),dark,16,8)
cylinder('Guidance collar',(0,0,-1.0),.143,.075,metal)
for z in [-.68,.5]:cylinder('Identification band',(0,0,z),.138,.032,band)
fins('Paveway canard ',-1.12,-.68,.08,.28,olive)
fins('Paveway tail ',.69,1.4,.07,.34,olive)
box('Cable conduit',(0,.14,-.02),(.035,.035,1.6),olive,.01)
for z in [-.32,.16]:box('Suspension lug',(0,.19,z),(.06,.10,.08),metal,.015)
save_asset('bomb')

# AIM-9L/M family proportions, 2.87 m long, 0.127 m body, cruciform fins and rollerons.
loft('Sidewinder body',[(-1.435,.029,.029,0),(-1.36,.059,.059,0),(-1.10,.064,.064,0),(1.33,.064,.064,0),(1.435,.049,.049,0)],white,24)
sphere('IR seeker dome',(0,0,-1.425),(.031,.031,.039),dark,16,8)
cylinder('Seeker housing',(0,0,-1.24),.065,.31,metal)
for z in [-.53,.32]:cylinder('Motor identification band',(0,0,z),.0655,.028,band)
fins('Sidewinder canard ',-1.0,-.58,.055,.205,metal)
fins('Sidewinder tail ',.76,1.37,.061,.305,white)
for i in range(4):
    a=math.pi/4+i*math.pi/2
    sphere('Rolleron',(math.cos(a)*.28,math.sin(a)*.28,1.3),(.026,.026,.035),metal,12,6)
cylinder('Rocket exhaust',(0,0,1.44),.047,.025,dark)
save_asset('sidewinder')

# A single MiG-15 target, distinctive nose intake, swept wings, fences and high tailplane.
loft('MiG fuselage',[(-5.05,.64,.62,0),(-4.8,.69,.68,0),(-4.1,.75,.82,.1),(-2.6,.79,.9,.12),(-1,.80,.9,.05),(1,.75,.8,0),(3,.58,.6,0),(4.9,.40,.42,0),(5.05,.40,.42,0)],silver,32)
cylinder('Intake dark aperture',(0,0,-5.065),.56,.022,dark,vertices=32)
box('Intake divider',(0,0,-5.10),(.10,1.10,.10),silver,.04)
sphere('MiG canopy', (0,1.02,-2.3),(.48,.54,1.15),dark)
for side in [-1,1]:
    prism('Swept wing',[(side*.60,-.05,-1.85),(side*5.04,-.05,.42),(side*5.04,-.05,1.4),(side*.65,-.05,1.4)],.13,silver)
    for x in [2.0,3.65]:box('Wing fence',(side*x,.13,.25),(.022,.34,1.24),silver,.012)
    prism('Tailplane',[(side*.15,2.3,2.35),(side*1.70,2.3,3.26),(side*1.70,2.3,3.8),(side*.15,2.3,3.64)],.09,silver)
    tube('Nose cannon',[(side*.36,-.50,-4.7),(side*.36,-.52,-5.30)],.042,dark)
mesh('Swept fin',[(-.07,.4,2.1),(-.07,3.25,3.9),(-.07,3.25,4.48),(-.07,.4,4.62),(.07,.4,2.1),(.07,3.25,3.9),(.07,3.25,4.48),(.07,.4,4.62)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],silver,bevel=.025)
cylinder('MiG exhaust',(0,0,5.07),.35,.025,dark)
save_asset('mig15')

mesh('Torn metal fragment',[(-.6,0,-.3),(.45,.1,-.2),(.3,-.06,.5),(-.3,.2,.36)],[(0,1,2),(0,2,3)],metal)
save_asset('debris')

# Additional geometry is kept separate so skin remapping can include it without changing hinges.
paint=bpy.data.materials['airframe']
for side in [-1,1]:
    for i in range(7):box('Engine cooling louvre',(side*.80,.32,2.0+i*.12),(.035,.022,.055),dark,.005)
    tube('Intake lip',[(side*.38,-.60,-3.68),(side*.75,-.77,-3.64),(side*1.05,-.53,-3.57)],.018,metal)
    box('Pylon missile rail',(side*3.68,-.29,1.15),(.14,.14,1.4),paint,.025)
    for x,y,z in [(1.85,-.46,.45),(2.85,-.34,1.25)]:
        box('Paveway suspension pylon',(side*x,y,z),(.16,.34,1.25),paint,.04)
    sphere('Wing-root access fastener',(side*.87,.33,-.7),(.023,.012,.023),metal,8,4)
box('Dorsal aerial',(0,.84,1.40),(.035,.22,.42),paint,.01)
save_asset('jet_detail')

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/RANGE.blend'))
exec(compile((ROOT/'tools/export_meshes.py').read_text(encoding='utf-8'),'export_meshes.py','exec'))
print('RANGE refinement assets exported',flush=True)
