/**
 * PondScene — the main game scene.
 *
 * Renders the isometric 4×4 pond grid, manages all systems (Fish, Plant,
 * Ecosystem), handles input, and runs the game loop.
 *
 * The pond is drawn procedurally using Phaser Graphics — no spritesheets
 * needed for the initial prototype. Each tile is a diamond with a soft
 * Ghibli-inspired water effect (layered translucent fills + gentle animation).
 */

import { isoToScreen, screenToIso, isoDepth, TILE_W, TILE_H, HALF_W, HALF_H } from '../utils/iso';
import StorageSystem from '../systems/StorageSystem';
import EcosystemSystem from '../systems/EcosystemSystem';
import FishSystem from '../systems/FishSystem';
import PlantSystem from '../systems/PlantSystem';
import AudioManager from '../utils/audio';
import speciesDefs from '../data/species';

// ── Ghibli-ish color palette ───────────────────────────────────────────────
const COLORS = {
  waterDeep:    0x2d6a4f,
  waterMid:     0x40916c,
  waterLight:   0x52b788,
  waterHighlight: 0x74c69d,
  waterShimmer: 0xa7d8b5,
  edgeStone:    0x6b705c,
  edgeMoss:     0x4a7c59,
  ground:       0x3a5a40,
  groundDark:   0x2d3a2d,
  // Meadow palette
  grassLight:   0x7bc67e,
  grassMid:     0x4caf50,
  grassDark:    0x388e3c,
  soilBrown:    0x5d4037,
  flowerWhite:  0xf8f9fa,
  flowerYellow: 0xffe066,
  flowerPink:   0xf48fb1,
  flowerBlue:   0x90caf9,
  flowerPurple: 0xce93d8,
  treeTrunk:    0x6d4c41,
  treeLeaf:     0x388e3c,
  treeLeafDark: 0x2e7d32,
};

// Zoom bounds
const MAX_ZOOM = 4.0;

export default class PondScene extends Phaser.Scene {
  // Runtime state — declared here to satisfy TypeScript strict property checks
  declare gridOriginX: number;
  declare gridOriginY: number;
  declare gridW: number;
  declare gridH: number;
  declare storage: any;
  declare ecosystem: any;
  declare fishSystem: any;
  declare plantSystem: any;
  declare audio: any;
  declare _currentZoom: number;
  declare _pinchPrevDistance: number | null;
  declare _meadowBounds: { x: number; y: number; width: number; height: number };
  declare _bgGfx: Phaser.GameObjects.Graphics;
  declare _meadowGfx: Phaser.GameObjects.Graphics;
  declare _animGfx: Phaser.GameObjects.Graphics;
  declare _tileGfx: Phaser.GameObjects.Graphics;
  declare _shimmerGfx: Phaser.GameObjects.Graphics;
  declare _grassTufts: any[];
  declare _flowerPositions: any[];
  declare _treePositions: any[];
  declare _inventoryTray: HTMLElement;
  declare _trashEl: HTMLElement;

