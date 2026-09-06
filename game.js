import * as THREE from './vendor/three.module.js';
import { Flight, bombStep } from './physics.js';

const $=id=>document.getElementById(id), v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const flight=new Flight(), keys=new Set();
let running=false,paused=false,cameraMode=0,elapsed=0,gunTimer=0,hitFlash=0,crashShown=false;
let audioContext,engineOsc,engineGain,noiseGain,master,muted=false;
const frameTimes=[],shots=[],bombs=[],blasts=[],smoke=[],targets=[],navPoints=[v(0,750,-3900),v(1800,850,-6200),v(3500,750,-1000),v(0,300,2400)];
let waypoint=0,rangeHit=0,sortieStage=0;
const canvas=$('view');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
catch(error){$('error').classList.remove('hidden');$('error').textContent='RANGE needs WebGL 2. Open it in a browser with hardware acceleration enabled. '+error.message;throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.86;
renderer.info.autoReset=false;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x7e8b91,.000105);
const camera=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.3,65000);
const library=window.RANGE_MESHES || await fetch('assets/meshes.json').then(r=>r.json());
const tex=async name=>new THREE.TextureLoader().loadAsync(window.RANGE_TEXTURES?.[name]||`textures/${name}.png`);
const [concreteTexture,panelTexture,skyTexture]=await Promise.all([tex('concrete'),tex('airframe'),tex('sky')]);
skyTexture.colorSpace=THREE.SRGBColorSpace;skyTexture.wrapS=THREE.RepeatWrapping;
for(const t of [concreteTexture,panelTexture]) {t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
const materials={};
for(const [name,m] of Object.entries(library.materials)){
  materials[name]=new THREE.MeshStandardMaterial({color:new THREE.Color(...m.colour),metalness:m.metallic,roughness:m.roughness});
}
materials.airframe.map=panelTexture;materials.airframe.color.setRGB(.52,.56,.61);materials.airframe.roughness=.44;materials.airframe.envMapIntensity=.9;
materials.canopy.color.set(0x172630);materials.canopy.roughness=.1;materials.canopy.metalness=.88;
materials.concrete.map=concreteTexture;materials.concrete.color.setRGB(.42,.46,.50);materials.concrete.envMapIntensity=.55;
const geometries={};
for(const [name,parts] of Object.entries(library.assets)) {
 geometries[name]=parts.map(p=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(p.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(p.uv,2));g.computeBoundingSphere();return {geometry:g,material:p.material};
 });
}
function asset(name,override) {
 const group=new THREE.Group();
 for(const part of geometries[name]) {const m=new THREE.Mesh(part.geometry,override||materials[part.material]);m.castShadow=true;m.receiveShadow=true;group.add(m);}
 return group;
}
const noiseGLSL=`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+13.4;a*=.5;}return f;}
vec3 atmosphere(vec3 d){
 float h=max(d.y,0.);vec3 top=vec3(.095,.135,.19);vec3 horizon=vec3(.40,.445,.49);
 vec3 col=mix(horizon,top,smoothstep(0.,.7,h));
 float warm=exp(-pow((d.y-.025)*17.,2.))*pow(max(0.,dot(normalize(d.xz),normalize(vec2(-.35,-1.)))),7.);
 col+=vec3(.30,.195,.085)*warm;
 return col;
}
vec3 skyColour(vec3 d,vec2 offset){
 vec3 col=atmosphere(d);float h=max(.025,d.y+.045);
 vec2 p=d.xz/h*.82+offset;
 float n=fbm(p+fbm(p*.5)*1.5);
 float cover=smoothstep(.26,.57,n);
 float layer=fbm(p*2.7+vec2(11.3));
 vec3 cloud=mix(vec3(.065,.083,.115),vec3(.29,.335,.39),layer*.8+max(0.,d.y)*.22);
 cloud+=vec3(.12,.10,.075)*pow(max(0.,-d.z),4.)*exp(-h*4.);
 col=mix(col,cloud,cover*smoothstep(-.012,.10,d.y));
 col=mix(col,vec3(.50,.55,.59),exp(-abs(d.y)*85.)*.34);
 return col;
}`;
const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{offset:{value:new THREE.Vector2()},panorama:{value:skyTexture}},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 direction;uniform sampler2D panorama;uniform vec2 offset;void main(){vec3 d=normalize(direction);vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5+offset.x*.025,asin(clamp(d.y,-1.,1.))/3.14159265+.5);gl_FragColor=vec4(texture2D(panorama,uv).rgb*.84,1.);}'});
const sky=asset('sky',skyMaterial);sky.scale.setScalar(40000);sky.traverse(o=>{o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;});scene.add(sky);
// Capture the same cloudy sky for physical reflections on the aircraft and puddles.
const environmentScene=new THREE.Scene(),environmentSky=asset('sky',skyMaterial);environmentSky.scale.setScalar(100);environmentScene.add(environmentSky);
const envTarget=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});const envCamera=new THREE.CubeCamera(.1,200,envTarget);envCamera.update(renderer,environmentScene);
const pmrem=new THREE.PMREMGenerator(renderer);const envMap=pmrem.fromCubemap(envTarget.texture);scene.environment=envMap.texture;
scene.add(new THREE.HemisphereLight(0xc3d2e2,0x333b38,1.35));
const sun=new THREE.DirectionalLight(0xffd5a3,.12);sun.position.set(-900,220,-2500);scene.add(sun);scene.add(sun.target);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-52;sun.shadow.camera.right=52;sun.shadow.camera.top=52;sun.shadow.camera.bottom=-52;sun.shadow.camera.near=10;sun.shadow.camera.far=4000;sun.shadow.bias=-.00015;sun.shadow.normalBias=.08;
materials.concrete.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 worldP;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nworldP=(modelMatrix*vec4(transformed,1.)).xyz;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 worldP;${noiseGLSL}`)
 .replace('#include <map_fragment>','#include <map_fragment>\nvec2 slab=abs(fract(worldP.xz/7.)-.5);float seam=smoothstep(.482,.496,max(slab.x,slab.y));diffuseColor.rgb*=mix(1.,.48,seam);float tracks=exp(-pow(abs(worldP.x)-5.,2.)*.2)*.20;diffuseColor.rgb*=1.-tracks;')
 .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat puddle=smoothstep(.40,.64,fbm(worldP.xz*.09));roughnessFactor=mix(.57,.23,puddle);');
};
materials.earth.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 worldP;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nworldP=(modelMatrix*vec4(transformed,1.)).xyz;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 worldP;${noiseGLSL}`).replace('#include <color_fragment>','#include <color_fragment>\nfloat marsh=fbm(worldP.xz*.004);diffuseColor.rgb*=mix(vec3(.5,.59,.50),vec3(1.7,1.6,1.34),marsh);float grain=noise(worldP.xz*.25);diffuseColor.rgb*=.82+grain*.3;float sand=smoothstep(-.3,-3.,worldP.y);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.17,.13),sand*.6);');
};
for(const name of ['terrain','pavement','runway_markings','scenery'])scene.add(asset(name));
const oceanMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:'varying vec3 worldP;void main(){worldP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}',fragmentShader:`varying vec3 worldP;uniform float time;${noiseGLSL}void main(){vec3 eye=normalize(cameraPosition-worldP);float waveFade=exp(-length(cameraPosition-worldP)*.0007);float a=(sin(worldP.x*.06+time*.7)+sin(worldP.z*.093-time*.5))*waveFade;vec3 normal=normalize(vec3(a*.045,1.,cos(worldP.x*.087+worldP.z*.04+time)*.06*waveFade));vec3 reflection=reflect(-eye,normal);vec3 reflected=atmosphere(reflection);float fres=pow(1.-max(0.,dot(eye,normal)),4.);vec3 c=mix(vec3(.035,.075,.086),reflected,.18+fres*.8);float foam=noise(worldP.xz*.1+time*.1);c+=vec3(.03)*smoothstep(.78,.95,foam);float fog=1.-exp(-length(cameraPosition-worldP)*.00009);c=mix(c,vec3(.44,.51,.55),fog);gl_FragColor=vec4(c,1.);}`});
scene.add(asset('ocean',oceanMaterial));
for(let i=0;i<6;i++){const h=asset('hangar');h.position.set(-330-i%2*120,0,-130-Math.floor(i/2)*330);scene.add(h);}
const tower=asset('tower');tower.position.set(-260,0,170);scene.add(tower);
function instances(name,positions,material) {
 for(const part of geometries[name]){const mesh=new THREE.InstancedMesh(part.geometry,material||materials[part.material],positions.length);const m=new THREE.Matrix4();positions.forEach((p,i)=>{m.makeTranslation(...p);mesh.setMatrixAt(i,m);});mesh.receiveShadow=true;scene.add(mesh);}
}
const lampPositions=[];
for(let z=240;z>-2480;z-=45)for(const x of [-32,32])lampPositions.push([x,.18,z]);
instances('lamp',lampPositions,new THREE.MeshBasicMaterial({color:0xffe5b8}));
const glows=[];
const glowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{colour:{value:new THREE.Color(1,.68,.3)}},vertexShader:'varying vec2 uvp;void main(){uvp=position.xy+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvp;uniform vec3 colour;void main(){float d=length(uvp-.5)*2.;gl_FragColor=vec4(colour,pow(max(0.,1.-d),3.)*.8);}'});
const cloudMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0}},vertexShader:'varying vec2 uvp;void main(){uvp=position.xy+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 uvp;uniform float time;${noiseGLSL}void main(){vec2 q=(uvp-.5)*2.;float edge=1.-dot(q,q);float density=fbm(uvp*vec2(9.,5.)+time*.003);float a=smoothstep(.02,.55,edge)*smoothstep(.27,.6,density)*.57;vec3 c=mix(vec3(.12,.16,.205),vec3(.35,.40,.46),smoothstep(.2,.85,uvp.y)*.7+density*.2);gl_FragColor=vec4(c,a);}`});
const cloudBanks=[];
for(let i=0;i<28;i++){const m=asset('quad',cloudMaterial);m.position.set(900+Math.sin(i*2.31)*4200,760+(i%3)*130,-6500+(i*683)%10500);m.scale.set(1600+(i%4)*320,190+(i%3)*90,1);scene.add(m);cloudBanks.push(m);}
for(let i=0;i<lampPositions.length;i+=2){const g=asset('quad',glowMaterial);g.position.set(...lampPositions[i]);g.scale.setScalar(1.3);scene.add(g);glows.push(g);}
const jet=asset('jet'),gear=asset('gear');jet.add(gear);scene.add(jet);
const stores=[];for(let i=0;i<4;i++){const b=asset('bomb');b.position.set(i%2===0?-2.2:2.2,-.67,i<2?.3:2.2);jet.add(b);stores.push(b);}
const flameMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},power:{value:0},eyeLocal:{value:v()}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 p;uniform float time,power;uniform vec3 eyeLocal;void main(){vec3 ray=normalize(p-eyeLocal);vec3 light=vec3(0.);for(int i=0;i<24;i++){vec3 s=p-ray*(float(i)*.065);float t=s.z+.5;if(t>0.&&t<1.){float radius=.31*(1.-t*.6);float r=length(s.xy)/radius;float turbulence=1.+.10*sin(t*63.+s.x*26.-time*43.)+.07*cos(s.y*29.+t*81.+time*31.);float density=exp(-r*r*5.)*pow(1.-t,.8)*turbulence;float shock=pow(max(0.,cos(t*31.)),16.)*.65;vec3 colour=mix(vec3(.7,.8,2.5),vec3(3.4,.86,.16),smoothstep(.035,.16,t));colour+=vec3(1.2,.8,.5)*shock;light+=colour*density*.085;}}gl_FragColor=vec4(light*power*4.5,1.);}`});
const flames=[];for(const x of [-.55,.55]){const f=asset('flame',flameMaterial);f.position.set(x,-.1,8.7);f.scale.set(1,1,5);f.traverse(o=>{if(o.isMesh)o.onBeforeRender=()=>{flameMaterial.uniforms.eyeLocal.value.copy(camera.position);o.worldToLocal(flameMaterial.uniforms.eyeLocal.value);flameMaterial.uniformsNeedUpdate=true;};});jet.add(f);flames.push(f);}
const reheatLight=new THREE.PointLight(0xff7022,0,16,2);reheatLight.position.set(0,-.2,7.7);jet.add(reheatLight);
const rangePositions=[[-950,-3900],[-1090,-4050],[-800,-4170],[-1040,-4300],[-1220,-4190],[-860,-4430]];
for(const [x,z]of rangePositions){const m=asset('target');m.position.set(x,0,z);m.rotation.y=Math.sin(x)*.7;scene.add(m);targets.push({mesh:m,position:m.position.clone(),hp:3,destroyed:false});}
const blastMaterial=new THREE.MeshBasicMaterial({color:0xff8a25,transparent:true,depthWrite:false});
const smokeMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.35}},vertexShader:'varying vec2 uvp;void main(){uvp=position.xy+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 uvp;uniform float opacity;${noiseGLSL}void main(){float d=length(uvp-.5)*2.;float n=fbm(uvp*8.);float a=smoothstep(1.,.1,d)*(.4+n*.6)*opacity;gl_FragColor=vec4(vec3(.075,.080,.083)+n*.04,a);}`});
function explosion(position,strength=1){
 const mat=blastMaterial.clone(),m=asset('blast',mat);m.position.copy(position);m.position.y=Math.max(1,m.position.y);scene.add(m);blasts.push({mesh:m,mat,age:0,strength});hitFlash=.18;burstSound();
 for(const target of targets)if(!target.destroyed&&target.position.distanceTo(position)<33*strength)destroyTarget(target);
}
function destroyTarget(target){
 if(target.destroyed)return;target.destroyed=true;rangeHit++;target.mesh.visible=false;
 const w=asset('wreck');w.position.copy(target.position);scene.add(w);target.wreck=w;
 for(let i=0;i<5;i++){const m=asset('quad',smokeMaterial);m.position.copy(target.position).add(v(0,i*5+3,0));m.scale.setScalar(7+i*2);scene.add(m);smoke.push({mesh:m,origin:target.position.clone(),phase:i*1.9});}
}
function dropBomb(){
 if(!running||paused||flight.crashed||flight.grounded||flight.bombs<=0)return;
 const index=4-flight.bombs;stores[index].visible=false;flight.bombs--;flight.mass-=240;
 const m=asset('bomb');m.position.copy(jet.localToWorld(stores[index].position.clone()));m.quaternion.copy(flight.attitude);scene.add(m);
 bombs.push({mesh:m,position:m.position,velocity:flight.velocity.clone().addScaledVector(flight.basis().up,-2)});
}
const tracerMaterial=new THREE.MeshBasicMaterial({color:0xffe7a1});
function fireGun(){
 if(flight.rounds<=0||flight.crashed)return;flight.rounds--;
 const forward=flight.basis().forward,m=asset('quad',tracerMaterial);m.scale.set(.07,5,1);m.position.copy(flight.position).addScaledVector(forward,8);scene.add(m);
 shots.push({mesh:m,position:m.position,velocity:flight.velocity.clone().addScaledVector(forward,1020),age:0});hitFlash=.025;
 if(audioContext){const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sawtooth';o.frequency.setValueAtTime(72,audioContext.currentTime);g.gain.setValueAtTime(.055,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.06);o.connect(g).connect(master);o.start();o.stop(audioContext.currentTime+.07);}
}
function startAudio(){
 if(audioContext){audioContext.resume();return;}
 audioContext=new AudioContext();master=audioContext.createGain();master.gain.value=.5;master.connect(audioContext.destination);
 engineOsc=audioContext.createOscillator();engineOsc.type='sawtooth';engineGain=audioContext.createGain();engineGain.gain.value=.005;
 const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;engineOsc.connect(filter).connect(engineGain).connect(master);engineOsc.start();
 const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.12-.06)/1.03;data[i]=last*3;}
 const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;noiseGain=audioContext.createGain();noiseGain.gain.value=.03;source.connect(noiseGain).connect(master);source.start();
}
function burstSound(){if(!audioContext)return;const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.setValueAtTime(85,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(24,audioContext.currentTime+.8);g.gain.setValueAtTime(.32,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+1);o.connect(g).connect(master);o.start();o.stop(audioContext.currentTime+1);}

// A small bloom buffer keeps hot exhaust and impact light bright without washing out the sky.
const sceneTarget=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType});
const bloomA=new THREE.WebGLRenderTarget(Math.floor(innerWidth/3),Math.floor(innerHeight/3),{type:THREE.HalfFloatType,depthBuffer:false});const bloomB=bloomA.clone();
const postScene=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);postCamera.position.z=1;
const postGeometry=geometries.quad[0].geometry;
const postVertex='varying vec2 uvp;void main(){uvp=position.xy+.5;gl_Position=vec4(position.xy*2.,0.,1.);}';
const blurMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{image:{value:sceneTarget.texture},direction:{value:new THREE.Vector2(1/innerWidth,0)},threshold:{value:1}},vertexShader:postVertex,fragmentShader:'varying vec2 uvp;uniform sampler2D image;uniform vec2 direction;uniform float threshold;void main(){vec3 col=vec3(0);for(int i=-4;i<=4;i++){vec3 c=texture2D(image,uvp+direction*float(i)*2.).rgb;c=max(vec3(0),c-vec3(threshold));col+=c*(1.-abs(float(i))*.16);}gl_FragColor=vec4(col/5.8,1.);}'});
const finalMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{image:{value:sceneTarget.texture},bloom:{value:bloomB.texture},time:{value:0},flash:{value:0}},vertexShader:postVertex,fragmentShader:`varying vec2 uvp;uniform sampler2D image,bloom;uniform float time,flash;void main(){vec3 col=texture2D(image,uvp).rgb+texture2D(bloom,uvp).rgb*.4;col=mix(col,vec3(dot(col,vec3(.2126,.7152,.0722))),.12);col*=vec3(.97,1.,1.025);float vignette=1.-.21*pow(length((uvp-.5)*1.3),2.);col*=vignette;col+=flash*.025;gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>\nfloat grain=fract(sin(dot(uvp+time,vec2(12.9898,78.233)))*43758.5453);gl_FragColor.rgb+=(grain-.5)*.012;}`.replace(';#include',';\n#include')});
const postQuad=new THREE.Mesh(postGeometry,finalMaterial);postQuad.frustumCulled=false;postScene.add(postQuad);
const cameraVelocity=v(),look=v(),desired=v(),previousCamera=v();
function updateCamera(dt,snap=false){
 const {forward,up}=flight.basis();
 const speed=flight.velocity.length();
 const distance=cameraMode?34:25;
 desired.copy(flight.position).addScaledVector(forward,-distance).add(v(0,cameraMode?10:7.8,0));
 if(!running){desired.copy(flight.position).add(v(14,7,23));}
 if(snap){camera.position.copy(desired);cameraVelocity.set(0,0,0);}
 else {
  // Critically damped follow, with velocity feed-forward so speed does not stretch the camera.
  if(running&&!paused)camera.position.addScaledVector(flight.velocity,dt);
  const displacement=desired.clone().sub(camera.position);cameraVelocity.addScaledVector(displacement,26*dt);cameraVelocity.multiplyScalar(Math.exp(-9.8*dt));camera.position.addScaledVector(cameraVelocity,dt);
 }
 camera.position.y=Math.max(2.7,camera.position.y);
 look.copy(flight.position).addScaledVector(forward,33).add(v(0,1.1,0));
 camera.up.copy(v(0,1,0).lerp(up,.16)).normalize();camera.lookAt(look);
 const fov=lerp(51,59,clamp(speed/300,0,1));camera.fov=lerp(camera.fov,fov,1-Math.exp(-dt*2));camera.updateProjectionMatrix();
 sky.position.copy(camera.position);skyMaterial.uniforms.offset.value.set(flight.position.x*.00003+elapsed*.001,flight.position.z*.00003);
 for(const g of glows)g.quaternion.copy(camera.quaternion);
 for(const c of cloudBanks)c.quaternion.copy(camera.quaternion);
 const inCloud=Math.exp(-Math.pow((flight.position.y-920)/115,2))*(.25+.75*(.5+.5*Math.sin(flight.position.x*.0013+flight.position.z*.001)));
 scene.fog.density=.000105+inCloud*.0008;
}
function updateEffects(dt){
 flameMaterial.uniforms.time.value=elapsed;const power=clamp((flight.spool-.96)/.16,0,1);flameMaterial.uniforms.power.value=power;
 for(const f of flames){f.visible=power>.01;const length=1.1+power*2.0+Math.sin(elapsed*77)*.08;f.scale.z=length;f.position.z=6.2+length/2;}
 reheatLight.intensity=power*55;gear.visible=flight.gearPosition>.01;gear.scale.y=Math.max(.01,flight.gearPosition);
 for(let i=bombs.length-1;i>=0;i--){const b=bombs[i];if(bombStep(b,dt)){explosion(b.position,1.2);scene.remove(b.mesh);bombs.splice(i,1);}else b.mesh.quaternion.setFromUnitVectors(v(0,0,-1),b.velocity.clone().normalize());}
 for(let i=shots.length-1;i>=0;i--){const s=shots[i],previous=s.position.clone();s.velocity.y-=9.81*dt;s.position.addScaledVector(s.velocity,dt);s.age+=dt;s.mesh.quaternion.copy(camera.quaternion);
  let hit=false;for(const t of targets)if(!t.destroyed){const line=new THREE.Line3(previous,s.position),closest=v();line.closestPointToPoint(t.position.clone().add(v(0,1,0)),true,closest);if(closest.distanceTo(t.position.clone().add(v(0,1,0)))<3.8){t.hp--;if(t.hp<=0){explosion(t.position,.35);destroyTarget(t);}hit=true;break;}}
  if(s.position.y<0||s.age>3||hit){scene.remove(s.mesh);shots.splice(i,1);}
 }
 for(let i=blasts.length-1;i>=0;i--){const b=blasts[i];b.age+=dt;const size=(2+Math.sin(Math.min(1,b.age/1.4)*Math.PI*.6)*20)*b.strength;b.mesh.scale.set(size,size*.7,size);b.mat.color.setRGB(lerp(5,.15,b.age/3),lerp(1.8,.08,b.age/3),lerp(.35,.025,b.age/3));b.mat.opacity=clamp(1-b.age/3,0,1);if(b.age>3){scene.remove(b.mesh);b.mat.dispose();blasts.splice(i,1);}}
 for(const s of smoke){const age=(elapsed+s.phase)%12;s.mesh.position.copy(s.origin).add(v(age*1.1,3+age*4,age*.55));s.mesh.scale.setScalar(8+age*2);s.mesh.quaternion.copy(camera.quaternion);}
 hitFlash=Math.max(0,hitFlash-dt);oceanMaterial.uniforms.time.value=elapsed;cloudMaterial.uniforms.time.value=elapsed;
 if(audioContext){engineOsc.frequency.setTargetAtTime(28+flight.spool*68+flight.velocity.length()*.06,audioContext.currentTime,.2);engineGain.gain.setTargetAtTime(paused?0:.012+flight.spool*.045,audioContext.currentTime,.15);noiseGain.gain.setTargetAtTime(paused?.0:.04+flight.spool*.18+flight.velocity.length()*.0003,audioContext.currentTime,.2);}
}
function ui(){
 const {forward}=flight.basis(),speed=flight.velocity.length();
 $('speed').textContent=Math.round(speed*1.94384);$('alt').textContent=Math.max(0,Math.round((flight.position.y-1.9)*3.28084));$('throttle').textContent=Math.round(flight.throttle*100);
 const heading=(Math.atan2(forward.x,-forward.z)*180/Math.PI+360)%360;$('heading').textContent=Math.round(heading).toString().padStart(3,'0');
 $('gear').textContent=flight.gearPosition>.01&&flight.gearPosition<.99?'GEAR IN TRANSIT':flight.gear?'GEAR DOWN':'GEAR UP';
 $('weapons').textContent=`GUN ${flight.rounds} · BOMBS ${flight.bombs}`;
 let hint='Follow the coast. Bank with ← / →, then pull gently with ↓.';
 if(flight.grounded&&!flight.landed){hint=speed<10?'Hold Shift to advance the throttle. Reheat engages above 100%.':speed<72?'Keep accelerating. Rotate gently with ↓ at 145 knots.':'Ease back with ↓ to rotate. Press G once clear of the runway.';}
 else if(flight.gear&&flight.position.y>70&&!flight.landed)hint='Climbing. Press G to retract the gear. Reduce throttle with Ctrl.';
 else if(flight.alpha>.27)hint='HIGH ANGLE OF ATTACK · Lower the nose and build airspeed.';
 else if(flight.position.distanceTo(v(-1000,flight.position.y,-4200))<2200)hint='Practice range ahead. Space fires the gun. B releases an unguided bomb.';
 else if(rangeHit>0||flight.bombs===0)hint='Return to runway 36. Gear down, 160–180 knots. Hold X to slow. Touch down gently.';
 if(flight.landed)hint=speed>4?'Touchdown. Hold X to brake and Ctrl to bring the engines to idle.':'Sortie complete. Aircraft safely recovered. Press R to fly again.';
 if(Math.abs(flight.position.x)>11000||Math.abs(flight.position.z)>12000)hint='Leaving the coastal box. Turn back towards the airfield.';
 $('hint').textContent=hint;
 const airfield=flight.position.distanceTo(v(0,flight.position.y,-900))/1000;
 const bearing=point=>((Math.atan2(point.x-flight.position.x,flight.position.z-point.z)*180/Math.PI+360)%360).toFixed(0).padStart(3,'0');
 const rangeDistance=flight.position.distanceTo(v(-1000,flight.position.y,-4200))/1000;
 $('objective').textContent=flight.grounded&&!flight.landed?'RUNWAY 36 · DEPARTURE':`AIRFIELD ${airfield.toFixed(1)} KM / ${bearing(v(0,0,-900))}° · RANGE ${rangeDistance.toFixed(1)} KM / ${bearing(v(-1000,0,-4200))}° · ${rangeHit} / ${targets.length}`;
 const gunAim=flight.position.clone().addScaledVector(forward,2040).addScaledVector(flight.velocity,2).add(v(0,-19.62,0)).project(camera);$('aim').style.left=(gunAim.x*.5+.5)*innerWidth+'px';$('aim').style.top=(-gunAim.y*.5+.5)*innerHeight+'px';
 if(flight.crashed&&!crashShown){crashShown=true;explosion(flight.position,.6);$('status').innerHTML='AIRCRAFT LOST<small>Press R to restart the sortie</small>';}
 // The impact cue predicts only gravity and drag, never guides the bomb.
 const aim=$('bombAim');if(!flight.grounded&&flight.bombs>0&&flight.position.y<1600){const predicted={position:jet.localToWorld(stores[4-flight.bombs].position.clone()),velocity:flight.velocity.clone().addScaledVector(flight.basis().up,-2)};for(let i=0;i<2400;i++)if(bombStep(predicted,1/60))break;const point=predicted.position.project(camera);if(point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1){aim.style.display='block';aim.style.left=(point.x*.5+.5)*innerWidth+'px';aim.style.top=(-point.y*.5+.5)*innerHeight+'px';}else aim.style.display='none';}else aim.style.display='none';
}
function reset(){
 flight.reset();rangeHit=0;waypoint=0;sortieStage=0;crashShown=false;keys.clear();
 for(const list of [bombs,shots,blasts,smoke]){for(const o of list)scene.remove(o.mesh);list.length=0;}
 for(const t of targets){t.destroyed=false;t.hp=3;t.mesh.visible=true;if(t.wreck)scene.remove(t.wreck);}
 for(const s of stores)s.visible=true;jet.visible=true;paused=false;$('status').innerHTML='';updateCamera(1/60,true);
}
function start(){running=true;$('intro').classList.add('hidden');$('veil').classList.add('hidden');$('hud').classList.remove('hidden');$('buttons').classList.remove('hidden');startAudio();updateCamera(1/60,true);}
function pause(){paused=!paused;keys.clear();$('status').innerHTML=paused?'PAUSED<small>Esc to resume</small>':'';$('pauseButton').textContent=paused?'RESUME · ESC':'PAUSE · ESC';}
$('start').onclick=start;$('helpToggle').onclick=()=>$('help').classList.toggle('hidden');$('pauseButton').onclick=pause;
$('sound').onclick=()=>{muted=!muted;if(master)master.gain.setTargetAtTime(muted?0:.5,audioContext.currentTime,.05);$('sound').textContent=muted?'SOUND OFF':'SOUND ON';};
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;
 if(!running&&e.code==='Enter')start();if(!running)return;
 if(e.code==='KeyG'&&!paused&&!flight.grounded)flight.gear=!flight.gear;
 if(e.code==='KeyB')dropBomb();if(e.code==='KeyC')cameraMode=1-cameraMode;if(e.code==='KeyR')reset();if(e.code==='KeyH')$('help').classList.toggle('hidden');if(e.code==='Escape')pause();
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{frameTimes.length=0;last=performance.now();accumulator=0;if(document.hidden&&running&&!paused)pause();});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();sceneTarget.setSize(innerWidth,innerHeight);bloomA.setSize(Math.max(1,Math.floor(innerWidth/3)),Math.max(1,Math.floor(innerHeight/3)));bloomB.setSize(bloomA.width,bloomA.height);});
function inputs(){return{throttle:(keys.has('ShiftLeft')||keys.has('ShiftRight')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0),pitch:(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0),roll:(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),yaw:(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0),brake:keys.has('KeyX'),airbrake:keys.has('KeyX')};}
let last=performance.now(),accumulator=0,hudTime=0;
function render(now){
 requestAnimationFrame(render);const raw=(now-last)/1000;last=now;const dt=Math.min(raw,.06);frameTimes.push(raw*1000);if(frameTimes.length>900)frameTimes.shift();
 if(!paused){elapsed+=dt;if(running){accumulator+=dt;const input=inputs();while(accumulator>=1/120){flight.step(1/120,input);accumulator-=1/120;}gunTimer-=dt;if(keys.has('Space')&&gunTimer<=0){fireGun();gunTimer=.065;}}updateEffects(dt);}
 jet.position.copy(flight.position);jet.quaternion.copy(flight.attitude);updateCamera(dt);
 sun.position.copy(flight.position).add(v(-900,220,-2500));sun.target.position.copy(flight.position);
 hudTime+=dt;if(hudTime>.12){ui();hudTime=0;const avg=frameTimes.slice(-90).reduce((a,b)=>a+b,0)/Math.min(frameTimes.length,90);$('fps').textContent=`${Math.round(1000/avg)} FPS`;}
 renderer.info.reset();renderer.setRenderTarget(sceneTarget);renderer.render(scene,camera);
 postQuad.material=blurMaterial;blurMaterial.uniforms.image.value=sceneTarget.texture;blurMaterial.uniforms.direction.value.set(1/bloomA.width,0);blurMaterial.uniforms.threshold.value=1.05;renderer.setRenderTarget(bloomA);renderer.render(postScene,postCamera);
 blurMaterial.uniforms.image.value=bloomA.texture;blurMaterial.uniforms.direction.value.set(0,1/bloomA.height);blurMaterial.uniforms.threshold.value=0;renderer.setRenderTarget(bloomB);renderer.render(postScene,postCamera);
 postQuad.material=finalMaterial;finalMaterial.uniforms.time.value=elapsed;finalMaterial.uniforms.flash.value=hitFlash;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
}
updateCamera(1/60,true);$('loading').classList.add('hidden');$('start').disabled=false;requestAnimationFrame(render);
// Deterministic scene staging lets visual QA compare all five concept viewpoints.
window.range={flight,renderer,scene,camera,targets,bombs,shots,start,reset,dropBomb,fireGun,explosion,
 metrics(){const s=frameTimes.slice(-600).sort((a,b)=>a-b);return{samples:s.length,meanMs:s.reduce((a,b)=>a+b,0)/s.length,p95Ms:s[Math.floor(s.length*.95)],fps:1000/(s.reduce((a,b)=>a+b,0)/s.length),resolution:[canvas.width,canvas.height],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
 stage(name){if(!running)start();reset();const poses={ramp:[0,1.9,85,0,0],takeoff:[0,12,-800,.12,92],cloud:[1600,1050,-2600,.035,200],bomb:[-980,270,-3300,-.12,155],landing:[0,32,590,.055,84]};const p=poses[name]||poses.ramp;flight.position.set(p[0],p[1],p[2]);flight.attitude.setFromEuler(new THREE.Euler(p[3],0,0));flight.velocity.set(0,name==='landing'?-3:name==='takeoff'?9:0,-p[4]);flight.grounded=name==='ramp';flight.gear=['ramp','takeoff','landing'].includes(name);flight.gearPosition=flight.gear?1:0;flight.throttle=flight.spool=['cloud','takeoff'].includes(name)?1.12:.55;flight.airborneTime=name==='ramp'?0:30;paused=true;jet.position.copy(flight.position);jet.quaternion.copy(flight.attitude);updateEffects(.016);updateCamera(.016,true);ui();},
 resume(){paused=false;},setPaused(value){paused=value;},input:keys};
