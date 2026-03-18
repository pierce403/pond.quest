/**
 * PlantSystem — manages plant entities: placement, growth, and rendering.
 *
 * Plants grow through stages over time. At each stage, DO production and
 * nitrate absorption rates increase (handled in EcosystemSystem).
 * Plants are placed at sub-tile positions within the 4×4 macro grid.
 */

import speciesDefs from '../data/species.js';
import { generateId } from './StorageSystem.js';
import { subTileToScreen, isoToScreen, HALF_W, HALF_H } from '../utils/iso.js';

// Growth tick: advance plants every in-game day (1440 minutes)
const GROWTH_RATE_PER_MINUTE = 1 / 1440;

export default class PlantSystem {
  constructor(scene, storage, pondBounds) {
    this.scene = scene;
    this.storage = storage;
    this.bounds = pondBounds;
    this.speciesDefs = speciesDefs.plants;

    this._plantObjects = new Map(); // plantId → { gfx, container }
    this._growthAccum = 0;
  }

  /**
   * Place a new plant at the given macro tile and sub-tile position.
   */
  placePlant(species, tileX, tileY, subX, subY) {
    const spec = this.speciesDefs[species];
    if (!spec) return null;

    const id = generateId();
    const plantData = {
      id, species,
      tileX, tileY, subX, subY,
      growthStage: 0,
      growthProgress: 0.0, // 0.0 → 1.0 (fully mature)
    };
    this.storage.addPlant(plantData);
    this._createPlantSprite(plantData, spec);
    return id;
  }

  _createPlantSprite(plantData, spec) {
    const container = this.scene.add.container(0, 0);
    const gfx = this.scene.add.graphics();
    this._drawPlant(gfx, spec, plantData);
    container.add(gfx);

    // Depth: plants are above tiles but below fish
    const depth = 5 + plantData.tileX + plantData.tileY + plantData.subX * 0.1 + plantData.subY * 0.1;
    container.setDepth(depth);

    this._plantObjects.set(plantData.id, { container, gfx, spec });
    this._positionPlantContainer(plantData);
  }

  _drawPlant(gfx, spec, plantData) {
    gfx.clear();
    const stage = plantData.growthStage;
    const progress = plantData.growthProgress;
    // Scale plant size with growth progress (0.3 → 1.0)
    const scale = 0.3 + progress * 0.7;

    if (spec.padColor) {
      // Floating pad plants (lotus, waterlily): pad + stem + flower
      // Stem
      gfx.lineStyle(1.5, spec.stemColor, 0.9);
      gfx.beginPath();
      gfx.moveTo(0, 0);
      gfx.lineTo(0, -16 * scale);
      gfx.strokePath();

      // Pad
      gfx.fillStyle(spec.padColor, 0.9);
      gfx.fillEllipse(0, -16 * scale, 18 * scale, 10 * scale);

      // Flower (only at stage 2+)
      if (stage >= 2) {
        const petalCount = 6;
        for (let i = 0; i < petalCount; i++) {
          const angle = (i / petalCount) * Math.PI * 2;
          const px = Math.cos(angle) * 6 * scale;
          const py = -18 * scale + Math.sin(angle) * 4 * scale;
          gfx.fillStyle(spec.color, 0.95);
          gfx.fillEllipse(px, py, 7 * scale, 5 * scale);
        }
        // Stigma center
        gfx.fillStyle(0xf4e04d, 1);
        gfx.fillCircle(0, -18 * scale, 3 * scale);
      }
    } else if (spec.name === 'Cattail' || spec.name === 'Hornwort') {
      // Emergent / submerged plants: reeds
      const reedCount = Math.max(1, Math.floor(stage + 1));
      for (let i = 0; i < reedCount; i++) {
        const ox = (i - (reedCount - 1) / 2) * 5 * scale;
        const h = (12 + i * 4) * scale;
        gfx.lineStyle(2 * scale, spec.stemColor, 0.95);
        gfx.beginPath();
        gfx.moveTo(ox, 0);
        gfx.lineTo(ox, -h);
        gfx.strokePath();

        // Cattail head
        if (spec.name === 'Cattail' && stage >= 1) {
          gfx.fillStyle(spec.color, 0.9);
          gfx.fillEllipse(ox, -h * 0.8, 4 * scale, 10 * scale);
        } else if (spec.name === 'Hornwort') {
          // Feathery tips
          for (let j = 0; j < 4; j++) {
            const tipAngle = (j / 4) * Math.PI - Math.PI / 2;
            gfx.lineStyle(1, spec.color, 0.8);
            gfx.beginPath();
            gfx.moveTo(ox, -h);
            gfx.lineTo(ox + Math.cos(tipAngle) * 6 * scale, -h + Math.sin(tipAngle) * 4 * scale);
            gfx.strokePath();
          }
        }
      }
    }
  }

  _positionPlantContainer(plantData) {
    const obj = this._plantObjects.get(plantData.id);
    if (!obj) return;
    const screen = subTileToScreen(
      plantData.tileX, plantData.tileY,
      plantData.subX, plantData.subY,
      this.bounds.originX, this.bounds.originY
    );
    obj.container.setPosition(screen.x, screen.y);
  }

  /**
   * Update plant growth — called every Phaser frame.
   */
  update(delta) {
    this._growthAccum += delta;
    // Grow once per in-game minute (matches EcosystemSystem tick rate)
    if (this._growthAccum < 1000) return; // 1000ms = 1 tick
    this._growthAccum -= 1000;

    const plants = this.storage.getPlants();
    plants.forEach(p => {
      const spec = this.speciesDefs[p.species];
      if (!spec) return;

      // Advance growth progress
      p.growthProgress = Math.min(1.0, p.growthProgress + spec.growthRate);

      // Advance growth stage based on stage thresholds (stageDays converted to progress)
      const totalDays = spec.stageDays[spec.stageDays.length - 1];
      const progressPerDay = 1.0 / totalDays;
      const dayEquivalent = p.growthProgress / progressPerDay;
      let newStage = 0;
      spec.stageDays.forEach((d, i) => {
        if (dayEquivalent >= d) newStage = i;
      });

      if (newStage !== p.growthStage || p.growthProgress !== p.growthProgress) {
        p.growthStage = newStage;
        this.storage.updatePlant(p.id, { growthProgress: p.growthProgress, growthStage: p.growthStage });
        // Redraw at new growth size
        const obj = this._plantObjects.get(p.id);
        if (obj) this._drawPlant(obj.gfx, spec, p);
      }
    });
  }

  /** Restore plants from saved state */
  restoreFromStorage() {
    this.storage.getPlants().forEach(p => {
      const spec = this.speciesDefs[p.species];
      if (spec) this._createPlantSprite(p, spec);
    });
  }

  removePlant(id) {
    const obj = this._plantObjects.get(id);
    if (obj) { obj.container.destroy(); this._plantObjects.delete(id); }
    this.storage.removePlant(id);
  }
}
