// Exercise the built HUD with a real Three.js camera, including munition-camera parallax.
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../_archive/hud-feedback-qa/',import.meta.url);mkdirSync(out,{recursive:true});
const chrome=await launch({width:932,height:430,gpu:true});
try {
  const page=await chrome.page({width:932,height:430});
  await page.goto(new URL('../dist/mobile.html?touch=1',import.meta.url).href);
  for(let i=0;i<180&&!await page.eval('!!window.range');i++)await sleep(500);
  const result=await page.eval(`(()=>{
    const r=range;r.touchDemo('cloud');
    const v=(x,y,z)=>r.flight.position.clone().set(x,y,z);
    r.flight.ias=100;r.flight.position.y=17.4;r.flight.verticalSpeed=-12;
    r.hud.update(r.flight,r.camera,r.input,r.instructor,r.effects,{touch:true});
    const units={speed:document.getElementById('speed').textContent,alt:document.getElementById('alt').textContent,vs:document.getElementById('vs').textContent};
    r.flight.position.set(0,1000,0);
    const t=r.engagement.airTargets[0];t.position.set(140,1000,-3000);
    Object.assign(r.engagement.seeker,{target:t,enabled:true,locked:true});
    r.engagement.seeker.direction.copy(t.position).sub(r.flight.position).normalize();
    r.dropBomb();const munition=r.effects.lastMunition;r.input.keys.add('KeyU');
    munition.position.set(80,1000,-1500);r.renderOnce(0);
    const followed=r.followingMunition===munition;
    let worstError=0,samples=0;
    for(const z of [-800,-1700,-2800,-3400]) for(const fov of [26,55]) {
      r.camera.fov=fov;r.camera.updateProjectionMatrix();r.camera.position.set(280,1100,z);
      r.camera.lookAt(v(80,980,-3100));
      r.hud.updateMarkers(r.flight,r.camera,r.input,r.effects,true);
      r.hud.updateEngagement(r.flight,r.camera,r.input,r.engagement,true);
      const point=t.position.clone().project(r.camera),el=document.getElementById('seekerHead');
      if(Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&point.z<1&&point.z>-1){
        if(el.getAttribute('visibility')!=='visible')throw Error('Visible lock lost');
        const m=el.transform.baseVal.consolidate().matrix;
        worstError=Math.max(worstError,Math.hypot(m.e-(point.x*.5+.5)*innerWidth,m.f-(-point.y*.5+.5)*innerHeight));samples++;
      }else if(el.getAttribute('visibility')!=='hidden')throw Error('Behind-camera lock remains visible');
    }
    const hiddenGuides=['reticle','nose','fpm','pipper','bombAim','seekerEnvelope'].every(id=>document.getElementById(id).getAttribute('visibility')==='hidden');
    // Laser stays attached to its own world anchor through a detached view too.
    r.engagement.laser.active=true;r.engagement.laser.point.copy(t.position);r.camera.lookAt(t.position);
    r.hud.updateEngagement(r.flight,r.camera,r.input,r.engagement,true);
    const laser=document.getElementById('laserMark').transform.baseVal.consolidate().matrix;
    const laserError=Math.hypot(laser.e-innerWidth/2,laser.f-innerHeight/2);
    r.input.keys.delete('KeyU');r.renderOnce(0);
    const returned=r.followingMunition===null;
    // The launched missile owns its track after leaving the rail. Switching off or moving
    // the aircraft seeker must not strand that track at the old aircraft-relative point.
    Object.assign(r.engagement.seeker,{target:t,enabled:true,locked:true});
    r.engagement.launch(r.flight);const missile=r.effects.lastMunition;
    missile.position.set(100,1000,-1600);missile.velocity.set(0,0,-500);
    Object.assign(r.engagement.seeker,{target:null,enabled:false,locked:false});
    r.input.keys.add('KeyU');r.renderOnce(0);
    const trackedPoint=t.position.clone().project(r.camera);
    const trackedElement=document.getElementById('seekerHead');
    const track=trackedElement.transform.baseVal.consolidate().matrix;
    const missileTrackError=Math.hypot(track.e-(trackedPoint.x*.5+.5)*innerWidth,track.f-(-trackedPoint.y*.5+.5)*innerHeight);
    const missileTrackVisible=trackedElement.getAttribute('visibility')==='visible';
    r.input.keys.delete('KeyU');
    r.hud.reset();r.effects.killEvents.push({kind:'air'},{kind:'ground'},{kind:'naval'});
    const messages=[];
    for(let i=0;i<3;i++){r.hud.updateKillConfirmation(i?2.5:0,r.effects);messages.push(document.getElementById('killConfirmation').textContent);}
    r.hud.updateKillConfirmation(2.5,r.effects);
    const expired=document.getElementById('killConfirmation').hidden;
    return {units,followed,returned,worstError,samples,hiddenGuides,laserError,missileTrackError,missileTrackVisible,messages,expired};
  })()`);
  assert.deepEqual(result.units,{speed:'360',alt:'100',vs:'-12'});
  assert(result.followed&&result.returned&&result.hiddenGuides&&result.expired);
  assert(result.samples>=3&&result.worstError<.1&&result.laserError<.1);
  assert(result.missileTrackVisible&&result.missileTrackError<.1);
  assert.deepEqual(result.messages,['AIR TARGET DESTROYED!','GROUND TARGET DESTROYED!','NAVAL TARGET DESTROYED!']);
  const sound=await page.eval(`(async()=>{
    const audio=new range.effects.audio.constructor();
    audio.context=new OfflineAudioContext(1,16800,48000);audio.master=audio.context.createGain();
    audio.master.gain.value=.5;audio.master.connect(audio.context.destination);audio.confirmKill();
    const buffer=await audio.context.startRendering(),data=buffer.getChannelData(0);
    return {samples:Array.from(data),peak:Math.max(...data.map(Math.abs))};
  })()`);
  assert(sound.peak>.05&&sound.peak<1);
  assert(sound.samples.slice(11000).every(x=>Math.abs(x)<.001),'Chime must stop cleanly');
  const wav=Buffer.alloc(44+sound.samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  sound.samples.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));
  writeFileSync(new URL('kill-confirmation.wav',out),wav);
  for(const [width,height] of [[932,430],[667,375],[390,844],[1366,768]]) {
    await chrome.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000},page.sessionId);
    await page.eval(`range.touchDemo('cloud');range.hud.reset();range.effects.killEvents.push({kind:'naval'});range.hud.updateKillConfirmation(0,range.effects)`);
    await sleep(120);
    const layout=await page.eval(`(()=>{const r=document.getElementById('killConfirmation').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth};})()`);
    assert(layout.left>=0&&layout.right<=layout.width&&layout.top>40,JSON.stringify(layout));
    writeFileSync(new URL('confirmation-'+width+'.png',out),await page.screenshot());
  }
  const errors=page.logs.filter(l=>l.startsWith('EXC')||l.startsWith('error'));
  assert.equal(errors.length,0,errors.join('\n'));
  writeFileSync(new URL('checks.json',out),JSON.stringify(result,null,2));
  console.log('PASS metric units, kill feedback and moving-camera marker projection',result);
} finally {await chrome.close();}
