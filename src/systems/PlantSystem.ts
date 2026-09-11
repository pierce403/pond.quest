/**
 * PlantSystem — manages plant entities: placement, rendering, and info.
 *
 * The EcosystemSystem owns all growth and physiology on its game-minute clock.
 * This system displays the resulting stage, health and realized process rates.
 */

import speciesDefs from '../data/species';
import { plantFrame } from '../data/plantArt';
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
  private _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    this.scene.events.once('shutdown', () => this._infoPanel?.remove());
  }

  _getEffectiveStats(plantData: any, _spec: any) {
    return {
      effectiveness: plantData.effectiveness ?? 0,
      oxygenRate: plantData.oxygenRate ?? 0,
      nitrateRate: plantData.nitrateRate ?? 0,
    };
  }

  _ensurePlantState(plantData: any, spec: any) {
    Object.assign(plantData, this.storage.normalizePlant(plantData));
  }

  isSuitableHabitat(species: string, tileX: number, tileY: number) {
    return this.speciesDefs[species]?.habitat !== 'marginal' || tileX === 0 || tileY === 0
      || tileX === this.bounds.gridW - 1 || tileY === this.bounds.gridH - 1;
  }

  isPlantSlotOccupied(tileX: number, tileY: number, subX: number, subY: number, ignoreId: string | null = null) {
    return this.storage.getPlants().some((plant: any) => {
      if (plant.id === ignoreId) return false;
      return plant.tileX === tileX && plant.tileY === tileY && plant.subX === subX && plant.subY === subY;
    });
  }

  findPlacementSlot(tileX: number, tileY: number, preferredSubX: number, preferredSubY: number, ignoreId: string | null = null, species = '') {
    if (![tileX, tileY, preferredSubX, preferredSubY].every(Number.isInteger) || !this.isSuitableHabitat(species, tileX, tileY) || tileX < 0 || tileY < 0 || tileX >= this.bounds.gridW || tileY >= this.bounds.gridH) {
      return null;
    }

    const candidates: { subX: number; subY: number; distance: number }[] = [];
    for (let subX = 0; subX < 4; subX += 1) {
      for (let subY = 0; subY < 4; subY += 1) {
        candidates.push({
          subX,
          subY,
          distance: Math.hypot(subX - preferredSubX, subY - preferredSubY),
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find(({ subX, subY }) => !this.isPlantSlotOccupied(tileX, tileY, subX, subY, ignoreId)) ?? null;
  }

  canPlacePlantAt(tileX: number, tileY: number, subX: number, subY: number, ignoreId: string | null = null) {
    return [tileX, tileY, subX, subY].every(Number.isInteger)
      && tileX >= 0 && tileY >= 0 && tileX < this.bounds.gridW && tileY < this.bounds.gridH
      && subX >= 0 && subY >= 0 && subX < 4 && subY < 4
      && !this.isPlantSlotOccupied(tileX, tileY, subX, subY, ignoreId);
  }

  placePlant(species: string, tileX: number, tileY: number, subX: number, subY: number) {
    const spec = this.speciesDefs[species];
    if (!spec || !this.isSuitableHabitat(species, tileX, tileY)) return null;
    if (!this.canPlacePlantAt(tileX, tileY, subX, subY)) return null;

    const id = generateId();
    const plantData = this.storage.normalizePlant({
      id,
      species,
      tileX,
      tileY,
      subX,
      subY,
      growthStage: 0,
      growthProgress: 0.08,
      age: 0,
      health: 1,
      sickness: 0,
      effectiveness: 0.08,
      oxygenRate: 0,
      nitrateRate: 0,
      isSick: false,
    });

    this.storage.addPlant(plantData);
    this._createPlantSprite(this.storage.getPlants().find((p: any) => p.id === id), spec);
    return id;
  }

  _createPlantSprite(plantData: any, spec: any) {
    const container = this.scene.add.container(0, 0);

    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.14);
    shadow.fillEllipse(0, 4, 20, 8);

    const art = this.scene.add.image(0, 0, 'plants', plantFrame(plantData.species, plantData.growthStage)).setOrigin(0.5, 0.97);
    const glowRing = this.scene.add.graphics();
    glowRing.lineStyle(1.5, 0xb7e4c7, 0.9);
    glowRing.strokeEllipse(0, 1, 32, 12);
    glowRing.setAlpha(0);
    container.add([shadow, glowRing, art]);
    container.setInteractive(new Phaser.Geom.Rectangle(-18, -40, 36, 48), Phaser.Geom.Rectangle.Contains);
    container.on('pointerover', () => glowRing.setAlpha(0.7));
    container.on('pointerout', () => glowRing.setAlpha(0));
    container.on('pointerdown', () => this._openInfoPanel(plantData.id));
    this._plantObjects.set(plantData.id, { container, shadow, glowRing, art, spec,
      phase: Math.random() * Math.PI * 2, lastAppearance: '' });
    this._refreshPlantArt(plantData);
    this._positionPlantContainer(plantData);
  }

  _refreshPlantArt(p: any) {
    const obj = this._plantObjects.get(p.id);
    if (!obj) return;
    const appearance = `${p.growthStage}:${Math.round(p.growthProgress * 100)}:${Math.round(p.sickness * 20)}`;
    if (appearance === obj.lastAppearance) return;
    obj.lastAppearance = appearance;
    obj.art.setFrame(plantFrame(p.species, p.growthStage));
    const width = p.species === 'cattail' ? 12 + p.growthProgress * 30 : 20 + p.growthProgress * 40;
    obj.art.setScale(width / obj.art.frame.width);
    obj.art.setTint(mixColor(0xffffff, 0xaa9070, p.sickness * 0.7));
    obj.art.setAlpha(p.species === 'hornwort' ? 0.76 : 1);
    const area = obj.container.input?.hitArea as Phaser.Geom.Rectangle;
    if (area) area.setTo(-Math.max(18, width / 2), -Math.max(32, obj.art.displayHeight),
      Math.max(36, width), Math.max(40, obj.art.displayHeight + 8));
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
    const submerged = plantData.species === 'hornwort';
    const depth = (submerged ? 4 : 20) + plantData.tileX + plantData.tileY + (plantData.subX + plantData.subY) / 4;
    obj.container.setPosition(screen.x, screen.y);
    obj.container.setDepth(depth);
  }

  update(delta: number) {
    this._growthAccum += delta;
    const refresh = this._growthAccum >= 250;
    if (refresh) this._growthAccum = 0;
    const reduced = this._reducedMotion;
    for (const p of this.storage.getPlants()) {
      const obj = this._plantObjects.get(p.id);
      if (!obj) continue;
      if (!reduced) {
        const t = this.scene.time.now * 0.001 + obj.phase;
        obj.art.rotation = Math.sin(t * 0.7) * (p.species === 'cattail' ? 0.025 : 0.012);
        obj.art.y = p.species === 'waterlily' ? Math.sin(t) * 0.6 : 0;
      }
      if (refresh) {
        this._refreshPlantArt(p);
        if (this._infoPanelPlantId === p.id) this._syncInfoPanelData(p);
      }
    }
  }

  reposition() {
    this.storage.getPlants().forEach((p: any) => this._positionPlantContainer(p));
  }

  _buildInfoPanel() {
    const panel = document.createElement('div');
    panel.id = 'plant-info-panel';
    panel.className = 'entity-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Plant details');
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
        <button id="pip-close" aria-label="Close plant details" style="background:none;border:none;color:#8db493;font-size:16px;cursor:pointer;padding:0 2px;line-height:1">×</button>
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
    const fishPanel = document.getElementById('fish-info-panel');
    if (fishPanel) fishPanel.style.display = 'none';
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
      `${stageLabel} · ${ageDays} days · ${plantData.condition ?? 'Establishing'}`;
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
        <span style="color:#9ab89e">Net water O₂</span>
        <span>${stats.oxygenRate >= 0 ? '+' : ''}${stats.oxygenRate.toFixed(2)} mg/min</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">Nitrate uptake</span>
        <span>${stats.nitrateRate.toFixed(2)} mg N/min</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#9ab89e">Growth</span>
        <span>${Math.round(plantData.growthProgress * 100)}%</span>
      </div>
      <div style="display:flex;justify-content:space-between"><span style="color:#9ab89e">Ammonium uptake</span><span>${(plantData.ammoniaRate ?? 0).toFixed(2)} mg N/min</span></div>
      <div style="margin-top:6px;color:#88a98d;line-height:1.5">
        ${spec.description}
      </div>`;
  }

  _closeInfoPanel() {
    if (!this._infoPanel) return;
    this._infoPanel.style.opacity = '0';
    this._infoPanel.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      if (this._infoPanel && !this._infoPanelPlantId) this._infoPanel.style.display = 'none';
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

  setInteractivityEnabled(enabled: boolean) {
    this._plantObjects.forEach((obj: any) => {
      if (obj.container?.input) obj.container.input.enabled = enabled;
    });
    if (!enabled && this._infoPanelPlantId) this._closeInfoPanel();
  }
}
