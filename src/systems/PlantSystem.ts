/**
 * PlantSystem — manages plant entities: placement, growth, rendering, and info.
 *
 * Plants now track health and sickness alongside growth. Dirty water lowers
 * their effectiveness, which the EcosystemSystem uses to scale oxygen
 * production and nitrate absorption.
 */

import speciesDefs from '../data/species';
import { generateId } from './StorageSystem';
import { subTileToScreen } from '../utils/iso';

function mixColor(a: number, b: number, t: number) {
  const amt = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * amt);
  const rg = Math.round(ag + (bg - ag) * amt);
  const rb = Math.round(ab + (bb - ab) * amt);
  return (rr << 16) | (rg << 8) | rb;
}

export default class PlantSystem {
  declare scene: Phaser.Scene;
  declare storage: any;
  declare bounds: any;
  declare speciesDefs: any;
  declare _plantObjects: Map<string, any>;
  declare _growthAccum: number;
  declare _infoPanel: HTMLElement | null;
  declare _infoPanelPlantId: string | null;

  constructor(scene: Phaser.Scene, storage: any, pondBounds: any) {
    this.scene = scene;
    this.storage = storage;
    this.bounds = pondBounds;
    this.speciesDefs = speciesDefs.plants;

    this._plantObjects = new Map();
    this._growthAccum = 0;
    this._infoPanel = null;
    this._infoPanelPlantId = null;
    this._buildInfoPanel();
  }

  _getEffectiveStats(plantData: any, spec: any) {
    const maturity = Math.max(0.2, plantData.growthProgress ?? 0);
    const health = plantData.health ?? 1;
    const sickness = plantData.sickness ?? 0;
    const effectiveness = plantData.effectiveness ?? Math.max(
      0.08,
      Math.min(1, maturity * (0.35 + health * 0.65) * (1 - sickness * 0.7))
    );

    return {
      effectiveness,
      oxygenRate: plantData.oxygenRate ?? spec.doProduction * effectiveness,
      nitrateRate: plantData.nitrateRate ?? spec.nitrateAbsorption * effectiveness,
    };
  }

  _ensurePlantState(plantData: any, spec: any) {
    const updates: any = {};
    if (!Number.isFinite(plantData.growthStage)) {
      plantData.growthStage = 0;
      updates.growthStage = 0;
    }
    if (!Number.isFinite(plantData.growthProgress)) {
      plantData.growthProgress = 0;
      updates.growthProgress = 0;
    }
    if (!Number.isFinite(plantData.age)) {
      plantData.age = 0;
      updates.age = 0;
    }
    if (!Number.isFinite(plantData.health)) {
      plantData.health = 1;
      updates.health = 1;
    }
    if (!Number.isFinite(plantData.sickness)) {
      plantData.sickness = 0;
      updates.sickness = 0;
    }

    const stats = this._getEffectiveStats(plantData, spec);
    if (!Number.isFinite(plantData.effectiveness)) {
      plantData.effectiveness = stats.effectiveness;
      updates.effectiveness = stats.effectiveness;
    }
    if (!Number.isFinite(plantData.oxygenRate)) {
      plantData.oxygenRate = stats.oxygenRate;
      updates.oxygenRate = stats.oxygenRate;
    }
    if (!Number.isFinite(plantData.nitrateRate)) {
      plantData.nitrateRate = stats.nitrateRate;
      updates.nitrateRate = stats.nitrateRate;
    }
    if (typeof plantData.isSick !== 'boolean') {
      plantData.isSick = (plantData.sickness ?? 0) >= 0.35;
      updates.isSick = plantData.isSick;
    }

    if (Object.keys(updates).length > 0) {
      this.storage.updatePlant(plantData.id, updates);
    }
  }

  placePlant(species: string, tileX: number, tileY: number, subX: number, subY: number) {
    const spec = this.speciesDefs[species];
    if (!spec) return null;

    const id = generateId();
    const plantData = {
      id,
      species,
      tileX,
      tileY,
      subX,
      subY,
      growthStage: 0,
      growthProgress: 0,
      age: 0,
      health: 1,
      sickness: 0,
      effectiveness: 0.08,
      oxygenRate: spec.doProduction * 0.08,
      nitrateRate: spec.nitrateAbsorption * 0.08,
      isSick: false,
    };

    this.storage.addPlant(plantData);
    this._createPlantSprite(plantData, spec);
    return id;
  }

