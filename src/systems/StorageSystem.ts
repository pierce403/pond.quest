import chemDefs from '../data/chemistry';
import speciesDefs from '../data/species';
import type { Chemistry, FishRecord, PlantRecord, PondState } from '../data/model';
import { carbonFromPH, clamp, finite, plantStage } from '../utils/water';

const STORAGE_KEY = 'pondquest_v1'; // retain the key so existing ponds migrate in place
const SCHEMA_VERSION = 2;

export default class StorageSystem {
  state!: PondState;
  isNewPond = false;
  private lastSave = 0;
  private dirty = false;

  load() {
    const defaults = this._initDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.isNewPond = true;
        this.state = defaults;
        return this.state;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid pond');
      const chem = { ...defaults.chemistry, ...parsed.chemistry } as Chemistry;
      for (const key of Object.keys(defaults.chemistry) as (keyof Chemistry)[]) {
        chem[key] = Math.max(0, finite(chem[key], defaults.chemistry[key]));
      }
      chem.pH = clamp(chem.pH, 4, 11);
      chem.temperature = clamp(chem.temperature, 0, 35);
      chem.bacteriaLevel = clamp(chem.bacteriaLevel);
      chem.nitriteBacteriaLevel = clamp(finite(parsed.chemistry?.nitriteBacteriaLevel, chem.bacteriaLevel));
      if (!Number.isFinite(parsed.chemistry?.inorganicCarbon)) {
        chem.inorganicCarbon = carbonFromPH(chem.pH, chem.alkalinity);
      }
      const pond = { ...defaults.pond, ...parsed.pond };
      pond.width = Math.round(clamp(finite(pond.width, 4), 1, 32));
      pond.height = Math.round(clamp(finite(pond.height, 4), 1, 32));
      this.state = {
        _version: SCHEMA_VERSION,
        pond,
        tiles: Array.isArray(parsed.tiles) ? parsed.tiles : defaults.tiles,
        fish: Array.isArray(parsed.fish) ? parsed.fish.filter((f: FishRecord) =>
          f && typeof f.id === 'string' && f.species in speciesDefs.fish && Number.isFinite(f.x) && Number.isFinite(f.y)) : [],
        plants: Array.isArray(parsed.plants) ? parsed.plants.filter((p: PlantRecord) =>
          p && typeof p.id === 'string' && p.species in speciesDefs.plants &&
          [p.tileX, p.tileY, p.subX, p.subY].every(Number.isFinite)).map((p: PlantRecord) => this.normalizePlant(p)) : [],
        chemistry: chem,
        gameTime: { totalMinutes: Math.max(0, finite(parsed.gameTime?.totalMinutes, 0)), dayLength: 1440 },
      };
      this.dirty = true;
      return this.state;
    } catch (e) {
      console.warn('[StorageSystem] Could not read pond:', e);
      this.isNewPond = true;
      this.state = defaults;
      return this.state;
    }
  }

  normalizePlant(p: Partial<PlantRecord> & Pick<PlantRecord, 'id' | 'species' | 'tileX' | 'tileY' | 'subX' | 'subY'>): PlantRecord {
    const spec = speciesDefs.plants[p.species as keyof typeof speciesDefs.plants];
    const progress = clamp(finite(p.growthProgress, 0));
    return {
      ...p,
      growthProgress: progress,
      growthStage: plantStage(progress, spec.stageDays),
      age: Math.max(0, finite(p.age, 0)),
      health: clamp(finite(p.health, 1)),
      sickness: clamp(finite(p.sickness, 0)),
      effectiveness: clamp(finite(p.effectiveness, 0.1)),
      oxygenRate: finite(p.oxygenRate, 0),
      nitrateRate: Math.max(0, finite(p.nitrateRate, 0)),
      ammoniaRate: Math.max(0, finite(p.ammoniaRate, 0)),
      nitrogenStored: Math.max(0, finite(p.nitrogenStored, 40 + progress * 600)),
      isSick: p.isSick ?? false,
      condition: p.condition ?? 'Establishing',
    };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.lastSave = Date.now();
      this.dirty = false;
    } catch (e) {
      console.warn('[StorageSystem] Could not save pond:', e);
    }
  }
  flush() { if (this.dirty) this.save(); }
  reset() {
    this.state = this._initDefaults();
    this.isNewPond = true;
    this.save();
    return this.state;
  }
  getPond() { return this.state.pond; }
  getTiles() { return this.state.tiles; }
  getFish() { return this.state.fish; }
  getPlants() { return this.state.plants; }
  getChemistry() { return this.state.chemistry; }
  getGameTime() { return this.state.gameTime; }
  setChemistry(chem: Partial<Chemistry>) { Object.assign(this.state.chemistry, chem); this.dirty = true; }
  addFish(f: FishRecord) { this.state.fish.push(f); this.save(); }
  removeFish(id: string) { this.state.fish = this.state.fish.filter(f => f.id !== id); this.save(); }
  updateFish(id: string, updates: Partial<FishRecord>) {
    const fish = this.state.fish.find(f => f.id === id);
    if (fish) { Object.assign(fish, updates); this.dirty = true; }
  }
  addPlant(p: PlantRecord) { this.state.plants.push(this.normalizePlant(p)); this.save(); }
  removePlant(id: string) { this.state.plants = this.state.plants.filter(p => p.id !== id); this.save(); }
  updatePlant(id: string, updates: Partial<PlantRecord>) {
    const plant = this.state.plants.find(p => p.id === id);
    if (plant) { Object.assign(plant, updates); this.dirty = true; }
  }
  advanceGameTime(minutes: number) { this.state.gameTime.totalMinutes += minutes; this.dirty = true; }
  tickSave(chem: Chemistry, minutes: number) {
    this.setChemistry(chem);
    this.advanceGameTime(minutes);
    // One serialization per two wall-clock seconds, independent of simulation speed.
    if (Date.now() - this.lastSave >= 2000) this.save();
  }
  private _initDefaults(): PondState {
    return {
      _version: SCHEMA_VERSION,
      pond: { width: 4, height: 4, name: 'My Pond', createdAt: Date.now() },
      tiles: Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4), substrate: 'clay', moisture: 1 })),
      fish: [], plants: [],
      chemistry: { ...chemDefs.initial, inorganicCarbon: carbonFromPH(chemDefs.initial.pH, chemDefs.initial.alkalinity), lastTick: Date.now() },
      gameTime: { totalMinutes: 0, dayLength: 1440 },
    };
  }
}
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
