// Browser checks for immediate touch release, held follow and the rendered effects.
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../_archive/refinement-qa/',import.meta.url);mkdirSync(out,{recursive:true});
const chrome=await launch({width:932,height:430,gpu:true});
try{
  const page=await chrome.page({width:932,height:430});
  await page.goto(new URL('../dist/mobile.html?touch=1',import.meta.url).href);
  for(let i=0;i<180&&!await page.eval('!!window.range');i++)await sleep(500);
  const result=await page.eval(`(()=>{
    const r=range;r.touchDemo('cloud');r.setPaused(false);
    const event=(name,id)=>new PointerEvent(name,{pointerId:id,pointerType:'touch',bubbles:true});
    const b=r.touch.el.bomb,before=r.flight.bombs;
    b.dispatchEvent(event('pointerdown',71));
    const immediate=r.flight.bombs===before-1,munition=r.effects.lastMunition;
    for(let i=0;i<15;i++)r.renderOnce(1/60);
    const held=r.followingMunition===munition;
    window.dispatchEvent(event('pointerup',71));r.renderOnce(1/60);
    const released=r.followingMunition===null;
    b.dispatchEvent(event('pointerdown',72));
    for(let i=0;i<15;i++)r.renderOnce(1/60);
    r.effects.lastMunition.expired=true;r.renderOnce(1/60);
    const expired=r.followingMunition===null;
    window.dispatchEvent(event('pointercancel',72));
    r.touchDemo('cloud','locked');r.engagement.seeker.target=r.engagement.airTargets[0];r.setPaused(false);
    const s=r.touch.el.seeker,count=r.engagement.remaining;
    s.dispatchEvent(event('pointerdown',73));
    const missileImmediate=r.engagement.remaining===count-1;
    for(let i=0;i<15;i++)r.renderOnce(1/60);
    const missileHeld=r.followingMunition===r.effects.lastMunition;
    window.dispatchEvent(event('pointerup',73));r.renderOnce(1/60);
    const missileReleased=r.followingMunition===null;
    r.setPaused(true);
    return {immediate,held,released,expired,missileImmediate,missileHeld,missileReleased};
  })()`);
  console.log('Touch follow:',result);for(const [name,value] of Object.entries(result))assert(value,name);
  const frames={
    launch:`range.touchDemo('cloud','locked');range.engagement.seeker.target=range.engagement.airTargets[0];range.setPaused(false);range.engagement.launch(range.flight);range.renderOnce(.04);range.setPaused(true)`,
    water:`range.touchDemo('cloud');range.flight.position.set(6000,-74.6,-4300);range.flight.velocity.set(0,0,-180);range.input.devCamera=true;range.input.devPosition=range.flight.position.clone().add({x:15,y:28,z:65});range.camera.position.copy(range.input.devPosition);range.camera.rotation.order='YXZ';range.camera.lookAt(range.flight.position);range.input.devLook={x:range.camera.rotation.y,y:range.camera.rotation.x};range.renderOnce(.01)`,
  };
  for(const [name,expression] of Object.entries(frames)){
    await page.eval(expression);writeFileSync(new URL(name+'.png',out),await page.screenshot());
  }
  const errors=page.logs.filter(l=>l.startsWith('EXC')||l.startsWith('error'));
  assert.equal(errors.length,0,errors.join('\n'));
  writeFileSync(new URL('checks.json',out),JSON.stringify(result,null,2));
  console.log('PASS browser touch follow, launch and water renders');
}finally{await chrome.close();}
