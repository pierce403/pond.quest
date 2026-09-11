import test from 'node:test';
import assert from 'node:assert/strict';
import StorageSystem from '../src/systems/StorageSystem';
import EcosystemSystem from '../src/systems/EcosystemSystem';
import species from '../src/data/species';
import FishSystem from '../src/systems/FishSystem';
import PlantSystem from '../src/systems/PlantSystem';
import { ammoniaFraction, carbonFromPH, carbonatePH, daylight, oxygenSaturation } from '../src/utils/water';
import { isoToScreen, screenToIso, subTileToScreen } from '../src/utils/iso';

let saved = new Map<string, string>();
let writes = 0;
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); writes++; },
  removeItem: (key: string) => saved.delete(key),
} });
function pond() {
  saved = new Map(); writes = 0;
  const storage = new StorageSystem(); storage.load();
  return { storage, sim: new EcosystemSystem(storage) };
}
function plant(storage: StorageSystem, name = 'hornwort', x = 1, y = 1) {
  const p = storage.normalizePlant({ id: `${name}-${storage.getPlants().length}`, species: name,
    tileX: x, tileY: y, subX: 1, subY: 1, growthProgress: 1 });
  storage.addPlant(p);
  return storage.getPlants().at(-1)!;
}
function near(a: number, b: number, tolerance = 1e-9) { assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`); }
function nitrogen(storage: StorageSystem) {
  const c = storage.getChemistry();
  const volume = storage.getPond().width * storage.getPond().height * 1000;
  return (c.ammonia + c.nitrite + c.nitrate + c.detritus) * volume
    + storage.getPlants().reduce((sum, p) => sum + p.nitrogenStored, 0);
}

test('freshwater saturation falls with temperature; Emerson fraction matches published table', () => {
  near(oxygenSaturation(20), 9.02, 0.03);
  assert.ok(oxygenSaturation(10) > oxygenSaturation(20));
  assert.ok(oxygenSaturation(20) > oxygenSaturation(30));
  near(ammoniaFraction(7.4, 20), 0.0098, 0.0002);
  assert.ok(ammoniaFraction(8.4, 20) > ammoniaFraction(7.4, 20) * 8);
  assert.ok(ammoniaFraction(8, 30) > ammoniaFraction(8, 20));
});
test('carbonate state round-trips pH; consuming buffer or adding CO2 acidifies water', () => {
  for (const pH of [6, 7.4, 8.5, 9]) for (const alkalinity of [20, 100, 200]) {
    near(carbonatePH(carbonFromPH(pH, alkalinity), alkalinity), pH, 1e-6);
  }
  const carbon = carbonFromPH(7.4, 100);
  assert.ok(carbonatePH(carbon, 90) < 7.4);
  assert.ok(carbonatePH(carbon + 0.1, 100) < 7.4);
});
test('two-step nitrification conserves nitrogen and pays exact oxygen/alkalinity costs', () => {
  const { storage, sim } = pond();
  const c = { ...storage.getChemistry(), ammonia: 2, nitrite: 1, nitrate: 3, bacteriaLevel: 1, nitriteBacteriaLevel: 1 };
  const before = { ...c };
  sim._nitrify(c);
  const aob = before.ammonia - c.ammonia;
  const nob = c.nitrate - before.nitrate;
  assert.ok(aob > 0 && nob > 0);
  near(c.ammonia + c.nitrite + c.nitrate, 6);
  near(before.dissolvedOxygen - c.dissolvedOxygen, aob * 3.43 + nob * 1.14);
  near(before.alkalinity - c.alkalinity, aob * 7.14);
});
test('nitrification is limited by oxygen and buffer; enormous TAN cannot overdraw either', () => {
  const { storage, sim } = pond();
  for (const unavailable of ['dissolvedOxygen', 'alkalinity']) {
    const c = { ...storage.getChemistry(), ammonia: 100, bacteriaLevel: 1, [unavailable]: 0 };
    sim._nitrify(c); near(c.ammonia, 100);
  }
  const c = { ...storage.getChemistry(), ammonia: 1e8, nitrite: 1e8, dissolvedOxygen: 0.01, alkalinity: 0.01, bacteriaLevel: 1, nitriteBacteriaLevel: 1 };
  sim._nitrify(c);
  assert.ok(c.dissolvedOxygen >= -1e-12 && c.alkalinity >= -1e-12);
});
test('hornwort oxygenates in daylight and respires at night; emergent leaves mostly exchange with air', () => {
  const { storage, sim } = pond();
  const h = plant(storage);
  const c = { ...storage.getChemistry() };
  sim._updatePlants(c, 16000, 1, 0, 1);
  assert.ok(h.oxygenRate > 0);
  const hornwortRate = h.oxygenRate;
  sim._updatePlants(c, 16000, 0, 0, 1);
  assert.ok(h.oxygenRate < 0); near(h.nitrateRate, 0);
  storage.removePlant(h.id);
  const lily = plant(storage, 'waterlily');
  sim._updatePlants(c, 16000, 1, 0, 1);
  assert.ok(lily.oxygenRate < hornwortRate * 0.2);
  near(daylight(960), 0); // midnight, since day starts at 08:00
});
test('plant uptake is bounded, shares scarce nitrogen, and conserves dissolved + tissue + detrital N', () => {
  const { storage, sim } = pond();
  plant(storage); plant(storage);
  storage.setChemistry({ ammonia: 0.000001, nitrate: 0.000001 });
  const total = nitrogen(storage);
  sim._simulate();
  near(nitrogen(storage), total, 1e-6);
  const [a, b] = storage.getPlants();
  near(a.ammoniaRate, b.ammoniaRate); near(a.nitrateRate, b.nitrateRate);
  assert.ok(storage.getChemistry().ammonia >= 0 && storage.getChemistry().nitrate >= 0);
});
test('no dissolved nitrogen means no growth; shade and crowding reduce productivity', () => {
  const { storage, sim } = pond();
  const p = plant(storage); p.growthProgress = 0.3;
  const c = { ...storage.getChemistry(), nitrate: 0, ammonia: 0 };
  sim._updatePlants(c, 16000, 1, 0, 1); near(p.growthProgress, 0.3);
  c.nitrate = 3; sim._updatePlants(c, 16000, 1, 0, 1);
  const full = p.nitrateRate;
  sim._updatePlants(c, 16000, 1, 0.9, 1); assert.ok(p.nitrateRate < full * 0.3);
  for (let i = 0; i < 7; i++) plant(storage);
  sim._updatePlants(c, 16000, 1, 0, 1); assert.ok(p.nitrateRate < full * 0.6);
});
test('plant growth and chemistry use identical minute steps at every speed and frame cadence', () => {
  const a = pond(); plant(a.storage).growthProgress = 0.2;
  const b = pond(); plant(b.storage).growthProgress = 0.2;
  for (let i = 0; i < 2000; i++) a.sim.update(100);
  b.sim.setSpeed(20);
  for (let i = 0; i < 100; i++) b.sim.update(100);
  near(a.storage.getGameTime().totalMinutes, b.storage.getGameTime().totalMinutes);
  near(a.storage.getChemistry().nitrate, b.storage.getChemistry().nitrate);
  near(a.storage.getPlants()[0].growthProgress, b.storage.getPlants()[0].growthProgress);
  b.sim.paused = true; const before = b.storage.getGameTime().totalMinutes;
  b.sim.update(60000); near(b.storage.getGameTime().totalMinutes, before);
  b.sim.paused = false; b.sim.update(60000);
  assert.ok(b.storage.getGameTime().totalMinutes - before <= 50);
});
test('legacy saves deep-merge new chemistry fields without replacing pond, fish or growth', () => {
  pond();
  saved.set('pondquest_v1', JSON.stringify({ _version: 1, pond: { name: 'Dean’s pond' },
    chemistry: { pH: 7.9, ammonia: 0.3, nitrate: 0, bacteriaLevel: 0.4 },
    fish: [{ id: 'koi-1', species: 'koi', x: 1, y: 2, name: 'Sakura' }],
    plants: [{ id: 'lily-1', species: 'waterlily', tileX: 2, tileY: 2, subX: 0, subY: 0, growthProgress: 0.8 }] }));
  const s = new StorageSystem(); s.load();
  assert.equal(s.getPond().name, 'Dean’s pond');
  assert.equal(s.getFish()[0].name, 'Sakura');
  near(s.getPlants()[0].growthProgress, 0.8);
  near(s.getChemistry().nitrate, 0); near(s.getChemistry().nitriteBacteriaLevel, 0.4);
  near(carbonatePH(s.getChemistry().inorganicCarbon, s.getChemistry().alkalinity), 7.9, 1e-6);
  assert.equal(s.state._version, 2); assert.equal(s.isNewPond, false);
});
test('intentionally empty saved ponds remain empty; save writes are batched and flushable', () => {
  const { storage, sim } = pond(); storage.save();
  writes = 0;
  for (let i = 0; i < 100; i++) sim._simulate();
  assert.equal(writes, 0); storage.flush(); assert.equal(writes, 1);
  const restored = new StorageSystem(); restored.load();
  assert.equal(restored.isNewPond, false);
  assert.equal(restored.getPlants().length + restored.getFish().length, 0);
});
test('all sub-tile centers round-trip into the intended cell, including the far pond edges', () => {
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let sx = 0; sx < 4; sx++) for (let sy = 0; sy < 4; sy++) {
    const screen = subTileToScreen(x, y, sx, sy, 500, 300);
    const iso = screenToIso(screen.x, screen.y, 500, 300);
    assert.equal(Math.floor(iso.isoX), x); assert.equal(Math.floor(iso.isoY), y);
    assert.equal(Math.floor((iso.isoX - x) * 4), sx); assert.equal(Math.floor((iso.isoY - y) * 4), sy);
    const moved = isoToScreen(iso.isoX, iso.isoY, 200, 100);
    near(moved.x, screen.x - 300); near(moved.y, screen.y - 200);
  }
});
test('45-day planted pond stays finite, conserves nitrogen and makes progress', () => {
  const { storage, sim } = pond();
  for (const name of ['koi', 'koi', 'goldfish']) storage.addFish({ id: String(storage.getFish().length), species: name, x: 1, y: 1 });
  for (const name of ['lotus', 'cattail', 'waterlily', 'hornwort']) plant(storage, name).growthProgress = 0.08;
  const before = nitrogen(storage);
  let addedN = 0;
  for (let minute = 0; minute < 45 * 1440; minute++) {
    sim._simulate();
    const c = storage.getChemistry();
    const metabolism = Math.pow(2, (c.temperature - 20) / 10);
    addedN += (species.fish.koi.wasteRate * 2 + species.fish.goldfish.wasteRate) * 1000 * metabolism;
    for (const [key, value] of Object.entries(c)) assert.ok(Number.isFinite(value) && value >= -1e-9, `${key}: ${value}`);
  }
  near(nitrogen(storage), before + addedN, 1e-4);
  assert.ok(storage.getPlants().every(p => p.growthProgress > 0.5));
  assert.ok(storage.getChemistry().dissolvedOxygen > 5);
  assert.ok(storage.getChemistry().pH > 6.5 && storage.getChemistry().pH < 8.8);
});

test('expanding a pond dilutes fish inputs without accelerating gas exchange per litre', () => {
  const a = pond(), b = pond();
  b.storage.getPond().width = 8;
  for (const s of [a.storage, b.storage]) {
    s.addFish({ id: 'f', species: 'koi', x: 1, y: 1 });
    s.setChemistry({ bacteriaLevel: 0, nitriteBacteriaLevel: 0 });
  }
  a.sim._simulate(); b.sim._simulate();
  near(a.storage.getChemistry().ammonia, b.storage.getChemistry().ammonia * 2, 1e-9);
  const c = pond(), d = pond();
  d.storage.getPond().width = 8;
  c.sim._simulate(); d.sim._simulate();
  near(c.storage.getChemistry().dissolvedOxygen, d.storage.getChemistry().dissolvedOxygen);
});


test('plant placement enforces bounds and edge habitat through the shared system API', () => {
  const { storage } = pond();
  const plants = Object.create(PlantSystem.prototype) as PlantSystem;
  plants.storage = storage; plants.speciesDefs = species.plants;
  plants.bounds = { gridW: 4, gridH: 4 };
  assert.equal(plants.canPlacePlantAt(-1, 0, 0, 0), false);
  assert.equal(plants.canPlacePlantAt(0, 0, 4, 0), false);
  assert.equal(plants.canPlacePlantAt(0.5, 0, 0, 0), false);
  assert.equal(plants.findPlacementSlot(1, 1, 0, 0, null, 'cattail'), null);
  assert.ok(plants.findPlacementSlot(0, 1, 0, 0, null, 'cattail'));
  plant(storage, 'lotus', 1, 1);
  assert.equal(plants.canPlacePlantAt(1, 1, 1, 1), false);
});

test('coincident fish separate instead of being pulled further into an overlap', () => {
  const { storage } = pond();
  (globalThis as any).Phaser = { Math: { Clamp: (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n)) } };
  const fish = Object.create(FishSystem.prototype) as FishSystem;
  fish.storage = storage; fish.speciesDefs = species.fish; fish.bounds = { gridW: 4, gridH: 4 };
  storage.addFish({ id: 'a', species: 'koi', x: 2, y: 2, vx: 0, vy: 0, headingAngle: 0 });
  storage.addFish({ id: 'b', species: 'koi', x: 2, y: 2, vx: 0, vy: 0, headingAngle: 0 });
  fish._resolveFishCollisions(storage.getFish());
  const [a, b] = storage.getFish();
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= fish._getCollisionRadius(species.fish.koi) * 2 - 1e-6);
});

test('jump motion is not overwritten by normal fish positioning in the frame loop', () => {
  const { storage } = pond();
  storage.addFish({ id: 'jumping', species: 'koi', x: 2, y: 2, jumping: true });
  const fish = Object.create(FishSystem.prototype) as FishSystem;
  fish.storage = storage; fish._visualRefreshAccum = 0; fish._infoPanelFishId = null;
  let jumps = 0, positions = 0;
  fish._updateJump = () => { jumps++; };
  fish._positionFishContainer = () => { positions++; };
  fish._resolveFishCollisions = () => {};
  fish._updateSplashes = () => {};
  fish.update(16);
  assert.equal(jumps, 1); assert.equal(positions, 0);
});
