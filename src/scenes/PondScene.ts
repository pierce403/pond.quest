/**
 * PondScene — the main game scene.
 *
 * Renders the isometric 4×4 pond grid, manages all systems (Fish, Plant,
 * Ecosystem), handles input, and runs the game loop.
 *
 * A continuous isometric water surface shares its coordinates with placement.
 * The meadow is cached; plant and fish sprites sit in separate depth layers.
 */

import { isoToScreen, screenToIso, subTileToScreen, HALF_W, HALF_H } from '../utils/iso';
import StorageSystem from '../systems/StorageSystem';
import EcosystemSystem from '../systems/EcosystemSystem';
import FishSystem from '../systems/FishSystem';
import PlantSystem from '../systems/PlantSystem';
import AudioManager from '../utils/audio';
import speciesDefs from '../data/species';
import { plantFrame } from '../data/plantArt';

// ── Ghibli-ish color palette ───────────────────────────────────────────────
const COLORS = {
  waterDeep:    0x174d50,
  waterMid:     0x287b78,
  waterLight:   0x55a394,
  waterHighlight: 0xb8ddc4,
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
const AMBIENT_ANIMATION_INTERVAL_MS = 50;

type PlacementSelection = {
  type: 'fish' | 'plant';
  species: string;
};

type PlacementPreview =
  | {
      type: 'fish';
      valid: boolean;
      x: number;
      y: number;
      screenX: number;
      screenY: number;
      colorInt: number;
    }
  | {
      type: 'plant';
      valid: boolean;
      tileX: number;
      tileY: number;
      subX: number;
      subY: number;
      screenX: number;
      screenY: number;
      colorInt: number;
    };

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
  declare _placementHintEl: HTMLElement;
  declare _placementPreviewGfx: Phaser.GameObjects.Graphics;
  declare _placementSelection: PlacementSelection | null;
  declare _lastWaterAnimTime: number;
  declare _lastMeadowAnimTime: number;
  declare _environmentTexture: Phaser.GameObjects.RenderTexture;
  declare _nightOverlay: Phaser.GameObjects.Rectangle;
  declare _placementGrid: Phaser.GameObjects.Graphics;
  _visualTime = 0;
  _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    super({ key: 'PondScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Grid origin: center of the screen, shifted up a bit
    this.gridOriginX = width / 2;
    this.gridOriginY = height / 2 - HALF_H * 4 - 12;
    this.gridW = 4;
    this.gridH = 4;

    // ── Initialize systems ────────────────────────────────────────────────
    this.storage = new StorageSystem();
    this.storage.load();
    this.gridW = this.storage.getPond().width;
    this.gridH = this.storage.getPond().height;
    this.gridOriginY = height / 2 - HALF_H * (this.gridW + this.gridH) / 2 - 12;

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
    if (this.storage.isNewPond) {
      this.fishSystem.spawnFish('koi');
      this.fishSystem.spawnFish('koi');
      this.fishSystem.spawnFish('goldfish');
    }
    // Spawn some starter plants if new pond
    if (this.storage.isNewPond) {
      this.plantSystem.placePlant('lotus', 1, 1, 2, 2);
      this.plantSystem.placePlant('cattail', 0, 2, 1, 1);
      this.plantSystem.placePlant('hornwort', 2, 3, 2, 2);
      this.plantSystem.placePlant('waterlily', 3, 1, 1, 3);
    }

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.addPointer(1);
    this._placementSelection = null;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      this._handlePlacementPointerDown(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this._updatePlacementPreview(pointer);
    });

    // ── Scroll-to-zoom ────────────────────────────────────────────────────
    this._currentZoom = this._fitPondZoom(width, height);
    this._pinchPrevDistance = null;
    this._lastWaterAnimTime = -Infinity;
    this._lastMeadowAnimTime = -Infinity;
    this.cameras.main.setZoom(this._clampZoom(this._currentZoom));
    this._currentZoom = this.cameras.main.zoom;
    this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      this._setTargetZoom(this._currentZoom - deltaY * 0.001 * (this._currentZoom * 4));
    });

    // ── Inventory tray (HTML overlay for click-to-place) ──────────────────
    this._buildInventoryTray();
    this._createPlacementPreview();

    // ── Launch UI overlay scene in parallel ───────────────────────────────
    this.scene.launch('UIScene', { storage: this.storage, ecosystem: this.ecosystem });

    // ── Handle resize ────────────────────────────────────────────────────
    const onResize = (gameSize: any) => {
      this.gridOriginX = gameSize.width / 2;
      this.gridOriginY = gameSize.height / 2 - HALF_H * (this.gridW + this.gridH) / 2 - 12;
      pondBounds.originX = this.gridOriginX;
      pondBounds.originY = this.gridOriginY;
      this.plantSystem.reposition();
      this.storage.getFish().forEach((f: any) => this.fishSystem._positionFishContainer(f));
      this._nightOverlay.setSize(gameSize.width, gameSize.height);
      this._drawPondBackground();
      this._drawTileGrid();
      this._currentZoom = this._clampZoom(this._fitPondZoom(gameSize.width, gameSize.height));
      this.cameras.main.setZoom(this._currentZoom);
      this._repositionInventoryTray(gameSize.width, gameSize.height);
      this._updatePlacementPreview(this.input.activePointer);
    };
    this.scale.on('resize', onResize);
    this._nightOverlay = this.add.rectangle(0, 0, width, height, 0x09243b, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(60);
    const flush = () => this.storage.save();
    const visibility = () => {
      flush();
      this.ecosystem._tickAccum = 0;
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    this.input.keyboard?.on('keydown-ESC', () => {
      this._setPlacementSelection(null);
      this.fishSystem._closeInfoPanel();
      this.plantSystem._closeInfoPanel();
    });
    this.events.once('shutdown', () => {
      flush();
      this.scale.off('resize', onResize);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
      this._inventoryTray.remove();
    });
  }

  update(time: number, delta: number) {
    this._updatePinchZoom();
    if (document.hidden) return;
    this.ecosystem.update(delta);
    if (!this.ecosystem.paused) {
      this._visualTime += Math.min(delta, 100);
      this.fishSystem.update(Math.min(delta, 50));
      this.plantSystem.update(delta);
    }
    if (time - this._lastWaterAnimTime >= (this._reducedMotion ? 1000 : AMBIENT_ANIMATION_INTERVAL_MS)) {
      this._animateWaterShimmer(this._reducedMotion ? 0 : this._visualTime);
      const light = this.ecosystem.getLight();
      this._nightOverlay.setFillStyle(0x09243b, (1 - Math.sqrt(light)) * 0.34);
      this._lastWaterAnimTime = time;
    }
    if (time - this._lastMeadowAnimTime >= (this._reducedMotion ? 1000 : 100)) {
      this._animateMeadow(this._reducedMotion ? 0 : this._visualTime);
      this._lastMeadowAnimTime = time;
    }
    this._updatePlacementPreview(this.input.activePointer);

    // Smooth zoom towards target
    if (this._currentZoom !== undefined) {
      const cam = this.cameras.main;
      this._currentZoom = this._clampZoom(this._currentZoom);
      const diff = this._currentZoom - cam.zoom;
      if (Math.abs(diff) > 0.001) {
        cam.zoom = Phaser.Math.Linear(cam.zoom, this._currentZoom, 1 - Math.exp(-delta / 130));
      }
      this._nightOverlay.setScale(1 / cam.zoom).setPosition(
        cam.width * (1 - 1 / cam.zoom) / 2, cam.height * (1 - 1 / cam.zoom) / 2);
    }
  }

  _fitPondZoom(width: number, height: number) {
    return Math.min(1.8, (width - 36) / ((this.gridW + this.gridH) * HALF_W),
      Math.max(120, height - 270) / ((this.gridW + this.gridH) * HALF_H));
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
    // Bake thousands of static meadow strokes into one draw call.
    this._environmentTexture?.destroy();
    this._environmentTexture = this.add.renderTexture(vx, vy, VW, VH).setOrigin(0).setDepth(-9);
    this._environmentTexture.draw(this._bgGfx, -vx, -vy);
    this._environmentTexture.draw(this._meadowGfx, -vx, -vy);
    this._bgGfx.setVisible(false);
    this._meadowGfx.setVisible(false);
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

    // Only a small foreground sample sways; most grass is part of the cached scene.
    this._grassTufts.slice(36).forEach(tuft => {
      for (let b = 0; b < tuft.count; b++) {
        const ox = (b - (tuft.count - 1) / 2) * tuft.spread;
        gfx.lineStyle(1.2, tuft.color, 0.85);
        gfx.lineBetween(tuft.x + ox, tuft.y, tuft.x + ox + 1, tuft.y - tuft.h);
      }
    });
    this._grassTufts = this._grassTufts.slice(0, 36);

    // ── Wildflowers ───────────────────────────────────────────────────────
    this._flowerPositions = [];
    const flowerColors = [COLORS.flowerWhite, COLORS.flowerYellow, COLORS.flowerPink, COLORS.flowerBlue, COLORS.flowerPurple];
    for (let i = 0; i < 120; i++) {
      const fx = vx + rng() * VW;
      const fy = vy + rng() * VH;
      if (isInPond(fx, fy)) continue;
      const fcolor = flowerColors[Math.floor(rng() * flowerColors.length)];
      const fsize = 2 + rng() * 3;
      gfx.fillStyle(fcolor, 0.9);
      gfx.fillCircle(fx, fy - 6, fsize);
      gfx.fillStyle(COLORS.flowerYellow, 1);
      gfx.fillCircle(fx, fy - 6, fsize * 0.4);
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
      isoToScreen(0, 0, this.gridOriginX, this.gridOriginY),
      isoToScreen(this.gridW, 0, this.gridOriginX, this.gridOriginY),
      isoToScreen(this.gridW, this.gridH, this.gridOriginX, this.gridOriginY),
      isoToScreen(0, this.gridH, this.gridOriginX, this.gridOriginY),
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
    this._tileGfx?.destroy();
    this._placementGrid?.destroy();
    const gfx = this.add.graphics().setDepth(0);
    this._tileGfx = gfx;
    const corner = (x: number, y: number) => isoToScreen(x, y, this.gridOriginX, this.gridOriginY);
    const polygon = [corner(0, 0), corner(this.gridW, 0), corner(this.gridW, this.gridH), corner(0, this.gridH)];
    gfx.fillStyle(COLORS.waterMid, 1);
    gfx.fillPoints(polygon, true);
    // Concentric bathymetry gives continuous shallow edges and a darker basin.
    for (let i = 1; i <= 18; i++) {
      const inset = i * 0.035;
      gfx.fillStyle(COLORS.waterDeep, 0.045);
      gfx.fillPoints([corner(inset, inset), corner(this.gridW - inset, inset),
        corner(this.gridW - inset, this.gridH - inset), corner(inset, this.gridH - inset)], true);
    }
    gfx.lineStyle(2, COLORS.waterHighlight, 0.35);
    gfx.strokePoints(polygon, true);
    const grid = this.add.graphics().setDepth(2).setVisible(Boolean(this._placementSelection));
    this._placementGrid = grid;
    grid.lineStyle(1, 0xc4e5cf, 0.22);
    for (let x = 1; x < this.gridW; x++) {
      const a = corner(x, 0), b = corner(x, this.gridH);
      grid.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = 1; y < this.gridH; y++) {
      const a = corner(0, y), b = corner(this.gridW, y);
      grid.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  // ── Water shimmer ──────────────────────────────────────────────────────

  _createWaterShimmer() {
    this._shimmerGfx = this.add.graphics();
    this._shimmerGfx.setDepth(18);
    this._shimmerGfx.setAlpha(0.45);
  }

  // ── Inventory Tray ────────────────────────────────────────────────────────

  /**
   * Build an HTML overlay tray with explicit place buttons.
   * Click a card to arm placement, then click the pond to place it.
   */
  _buildInventoryTray() {
    const { width } = this.cameras.main;

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

    const hint = document.createElement('div');
    hint.dataset.placementHint = '1';
    hint.id = 'placement-hint';
    hint.setAttribute('role', 'status');
    Object.assign(hint.style, {
      minWidth: '180px',
      maxWidth: '220px',
      padding: '8px 12px',
      borderRadius: '12px',
      background: 'rgba(82, 183, 136, 0.12)',
      border: '1px solid rgba(82, 183, 136, 0.18)',
      color: 'rgba(208, 235, 216, 0.82)',
      fontSize: '11px',
      lineHeight: '1.4',
      flexShrink: '1',
    });
    hint.textContent = 'Choose a fish or plant, then tap the pond to place it.';
    tray.appendChild(hint);
    this._placementHintEl = hint;

    this._setupTrayPlacementEvents();
    this._applyResponsiveTrayLayout(width);
    this._refreshTraySelection();
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
   * Create a tray card for a given entity type and species.
   */
  _makeTrayCard(name: string, colorInt: number, type: 'fish' | 'plant', speciesKey: string, def: any): HTMLElement {
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;

    const card = document.createElement('button');
    card.type = 'button';
    card.setAttribute('aria-label', `Place ${name}`);
    card.setAttribute('aria-pressed', 'false');
    card.dataset.type = type;
    card.dataset.species = speciesKey;
    card.dataset.trayCard = '1';
    card.dataset.rgb = `${r},${g},${b}`;
    card.title = def.description || name;
    Object.assign(card.style, {
      width: '52px', height: '52px',
      borderRadius: '10px',
      background: `rgba(${r},${g},${b},0.18)`,
      border: `1.5px solid rgba(${r},${g},${b},0.5)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s, background 0.15s',
      flexShrink: '0',
      position: 'relative',
    });

    const preview = document.createElement('img');
    preview.className = 'tray-art';
    preview.alt = '';
    preview.draggable = false;
    preview.src = type === 'fish' ? `assets/images/fish_${speciesKey}_e.png`
      : this.textures.getBase64('plants', plantFrame(speciesKey, def.stages.length - 1));
    card.appendChild(preview);

    const lbl = document.createElement('span');
    Object.assign(lbl.style, {
      fontSize: '9px', color: 'rgba(168,216,185,0.85)',
      textAlign: 'center', lineHeight: '1.1',
    });
    lbl.textContent = name;
    card.appendChild(lbl);

    // Hover effect
    card.addEventListener('mouseenter', () => {
      if (card.dataset.active === '1') return;
      card.style.transform = 'scale(1.08)';
      card.style.boxShadow = `0 0 12px rgba(${r},${g},${b},0.45)`;
    });
    card.addEventListener('mouseleave', () => {
      if (card.dataset.active === '1') return;
      card.style.transform = '';
      card.style.boxShadow = '';
    });

    return card;
  }

  _applyResponsiveTrayLayout(width: number) {
    if (!this._inventoryTray || !this._placementHintEl) return;

    const compact = width < 760;
    Object.assign(this._inventoryTray.style, {
      bottom: compact ? '10px' : '16px',
      gap: compact ? '6px' : '10px',
      padding: compact ? '8px 10px' : '10px 16px',
      maxWidth: compact ? 'calc(100vw - 10px)' : '760px',
      flexWrap: compact ? 'wrap' : 'nowrap',
      borderRadius: compact ? '14px' : '16px',
      justifyContent: compact ? 'center' : 'center',
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

    Object.assign(this._placementHintEl.style, {
      minWidth: compact ? '100%' : '180px',
      maxWidth: compact ? '100%' : '220px',
      fontSize: compact ? '10px' : '11px',
      textAlign: compact ? 'center' : 'left',
    });
  }

  _setupTrayPlacementEvents() {
    this._inventoryTray.addEventListener('click', (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('[data-type]') as HTMLElement | null;
      if (!card) return;
      const sameSelection = this._placementSelection?.type === card.dataset.type
        && this._placementSelection?.species === card.dataset.species;
      this._setPlacementSelection(sameSelection ? null : {
        type: card.dataset.type as 'fish' | 'plant',
        species: card.dataset.species!,
      });
    });
  }

  _refreshTraySelection() {
    if (!this._inventoryTray || !this._placementHintEl) return;

    this._inventoryTray.querySelectorAll('[data-tray-card="1"]').forEach((cardEl) => {
      const card = cardEl as HTMLElement;
      const [r, g, b] = (card.dataset.rgb ?? '82,183,136').split(',').map((value) => Number(value));
      const active = this._placementSelection?.type === card.dataset.type
        && this._placementSelection?.species === card.dataset.species;
      card.dataset.active = active ? '1' : '0';
      card.setAttribute('aria-pressed', String(active));
      card.style.transform = active ? 'translateY(-2px) scale(1.08)' : '';
      card.style.boxShadow = active ? `0 0 18px rgba(${r},${g},${b},0.48)` : '';
      card.style.background = active ? `rgba(${r},${g},${b},0.32)` : `rgba(${r},${g},${b},0.18)`;
      card.style.borderColor = active ? `rgba(${r},${g},${b},0.95)` : `rgba(${r},${g},${b},0.5)`;
    });

    if (!this._placementSelection) {
      this._placementHintEl.textContent = 'Choose a fish or plant, then tap the pond to place it.';
      this._placementHintEl.style.color = 'rgba(208, 235, 216, 0.82)';
      this._placementHintEl.style.borderColor = 'rgba(82, 183, 136, 0.18)';
      return;
    }

    const defs = this._placementSelection.type === 'fish'
      ? speciesDefs.fish as Record<string, any>
      : speciesDefs.plants as Record<string, any>;
    const spec = defs[this._placementSelection.species];
    const colorInt = spec?.padColor ?? spec?.stemColor ?? spec?.color ?? COLORS.waterHighlight;
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;
    this._placementHintEl.textContent = `Tap ${spec?.habitat === 'marginal' ? 'an edge tile' : 'the pond'} to place ${spec?.name ?? this._placementSelection.species}. Tap again to cancel.`;
    this._placementHintEl.style.color = `rgba(${r},${g},${b},0.96)`;
    this._placementHintEl.style.borderColor = `rgba(${r},${g},${b},0.4)`;
  }

  _setPlacementSelection(selection: PlacementSelection | null) {
    this._placementSelection = selection;
    this._placementGrid?.setVisible(Boolean(selection));
    this._refreshTraySelection();
    this.fishSystem.setInteractivityEnabled(!selection);
    this.plantSystem.setInteractivityEnabled(!selection);
    this.sys.game.canvas.style.cursor = selection ? 'crosshair' : '';
    if (!selection && this._placementPreviewGfx) {
      this._placementPreviewGfx.clear();
    }
  }

  _createPlacementPreview() {
    this._placementPreviewGfx = this.add.graphics();
    this._placementPreviewGfx.setDepth(45);
  }

  _resolvePlacementPreview(pointer: Phaser.Input.Pointer): PlacementPreview | null {
    if (!this._placementSelection) return null;
    if (pointer.x < 0 || pointer.y < 0 || pointer.x > this.scale.width || pointer.y > this.scale.height) {
      return null;
    }

    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const worldX = world.x;
    const worldY = world.y;
    const { isoX, isoY } = screenToIso(worldX, worldY, this.gridOriginX, this.gridOriginY);
    if (isoX < 0 || isoY < 0 || isoX >= this.gridW || isoY >= this.gridH) {
      return null;
    }

    if (this._placementSelection.type === 'fish') {
      const spec = (speciesDefs.fish as Record<string, any>)[this._placementSelection.species];
      const margin = 0.24;
      const x = Phaser.Math.Clamp(isoX, margin, this.gridW - margin);
      const y = Phaser.Math.Clamp(isoY, margin, this.gridH - margin);
      const screen = isoToScreen(x, y, this.gridOriginX, this.gridOriginY);
      return {
        type: 'fish',
        valid: this.fishSystem.canPlaceFishAt(this._placementSelection.species, x, y),
        x,
        y,
        screenX: screen.x,
        screenY: screen.y,
        colorInt: spec?.color ?? COLORS.waterHighlight,
      };
    }

    const tileX = Math.floor(isoX);
    const tileY = Math.floor(isoY);
    const localX = Phaser.Math.Clamp(isoX - tileX, 0, 0.999);
    const localY = Phaser.Math.Clamp(isoY - tileY, 0, 0.999);
    const preferredSubX = Math.min(3, Math.floor(localX * 4));
    const preferredSubY = Math.min(3, Math.floor(localY * 4));
    const slot = this.plantSystem.findPlacementSlot(tileX, tileY, preferredSubX, preferredSubY, null, this._placementSelection.species);
    const previewSubX = slot?.subX ?? preferredSubX;
    const previewSubY = slot?.subY ?? preferredSubY;
    const screen = subTileToScreen(tileX, tileY, previewSubX, previewSubY, this.gridOriginX, this.gridOriginY);
    const spec = (speciesDefs.plants as Record<string, any>)[this._placementSelection.species];

    return {
      type: 'plant',
      valid: Boolean(slot),
      tileX,
      tileY,
      subX: previewSubX,
      subY: previewSubY,
      screenX: screen.x,
      screenY: screen.y,
      colorInt: spec?.padColor ?? spec?.stemColor ?? spec?.color ?? COLORS.waterHighlight,
    };
  }

  _updatePlacementPreview(pointer: Phaser.Input.Pointer) {
    if (!this._placementPreviewGfx) return;
    if (!this._placementSelection) {
      if (this._placementPreviewGfx.visible) {
        this._placementPreviewGfx.clear();
        this._placementPreviewGfx.setVisible(false);
      }
      return;
    }

    this._placementPreviewGfx.setVisible(true);
    this._placementPreviewGfx.clear();

    const preview = this._resolvePlacementPreview(pointer);
    if (!preview) return;

    const color = preview.valid ? preview.colorInt : 0xe76f51;
    const alpha = preview.valid ? 0.92 : 0.82;
    this._placementPreviewGfx.lineStyle(2, color, alpha);
    this._placementPreviewGfx.fillStyle(color, preview.valid ? 0.16 : 0.12);

    if (preview.type === 'fish') {
      this._placementPreviewGfx.fillEllipse(preview.screenX, preview.screenY, 34, 18);
      this._placementPreviewGfx.strokeEllipse(preview.screenX, preview.screenY, 34, 18);
      this._placementPreviewGfx.lineBetween(preview.screenX + 8, preview.screenY, preview.screenX + 22, preview.screenY);
    } else {
      const sizeX = HALF_W / 4;
      const sizeY = HALF_H / 4;
      this._placementPreviewGfx.beginPath();
      this._placementPreviewGfx.moveTo(preview.screenX, preview.screenY - sizeY);
      this._placementPreviewGfx.lineTo(preview.screenX + sizeX, preview.screenY);
      this._placementPreviewGfx.lineTo(preview.screenX, preview.screenY + sizeY);
      this._placementPreviewGfx.lineTo(preview.screenX - sizeX, preview.screenY);
      this._placementPreviewGfx.closePath();
      this._placementPreviewGfx.fillPath();
      this._placementPreviewGfx.strokePath();
    }
  }

  _handlePlacementPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this._placementSelection || this._pinchPrevDistance !== null) return;

    const preview = this._resolvePlacementPreview(pointer);
    if (!preview || !preview.valid) return;

    if (preview.type === 'fish') {
      const fishId = this.fishSystem.spawnFishAt(this._placementSelection.species, preview.x, preview.y);
      if (!fishId) return;
    } else {
      const plantId = this.plantSystem.placePlant(
        this._placementSelection.species,
        preview.tileX,
        preview.tileY,
        preview.subX,
        preview.subY
      );
      if (!plantId) return;
    }

    this.audio.playSfx('sfx_plop');
    this._setPlacementSelection(null);
  }

  _repositionInventoryTray(_w: number, _h: number) {
    this._applyResponsiveTrayLayout(_w);
    this._refreshTraySelection();
  }

  _animateWaterShimmer(time: number) {
    if (!this._shimmerGfx) return;
    this._shimmerGfx.clear();

    const t = time * 0.00025;
    for (let i = 0; i < 22; i++) {
      const x = 0.3 + ((i * 0.61803398875) % 1) * (this.gridW - 0.6);
      const y = 0.3 + ((i * 0.41421356237) % 1) * (this.gridH - 0.6);
      const p = isoToScreen(x, y, this.gridOriginX, this.gridOriginY);
      const wave = Math.sin(t + i * 1.7);
      this._shimmerGfx.lineStyle(0.8, 0xc6e9db, 0.08 + (wave + 1) * 0.05);
      const w = 8 + (Math.sin(t * 0.7 + i) + 1) * 8;
      this._shimmerGfx.lineBetween(p.x - w, p.y + wave * 2, p.x + w, p.y + wave * 2 - 1);
    }
  }
}