  constructor() {
    super({ key: 'PondScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Grid origin: center of the screen, shifted up a bit
    this.gridOriginX = width / 2;
    this.gridOriginY = height / 2 - 60;
    this.gridW = 4;
    this.gridH = 4;

    // ── Initialize systems ────────────────────────────────────────────────
    this.storage = new StorageSystem();
    this.storage.load();

    this.ecosystem = new EcosystemSystem(this.storage);

    const pondBounds = {
      originX: this.gridOriginX,
      originY: this.gridOriginY,
      gridW: this.gridW,
      gridH: this.gridH,
    };

    this.fishSystem = new FishSystem(this, this.storage, pondBounds);
    this.plantSystem = new PlantSystem(this, this.storage, pondBounds);

    // Audio
    this.audio = new AudioManager(this);

    // ── Draw the pond ─────────────────────────────────────────────────────
    this._drawPondBackground();
    this._drawTileGrid();

    // ── Water shimmer animation layer ─────────────────────────────────────
    this._createWaterShimmer();

    // ── Restore entities from saved state ─────────────────────────────────
    this.fishSystem.restoreFromStorage();
    this.plantSystem.restoreFromStorage();

    // ── Spawn starter fish if new pond ────────────────────────────────────
    if (this.storage.getFish().length === 0) {
      this.fishSystem.spawnFish('koi');
      this.fishSystem.spawnFish('koi');
      this.fishSystem.spawnFish('goldfish');
    }
    // Spawn some starter plants if new pond
    if (this.storage.getPlants().length === 0) {
      this.plantSystem.placePlant('lotus', 1, 1, 2, 2);
      this.plantSystem.placePlant('cattail', 0, 2, 1, 1);
      this.plantSystem.placePlant('hornwort', 2, 3, 2, 2);
      this.plantSystem.placePlant('waterlily', 3, 1, 1, 3);
    }

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.addPointer(1);
    this.input.on('pointerdown', () => {
      this.audio.unlock();
    });

    // ── Scroll-to-zoom ────────────────────────────────────────────────────
    this._currentZoom = 1.0;
    this._pinchPrevDistance = null;
    this.cameras.main.setZoom(this._clampZoom(this._currentZoom));
    this._currentZoom = this.cameras.main.zoom;
    this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      this._setTargetZoom(this._currentZoom - deltaY * 0.001 * (this._currentZoom * 4));
    });

    // ── Inventory tray (HTML overlay for drag-and-drop) ───────────────────
    this._buildInventoryTray();

    // ── Launch UI overlay scene in parallel ───────────────────────────────
    this.scene.launch('UIScene', { storage: this.storage, ecosystem: this.ecosystem });

    // ── Handle resize ────────────────────────────────────────────────────
    this.scale.on('resize', (gameSize: any) => {
      this.gridOriginX = gameSize.width / 2;
      this.gridOriginY = gameSize.height / 2 - 60;
      this._drawPondBackground();
      this._drawTileGrid();
      this._currentZoom = this._clampZoom(this._currentZoom);
      this.cameras.main.setZoom(this._clampZoom(this.cameras.main.zoom));
      this._repositionInventoryTray(gameSize.width, gameSize.height);
    });
  }

  update(time: number, delta: number) {
    this._updatePinchZoom();
    this.ecosystem.update(delta);
    this.fishSystem.update(delta);
    this.plantSystem.update(delta);
    this._animateWaterShimmer(time);
    this._animateMeadow(time);

    // Smooth zoom towards target
    if (this._currentZoom !== undefined) {
      const cam = this.cameras.main;
      this._currentZoom = this._clampZoom(this._currentZoom);
      const diff = this._currentZoom - cam.zoom;
      if (Math.abs(diff) > 0.001) {
        cam.zoom = Phaser.Math.Linear(cam.zoom, this._currentZoom, 0.12);
      }
    }
  }

  _setTargetZoom(nextZoom: number) {
    this._currentZoom = this._clampZoom(nextZoom);
  }

  _clampZoom(nextZoom: number) {
    const minZoom = this._getMinZoom();
    return Math.max(minZoom, Math.min(MAX_ZOOM, nextZoom));
  }

  _getMinZoom() {
    if (!this._meadowBounds) return 1;
    const cam = this.cameras.main;
    const fitWidth = cam.width / this._meadowBounds.width;
    const fitHeight = cam.height / this._meadowBounds.height;
    return Math.max(fitWidth, fitHeight);
  }

  _updatePinchZoom() {
    const activeTouches = this.input.manager.pointers.filter((pointer: any) => {
      return pointer.isDown && pointer.pointerType !== 'mouse';
    });

    if (activeTouches.length < 2) {
      this._pinchPrevDistance = null;
      return;
    }

    const [p1, p2] = activeTouches;
    const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (this._pinchPrevDistance && this._pinchPrevDistance > 0) {
      this._setTargetZoom(this._currentZoom * (distance / this._pinchPrevDistance));
    }
    this._pinchPrevDistance = distance;
  }

