"""Render both runtime skin atlases on the actual RAF UVs without changing the saved Blender file."""
import bpy, math
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parent.parent
scene=bpy.data.scenes['RANGE'];bpy.context.window.scene=scene
for coll in scene.collection.children:
    coll.hide_render=not coll.name.startswith('jet_')
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review world');scene.world.color=(.22,.25,.30)
camera=bpy.data.objects.new('Skin review camera',bpy.data.cameras.new('Skin review camera'))
scene.collection.objects.link(camera);scene.camera=camera
camera.location=(17,17,22);forward=(Vector((0,0,0))-camera.location).normalized()
right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward)
camera.rotation_euler=Matrix((right,up,-forward)).transposed().to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=22
for name,location,energy,size in [('Key',(5,15,-8),2600,12),('Fill',(-10,8,5),1800,10)]:
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(light);light.location=location;light.data.energy=energy;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
material=bpy.data.materials['raf_airframe'];material.use_nodes=True
bs=material.node_tree.nodes.get('Principled BSDF')
tex=material.node_tree.nodes.new('ShaderNodeTexImage');material.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
for name,stem in [('heritage','raf_typhoon_heritage'),('grey','raf_typhoon_skin')]:
    tex.image=bpy.data.images.load(str(ROOT/f'textures/{stem}.png'),check_existing=True)
    scene.render.filepath=str(ROOT/f'_archive/skin-{name}-verified.png');bpy.ops.render.render(write_still=True)
print('Both skin review renders saved; source file unchanged')
