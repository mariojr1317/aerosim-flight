/* AeroSim Flight Dynamics — modelo aerodinámico educativo.
 * Unidades SI: m, s, kg, N, rad. El HUD convierte la velocidad a km/h.
 * Estructura física inspirada en prácticas de modelado de dinámica de vuelo
 * documentadas por JSBSim; este archivo NO contiene ni ejecuta la biblioteca JSBSim.
 * Para integrar el motor JSBSim real se requiere compilar/cargar su módulo WebAssembly
 * y suministrar sus archivos de aeronave, motor y sistemas.
 */
window.AeroPhysics = (() => {
  const G0 = 9.80665;
  const EARTH_RADIUS = 6371000;
  const RHO0 = 1.225;
  const GAS_R = 287.05287;
  const GAMMA_AIR = 1.4;

  // Parámetros aproximados de un avión ligero monomotor tipo entrenador.
  // No son datos certificados del modelo GLB.
  const AIRCRAFT = {
    mass: 1100,                 // kg
    wingArea: 16.2,             // m²
    wingSpan: 10.9,             // m
    meanChord: 1.50,            // m
    oswaldEfficiency: 0.78,
    cd0: 0.030,
    cl0: 0.25,
    clAlpha: 5.0,               // 1/rad
    clMax: 1.45,
    stallAlpha: 15 * Math.PI / 180,
    maxThrust: 2600,            // N, potencia máxima estática aproximada
    propEfficiency: 0.78,
    maxPitchRate: 0.55,         // rad/s
    maxRollRate: 1.05,          // rad/s
    pitchInertia: 1800,         // kg m², aproximada
    rollInertia: 1400,
    yawInertia: 2200
  };
  const AR = AIRCRAFT.wingSpan ** 2 / AIRCRAFT.wingArea;

  function gravityAt(altitude) {
    const r = EARTH_RADIUS + Math.max(0, altitude);
    return G0 * (EARTH_RADIUS / r) ** 2;
  }

  // Atmósfera ISA por capas: troposfera con gradiente térmico y capa isotérmica.
  function airAt(altitude) {
    const h = Math.max(0, altitude);
    let temperature, pressure;
    if (h <= 11000) {
      temperature = 288.15 - 0.0065 * h;
      pressure = 101325 * Math.pow(temperature / 288.15, 5.2558797);
    } else {
      temperature = 216.65;
      pressure = 22632.06 * Math.exp(-G0 * (h - 11000) / (GAS_R * temperature));
    }
    const density = pressure / (GAS_R * temperature);
    return { density, temperature, pressure, speedOfSound: Math.sqrt(GAMMA_AIR * GAS_R * temperature) };
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function finite(x, fallback = 0) { return Number.isFinite(x) ? x : fallback; }

  function step(s, controls, dt) {
    dt = clamp(finite(dt), 0, 0.05);
    const g = gravityAt(s.altitude);
    const atmosphere = airAt(s.altitude);
    const rho = atmosphere.density;
    const v = Math.max(0, finite(s.speed) / 3.6);
    const vSafe = Math.max(v, 4);
    const gamma = finite(s.flightPathAngle);
    const pitch = finite(s.pitch);
    const bank = finite(s.roll);
    const pitchRate = finite(s.pitchRate);
    const rollRate = finite(s.rollRate);
    const alpha = pitch - gamma;
    const qbar = 0.5 * rho * v * v;
    const mach = v / atmosphere.speedOfSound;
    const throttle = clamp(finite(controls.throttle), 0, 1);
    const elevator = clamp(finite(controls.pitch), -1, 1);
    const aileron = clamp(finite(controls.roll), -1, 1);
    const rudder = clamp(finite(controls.yaw), -1, 1);

    // Curva de sustentación lineal hasta la pérdida y caída después de ella.
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
    const stall = v < 1.3 * Math.sqrt((2 * AIRCRAFT.mass * g) / (Math.max(rho, 0.1) * AIRCRAFT.wingArea * AIRCRAFT.clMax))
      || Math.abs(alpha) > alphaStall;

    const heightAboveGround = Math.max(0, finite(s.altitude) - finite(s.groundHeight));
    const groundEffect = heightAboveGround < AIRCRAFT.wingSpan * 0.5
      ? 1 - 0.25 * Math.pow(1 - heightAboveGround / (AIRCRAFT.wingSpan * 0.5), 2)
      : 1;
    const inducedCd = cl * cl / (Math.PI * AIRCRAFT.oswaldEfficiency * AR) * groundEffect;
    const postStallCd = Math.abs(alpha) > alphaStall
      ? 0.12 * clamp((Math.abs(alpha) - alphaStall) / (Math.PI / 2 - alphaStall), 0, 1)
      : 0;
    const cd = AIRCRAFT.cd0 + inducedCd + postStallCd + 0.004 * mach * mach;
    const lift = qbar * AIRCRAFT.wingArea * cl;
    const drag = qbar * AIRCRAFT.wingArea * cd;

    // Modelo de hélice: el empuje disminuye con la velocidad y la potencia disponible.
    const thrust = AIRCRAFT.maxThrust * throttle *
      clamp(1 - v / 125, 0.12, 1) * (rho / RHO0) ** 0.7;
    const weight = AIRCRAFT.mass * g;
    const longitudinalAccel = (thrust - drag) / AIRCRAFT.mass - g * Math.sin(gamma);

    // Trayectoria: la fuerza normal neta curva la trayectoria de vuelo.
    const normalLift = lift * Math.cos(bank);
    const gammaAccel = (normalLift - weight * Math.cos(gamma)) /
      (AIRCRAFT.mass * vSafe);
    const nextSpeed = clamp(v + longitudinalAccel * dt, 0, 125);
    const nextGamma = clamp(gamma + gammaAccel * dt, -1.25, 1.25);

    // Respuesta angular con inercia, amortiguación y estabilidad longitudinal.
    // La entrada del elevador cambia la tasa de cabeceo, no la actitud instantáneamente.
    const pitchControlMoment = elevator * 1550;
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
    const turnRate = g * Math.tan(nextBank) / vSafe;
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
      wingArea: AIRCRAFT.wingArea, wingSpan: AIRCRAFT.wingSpan, aspectRatio: AR,
      groundEffect, airspeed: nextSpeed, verticalSpeed: nextSpeed * Math.sin(nextGamma),
      pressure: atmosphere.pressure, temperature: atmosphere.temperature, mach,
      cl, cd, longitudinalAccel, gammaAccel, turnRate, mass: AIRCRAFT.mass,
      weight, loadFactor: weight > 0 ? normalLift / weight : 0
    };
  }

  return { step, gravityAt, airAt, aircraft: { ...AIRCRAFT, aspectRatio: AR } };
})();