  // ── Pond rendering ───────────────────────────────────────────────────────

  _drawPondBackground() {
    if (this._bgGfx) this._bgGfx.destroy();
    this._bgGfx = this.add.graphics();
    this._bgGfx.setDepth(-10);

    if (this._meadowGfx) this._meadowGfx.destroy();
    this._meadowGfx = this.add.graphics();
    this._meadowGfx.setDepth(-9);

    const { width, height } = this.cameras.main;
    // Use a large virtual canvas so the meadow looks expansive when zoomed out
    const VW = Math.max(width, 1400);
    const VH = Math.max(height, 1000);
    const vx = (width - VW) / 2;
    const vy = (height - VH) / 2;
    this._meadowBounds = { x: vx, y: vy, width: VW, height: VH };

    // ── Base soil/meadow fill ─────────────────────────────────────────────
    this._bgGfx.fillStyle(0x4a7c38, 1);
    this._bgGfx.fillRect(vx, vy, VW, VH);

    // Subtle soil-patch texture variation
    const rng = this._seededRng(42);
    for (let i = 0; i < 80; i++) {
      const px = vx + rng() * VW;
      const py = vy + rng() * VH;
      const pr = 20 + rng() * 60;
      this._bgGfx.fillStyle(rng() > 0.5 ? 0x5a8c40 : 0x3e6e2e, 0.35);
      this._bgGfx.fillEllipse(px, py, pr * 1.5, pr * 0.8);
    }

    // Edge stones/border around the pond
    this._drawPondEdge();

    // ── Meadow details (grass tufts, flowers, trees) ───────────────────────
    this._drawMeadowDetails(VW, VH, vx, vy, rng);
  }

  /**
   * Seeded pseudo-RNG (mulberry32) so the meadow looks deterministic across redraws.
   */
  _seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Draw static meadow details: grass tufts, wildflowers, small trees.
   * These are drawn to _meadowGfx at scene start (non-animated).
   * Dynamic waving is applied each frame in _animateMeadow().
   */
  _drawMeadowDetails(VW: number, VH: number, vx: number, vy: number, rng: () => number) {
    const gfx = this._meadowGfx;
    const cx = this.gridOriginX;
    const cy = this.gridOriginY;

    // Pond exclusion zone — don't draw meadow items on top of water
    const pondRadX = HALF_W * this.gridW * 0.9;
    const pondRadY = HALF_H * this.gridH * 0.9;
    const isInPond = (x: number, y: number) => {
      const dx = (x - cx) / pondRadX;
      const dy = (y - cy - HALF_H * this.gridH * 0.5) / pondRadY;
      return dx * dx + dy * dy < 1.2;
    };

    // ── Small trees (drawn first, behind everything) ─────────────────────
    this._treePositions = [];
    for (let i = 0; i < 18; i++) {
      const tx = vx + rng() * VW;
      const ty = vy + rng() * VH * 0.8;
      if (isInPond(tx, ty + 30)) continue;
      this._drawTree(gfx, tx, ty, 0.6 + rng() * 0.7);
      this._treePositions.push({ x: tx, y: ty });
    }

    // ── Store grass tuft positions for animation ─────────────────────────
    this._grassTufts = [];
    for (let i = 0; i < 250; i++) {
      const gx2 = vx + rng() * VW;
      const gy2 = vy + rng() * VH;
      if (isInPond(gx2, gy2)) continue;
      const h = 6 + rng() * 12;
      const clustered = rng() > 0.5;
      this._grassTufts.push({
        x: gx2, y: gy2,
        h,
        count: clustered ? 3 + Math.floor(rng() * 4) : 1,
        spread: 4 + rng() * 8,
        color: rng() > 0.5 ? COLORS.grassLight : COLORS.grassMid,
        phase: rng() * Math.PI * 2,
      });
    }

    // ── Wildflowers ───────────────────────────────────────────────────────
    this._flowerPositions = [];
    const flowerColors = [COLORS.flowerWhite, COLORS.flowerYellow, COLORS.flowerPink, COLORS.flowerBlue, COLORS.flowerPurple];
    for (let i = 0; i < 120; i++) {
      const fx = vx + rng() * VW;
      const fy = vy + rng() * VH;
      if (isInPond(fx, fy)) continue;
      const fcolor = flowerColors[Math.floor(rng() * flowerColors.length)];
      const fsize = 2 + rng() * 3;
      this._flowerPositions.push({ x: fx, y: fy, color: fcolor, size: fsize, phase: rng() * Math.PI * 2 });
      // Static stem
      gfx.lineStyle(1, COLORS.grassDark, 0.7);
      gfx.beginPath();
      gfx.moveTo(fx, fy);
      gfx.lineTo(fx + (rng() - 0.5) * 3, fy + 6 + rng() * 4);
      gfx.strokePath();
    }
  }

