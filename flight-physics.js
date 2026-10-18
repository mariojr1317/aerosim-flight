/* AeroSim Flight Dynamics
 * Original simplified flight model informed by public flight-dynamics references.
 * SI units internally. This is an educational approximation, not a certified FDM.
 */
window.AeroPhysics = {
  step(s, controls, dt) {
    const g = 9.80665;
    // Approximate Cessna-class single-engine trainer.
    const mass = 1100, wingArea = 16.2, wingspan = 10.9, meanChord = 1.5;
    const rho = 1.225 * Math.exp(-Math.max(0, s.altitude) / 8500);
    const v = Math.max(0, s.speed / 3.6);
    const gamma = s.flightPathAngle || 0;
    const pitchRate = s.pitchRate || 0;
    const rollRate = s.rollRate || 0;
    const alpha = s.pitch - gamma;
    const qbar = 0.5 * rho * v * v;

    // Lift curve with a smooth post-stall falloff instead of a hard force clamp.
    const clLinear = 0.28 + 5.0 * alpha;
    const clMax = 1.45;
    let cl = clMax * Math.tanh(clLinear / clMax);
    const absAlpha = Math.abs(alpha);
    const stallFactor = absAlpha > 0.25 ? Math.max(0.48, 1 - (absAlpha - 0.25) * 1.7) : 1;
    cl *= stallFactor;
    const cd = 0.032 + 0.055 * cl * cl + (absAlpha > 0.24 ? 0.16 * Math.min(1, (absAlpha - 0.24) * 4) : 0);
    const lift = qbar * wingArea * cl;
    const drag = qbar * wingArea * cd;

    // Propeller thrust decays with airspeed; throttle changes smoothly.
    const thrust = Math.max(0, (300 + 2300 * controls.throttle) * Math.max(0.35, 1 - v / 105));
    const longitudinalAccel = (thrust - drag) / mass - g * Math.sin(gamma);
    const vSafe = Math.max(v, 8);
    const gammaAccel = (lift * Math.cos(s.roll) - mass * g * Math.cos(gamma)) / (mass * vSafe);
    s.speed = Math.max(0, Math.min(360, (v + longitudinalAccel * dt) * 3.6));
    s.flightPathAngle = Math.max(-1.15, Math.min(1.15, gamma + gammaAccel * dt));
    s.altitude = Math.max(0, Math.min(18000, s.altitude + v * Math.sin(s.flightPathAngle) * dt));

    // Control inputs produce angular rates; damping prevents instant snapping.
    const elevator = Math.max(-1, Math.min(1, controls.pitch));
    const aileron = Math.max(-1, Math.min(1, controls.roll));
    const pitchAccel = elevator * 1.05 - 1.8 * alpha - 1.15 * pitchRate;
    const rollAccel = aileron * 1.8 - 1.35 * rollRate;
    s.pitchRate = Math.max(-0.65, Math.min(0.65, pitchRate + pitchAccel * dt));
    s.rollRate = Math.max(-1.1, Math.min(1.1, rollRate + rollAccel * dt));
    s.pitch = Math.max(-0.65, Math.min(0.72, s.pitch + s.pitchRate * dt));
    s.roll = Math.max(-1.22, Math.min(1.22, s.roll + s.rollRate * dt));

    // Coordinated turn approximation: bank creates yaw rate, increasing at low speed.
    s.heading = (s.heading + g * Math.tan(s.roll) / vSafe * dt + Math.PI * 2) % (Math.PI * 2);
    const stall = v < 28 || absAlpha > 0.25 || clLinear > clMax;
    return { lift, drag, rho, alpha, stall, qbar, thrust, verticalSpeed: v * Math.sin(s.flightPathAngle) };
  }
};