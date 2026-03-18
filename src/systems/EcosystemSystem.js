/**
 * EcosystemSystem — real-time pond chemistry simulation.
 *
 * Models the nitrogen cycle (Boyd & Tucker, 1998):
 *   Fish waste → NH₃ (ammonia)
 *   NH₃ + Nitrosomonas bacteria → NO₂⁻ (nitrite)
 *   NO₂⁻ + Nitrobacter bacteria → NO₃⁻ (nitrate)
 *   Plants absorb NO₃⁻
 *
 * Beneficial bacteria colonize gradually (~30 in-game days) — mirroring
 * real "new tank syndrome" where ammonia/nitrite spike before bacteria establish.
 *
 * Chemistry is updated each game-tick (1 real second = 1 in-game minute by default).
 */

import chemDefs from '../data/chemistry.js';
import speciesDefs from '../data/species.js';

export default class EcosystemSystem {
  constructor(storage) {
    this.storage = storage;
    this.cfg = chemDefs;
    this.speciesDefs = speciesDefs;

    // Tick accumulator — only simulate when enough real time has passed
    this._tickAccum = 0;
    this.TICK_MS = this.cfg.time.realSecondsPerGameMinute * 1000;
  }

  /**
   * Called every Phaser frame. Accumulates time and fires simulation ticks.
   * @param {number} delta - ms since last frame
   */
  update(delta) {
    this._tickAccum += delta;
    while (this._tickAccum >= this.TICK_MS) {
      this._tickAccum -= this.TICK_MS;
      this._simulate();
    }
  }

  /**
   * One game-minute simulation step.
   * All rates are per-minute normalized values.
   */
  _simulate() {
    const chem = { ...this.storage.getChemistry() };
    const fish = this.storage.getFish();
    const plants = this.storage.getPlants();
    const sim = this.cfg.simulation;
    const pond = this.storage.getPond();
    const pondTiles = pond.width * pond.height;
    // Water volume proportional to pond size (liters)
    const waterVolume = pondTiles * sim.waterVolumePerTile;

    // ── 1. Fish waste → ammonia ────────────────────────────────────────────
    // Each fish species has a wasteRate (ppm per fish per minute per 1000L).
    // Normalized by pond volume.
    let ammoniaInput = 0;
    let o2Demand = 0;
    fish.forEach(f => {
      const spec = this.speciesDefs.fish[f.species];
      if (!spec) return;
      ammoniaInput += spec.wasteRate / (waterVolume / 1000);
      o2Demand += spec.oxygenConsumption / (waterVolume / 1000);
    });
    chem.ammonia = Math.max(0, chem.ammonia + ammoniaInput);

    // ── 2. Bacteria colonization ───────────────────────────────────────────
    // Bacteria grow logistically, maxing at 1.0 over ~30 in-game days.
    // More bacteria → faster nitrification.
    const bacteriaCap = sim.bacteriaMaxLevel;
    chem.bacteriaLevel = Math.min(
      bacteriaCap,
      chem.bacteriaLevel + sim.bacteriaGrowthRate * (1 - chem.bacteriaLevel / bacteriaCap)
    );

    // ── 3. Nitrification: NH₃ → NO₂⁻ → NO₃⁻ ─────────────────────────────
    // Rate gated by bacteria level (0→1). New ponds have no bacteria = slow conversion.
    const nitrifyRate = chem.bacteriaLevel;
    const nh3Converted = chem.ammonia * sim.ammoniaToNitriteRate * nitrifyRate;
    chem.ammonia = Math.max(0, chem.ammonia - nh3Converted);
    chem.nitrite = Math.max(0, chem.nitrite + nh3Converted);

    const no2Converted = chem.nitrite * sim.nitriteToNitrateRate * nitrifyRate;
    chem.nitrite = Math.max(0, chem.nitrite - no2Converted);
    chem.nitrate = Math.max(0, chem.nitrate + no2Converted);

    // ── 4. Plants: O₂ production + nitrate absorption ─────────────────────
    // Production scales with plant maturity (growthProgress 0→1).
    let o2Production = 0;
    let no3Absorbed = 0;
    plants.forEach(p => {
      const spec = this.speciesDefs.plants[p.species];
      if (!spec) return;
      const maturity = p.growthProgress || 0;
      o2Production += spec.doProduction * maturity / (waterVolume / 1000);
      no3Absorbed += spec.nitrateAbsorption * maturity / (waterVolume / 1000);
    });
    chem.dissolvedOxygen = Math.min(
      this.cfg.thresholds.dissolvedOxygen.saturation,
      chem.dissolvedOxygen + o2Production - o2Demand
    );
    chem.nitrate = Math.max(0, chem.nitrate - no3Absorbed);

    // ── 5. DO: passive atmospheric re-aeration ────────────────────────────
    // Dissolved oxygen equilibrates toward atmospheric saturation.
    // Rate boosted by surface area (pond size). Langelier saturation approach.
    const doTarget = sim.doAtmosphericEquilibrium;
    chem.dissolvedOxygen += (doTarget - chem.dissolvedOxygen) * sim.doPassiveReaeration * pondTiles;
    chem.dissolvedOxygen = Math.max(0, Math.min(this.cfg.thresholds.dissolvedOxygen.saturation, chem.dissolvedOxygen));

    // ── 6. pH drift ────────────────────────────────────────────────────────
    // High ammonia → pH rises (ammonia is alkaline)
    // High CO₂ (fish respiration, decomposition) → pH falls
    // We approximate: ammonia pushes up, high fish count pushes down.
    const fishCount = fish.length;
    const phPushUp = chem.ammonia * 0.05;
    const phPushDown = fishCount * 0.001;
    const phNatural = sim.pHTargetNatural;
    chem.pH += (phNatural - chem.pH) * sim.pHDriftRate;
    chem.pH += phPushUp - phPushDown;
    chem.pH = Math.max(5.0, Math.min(10.0, chem.pH));

    chem.lastTick = Date.now();

    // ── 7. Fish stress ────────────────────────────────────────────────────
    this._updateFishStress(chem);

    // Persist every tick (storage system rate-limits writes internally)
    this.storage.tickSave(chem, 1);
  }

