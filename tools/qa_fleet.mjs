import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../_archive/expansion-qa/',import.meta.url);mkdirSync(out,{recursive:true});
const chrome=await launch({width:1400,height:900,gpu:true});
try{
 const page=await chrome.page({width:1400,height:900});
 await page.goto(new URL('../dist/index.html',import.meta.url).href);
 for(let i=0;i<180&&!await page.eval('!!window.range');i++)await sleep(500);
 assert(await page.eval('!!window.range'),'RANGE loaded');
 await page.eval('range.setAircraft("wyvern")');
 writeFileSync(new URL('wyvern-intro.png',out),await page.screenshot());
 await page.eval('range.stage("cloud");range.input.devCamera=true;range.input.keys.clear();range.flight.bombs=1');
 const pose=async(eye,target)=>page.eval(`(()=>{const r=range;r.input.devPosition=r.flight.position.clone().set(${eye});r.camera.position.copy(r.input.devPosition);r.camera.up.set(0,1,0);r.camera.rotation.order='YXZ';r.camera.lookAt(r.flight.position.clone().set(${target}));r.input.devLook={x:r.camera.rotation.y,y:r.camera.rotation.x};r.renderOnce(0);})()`);
 const f=await page.eval('range.flight.position.toArray()');
 for(const [name,d] of Object.entries({side:[23,5,0],front:[13,7,-22],below:[10,-7,-15]})){
   await pose(f.map((v,i)=>v+d[i]),f);writeFileSync(new URL('wyvern-'+name+'.png',out),await page.screenshot());
 }
 for(const i of [1,2]){
   const p=await page.eval(`range.engagement.airTargets[${i}].position.toArray()`);
   await pose(p.map((v,j)=>v+[i===1?70:32,18,-40][j]),p);writeFileSync(new URL((i===1?'bear':'hind')+'.png',out),await page.screenshot());
 }
 const frames={aubin:[[2420,180,-2200],[2010,-72,-2550]],helier:[[3500,350,-5000],[2900,-60,-6200]],ouen:[[-300,160,1200],[-400,-78,680]],catherine:[[-410,80,-12230],[-205,-78,-12125]]};
 for(const [name,[eye,target]] of Object.entries(frames)){
   await pose(eye,target);writeFileSync(new URL(name+'.png',out),await page.screenshot());
 }
 const shots=await page.eval(`(()=>{const r=range;r.flight.onGround=false;r.flight.crashed=false;r.flight.velocity.set(0,0,-110);r.flight.bombs=1;return {rocket:r.engagement.launchRocket(r.flight),torpedo:r.dropBomb(),rockets:r.engagement.rocketsRemaining,bombs:r.flight.bombs};})()`);
 assert.deepEqual(shots,{rocket:true,torpedo:true,rockets:15,bombs:0});
 const errors=page.logs.filter(l=>l.startsWith('EXC')||l.startsWith('error'));assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS fleet browser, store release and coastal renders',shots);
}finally{await chrome.close();}
