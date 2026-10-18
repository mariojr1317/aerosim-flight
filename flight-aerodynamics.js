/* AeroSim — modelo aerodinámico independiente: sustentación, resistencia y pérdida. */
window.AeroAerodynamics = (() => {
  const AIRCRAFT = Object.freeze({
    mass: 1100,
    wingArea: 16.2,
    wingSpan: 10.9,
    meanChord: 1.50,
    oswaldEfficiency: 0.78,
    cd0: 0.030,
    cl0: 0.25,
    clAlpha: 5.0,
    clMax: 1.45,
    stallAlpha: 15 * Math.PI / 180,
    maxThrust: 4200,
    propEfficiency: 0.78,
    maxPitchRate: 0.55,
    maxRollRate: 1.05,
    pitchInertia: 1800,
    rollInertia: 1400,
    yawInertia: 2200
  });
  const aspectRatio = AIRCRAFT.wingSpan ** 2 / AIRCRAFT.wingArea;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function calculate({ speed, altitude, groundHeight, pitch, flightPathAngle, bank, throttle }, atmosphere, gravity) {
    const v = Math.max(0, Number.isFinite(speed) ? speed / 3.6 : 0);
    const rho = atmosphere.density;
    const alpha = (Number.isFinite(pitch) ? pitch : 0) - (Number.isFinite(flightPathAngle) ? flightPathAngle : 0);
    const qbar = 0.5 * rho * v * v;
    const mach = v / atmosphere.speedOfSound;
    const alphaStall = AIRCRAFT.stallAlpha;
    let cl;
    if (Math.abs(alpha) <= alphaStall) {
      cl = AIRCRAFT.cl0 + AIRCRAFT.clAlpha * alpha;
    } else {
      const clAtStall = AIRCRAFT.cl0 + AIRCRAFT.clAlpha * alphaStall;
      const excess = Math.abs(alpha) - alphaStall;
      const postStall = Math.max(0.12, Math.cos(Math.min(Math.PI / 2, excess * 2.4)));
      cl = Math.sign(alpha) * clAtStall * postStall;
    }
    cl = clamp(cl, -1.0, AIRCRAFT.clMax);
    const stallSpeed = 1.05 * Math.sqrt((2 * AIRCRAFT.mass * gravity) /
      (Math.max(rho, 0.1) * AIRCRAFT.wingArea * AIRCRAFT.clMax));
    const stall = v < stallSpeed || Math.abs(alpha) > alphaStall;
    const heightAboveGround = Math.max(0, (Number.isFinite(altitude) ? altitude : 0) -
      (Number.isFinite(groundHeight) ? groundHeight : 0));
    const groundEffect = heightAboveGround < AIRCRAFT.wingSpan * 0.5
      ? 1 - 0.25 * Math.pow(1 - heightAboveGround / (AIRCRAFT.wingSpan * 0.5), 2)
      : 1;
    const inducedCd = cl * cl / (Math.PI * AIRCRAFT.oswaldEfficiency * aspectRatio) * groundEffect;
    const postStallCd = Math.abs(alpha) > alphaStall
      ? 0.12 * clamp((Math.abs(alpha) - alphaStall) / (Math.PI / 2 - alphaStall), 0, 1)
      : 0;
    const cd = AIRCRAFT.cd0 + inducedCd + postStallCd + 0.004 * mach * mach;
    const lift = qbar * AIRCRAFT.wingArea * cl;
    const drag = qbar * AIRCRAFT.wingArea * cd;
    const availableThrust = AIRCRAFT.maxThrust * clamp(Number.isFinite(throttle) ? throttle : 0, 0, 1) *
      clamp(1 - v / 180, 0.20, 1) * (rho / 1.225) ** 0.7;
    return { v, alpha, qbar, mach, cl, cd, lift, drag, thrust: availableThrust, stall,
      groundEffect, heightAboveGround, stallSpeed, wingArea: AIRCRAFT.wingArea,
      wingSpan: AIRCRAFT.wingSpan, aspectRatio, mass: AIRCRAFT.mass,
      maxPitchRate: AIRCRAFT.maxPitchRate, maxRollRate: AIRCRAFT.maxRollRate,
      pitchInertia: AIRCRAFT.pitchInertia, rollInertia: AIRCRAFT.rollInertia };
  }

  return Object.freeze({ calculate, aircraft: AIRCRAFT, aspectRatio });
})();