/**
 * StorageSystem — localStorage adapter with MUD-compatible schema.
 *
 * All state is stored as flat table-like structures so that when we migrate
 * to MUD (Ethereum), each table maps 1:1 to a MUD World table.
 * No nested objects deeper than one level — matches MUD's field model.
 *
 * Schema version allows future migrations without data loss.
 */

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'pondquest_v1';

const DEFAULT_STATE = {
  _version: SCHEMA_VERSION,
  pond: { width: 4, height: 4, name: 'My Pond', createdAt: Date.now() },
  tiles: [], // { x, y, substrate, moisture }
  fish: [],  // { id, species, x, y, age, health, stress }
  plants: [], // { id, species, tileX, tileY, subX, subY, growthStage, growthProgress }
  chemistry: {
    pH: 7.4,
    ammonia: 0.0,
    nitrite: 0.0,
    nitrate: 0.0,
    dissolvedOxygen: 8.5,
    bacteriaLevel: 0.0,
    lastTick: Date.now(),
  },
  gameTime: {
    totalMinutes: 0,
    dayLength: 1440, // in-game minutes per day
  },
};

export default class StorageSystem {
  constructor() {
    this.state = null;
  }

  /** Load state from localStorage, initializing defaults if absent or corrupt */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.state = this._initDefaults();
        return this.state;
      }
      const parsed = JSON.parse(raw);
      // Future: migrate if parsed._version < SCHEMA_VERSION
      this.state = { ...DEFAULT_STATE, ...parsed };
      return this.state;
    } catch (e) {
      console.warn('[StorageSystem] Corrupt save, reinitializing:', e);
      this.state = this._initDefaults();
      return this.state;
    }
  }

  /** Persist current state to localStorage */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('[StorageSystem] Failed to save:', e);
    }
  }

  /** Reset to a fresh pond */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this._initDefaults();
    this.save();
    return this.state;
  }

  // ── Table accessors (MUD-style) ──────────────────────────────────────────

  getPond() { return this.state.pond; }
  getTiles() { return this.state.tiles; }
  getFish() { return this.state.fish; }
  getPlants() { return this.state.plants; }
  getChemistry() { return this.state.chemistry; }
  getGameTime() { return this.state.gameTime; }

  setChemistry(chem) {
    this.state.chemistry = { ...this.state.chemistry, ...chem };
  }

  addFish(fishData) {
    this.state.fish.push(fishData);
    this.save();
  }

  removeFish(id) {
    this.state.fish = this.state.fish.filter(f => f.id !== id);
    this.save();
  }

  updateFish(id, updates) {
    const fish = this.state.fish.find(f => f.id === id);
    if (fish) Object.assign(fish, updates);
  }

  addPlant(plantData) {
    this.state.plants.push(plantData);
    this.save();
  }

  removePlant(id) {
    this.state.plants = this.state.plants.filter(p => p.id !== id);
    this.save();
  }

  updatePlant(id, updates) {
    const plant = this.state.plants.find(p => p.id === id);
    if (plant) Object.assign(plant, updates);
  }

  advanceGameTime(minutes) {
    this.state.gameTime.totalMinutes += minutes;
  }

  /** Save chemistry + time together (called each tick) */
  tickSave(chem, minutes) {
    this.setChemistry(chem);
    this.advanceGameTime(minutes);
    this.save();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _initDefaults() {
    const state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    // Generate initial 4x4 tile grid
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        state.tiles.push({ x, y, substrate: 'clay', moisture: 1.0 });
      }
    }
    state.chemistry.lastTick = Date.now();
    return state;
  }
}

/** Utility: generate a simple UUID-ish ID */
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
