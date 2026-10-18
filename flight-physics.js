/* AeroSim Flight Dynamics — modelo aerodinámico educativo.
 * Unidades SI: m, s, kg, N, rad. El HUD convierte la velocidad a km/h.
 * Estructura física inspirada en prácticas de modelado de dinámica de vuelo
 * documentadas por JSBSim; este archivo NO contiene ni ejecuta la biblioteca JSBSim.
 * Para integrar el motor JSBSim real se requiere compilar/cargar su módulo WebAssembly
 * y suministrar sus archivos de aeronave, motor y sistemas.
 */
window.AeroPhysics = (() => {
  const AIRCRAFT = window.AeroAerodynamics.aircraft;
  const AR = window.AeroAerodynamics.aspectRatio;
  const gravityAt = window.AeroEnvironment.gravityAt;
  const airAt = window.AeroEnvironment.airAt;
  const RHO0 = 1.225;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function finite(x, fallback = 0) { return Number.isFinite(x) ? x : fallback; }

  function step(s, controls, dt) {
    dt = clamp(finite(dt), 0, 0.05);
    const g = gravityAt(s.altitude);
    const atmosphere = airAt(s.altitude);
    const rho = atmosphere.density;
    const gamma = finite(s.flightPathAngle);
    const pitch = finite(s.pitch);
    const bank = finite(s.roll);
    const pitchRate = finite(s.pitchRate);
    const rollRate = finite(s.rollRate);
    const throttle = clamp(finite(controls.throttle), 0, 1);
    const elevator = clamp(finite(controls.pitch), -1, 1);
    const aileron = clamp(finite(controls.roll), -1, 1);
    const rudder = clamp(finite(controls.yaw), -1, 1);
    // Este módulo calcula las fuerzas aerodinámicas y la pérdida; el integrador
    // conserva aquí la dinámica temporal, los momentos y la trayectoria.
    const aero = window.AeroAerodynamics.calculate({
      speed: s.speed, altitude: s.altitude, groundHeight: s.groundHeight,
      pitch, flightPathAngle: gamma, bank, throttle
    }, atmosphere, g);
    const { v, alpha, qbar, mach, cl, cd, lift, drag, thrust, stall,
      groundEffect, mass } = aero;
    const vSafe = Math.max(v, 4);
    const weight = mass * g;
    const longitudinalAccel = (thrust - drag) / AIRCRAFT.mass - g * Math.sin(gamma);

    // Trayectoria: la fuerza normal neta curva la trayectoria de vuelo.
    const normalLift = lift * Math.cos(bank);
    const gammaAccel = (normalLift - weight * Math.cos(gamma)) /
      (AIRCRAFT.mass * vSafe);
    const nextSpeed = clamp(v + longitudinalAccel * dt, 0, 125);
    const nextGamma = clamp(gamma + gammaAccel * dt, -1.25, 1.25);

    // Respuesta angular con inercia, amortiguación y estabilidad longitudinal.
    // La entrada del elevador cambia la tasa de cabeceo, no la actitud instantáneamente.
    const pitchControlMoment = elevator * 3200; // Autoridad de elevador suficiente para rotación y recuperación a baja altura.
    const pitchStabilityMoment = -qbar * AIRCRAFT.wingArea * AIRCRAFT.meanChord *
      (0.72 * alpha + 0.20 * pitchRate);
    const pitchAccel = (pitchControlMoment + pitchStabilityMoment) / AIRCRAFT.pitchInertia;
    const rollControlMoment = aileron * qbar * AIRCRAFT.wingSpan * 0.075;
    const rollDampingMoment = -qbar * AIRCRAFT.wingArea * AIRCRAFT.wingSpan *
      (0.10 * rollRate);
    const rollAccel = (rollControlMoment + rollDampingMoment) / AIRCRAFT.rollInertia;
    const nextPitchRate = clamp(pitchRate + pitchAccel * dt, -AIRCRAFT.maxPitchRate, AIRCRAFT.maxPitchRate);
    const nextRollRate = clamp(rollRate + rollAccel * dt, -AIRCRAFT.maxRollRate, AIRCRAFT.maxRollRate);
    const nextPitch = clamp(pitch + nextPitchRate * dt, -0.75, 0.85);
    const nextBank = clamp(bank + nextRollRate * dt, -1.30, 1.30);

    // Coordinación de giro con alabeo; rumbo no cambia de forma instantánea.
    const turnRate = 1.45 * g * Math.tan(nextBank) / vSafe;
    const nextHeading = ((finite(s.heading) + turnRate * dt) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    if (dt > 0) {
      s.speed = nextSpeed * 3.6;
      s.flightPathAngle = nextGamma;
      s.altitude = clamp(finite(s.altitude) + nextSpeed * Math.sin(nextGamma) * dt, 0, 20000);
      s.pitchRate = nextPitchRate;
      s.rollRate = nextRollRate;
      s.pitch = nextPitch;
      s.roll = nextBank;
      s.heading = nextHeading;
    }

    return {
      lift, drag, rho, alpha, stall, qbar, thrust, gravity: g,
      wingArea: aero.wingArea, wingSpan: aero.wingSpan, aspectRatio: aero.aspectRatio,
      groundEffect, airspeed: nextSpeed, verticalSpeed: nextSpeed * Math.sin(nextGamma),
      pressure: atmosphere.pressure, temperature: atmosphere.temperature, mach,
      cl, cd, longitudinalAccel, gammaAccel, turnRate, mass,
      weight, loadFactor: weight > 0 ? normalLift / weight : 0
    };
  }

  return { step, gravityAt, airAt, aircraft: { ...AIRCRAFT, aspectRatio: AR } };
})();
