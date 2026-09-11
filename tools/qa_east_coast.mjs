// Inspect both mapped landmarks from plan, harbour and sea approaches in the built renderer.
import { launch, sleep } from '../../design/tools/qa/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../_archive/east-coast-qa/',import.meta.url);mkdirSync(out,{recursive:true});
const chrome=await launch({width:1400,height:900,gpu:true});
try {
  const page=await chrome.page({width:1400,height:900});
  await page.goto(new URL('../dist/index.html',import.meta.url).href);
  for(let i=0;i<180&&!await page.eval('!!window.range');i++)await sleep(500);
  await page.eval('range.stage("cloud");range.input.devCamera=true;range.input.keys.clear()');
  const frames={
    'gorey-harbour':[[2430,115,-11630],[2178,-44,-11855]],
    'gorey-north':[[1900,110,-12070],[2178,-44,-11855]],
    'gorey-plan':[[2180,360,-11849],[2180,-40,-11850]],
    'catherine-aerial':[[-530,230,-12600],[-40,-77,-12400]],
    'catherine-sea':[[330,-55,-12850],[30,-77,-12550]],
  };
  for(const [name,[eye,target]] of Object.entries(frames)) {
    await page.eval(`(()=>{const r=range;r.input.devPosition=r.flight.position.clone().set(${eye});r.camera.position.copy(r.input.devPosition);r.camera.up.set(0,1,0);r.camera.rotation.order='YXZ';r.camera.lookAt(r.flight.position.clone().set(${target}));r.input.devLook={x:r.camera.rotation.y,y:r.camera.rotation.x};r.renderOnce(0);})()`);
    await sleep(100);writeFileSync(new URL(name+'.png',out),await page.screenshot());
  }
  const errors=page.logs.filter(l=>l.startsWith('EXC')||l.startsWith('error'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS east-coast renders:',Object.keys(frames));
} finally {await chrome.close();}
