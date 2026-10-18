/* AeroSim — cálculo del entorno atmosférico, separado del integrador de vuelo. */
window.AeroEnvironment = (() => {
  const G0 = 9.80665;
  const EARTH_RADIUS = 6371000;
  const GAS_R = 287.05287;
  const GAMMA_AIR = 1.4;

  function gravityAt(altitude) {
    const r = EARTH_RADIUS + Math.max(0, Number.isFinite(altitude) ? altitude : 0);
    return G0 * (EARTH_RADIUS / r) ** 2;
  }

  function airAt(altitude) {
    const h = Math.max(0, Number.isFinite(altitude) ? altitude : 0);
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

  return Object.freeze({ gravityAt, airAt, constants: Object.freeze({ G0, EARTH_RADIUS, GAS_R, GAMMA_AIR }) });
})();