  /**
   * Draw a small stylized tree (trunk + layered canopy circles).
   */
  _drawTree(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, scale: number) {
    const trunkH = 18 * scale;
    const trunkW = 4 * scale;
    // Trunk
    gfx.fillStyle(COLORS.treeTrunk, 0.9);
    gfx.fillRect(tx - trunkW / 2, ty, trunkW, trunkH);
    // Shadow canopy layer
    gfx.fillStyle(COLORS.treeLeafDark, 0.6);
    gfx.fillEllipse(tx + 2, ty - 10 * scale, 30 * scale, 22 * scale);
    // Main canopy
    gfx.fillStyle(COLORS.treeLeaf, 0.85);
    gfx.fillEllipse(tx, ty - 12 * scale, 28 * scale, 20 * scale);
    // Highlight
    gfx.fillStyle(COLORS.grassLight, 0.3);
    gfx.fillEllipse(tx - 4 * scale, ty - 16 * scale, 14 * scale, 10 * scale);
  }

  /**
   * Animate grass tufts and flowers each frame (gentle swaying).
   * Re-draws only the animated elements on top of the static meadow.
   */
  _animateMeadow(time: number) {
    if (!this._animGfx) {
      this._animGfx = this.add.graphics();
      this._animGfx.setDepth(-8);
    }
    const gfx = this._animGfx;
    gfx.clear();

    const t = time * 0.001;

    // Draw animated grass tufts
    if (this._grassTufts) {
      this._grassTufts.forEach(tuft => {
        const sway = Math.sin(t * 1.2 + tuft.phase) * 2.5;
        for (let b = 0; b < tuft.count; b++) {
          const ox = (b - (tuft.count - 1) / 2) * tuft.spread;
          gfx.lineStyle(1.2, tuft.color, 0.85);
          gfx.beginPath();
          gfx.moveTo(tuft.x + ox, tuft.y);
          gfx.lineTo(tuft.x + ox + sway, tuft.y - tuft.h);
          gfx.strokePath();
        }
      });
    }

    // Draw animated flower heads
    if (this._flowerPositions) {
      this._flowerPositions.forEach(f => {
        const sway = Math.sin(t * 0.9 + f.phase) * 1.5;
        gfx.fillStyle(f.color, 0.9);
        gfx.fillCircle(f.x + sway, f.y - 6, f.size);
        gfx.fillStyle(COLORS.flowerYellow, 1);
        gfx.fillCircle(f.x + sway, f.y - 6, f.size * 0.4);
      });
    }
  }

