// Scripted practice traffic. These routes and damage values are gameplay settings.
export const TRAFFIC = [
  {asset:'mig15',name:'MiG-15',centre:[-700,1050,-4400],radius:2100,rate:.095,phase:0,hp:6,heat:1,bank:-.32},
  {asset:'tu95',name:'Tu-95 Bear',centre:[-1100,1650,-6900],radius:3300,rate:.061,phase:2.1,hp:18,heat:2.5,bank:-.22},
  {asset:'hind',name:'Mi-24 Hind',centre:[2300,150,-5100],radius:900,rate:.052,phase:4.1,hp:8,heat:.65,bank:-.15},
];
export function trafficPose(target,time) {
  const s=target.route,p=time*s.rate+s.phase;
  target.position.set(s.centre[0]+Math.sin(p)*s.radius,s.centre[1]+Math.sin(p*.7)*35,s.centre[2]+Math.cos(p)*s.radius);
  target.velocity.set(Math.cos(p)*s.radius*s.rate,Math.cos(p*.7)*24.5*s.rate,-Math.sin(p)*s.radius*s.rate);
}
