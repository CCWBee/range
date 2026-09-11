import { SHORE } from './shore-data.js';
const buckets=new Map(),cell=300;
for(const line of SHORE)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i];
  for(let x=Math.floor(Math.min(a[0],b[0])/cell)-1;x<=Math.floor(Math.max(a[0],b[0])/cell)+1;x++)
    for(let z=Math.floor(Math.min(a[1],b[1])/cell)-1;z<=Math.floor(Math.max(a[1],b[1])/cell)+1;z++){
      const key=x+','+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push([a,b]);
    }
}
export function shoreSample(x,z){
  let best=Infinity,land=false;
  for(const [a,b] of buckets.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){
    const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(1,l)));
    const d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
    if(d<best){best=d;land=dx*(z-a[1])-dz*(x-a[0])<0;}
  }
  return {distance:best,land};
}
export function shoreHeight(x,z,height,sea){
  const s=shoreSample(x,z);
  if(s.distance>250)return height;
  // Restore dry mapped land lost in coarse coastal DEM cells. Do not lower real cliffs.
  if(s.land)return Math.max(height,sea+2.8+Math.min(5,s.distance*.035));
  // Mid-tide beach exposure in the broad western and southern bays, not the rocky north coast.
  const a=82.8*Math.PI/180,e=x*Math.cos(a)-(z+1100)*Math.sin(a),n=-x*Math.sin(a)-(z+1100)*Math.cos(a);
  const lon=-2.1955555556+e/(73000*.85),lat=49.2080555556+n/(111320*.85);
  const sandy=(lon< -2.215&&lat>49.183&&lat<49.235)||(lat<49.198&&lon> -2.175&&lon< -2.12)||(lat>49.177&&lat<49.19&&lon> -2.205&&lon< -2.18);
  if(sandy&&s.distance<180)return Math.max(height,sea+2.1-s.distance*.025);
  return height;
}
