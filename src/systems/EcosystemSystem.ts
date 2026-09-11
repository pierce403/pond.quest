import chemDefs from '../data/chemistry';
import speciesDefs from '../data/species';
import type { Chemistry } from '../data/model';
import StorageSystem from './StorageSystem';
import { ammoniaFraction, carbonateFractions, carbonatePH, clamp, daylight, oxygenSaturation, plantStage } from '../utils/water';

/** Fixed one-minute, well-mixed freshwater model. See docs/SIMULATION.md for units and sources. */
export default class EcosystemSystem {
  readonly cfg = chemDefs;
  readonly TICK_MS = chemDefs.time.realSecondsPerGameMinute * 1000;
  _tickAccum = 0;
  speed = 1;
  paused = false;
  storage: StorageSystem;

  constructor(storage: StorageSystem) { this.storage = storage; }
  update(delta: number) {
    if (this.paused || !Number.isFinite(delta) || delta <= 0) return;
    // A background tab must not fast-forward an unattended pond or create a catch-up spiral.
    this._tickAccum += Math.min(delta, 250) * this.speed;
    let steps = 0;
    while (this._tickAccum >= this.TICK_MS && steps++ < 120) {
      this._tickAccum -= this.TICK_MS;
      this._simulate();
    }
  }
  setSpeed(speed: number) { if ([1, 5, 20].includes(speed)) this.speed = speed; }
  getLight() { return daylight(this.storage.getGameTime().totalMinutes); }
  getCoverage() {
    const pond = this.storage.getPond();
    return clamp(this.storage.getPlants().reduce((area, p) => {
      const spec = speciesDefs.plants[p.species as keyof typeof speciesDefs.plants];
      return area + (spec?.shadeArea ?? 0) * (0.12 + p.growthProgress * 0.88) * p.health;
    }, 0) / (pond.width * pond.height), 0, 0.95);
  }

  _simulate() {
    const c = { ...this.storage.getChemistry() };
    const { width, height } = this.storage.getPond();
    const volume = width * height * this.cfg.simulation.waterVolumePerTile;
    const light = this.getLight();
    const coverage = this.getCoverage();
    const hour = ((this.storage.getGameTime().totalMinutes + 480) % 1440) / 60;
    const targetTemperature = 20 + 3 * Math.sin((hour - 9) * Math.PI / 12) - coverage * light * 2;
    c.temperature += (targetTemperature - c.temperature) / 90;
    const metabolism = Math.pow(2, (c.temperature - 20) / 10);

    let fishRespiration = 0;
    for (const f of this.storage.getFish()) {
      const spec = speciesDefs.fish[f.species as keyof typeof speciesDefs.fish];
      if (!spec) continue;
      c.ammonia += spec.wasteRate * 1000 / volume * metabolism;
      fishRespiration += spec.oxygenConsumption * 1000 / volume * metabolism;
    }

    // Senesced plant nitrogen is mineralized, not silently deleted. Simplified aerobic BOD.
    const decay = Math.min(c.detritus * 0.00015 * metabolism, c.dissolvedOxygen / 8);
    c.detritus -= decay;
    c.ammonia += decay;
    c.dissolvedOxygen -= decay * 8;
    c.inorganicCarbon += decay * 8 / 32;

    const plantRespiration = this._updatePlants(c, volume, light, coverage, metabolism);
    const totalRespiration = fishRespiration + plantRespiration;
    const respiration = Math.min(c.dissolvedOxygen, totalRespiration);
    // Report realized, rather than impossible, plant oxygen demand in anoxic water.
    if (respiration < totalRespiration) {
      const unmet = 1 - respiration / totalRespiration;
      for (const p of this.storage.getPlants()) {
        const spec = speciesDefs.plants[p.species as keyof typeof speciesDefs.plants];
        p.oxygenRate += spec.respiration * 1000 * p.effectiveness * metabolism * unmet;
      }
    }
    c.dissolvedOxygen -= respiration;
    c.inorganicCarbon += respiration / 32; // respiratory quotient ~1 mol CO2 per mol O2

    this._nitrify(c, metabolism);

    // Both uptake and outgassing approach saturation exponentially. Area/volume is
    // constant at a fixed depth: expanding the pond must not multiply this rate.
    const exchange = 1 - Math.exp(-this.cfg.simulation.doPassiveReaeration * (1 - coverage * 0.75));
    c.dissolvedOxygen += (oxygenSaturation(c.temperature) - c.dissolvedOxygen) * exchange;
    const co2 = c.inorganicCarbon * carbonateFractions(c.pH).co2;
    c.inorganicCarbon = Math.max(0.00001, c.inorganicCarbon +
      (0.015 - co2) * this.cfg.simulation.carbonGasExchange * (1 - coverage * 0.75));
    c.pH = carbonatePH(c.inorganicCarbon, c.alkalinity);
    c.lastTick = Date.now();
    this._updateFishStress(c);
    this.storage.tickSave(c, 1);
  }