  /**
   * Update each fish's stress level based on current chemistry.
   * Stress accumulates under poor conditions and slowly recovers in good conditions.
   */
  _updateFishStress(chem) {
    const stress = this.cfg.simulation.fishStressThreshold;
    const fish = this.storage.getFish();

    fish.forEach(f => {
      let stressScore = 0;
      if (chem.ammonia > stress.ammonia) stressScore += (chem.ammonia - stress.ammonia) * 10;
      if (chem.nitrite > stress.nitrite) stressScore += (chem.nitrite - stress.nitrite) * 5;
      if (chem.nitrate > stress.nitrate) stressScore += (chem.nitrate - stress.nitrate) * 0.1;
      if (chem.pH < stress.pH_low) stressScore += (stress.pH_low - chem.pH) * 2;
      if (chem.pH > stress.pH_high) stressScore += (chem.pH - stress.pH_high) * 2;
      if (chem.dissolvedOxygen < stress.do_low) stressScore += (stress.do_low - chem.dissolvedOxygen) * 3;

      const currentStress = f.stress || 0;
      // Stress builds quickly, recovers slowly (realistic fish health dynamics)
      const newStress = stressScore > 0
        ? Math.min(1.0, currentStress + stressScore * 0.01)
        : Math.max(0.0, currentStress - 0.001);

      this.storage.updateFish(f.id, { stress: newStress });
    });
  }

  /**
   * Get current chemistry with status annotations for HUD.
   * @returns {{ pH, ammonia, nitrite, nitrate, dissolvedOxygen, statuses }}
   */
  getAnnotatedChemistry() {
    const chem = this.storage.getChemistry();
    const th = this.cfg.thresholds;

    const status = (val, ideal, warn, critHigh) => {
      if (val <= ideal) return 'ideal';
      if (val <= warn) return 'warning';
      return 'critical';
    };

    const pHStatus = () => {
      const pH = chem.pH;
      const [lo, hi] = th.pH.ideal;
      if (pH >= lo && pH <= hi) return 'ideal';
      if (pH >= th.pH.warning[0] && pH <= th.pH.warning[1]) return 'warning';
      return 'critical';
    };

    return {
      ...chem,
      statuses: {
        pH: pHStatus(),
        ammonia: status(chem.ammonia, th.ammonia.ideal_max, th.ammonia.warning_max, th.ammonia.critical_max),
        nitrite: status(chem.nitrite, th.nitrite.ideal_max, th.nitrite.warning_max, th.nitrite.critical_max),
        nitrate: status(chem.nitrate, th.nitrate.ideal_max, th.nitrate.warning_max, th.nitrate.critical_max),
        dissolvedOxygen: chem.dissolvedOxygen >= th.dissolvedOxygen.ideal_min ? 'ideal'
          : chem.dissolvedOxygen >= th.dissolvedOxygen.warning_min ? 'warning' : 'critical',
      },
    };
  }
}
