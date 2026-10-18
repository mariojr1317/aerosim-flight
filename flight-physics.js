/* AeroSim Flight Dynamics
 * Modelo educativo de vuelo con atmósfera, sustentación, resistencia y gravedad terrestre.
 * Unidades internas SI: m, s, kg, N, rad. La velocidad del HUD se muestra en km/h.
 * No es un modelo certificado ni reproduce exactamente un avión real.
 */
window.AeroPhysics = (() => {
  const G0 = 9.80665;             // gravedad estándar al nivel del mar (m/s²)
  const EARTH_RADIUS = 6371000;   // radio medio terrestre (m)
  const RHO0 = 1.225;             // densidad del aire ISA a nivel del mar (kg/m³)
  const SCALE_HEIGHT = 8500;      // aproximación de caída de densidad en la troposfera (m)

  function gravityAt(altitude) {
    const r = EARTH_RADIUS + Math.max(0, altitude);
    return G0 * (EARTH_RADIUS / r) ** 2;
  }

  function airAt(altitude) {
    const h = Math.max(0, altitude);
    // Atmósfera estándar aproximada: densidad decreciente con la altura.
    const density = RHO0 * Math.exp(-Math.min(h, 32000) / SCALE_HEIGHT);
    return { density, temperature: Math.max(216.65, 288.15 - 0.0065 * Math.min(h, 11000)) };
  }

  function step(s, controls, dt) {
    dt = Math.max(0, Math.min(0.05, Number(dt) || 0));
    if (!dt) return { lift: 0, drag: 0, rho: RHO0, alpha: 0, stall: false, qbar: 0, thrust: 0, gravity: G0, verticalSpeed: 0, airspeed: Math.max(0, s.speed / 3.6) };

    // Aproximación de un avión ligero monomotor tipo entrenador.
    const mass = 1100;
    const wingArea = 16.2;       // área alar aproximada compatible con el ala del modelo
    const wingSpan = 10.9;       // envergadura aproximada del modelo
    const aspectRatio = wingSpan * wingSpan / wingArea;
    const oswaldEfficiency = 0.78;
    const maxThrust = 2600;
    const aero = airAt(s.altitude);
    const g = gravityAt(s.altitude);
    const rho = aero.density;
    const v = Math.max(0, s.speed / 3.6);
    const gamma = Number.isFinite(s.flightPathAngle) ? s.flightPathAngle : 0;
    const pitchRate = Number.isFinite(s.pitchRate) ? s.pitchRate : 0;
    const rollRate = Number.isFinite(s.rollRate) ? s.rollRate : 0;
    const pitch = Number.isFinite(s.pitch) ? s.pitch : 0;
    const bank = Number.isFinite(s.roll) ? s.roll : 0;
    const alpha = pitch - gamma;
    const qbar = 0.5 * rho * v * v;

    // Coeficiente de sustentación con pérdida progresiva tras el ángulo crítico.
    const clLinear = 0.28 + 5.0 * alpha;
    const clMax = 1.45;
    let cl = clMax * Math.tanh(clLinear / clMax);
    const absAlpha = Math.abs(alpha);
    const stall = v < 28 || absAlpha > 0.25 || clLinear > clMax;
    const postStall = absAlpha > 0.25 ? Math.max(0.25, 1 - (absAlpha - 0.25) * 1.8) : 1;
    cl *= postStall;

    // La resistencia del aire crece aproximadamente con el cuadrado de la velocidad.
    const heightAboveGround = Math.max(0, s.altitude - (Number.isFinite(s.groundHeight) ? s.groundHeight : 0));
    // Resistencia inducida según envergadura y área del ala; disminuye cerca del suelo (efecto suelo).
    const groundEffect = heightAboveGround < wingSpan * 0.5
      ? 1 - 0.45 * Math.pow(1 - heightAboveGround / (wingSpan * 0.5), 2)
      : 1;
    const inducedCd = (cl * cl) / (Math.PI * oswaldEfficiency * aspectRatio) * groundEffect;
    const cd = 0.028 + 0.018 * cl * cl + inducedCd +
      (absAlpha > 0.24 ? 0.16 * Math.min(1, (absAlpha - 0.24) * 4) : 0);
    const lift = qbar * wingArea * cl;
    const drag = qbar * wingArea * cd;

    // Empuje de hélice simplificado: disminuye al aumentar la velocidad.
    const throttle = Math.max(0, Math.min(1, Number(controls.throttle) || 0));
    const thrust = Math.max(0, maxThrust * throttle * Math.max(0.12, 1 - v / 115));
    const longitudinalAccel = (thrust - drag) / mass - g * Math.sin(gamma);

    // La sustentación y el peso determinan el cambio de trayectoria vertical.
    const vSafe = Math.max(v, 8);
    const gammaAccel = (lift * Math.cos(bank) - mass * g * Math.cos(gamma)) / (mass * vSafe);
    const nextSpeed = Math.max(0, Math.min(360 / 3.6, v + longitudinalAccel * dt));
    const nextGamma = Math.max(-1.15, Math.min(1.15, gamma + gammaAccel * dt));

    // Integración semi-implícita, estable para pasos pequeños.
    s.speed = nextSpeed * 3.6;
    s.flightPathAngle = nextGamma;
    s.altitude = Math.max(0, Math.min(18000, s.altitude + nextSpeed * Math.sin(nextGamma) * dt));

    // Mandos con amortiguación; la actitud cambia gradualmente, no instantáneamente.
    const elevator = Math.max(-1, Math.min(1, Number(controls.pitch) || 0));
    const aileron = Math.max(-1, Math.min(1, Number(controls.roll) || 0));
    const pitchAccel = elevator * 1.05 - 1.8 * alpha - 1.15 * pitchRate;
    const rollAccel = aileron * 1.8 - 1.35 * rollRate;
    s.pitchRate = Math.max(-0.65, Math.min(0.65, pitchRate + pitchAccel * dt));
    s.rollRate = Math.max(-1.1, Math.min(1.1, rollRate + rollAccel * dt));
    s.pitch = Math.max(-0.65, Math.min(0.72, pitch + s.pitchRate * dt));
    s.roll = Math.max(-1.22, Math.min(1.22, bank + s.rollRate * dt));

    // Giro coordinado aproximado; se evita una tasa infinita a velocidad casi cero.
    s.heading = ((s.heading + g * Math.tan(s.roll) / vSafe * dt) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    return {
      lift, drag, rho, alpha, stall, qbar, thrust, gravity: g, wingArea, wingSpan, aspectRatio, groundEffect,
      verticalSpeed: nextSpeed * Math.sin(nextGamma),
      airspeed: nextSpeed
    };
  }

  return { step, gravityAt, airAt };
})();