  _nitrify(c: Chemistry, temperatureFactor = 1) {
    const sim = this.cfg.simulation;
    const environment = c.dissolvedOxygen / (c.dissolvedOxygen + 0.7)
      * clamp((c.pH - 5.8) / 1.4) * clamp((9.8 - c.pH) / 1.3)
      * clamp(c.alkalinity / 20) * temperatureFactor;
    const grow = (level: number, substrate: number, multiplier: number) => {
      const food = substrate / (substrate + 0.05);
      return clamp(level + (0.000002 + sim.bacteriaGrowthRate * level) * food * environment
        * (1 - level) * multiplier - level * (1 - food * clamp(environment)) * 0.00001);
    };
    c.bacteriaLevel = grow(c.bacteriaLevel, c.ammonia, 1);
    c.nitriteBacteriaLevel = grow(c.nitriteBacteriaLevel, c.nitrite, 0.85);
    // EPA Nutrient Control Design Manual §4.4. All nitrogen pools are mg N/L.
    const aob = Math.min(c.ammonia, c.ammonia * (1 - Math.exp(-sim.ammoniaToNitriteRate * c.bacteriaLevel * environment)),
      c.dissolvedOxygen / 3.43, c.alkalinity / 7.14);
    c.ammonia -= aob;
    c.nitrite += aob;
    c.dissolvedOxygen -= aob * 3.43;
    c.alkalinity -= aob * 7.14;
    const nob = Math.min(c.nitrite, c.nitrite * (1 - Math.exp(-sim.nitriteToNitrateRate * c.nitriteBacteriaLevel * environment)),
      c.dissolvedOxygen / 1.14);
    c.nitrite -= nob;
    c.nitrate += nob;
    c.dissolvedOxygen -= nob * 1.14;
  }

  _updatePlants(c: Chemistry, volume: number, light: number, coverage: number, temperatureFactor: number) {
    const plants = this.storage.getPlants();
    const tileCounts = new Map<string, number>();
    for (const p of plants) {
      const key = `${p.tileX},${p.tileY}`;
      tileCounts.set(key, (tileCounts.get(key) ?? 0) + 1);
    }
    const dissolvedN = c.ammonia + c.nitrate;
    const nutrient = dissolvedN / (dissolvedN + 0.15);
    const rates = plants.map(p => {
      const spec = speciesDefs.plants[p.species as keyof typeof speciesDefs.plants];
      const crowding = 1 / (1 + Math.max(0, (tileCounts.get(`${p.tileX},${p.tileY}`) ?? 1) - 3) * 0.22);
      const plantLight = light * (spec.habitat === 'submerged' ? 1 - coverage * 0.9 : 1);
      const temperature = clamp(1 - Math.abs(c.temperature - 23) / 20);
      // Nitrogen is fertilizer, not a fish-like plant toxin at ordinary pond concentrations.
      const stress = Math.max(0, 6 - c.pH, c.pH - 9.2) + Math.max(0, c.temperature - 32) / 4;
      p.age += 1;
      p.sickness = clamp(p.sickness + (stress > 0 ? stress * 0.0005 : -0.0003));
      p.health = clamp(p.health + (stress > 0 ? -stress * 0.00015 : 0.00008));
      p.isSick = p.sickness >= 0.35;
      const vigor = p.health * (1 - p.sickness * 0.7);
      p.effectiveness = (0.12 + p.growthProgress * 0.88) * vigor * crowding;
      p.condition = p.isSick ? 'Water stress' : plantLight < 0.01 ? 'Night · resting' :
        nutrient < 0.15 ? 'Nitrogen limited' : crowding < 0.65 ? 'Crowded' :
        plantLight < light * 0.5 ? 'Shaded' : p.growthProgress < 0.2 ? 'Establishing' : 'Growing well';
      return { p, spec, temperature, plantLight, crowding, vigor,
        demand: spec.nitrateAbsorption * 1000 / volume * p.effectiveness * plantLight * nutrient * temperature };
    });
    // Share a limited nutrient pool proportionally; planting order gives no advantage.
    const demand = rates.reduce((sum, r) => sum + r.demand, 0);
    const nh4 = Math.min(c.ammonia, demand);
    const no3 = Math.min(c.nitrate, Math.max(0, demand - nh4));
    c.ammonia -= nh4;
    c.nitrate -= no3;
    // First-order charge balance for ammonium/nitrate assimilation (mg CaCO3 per mg N).
    c.alkalinity = Math.max(0, c.alkalinity + (no3 - nh4) * 50 / 14);
    const availability = demand > 0 ? (nh4 + no3) / demand : 0;
    let oxygen = 0, respiration = 0;
    for (const r of rates) {
      const { p, spec } = r;
      const share = demand > 0 ? r.demand / demand : 0;
      p.ammoniaRate = nh4 * share * volume;
      p.nitrateRate = no3 * share * volume;
      p.nitrogenStored += p.ammoniaRate + p.nitrateRate;
      // Tissue turnover returns stored nitrogen to the detritus pool, conserving N.
      const shed = p.nitrogenStored * (0.000005 + p.sickness * 0.00008);
      p.nitrogenStored -= shed;
      c.detritus += shed / volume;
      // Stage days are biological growth time; daylight compensation averages to one
      // over a full unshaded day. No independent wall-clock growth in PlantSystem.
      const growth = Math.PI * r.plantLight * nutrient * availability * r.temperature * r.vigor * r.crowding;
      p.growthProgress = clamp(p.growthProgress + growth / (spec.stageDays[spec.stageDays.length - 1] * 1440));
      p.growthStage = plantStage(p.growthProgress, spec.stageDays);
      const production = spec.doProduction * spec.waterOxygenFraction * 1000 / volume
        * p.effectiveness * r.plantLight * (0.1 + nutrient * 0.9) * r.temperature;
      const consumption = spec.respiration * 1000 / volume * p.effectiveness * temperatureFactor;
      oxygen += production;
      respiration += consumption;
      p.oxygenRate = (production - consumption) * volume;
    }
    // Aquatic photosynthesis cannot consume more inorganic carbon than exists.
    const actualOxygen = Math.min(oxygen, Math.max(0, c.inorganicCarbon - 0.00001) * 32);
    const carbonScale = oxygen > 0 ? actualOxygen / oxygen : 1;
    if (carbonScale < 1) {
      for (const r of rates) {
        const consumption = r.spec.respiration * r.p.effectiveness * temperatureFactor;
        r.p.oxygenRate = (r.p.oxygenRate + consumption * 1000) * carbonScale - consumption * 1000;
      }
    }
    c.dissolvedOxygen += actualOxygen;
    c.inorganicCarbon -= actualOxygen / 32;
    return respiration;
  }

