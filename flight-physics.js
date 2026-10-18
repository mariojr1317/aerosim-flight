/* AeroSim Flight Dynamics — original educational model, not copied from GeoFS.
   SI units internally; the interface displays speed in km/h. */
window.AeroPhysics = {
  step(s, throttle, dt) {
    const g=9.80665, mass=1100, wingArea=16.2;
    const rho=1.225*Math.exp(-Math.max(0,s.altitude)/8500);
    const v=Math.max(0,s.speed/3.6), gamma=s.flightPathAngle||0;
    const alpha=s.pitch-gamma, clRaw=0.22+5.1*alpha;
    const cl=Math.max(-0.9,Math.min(1.45,clRaw));
    const q=0.5*rho*v*v, lift=q*wingArea*cl;
    const cd=0.028+0.055*cl*cl+(Math.abs(alpha)>0.22?0.12:0);
    const drag=q*wingArea*cd, thrust=420+throttle*2600;
    const vdot=(thrust-drag-mass*g*Math.sin(gamma))/mass;
    const gammaDot=v>8 ? lift*Math.cos(s.roll)/(mass*Math.max(v,8))-g*Math.cos(gamma)/Math.max(v,8) : 0;
    s.speed=Math.max(0,Math.min(420,(v+vdot*dt)*3.6));
    s.flightPathAngle=Math.max(-0.7,Math.min(0.7,gamma+gammaDot*dt));
    s.altitude=Math.max(0,Math.min(18000,s.altitude+v*Math.sin(s.flightPathAngle)*dt));
    s.heading=(s.heading+g*Math.tan(s.roll)/Math.max(v,15)*dt+Math.PI*2)%(Math.PI*2);
    return {lift,drag,rho,alpha,stall:clRaw>1.45||s.speed<95};
  }
};