  _drawPondEdge() {
    const gfx = this._bgGfx;

    // Draw stone border — slightly larger diamond around the 4×4 grid
    const PADDING = 8;
    const corners = [
      isoToScreen(-0.5, -0.5, this.gridOriginX, this.gridOriginY),
      isoToScreen(this.gridW - 0.5, -0.5, this.gridOriginX, this.gridOriginY),
      isoToScreen(this.gridW - 0.5, this.gridH - 0.5, this.gridOriginX, this.gridOriginY),
      isoToScreen(-0.5, this.gridH - 0.5, this.gridOriginX, this.gridOriginY),
    ];

    // Outer stone border
    gfx.fillStyle(COLORS.edgeStone, 0.7);
    gfx.beginPath();
    gfx.moveTo(corners[0].x, corners[0].y - PADDING);
    gfx.lineTo(corners[1].x + PADDING, corners[1].y);
    gfx.lineTo(corners[2].x, corners[2].y + PADDING);
    gfx.lineTo(corners[3].x - PADDING, corners[3].y);
    gfx.closePath();
    gfx.fillPath();

    // Inner moss edge
    gfx.fillStyle(COLORS.edgeMoss, 0.5);
    gfx.beginPath();
    gfx.moveTo(corners[0].x, corners[0].y - PADDING / 2);
    gfx.lineTo(corners[1].x + PADDING / 2, corners[1].y);
    gfx.lineTo(corners[2].x, corners[2].y + PADDING / 2);
    gfx.lineTo(corners[3].x - PADDING / 2, corners[3].y);
    gfx.closePath();
    gfx.fillPath();
  }