  _updateFishStress(c: Chemistry) {
    const s = this.cfg.simulation.fishStressThreshold;
    const toxic = c.ammonia * ammoniaFraction(c.pH, c.temperature);
    for (const f of this.storage.getFish()) {
      const load = Math.max(0, toxic - s.ammonia) * 10 + Math.max(0, c.nitrite - s.nitrite) * 2
        + Math.max(0, c.nitrate - s.nitrate) * 0.02 + Math.max(0, s.pH_low - c.pH, c.pH - s.pH_high)
        + Math.max(0, s.do_low - c.dissolvedOxygen);
      f.age = (f.age ?? 0) + 1;
      f.stress = clamp((f.stress ?? 0) + (load > 0 ? load * 0.001 : -0.001));
    }
  }

  getAnnotatedChemistry() {
    const c = this.storage.getChemistry();
    const t = this.cfg.thresholds;
    const freeAmmonia = c.ammonia * ammoniaFraction(c.pH, c.temperature);
    const status = (n: number, ideal: number, warn: number) => n <= ideal ? 'ideal' : n <= warn ? 'warning' : 'critical';
    return { ...c, freeAmmonia, light: this.getLight(), coverage: this.getCoverage(), saturation: oxygenSaturation(c.temperature),
      statuses: {
        pH: c.pH >= t.pH.ideal[0] && c.pH <= t.pH.ideal[1] ? 'ideal' : c.pH >= t.pH.warning[0] && c.pH <= t.pH.warning[1] ? 'warning' : 'critical',
        ammonia: status(freeAmmonia, t.ammonia.ideal_max, t.ammonia.warning_max),
        nitrite: status(c.nitrite, t.nitrite.ideal_max, t.nitrite.warning_max),
        nitrate: status(c.nitrate, t.nitrate.ideal_max, t.nitrate.warning_max),
        dissolvedOxygen: c.dissolvedOxygen >= t.dissolvedOxygen.ideal_min ? 'ideal' : c.dissolvedOxygen >= t.dissolvedOxygen.warning_min ? 'warning' : 'critical',
        alkalinity: c.alkalinity >= 50 ? 'ideal' : c.alkalinity >= 20 ? 'warning' : 'critical',
      },
    };
  }
}
