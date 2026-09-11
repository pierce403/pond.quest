/** Equations, assumptions, and primary references: docs/SIMULATION.md. */
export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const finite = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;

export function daylight(totalMinutes: number) {
  const hour = ((totalMinutes + 480) % 1440) / 60;
  return Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
}
export function oxygenSaturation(temperature: number) {
  // Fresh water, sea level; cubic approximation over 0–35 °C, not a hard DO cap.
  const t = clamp(temperature, 0, 35);
  return 14.652 - 0.41022 * t + 0.007991 * t * t - 0.000077774 * t * t * t;
}
export function ammoniaFraction(pH: number, temperature: number) {
  // Emerson et al. (1975), freshwater NH3 fraction of TAN.
  const pKa = 0.09018 + 2729.92 / (273.15 + temperature);
  return 1 / (1 + Math.pow(10, pKa - pH));
}
export function carbonateFractions(pH: number) {
  const bicarbonate = Math.pow(10, pH - 6.35);
  const carbonate = bicarbonate * Math.pow(10, pH - 10.33);
  const sum = 1 + bicarbonate + carbonate;
  return { co2: 1 / sum, bicarbonate: bicarbonate / sum, carbonate: carbonate / sum };
}
export function carbonFromPH(pH: number, alkalinity: number) {
  const f = carbonateFractions(pH);
  const water = 1000 * (Math.pow(10, pH - 14) - Math.pow(10, -pH));
  return Math.max(0.00001, (alkalinity / 50 - water) / (f.bicarbonate + 2 * f.carbonate));
}
export function carbonatePH(carbon: number, alkalinity: number) {
  // Solve carbonate alkalinity + water dissociation by bisection (mmol/L).
  let lo = 4, hi = 11;
  for (let i = 0; i < 28; i++) {
    const pH = (lo + hi) / 2;
    const f = carbonateFractions(pH);
    const predicted = carbon * (f.bicarbonate + 2 * f.carbonate)
      + 1000 * (Math.pow(10, pH - 14) - Math.pow(10, -pH));
    if (predicted > alkalinity / 50) hi = pH;
    else lo = pH;
  }
  return (lo + hi) / 2;
}
export function plantStage(progress: number, stageDays: number[]) {
  const days = progress * stageDays[stageDays.length - 1];
  return stageDays.reduce((stage, day, i) => days >= day ? i : stage, 0);
}