  _drawTileGrid() {
    if (this._tileGfx) this._tileGfx.destroy();
    this._tileGfx = this.add.graphics();
    this._tileGfx.setDepth(0);

    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        this._drawTile(this._tileGfx, x, y);
      }
    }
  }

  _drawTile(gfx: Phaser.GameObjects.Graphics, isoX: number, isoY: number) {
    const { x: cx, y: cy } = isoToScreen(isoX, isoY, this.gridOriginX, this.gridOriginY);

    // Diamond points for this tile
    const topX = cx, topY = cy - HALF_H;
    const rightX = cx + HALF_W, rightY = cy;
    const botX = cx, botY = cy + HALF_H;
    const leftX = cx - HALF_W, leftY = cy;

    // Water fill — layered for depth effect
    // Base deep water
    gfx.fillStyle(COLORS.waterDeep, 0.9);
    gfx.fillPoints([
      { x: topX, y: topY },
      { x: rightX, y: rightY },
      { x: botX, y: botY },
      { x: leftX, y: leftY },
    ], true);

    // Mid-tone overlay — slightly offset for sense of depth
    gfx.fillStyle(COLORS.waterMid, 0.4);
    gfx.fillPoints([
      { x: topX, y: topY + 2 },
      { x: rightX - 4, y: rightY },
      { x: botX, y: botY - 2 },
      { x: leftX + 4, y: leftY },
    ], true);

    // Light water edge highlight (top-left lit face)
    gfx.lineStyle(1, COLORS.waterHighlight, 0.3);
    gfx.beginPath();
    gfx.moveTo(topX, topY);
    gfx.lineTo(rightX, rightY);
    gfx.strokePath();
    gfx.beginPath();
    gfx.moveTo(topX, topY);
    gfx.lineTo(leftX, leftY);
    gfx.strokePath();

    // Grid lines — very subtle
    gfx.lineStyle(0.5, 0x1a3a2a, 0.3);
    gfx.beginPath();
    gfx.moveTo(topX, topY);
    gfx.lineTo(rightX, rightY);
    gfx.lineTo(botX, botY);
    gfx.lineTo(leftX, leftY);
    gfx.closePath();
    gfx.strokePath();
  }

  // ── Water shimmer ──────────────────────────────────────────────────────

  _createWaterShimmer() {
    this._shimmerGfx = this.add.graphics();
    this._shimmerGfx.setDepth(1);
    this._shimmerGfx.setAlpha(0.15);
  }

  // ── Inventory Tray ────────────────────────────────────────────────────────

  /**
   * Build an HTML overlay tray with draggable item cards.
   * Each card can be dragged onto the canvas to spawn that entity.
   * Existing entities in the pond can be dragged to the trash icon to remove them.
   */
  _buildInventoryTray() {
    const { width, height } = this.cameras.main;

    // ── Outer tray container ──────────────────────────────────────────────
    const tray = document.createElement('div');
    tray.id = 'inventory-tray';
    Object.assign(tray.style, {
      position: 'absolute',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'nowrap',
      gap: '10px',
      background: 'rgba(10, 26, 10, 0.72)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(82, 183, 136, 0.3)',
      borderRadius: '16px',
      padding: '10px 16px',
      maxWidth: '760px',
      zIndex: '100',
      userSelect: 'none',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      pointerEvents: 'all',
      touchAction: 'none',
    });
    document.getElementById('game-container')!.appendChild(tray);
    this._inventoryTray = tray;

    // ── Section label: Fish ───────────────────────────────────────────────
    tray.appendChild(this._makeTrayLabel('🐟 Fish'));
    const fishDefs = speciesDefs.fish as Record<string, any>;
    Object.entries(fishDefs).forEach(([key, def]) => {
      const card = this._makeTrayCard(def.name, def.color, 'fish', key, def);
      tray.appendChild(card);
    });

    // ── Divider ───────────────────────────────────────────────────────────
    const div = document.createElement('div');
    div.dataset.trayDivider = '1';
    Object.assign(div.style, {
      width: '1px', height: '48px',
      background: 'rgba(82, 183, 136, 0.25)',
      margin: '0 4px',
    });
    tray.appendChild(div);

    // ── Section label: Plants ─────────────────────────────────────────────
    tray.appendChild(this._makeTrayLabel('🌿 Plants'));
    const plantDefs = speciesDefs.plants as Record<string, any>;
    Object.entries(plantDefs).forEach(([key, def]) => {
      const padCol = def.padColor ?? def.stemColor ?? def.color;
      const card = this._makeTrayCard(def.name, padCol, 'plant', key, def);
      tray.appendChild(card);
    });

    // ── Divider ───────────────────────────────────────────────────────────
    const div2 = document.createElement('div');
    div2.dataset.trayDivider = '1';
    Object.assign(div2.style, { width: '1px', height: '48px', background: 'rgba(82, 183, 136, 0.25)', margin: '0 4px' });
    tray.appendChild(div2);

    // ── Trash zone ────────────────────────────────────────────────────────
    const trash = document.createElement('div');
    trash.id = 'pond-trash';
    Object.assign(trash.style, {
      width: '48px', height: '48px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '22px',
      borderRadius: '10px',
      border: '1.5px dashed rgba(230, 111, 81, 0.4)',
      color: 'rgba(230, 111, 81, 0.6)',
      cursor: 'default',
      transition: 'all 0.2s',
      flexShrink: '0',
    });
    trash.textContent = '🗑️';
    tray.appendChild(trash);
    this._trashEl = trash;

    // ── Global drag event plumbing ────────────────────────────────────────
    this._setupTrayDragEvents();
    this._applyResponsiveTrayLayout(width);
  }

  _makeTrayLabel(text: string): HTMLElement {
    const lbl = document.createElement('div');
    lbl.dataset.trayLabel = '1';
    Object.assign(lbl.style, {
      fontSize: '10px',
      color: 'rgba(168, 216, 185, 0.6)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      writingMode: 'vertical-lr',
      transform: 'rotate(180deg)',
      flexShrink: '0',
    });
    lbl.textContent = text;
    return lbl;
  }

  /**
   * Create a draggable tray card for a given entity type and species.
   */
  _makeTrayCard(name: string, colorInt: number, type: 'fish' | 'plant', speciesKey: string, def: any): HTMLElement {
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;

    const card = document.createElement('div');
    card.dataset.type = type;
    card.dataset.species = speciesKey;
    card.dataset.trayCard = '1';
    card.title = def.description || name;
    Object.assign(card.style, {
      width: '52px', height: '52px',
      borderRadius: '10px',
      background: `rgba(${r},${g},${b},0.18)`,
      border: `1.5px solid rgba(${r},${g},${b},0.5)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'grab',
      transition: 'transform 0.15s, box-shadow 0.15s',
      flexShrink: '0',
      position: 'relative',
    });

    // Coloured dot preview
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: type === 'fish' ? '22px' : '16px',
      height: type === 'fish' ? '12px' : '16px',
      borderRadius: type === 'fish' ? '60% 40% 40% 60%' : '50%',
      background: hex,
      marginBottom: '4px',
      boxShadow: `0 0 6px rgba(${r},${g},${b},0.6)`,
    });
    card.appendChild(dot);

    const lbl = document.createElement('span');
    Object.assign(lbl.style, {
      fontSize: '9px', color: 'rgba(168,216,185,0.85)',
      textAlign: 'center', lineHeight: '1.1',
    });
    lbl.textContent = name;
    card.appendChild(lbl);

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.08)';
      card.style.boxShadow = `0 0 12px rgba(${r},${g},${b},0.45)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.boxShadow = '';
    });

    return card;
  }

  _applyResponsiveTrayLayout(width: number) {
    if (!this._inventoryTray || !this._trashEl) return;

    const compact = width < 760;
    Object.assign(this._inventoryTray.style, {
      bottom: compact ? '10px' : '16px',
      gap: compact ? '6px' : '10px',
      padding: compact ? '8px 10px' : '10px 16px',
      maxWidth: compact ? 'calc(100vw - 10px)' : '760px',
      flexWrap: compact ? 'wrap' : 'nowrap',
      borderRadius: compact ? '14px' : '16px',
    });

    this._inventoryTray.querySelectorAll('[data-tray-label="1"]').forEach((label) => {
      (label as HTMLElement).style.display = compact ? 'none' : 'block';
    });

    this._inventoryTray.querySelectorAll('[data-tray-divider="1"]').forEach((divider) => {
      (divider as HTMLElement).style.display = compact ? 'none' : 'block';
    });

    this._inventoryTray.querySelectorAll('[data-tray-card="1"]').forEach((cardEl) => {
      const card = cardEl as HTMLElement;
      const preview = card.firstElementChild as HTMLElement | null;
      const label = card.lastElementChild as HTMLElement | null;
      Object.assign(card.style, {
        width: compact ? '44px' : '52px',
        height: compact ? '44px' : '52px',
        borderRadius: compact ? '9px' : '10px',
      });
      if (preview) {
        Object.assign(preview.style, {
          width: compact ? (card.dataset.type === 'fish' ? '18px' : '14px') : (card.dataset.type === 'fish' ? '22px' : '16px'),
          height: compact ? (card.dataset.type === 'fish' ? '10px' : '14px') : (card.dataset.type === 'fish' ? '12px' : '16px'),
          marginBottom: compact ? '2px' : '4px',
        });
      }
      if (label) {
        label.style.fontSize = compact ? '8px' : '9px';
      }
    });

    Object.assign(this._trashEl.style, {
      width: compact ? '40px' : '48px',
      height: compact ? '40px' : '48px',
      fontSize: compact ? '18px' : '22px',
    });
  }

  _setupTrayDragEvents() {
    const container = document.getElementById('game-container')!;
    const canvas = this.sys.game.canvas;

    let dragData: { type: string; species: string } | null = null;
    let ghost: HTMLElement | null = null;

    // Pointer-down on a tray card → start drag from tray
    this._inventoryTray.addEventListener('pointerdown', (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest('[data-type]') as HTMLElement | null;
      if (!card) return;
      dragData = { type: card.dataset.type!, species: card.dataset.species! };

      ghost = card.cloneNode(true) as HTMLElement;
      Object.assign(ghost.style, {
        position: 'fixed', pointerEvents: 'none', opacity: '0.85',
        zIndex: '999', transform: 'scale(1.1)',
        left: `${e.clientX - 26}px`, top: `${e.clientY - 26}px`,
        transition: 'none',
      });
      document.body.appendChild(ghost);
      e.preventDefault();
    });

    // Pointer move → move ghost
    document.addEventListener('pointermove', (e: PointerEvent) => {
      if (!ghost) return;
      ghost.style.left = `${e.clientX - 26}px`;
      ghost.style.top = `${e.clientY - 26}px`;

      // Highlight trash if hovering over it
      const trashRect = this._trashEl.getBoundingClientRect();
      const overTrash = e.clientX >= trashRect.left && e.clientX <= trashRect.right &&
                        e.clientY >= trashRect.top  && e.clientY <= trashRect.bottom;
      this._trashEl.style.borderColor = overTrash ? 'rgba(230,111,81,0.9)' : 'rgba(230,111,81,0.4)';
      this._trashEl.style.color       = overTrash ? 'rgba(230,111,81,0.9)' : 'rgba(230,111,81,0.6)';
    });

    // Pointer up → drop logic
    document.addEventListener('pointerup', (e: PointerEvent) => {
      if (!ghost || !dragData) return;

      // Check if dropped over trash
      const trashRect = this._trashEl.getBoundingClientRect();
      const overTrash = e.clientX >= trashRect.left && e.clientX <= trashRect.right &&
                        e.clientY >= trashRect.top  && e.clientY <= trashRect.bottom;

      if (!overTrash) {
        // Check if dropped on the canvas
        const canvasRect = canvas.getBoundingClientRect();
        const onCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
                         e.clientY >= canvasRect.top  && e.clientY <= canvasRect.bottom;
        if (onCanvas && dragData.type === 'fish') {
          this.fishSystem.spawnFish(dragData.species);
          this.audio.playSfx('sfx_plop');
        } else if (onCanvas && dragData.type === 'plant') {
          // Place plant at a random free sub-tile position
          const tx = Math.floor(Math.random() * this.gridW);
          const ty = Math.floor(Math.random() * this.gridH);
          const sx = Math.floor(Math.random() * 4);
          const sy = Math.floor(Math.random() * 4);
          this.plantSystem.placePlant(dragData.species, tx, ty, sx, sy);
          this.audio.playSfx('sfx_plop');
        }
      }

      ghost.remove();
      ghost = null;
      dragData = null;
      this._trashEl.style.borderColor = 'rgba(230,111,81,0.4)';
      this._trashEl.style.color = 'rgba(230,111,81,0.6)';
    });
  }

  _repositionInventoryTray(_w: number, _h: number) {
    this._applyResponsiveTrayLayout(_w);
  }

  _animateWaterShimmer(time: number) {
    if (!this._shimmerGfx) return;
    this._shimmerGfx.clear();

    // Gentle ripple highlights that drift across tiles
    const t = time * 0.0003;
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const { x: cx, y: cy } = isoToScreen(x, y, this.gridOriginX, this.gridOriginY);
        // Two overlapping sine patterns for organic feel
        const shimmer1 = Math.sin(t + x * 1.7 + y * 0.9) * 0.5 + 0.5;
        const shimmer2 = Math.cos(t * 0.7 + x * 0.5 + y * 2.1) * 0.5 + 0.5;
        const alpha = (shimmer1 * 0.3 + shimmer2 * 0.2);

        this._shimmerGfx.fillStyle(COLORS.waterShimmer, alpha);
        const offX = Math.sin(t + x) * 3;
        const offY = Math.cos(t * 0.8 + y) * 2;
        this._shimmerGfx.fillEllipse(cx + offX, cy + offY, 20 + shimmer1 * 15, 8 + shimmer2 * 6);
      }
    }
  }
}
