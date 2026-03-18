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
};

export default class PondScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PondScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Grid origin: center of the screen, shifted up a bit
    this.gridOriginX = width / 2;
    this.gridOriginY = height / 2 - 50;
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
    this.input.on('pointerdown', (pointer) => {
      // Unlock audio on first click (browser autoplay policy)
      this.audio.unlock();
    });

    // ── Launch UI overlay scene in parallel ───────────────────────────────
    this.scene.launch('UIScene', { storage: this.storage, ecosystem: this.ecosystem });

    // ── Handle resize ────────────────────────────────────────────────────
    this.scale.on('resize', (gameSize) => {
      this.gridOriginX = gameSize.width / 2;
      this.gridOriginY = gameSize.height / 2 - 50;
      // Redraw pond on resize
      this._drawPondBackground();
      this._drawTileGrid();
    });
  }

  update(time, delta) {
    this.ecosystem.update(delta);
    this.fishSystem.update(delta);
    this.plantSystem.update(delta);
    this._animateWaterShimmer(time);
  }

  // ── Pond rendering ───────────────────────────────────────────────────────

  _drawPondBackground() {
    if (this._bgGfx) this._bgGfx.destroy();
    this._bgGfx = this.add.graphics();
    this._bgGfx.setDepth(-10);

    const { width, height } = this.cameras.main;

    // Full-screen dark ground
    this._bgGfx.fillStyle(COLORS.groundDark, 1);
    this._bgGfx.fillRect(0, 0, width, height);

    // Soft gradient toward pond center — radial green
    const cx = this.gridOriginX;
    const cy = this.gridOriginY + 50;
    for (let r = 400; r > 0; r -= 8) {
      const alpha = 0.02 + (1 - r / 400) * 0.08;
      this._bgGfx.fillStyle(COLORS.ground, alpha);
      this._bgGfx.fillEllipse(cx, cy, r * 2, r * 1.2);
    }

    // Edge stones/border around the pond
    this._drawPondEdge();
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

  _drawTile(gfx, isoX, isoY) {
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

  _animateWaterShimmer(time) {
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