  _createPlantSprite(plantData: any, spec: any) {
    const container = this.scene.add.container(0, 0);

    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.14);
    shadow.fillEllipse(0, 4, 20, 8);

    const gfx = this.scene.add.graphics();
    this._drawPlant(gfx, spec, plantData);

    const glowRing = this.scene.add.graphics();
    glowRing.lineStyle(2, 0xb7e4c7, 0);
    glowRing.strokeCircle(0, -8, 18);

    container.add([shadow, glowRing, gfx]);
    container.setInteractive(
      new Phaser.Geom.Circle(0, -6, 18),
      Phaser.Geom.Circle.Contains
    );

    container.on('pointerover', () => {
      this.scene.tweens.add({ targets: glowRing, alpha: 0.5, duration: 180 });
    });
    container.on('pointerout', () => {
      this.scene.tweens.add({ targets: glowRing, alpha: 0, duration: 220 });
    });
    container.on('pointerdown', () => {
      this._openInfoPanel(plantData.id);
    });

    this._plantObjects.set(plantData.id, { container, shadow, glowRing, gfx, spec });
    this._positionPlantContainer(plantData);
  }

  _drawPlant(gfx: Phaser.GameObjects.Graphics, spec: any, plantData: any) {
    gfx.clear();

    const stage = plantData.growthStage ?? 0;
    const progress = plantData.growthProgress ?? 0;
    const scale = 0.45 + progress * 0.85;
    const health = plantData.health ?? 1;
    const sickness = plantData.sickness ?? 0;
    const vitality = Math.max(0.25, health * (1 - sickness * 0.6));

    const baseLeafColor = spec.padColor ?? spec.color;
    const leafColor = mixColor(baseLeafColor, 0x7a5c3a, sickness * 0.55);
    const stemColor = mixColor(spec.stemColor ?? spec.color, 0x6a5641, sickness * 0.45);
    const bloomColor = mixColor(spec.color, 0xd8ccb2, (1 - vitality) * 0.45);
    const accentColor = mixColor(spec.secondaryColor ?? spec.color, 0x3f5133, sickness * 0.3);

    gfx.fillStyle(0x0e1a10, 0.12 + (1 - vitality) * 0.08);
    gfx.fillEllipse(0, 2, 18 * scale, 8 * scale);

    if (spec.padColor) {
      const padCount = stage >= 2 ? 2 : 1;
      gfx.lineStyle(1.4, stemColor, 0.85);
      gfx.beginPath();
      gfx.moveTo(0, 2);
      gfx.lineTo(0, -16 * scale);
      gfx.strokePath();

      for (let i = 0; i < padCount; i += 1) {
        const ox = i === 0 ? -5 * scale : 7 * scale;
        const oy = i === 0 ? -10 * scale : -15 * scale;
        const padW = (15 + i * 3) * scale;
        const padH = (8 + i * 1.5) * scale;
        gfx.fillStyle(mixColor(0x102814, leafColor, 0.6), 0.28);
        gfx.fillEllipse(ox + 1.5 * scale, oy + 2 * scale, padW, padH);
        gfx.fillStyle(leafColor, 0.95);
        gfx.fillEllipse(ox, oy, padW, padH);
        gfx.fillStyle(mixColor(leafColor, 0xcbe9d0, 0.22 * vitality), 0.9);
        gfx.fillEllipse(ox - 1.5 * scale, oy - 1 * scale, padW * 0.65, padH * 0.42);
        gfx.lineStyle(1, mixColor(leafColor, 0x1f3b28, 0.42), 0.75);
        gfx.beginPath();
        gfx.moveTo(ox - padW * 0.08, oy);
        gfx.lineTo(ox + padW * 0.2, oy - padH * 0.42);
        gfx.strokePath();
      }

      if (stage >= 1) {
        gfx.lineStyle(1.1, stemColor, 0.82);
        gfx.beginPath();
        gfx.moveTo(0, -12 * scale);
        gfx.lineTo(0, -22 * scale);
        gfx.strokePath();
      }

      if (stage >= 2) {
        const petalCount = stage >= 3 ? 8 : 5;
        const bloomY = -23 * scale;
        for (let i = 0; i < petalCount; i += 1) {
          const angle = (i / petalCount) * Math.PI * 2;
          const px = Math.cos(angle) * 6.5 * scale;
          const py = bloomY + Math.sin(angle) * 4 * scale;
          gfx.fillStyle(bloomColor, 0.96);
          gfx.fillEllipse(px, py, 7 * scale, 4.5 * scale);
        }
        gfx.fillStyle(0xf4dc74, 1);
        gfx.fillCircle(0, bloomY, 2.6 * scale);
      } else if (stage >= 1) {
        gfx.fillStyle(bloomColor, 0.94);
        gfx.fillEllipse(0, -22 * scale, 5 * scale, 8 * scale);
      }
    } else if (spec.name === 'Cattail') {
      const stemCount = 3 + stage;
      for (let i = 0; i < stemCount; i += 1) {
        const ox = (i - (stemCount - 1) / 2) * 4.8 * scale;
        const height = (18 + i * 1.8) * scale;
        const sway = (i % 2 === 0 ? -1 : 1) * scale;

        gfx.lineStyle(2.2 * scale, stemColor, 0.92);
        gfx.beginPath();
        gfx.moveTo(ox, 2);
        gfx.lineTo(ox + sway, -height);
        gfx.strokePath();

        gfx.lineStyle(1.1 * scale, mixColor(leafColor, 0xbedf99, 0.16), 0.8);
        gfx.beginPath();
        gfx.moveTo(ox, -height * 0.4);
        gfx.lineTo(ox - 7 * scale, -height * 0.12);
        gfx.strokePath();
        gfx.beginPath();
        gfx.moveTo(ox + sway * 0.4, -height * 0.62);
        gfx.lineTo(ox + 7 * scale, -height * 0.34);
        gfx.strokePath();

        if (stage >= 1) {
          gfx.fillStyle(mixColor(spec.color, 0x5d4037, sickness * 0.38), 0.94);
          gfx.fillRoundedRect(ox + sway - 1.3 * scale, -height * 0.9, 2.6 * scale, 10 * scale, 2 * scale);
        }
      }
    } else {
      const frondCount = 5 + stage * 2;
      gfx.lineStyle(1.6 * scale, stemColor, 0.88);
      gfx.beginPath();
      gfx.moveTo(0, 2);
      gfx.lineTo(0, -18 * scale);
      gfx.strokePath();

      for (let i = 0; i < frondCount; i += 1) {
        const t = i / Math.max(1, frondCount - 1);
        const baseY = -4 * scale - t * 16 * scale;
        const dir = i % 2 === 0 ? -1 : 1;
        const reach = (8 + stage * 1.6) * scale;
        gfx.lineStyle(1.05 * scale, leafColor, 0.9);
        gfx.beginPath();
        gfx.moveTo(0, baseY);
        gfx.lineTo(dir * reach, baseY - 4 * scale);
        gfx.strokePath();
        for (let j = 0; j < 3; j += 1) {
          const subT = (j + 1) / 4;
          const sx = dir * reach * subT;
          const sy = baseY - 4 * scale * subT;
          gfx.lineStyle(0.75 * scale, accentColor, 0.78);
          gfx.beginPath();
          gfx.moveTo(sx, sy);
          gfx.lineTo(sx + dir * 2.6 * scale, sy - 2 * scale);
          gfx.strokePath();
          gfx.beginPath();
          gfx.moveTo(sx, sy);
          gfx.lineTo(sx + dir * 1.8 * scale, sy + 1.8 * scale);
          gfx.strokePath();
        }
      }
    }

    gfx.setAlpha(0.82 + vitality * 0.18);
  }

  _positionPlantContainer(plantData: any) {
    const obj = this._plantObjects.get(plantData.id);
    if (!obj) return;
    const screen = subTileToScreen(
      plantData.tileX,
      plantData.tileY,
      plantData.subX,
      plantData.subY,
      this.bounds.originX,
      this.bounds.originY
    );
    const depth = 5 + plantData.tileX + plantData.tileY + plantData.subX * 0.1 + plantData.subY * 0.1;
    obj.container.setPosition(screen.x, screen.y);
    obj.container.setDepth(depth);
  }

  update(delta: number) {
    this._growthAccum += delta;
    if (this._growthAccum < 1000) return;
    this._growthAccum -= 1000;

    const plants = this.storage.getPlants();
    let changed = false;

    plants.forEach((plantData: any) => {
      const spec = this.speciesDefs[plantData.species];
      if (!spec) return;
      this._ensurePlantState(plantData, spec);

      const growthFactor = (0.45 + (plantData.health ?? 1) * 0.55) * (1 - (plantData.sickness ?? 0) * 0.55);
      const nextProgress = Math.min(1, (plantData.growthProgress ?? 0) + spec.growthRate * Math.max(0.2, growthFactor));
      const totalDays = spec.stageDays[spec.stageDays.length - 1];
      const dayEquivalent = nextProgress * totalDays;
      let nextStage = 0;
      spec.stageDays.forEach((d: number, i: number) => {
        if (dayEquivalent >= d) nextStage = i;
      });

      if (nextProgress !== plantData.growthProgress || nextStage !== plantData.growthStage) {
        plantData.growthProgress = nextProgress;
        plantData.growthStage = nextStage;
        this.storage.updatePlant(plantData.id, {
          growthProgress: nextProgress,
          growthStage: nextStage,
        });
        changed = true;
      }

      const obj = this._plantObjects.get(plantData.id);
      if (obj) this._drawPlant(obj.gfx, spec, plantData);
      if (this._infoPanelPlantId === plantData.id) this._syncInfoPanelData(plantData);
    });

    if (changed) this.storage.save();
  }

  _buildInfoPanel() {
    const panel = document.createElement('div');
    panel.id = 'plant-info-panel';
    Object.assign(panel.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: '240px',
      background: 'rgba(10, 20, 14, 0.84)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(167, 216, 181, 0.28)',
      borderRadius: '14px',
      padding: '14px 16px 12px',
      zIndex: '210',
      display: 'none',
      fontFamily: 'Georgia, serif',
      color: '#d7eedb',
      boxShadow: '0 6px 28px rgba(0,0,0,0.48)',
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span id="pip-species" style="font-size:11px;color:#8db493;letter-spacing:1px;text-transform:uppercase"></span>
        <button id="pip-close" style="background:none;border:none;color:#8db493;font-size:16px;cursor:pointer;padding:0 2px;line-height:1">×</button>
      </div>
      <div id="pip-name" style="font-size:18px;color:#eef7ef;margin-bottom:10px"></div>
      <div id="pip-stage" style="font-size:11px;color:#a8c9ac;margin-bottom:10px"></div>
      <div id="pip-stats" style="font-size:11px;line-height:1.9"></div>
      <button id="pip-pull"
        style="margin-top:12px;width:100%;padding:7px 0;border-radius:8px;border:1px solid rgba(230,111,81,0.5);
               background:rgba(230,111,81,0.12);color:#f2a889;font-family:Georgia,serif;
               font-size:12px;cursor:pointer;transition:background 0.2s">
        Pull Plant
      </button>`;

    document.getElementById('game-container')!.appendChild(panel);
    this._infoPanel = panel;

    panel.querySelector('#pip-close')!.addEventListener('click', () => this._closeInfoPanel());

    const pullBtn = panel.querySelector('#pip-pull') as HTMLButtonElement;
    pullBtn.addEventListener('mouseenter', () => {
      pullBtn.style.background = 'rgba(230,111,81,0.24)';
    });
    pullBtn.addEventListener('mouseleave', () => {
      pullBtn.style.background = 'rgba(230,111,81,0.12)';
    });
    pullBtn.addEventListener('click', () => {
      if (!this._infoPanelPlantId) return;
      if ((this.scene as any).audio) (this.scene as any).audio.playSfx('sfx_plop');
      this.removePlant(this._infoPanelPlantId);
      this._closeInfoPanel();
    });
  }

  _openInfoPanel(plantId: string) {
    const plantData = this.storage.getPlants().find((x: any) => x.id === plantId);
    if (!plantData || !this._infoPanel) return;
    this._infoPanelPlantId = plantId;
    this._syncInfoPanelData(plantData);
    this._infoPanel.style.display = 'block';
    this._infoPanel.style.opacity = '0';
    this._infoPanel.style.transform = 'translateY(-6px)';
    this._infoPanel.style.transition = 'opacity 0.2s, transform 0.2s';
    requestAnimationFrame(() => {
      if (!this._infoPanel) return;
      this._infoPanel.style.opacity = '1';
      this._infoPanel.style.transform = 'translateY(0)';
    });
  }

  _syncInfoPanelData(plantData: any) {
    if (!this._infoPanel || this._infoPanelPlantId !== plantData.id) return;
    const spec = this.speciesDefs[plantData.species];
    if (!spec) return;

    const stats = this._getEffectiveStats(plantData, spec);
    const healthPct = Math.round((plantData.health ?? 1) * 100);
    const sicknessPct = Math.round((plantData.sickness ?? 0) * 100);
    const ageDays = Math.floor((plantData.age ?? 0) / 1440);
    const healthCol = healthPct > 70 ? '#74c69d' : healthPct > 40 ? '#e9c46a' : '#e76f51';
    const sicknessCol = sicknessPct < 25 ? '#74c69d' : sicknessPct < 60 ? '#e9c46a' : '#e76f51';
    const stageLabel = spec.stages[Math.min(plantData.growthStage ?? 0, spec.stages.length - 1)] ?? 'young';

    (this._infoPanel.querySelector('#pip-species') as HTMLElement).textContent = spec.name;
    (this._infoPanel.querySelector('#pip-name') as HTMLElement).textContent = `${spec.name} Cluster`;
    (this._infoPanel.querySelector('#pip-stage') as HTMLElement).textContent =
      `Stage: ${stageLabel} • Day ${ageDays} • ${plantData.isSick ? 'recovering' : 'thriving'}`;
    (this._infoPanel.querySelector('#pip-stats') as HTMLElement).innerHTML = `
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">Health</span>
        <span style="color:${healthCol}">${healthPct}%</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;margin:-3px 0 5px">
        <div style="height:100%;width:${healthPct}%;background:${healthCol};border-radius:3px;transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">Sickness</span>
        <span style="color:${sicknessCol}">${sicknessPct}%</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;margin:-3px 0 7px">
        <div style="height:100%;width:${sicknessPct}%;background:${sicknessCol};border-radius:3px;transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">O₂ emission</span>
        <span>${stats.oxygenRate.toFixed(4)} / min</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">NO₃ absorption</span>
        <span>${stats.nitrateRate.toFixed(4)} / min</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">Effectiveness</span>
        <span>${Math.round(stats.effectiveness * 100)}%</span>
      </div>
      <div style="margin-top:6px;color:#88a98d;line-height:1.5">
        ${spec.description}
      </div>`;
  }

  _closeInfoPanel() {
    if (!this._infoPanel) return;
    this._infoPanel.style.opacity = '0';
    this._infoPanel.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      if (this._infoPanel) this._infoPanel.style.display = 'none';
    }, 200);
    this._infoPanelPlantId = null;
  }

  restoreFromStorage() {
    this.storage.getPlants().forEach((plantData: any) => {
      const spec = this.speciesDefs[plantData.species];
      if (!spec) return;
      this._ensurePlantState(plantData, spec);
      this._createPlantSprite(plantData, spec);
    });
  }

  removePlant(id: string) {
    const obj = this._plantObjects.get(id);
    if (obj) {
      obj.container.destroy();
      this._plantObjects.delete(id);
    }
    if (this._infoPanelPlantId === id) this._closeInfoPanel();
    this.storage.removePlant(id);
  }
}
