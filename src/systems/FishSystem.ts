/**
 * FishSystem — manages fish AI behavior, animation, interaction, and info panel.
 *
 * Fish use simplified Boids-style steering:
 *   - Wander: gentle random drift
 *   - Separation: avoid overlapping other fish
 *   - Cohesion: loosely stay near the group
 *   - Bounds: stay within pond boundary
 *   - Flee: triggered by poke/click
 *
 * Fish also occasionally jump (projectile arc, splash particle).
 *
 * --- 8-directional sprites ---
 * 4 base textures per species: e, ne, n, se
 * 4 mirrored dirs: w=flip(e), nw=flip(ne), sw=flip(se), s=flip(n)
 * Direction selected from iso-space velocity each frame.
 *
 * --- Fish info panel ---
 * Clicking a fish opens an HTML overlay showing name (editable), species,
 * age, health, stress, and a harvest button.
 */

import speciesDefs from '../data/species';
import { generateId } from './StorageSystem';
import { isoToScreen } from '../utils/iso';

// ── Per-species name pools ───────────────────────────────────────────────────
const FISH_NAMES: Record<string, string[]> = {
  koi:       ['Sakura', 'Taro', 'Kiku', 'Nori', 'Ryu', 'Hana', 'Koji', 'Mizu',
               'Yuki', 'Sora', 'Kaito', 'Asahi'],
  goldfish:  ['Goldie', 'Nugget', 'Sunny', 'Citrus', 'Amber', 'Blaze', 'Copper',
               'Rusty', 'Marigold', 'Clementine', 'Ember', 'Pumpkin'],
  shubunkin: ['Pearl', 'Spot', 'Calico', 'Marble', 'Pepper', 'Freckle',
               'Mosaic', 'Splash', 'Pebble', 'Dapple', 'Patches', 'Speckle'],
};

// Direction lookup: 8 compass points, ordered clockwise starting East
// Index 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
const DIR_BASES  = ['e',  'se',  'n',  'se',  'e',  'ne',  'n',  'ne'];
const DIR_FLIPX  = [false, false, true, true,  true, true,  false, false];
// Note: S uses n+flipX (back view flipped), SW uses se+flipX, NW uses ne+flipX, W uses e+flipX

const TURN_INTERVAL_SECONDS = 2.0;
const TURN_INTERVAL_VARIANCE = 0.5;
const TURN_THRESHOLD_RADIANS = Math.PI / 8;

function normalizeAngle(angle: number): number {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function angleToDir(angle: number): number {
  return velocityToDir(Math.cos(angle), Math.sin(angle));
}

/**
 * Map iso-space velocity to one of 8 direction indices.
 * In isometric view: screen_vx = vx - vy, screen_vy = vx + vy
 */
function velocityToDir(vx: number, vy: number): number {
  const sx = vx - vy;
  const sy = vx + vy;
  if (Math.abs(sx) < 0.001 && Math.abs(sy) < 0.001) return 0; // stopped → E
  // atan2 gives angle in (-π, π]; normalize to [0, 2π)
  const angle = ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360;
  // Each sector is 45°, centered on 0°(E), 45°(SE), 90°(S), ...
  return Math.round(angle / 45) % 8;
}

export default class FishSystem {
  declare scene: Phaser.Scene;
  declare storage: any;
  declare bounds: any;
  declare speciesDefs: any;
  declare _fishObjects: Map<string, any>;
  declare _particles: any;
  declare _splashGraphics: Phaser.GameObjects.Graphics;
  declare _activeSplashes: any[];
  declare _infoPanel: HTMLElement | null;
  declare _infoPanelFishId: string | null;

  constructor(scene: Phaser.Scene, storage: any, pondBounds: any) {
    this.scene = scene;
    this.storage = storage;
    this.bounds = pondBounds;
    this.speciesDefs = speciesDefs.fish;

    this._fishObjects = new Map();
    this._particles = null;
    this._infoPanel = null;
    this._infoPanelFishId = null;
    this._setupParticles();
    this._buildInfoPanel();
  }

  _setupParticles() {
    this._splashGraphics = this.scene.add.graphics();
    this._activeSplashes = [];
  }

  // ── Fish name helpers ──────────────────────────────────────────────────────

  _generateFishName(species: string): string {
    const pool = FISH_NAMES[species] || ['Fish'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _nextTurnCooldown() {
    return TURN_INTERVAL_SECONDS + Math.random() * TURN_INTERVAL_VARIANCE;
  }

  _ensureFishMotionState(f: any, spec: any) {
    const maxSpeed = spec.speed / 100;
    const currentSpeed = Math.hypot(f.vx ?? 0, f.vy ?? 0);
    const headingAngle = Number.isFinite(f.headingAngle)
      ? f.headingAngle
      : currentSpeed > 0.001
        ? Math.atan2(f.vy, f.vx)
        : Math.random() * Math.PI * 2;
    const cruiseSpeed = currentSpeed > 0.001 ? currentSpeed : maxSpeed * (0.65 + Math.random() * 0.2);

    const updates: any = {};
    if (!Number.isFinite(f.headingAngle)) {
      f.headingAngle = headingAngle;
      updates.headingAngle = headingAngle;
    }
    if (!Number.isFinite(f.vx) || !Number.isFinite(f.vy) || currentSpeed <= 0.001) {
      f.vx = Math.cos(headingAngle) * cruiseSpeed;
      f.vy = Math.sin(headingAngle) * cruiseSpeed;
      updates.vx = f.vx;
      updates.vy = f.vy;
    }
    if (!Number.isFinite(f.turnCooldown)) {
      f.turnCooldown = this._nextTurnCooldown();
      updates.turnCooldown = f.turnCooldown;
    }
    if (!Number.isFinite(f.wanderAngle)) {
      f.wanderAngle = Math.random() * Math.PI * 2;
      updates.wanderAngle = f.wanderAngle;
    }
    if (!Number.isFinite(f.fleeTimer)) {
      f.fleeTimer = 0;
      updates.fleeTimer = 0;
    }
    if (!Number.isFinite(f.fleeVx)) {
      f.fleeVx = 0;
      updates.fleeVx = 0;
    }
    if (!Number.isFinite(f.fleeVy)) {
      f.fleeVy = 0;
      updates.fleeVy = 0;
    }
    if (typeof f.forceImmediateTurn !== 'boolean') {
      f.forceImmediateTurn = false;
      updates.forceImmediateTurn = false;
    }

    if (Object.keys(updates).length > 0) {
      this.storage.updateFish(f.id, updates);
    }
  }

  // ── Spawn / restore ────────────────────────────────────────────────────────

  spawnFish(species = 'koi') {
    const spec = this.speciesDefs[species];
    if (!spec) return;

    const id = generateId();
    const headingAngle = Math.random() * Math.PI * 2;
    const initialSpeed = spec.speed / 100 * (0.65 + Math.random() * 0.2);
    const fishData = {
      id,
      species,
      name: this._generateFishName(species),
      x: 0.5 + Math.random() * 3.0,
      y: 0.5 + Math.random() * 3.0,
      age: 0,
      health: 1.0,
      stress: 0.0,
      vx: Math.cos(headingAngle) * initialSpeed,
      vy: Math.sin(headingAngle) * initialSpeed,
      headingAngle,
      turnCooldown: this._nextTurnCooldown(),
      wanderAngle: Math.random() * Math.PI * 2,
      fleeTimer: 0,
      fleeVx: 0,
      fleeVy: 0,
      forceImmediateTurn: false,
      jumping: false,
      jumpTimer: 0,
    };
    this.storage.addFish(fishData);
    this._createFishSprite(fishData, spec);
    return id;
  }

  _createFishSprite(fishData: any, spec: any) {
    const container = this.scene.add.container(0, 0);
    container.setDepth(10 + fishData.x + fishData.y);

    // Drop shadow
    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillEllipse(4, 6, spec.size * 2.2, spec.size * 0.9);

    // Sprite — start with 'e' direction
    const baseKey = `fish_${fishData.species}_e`;
    const fallbackKey = `fish_${fishData.species}`;
    const startKey = this.scene.textures.exists(baseKey) ? baseKey : fallbackKey;

    let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    let baseScale = 1;

    if (this.scene.textures.exists(startKey)) {
      sprite = this.scene.add.image(0, 0, startKey);
      const targetW = spec.size * 2.6;
      const tex = this.scene.textures.get(startKey).getSourceImage() as HTMLImageElement;
      baseScale = targetW / (tex.width || 200);
      (sprite as Phaser.GameObjects.Image).setScale(baseScale);
      (sprite as Phaser.GameObjects.Image).setOrigin(0.5, 0.55);
    } else {
      const gfxFallback = this.scene.add.graphics();
      this._drawFishShape(gfxFallback, spec, 0, 0, 0);
      sprite = gfxFallback;
    }

    // Hover glow ring
    const glowRing = this.scene.add.graphics();
    glowRing.lineStyle(2, 0xffffff, 0);
    glowRing.strokeCircle(0, 0, spec.size * 1.4);

    container.add([shadow, glowRing, sprite as Phaser.GameObjects.GameObject]);
    container.setInteractive(
      new Phaser.Geom.Circle(0, 0, spec.size + 8),
      Phaser.Geom.Circle.Contains
    );

    container.on('pointerover', () => {
      this.scene.tweens.add({ targets: glowRing, alpha: 0.5, duration: 200 });
    });
    container.on('pointerout', () => {
      this.scene.tweens.add({ targets: glowRing, alpha: 0, duration: 300 });
    });
    container.on('pointerdown', () => {
      this._pokeFish(fishData.id);
      this._openInfoPanel(fishData.id);
    });

    this._fishObjects.set(fishData.id, {
      container, sprite, shadow, glowRing, spec, baseScale,
      currentDirIdx: 0,
    });
    this._positionFishContainer(fishData);
  }

  // Procedural fallback fish shape (kept for safety)
  _drawFishShape(gfx: any, spec: any, cx: any, cy: any, stress = 0) {
    gfx.clear();
    const color = spec.color;
    const s = spec.size;
    gfx.fillStyle(color, 0.92);
    gfx.fillEllipse(cx, cy, s * 2, s);
    gfx.fillStyle(spec.color, 0.75);
    gfx.fillTriangle(cx - s * 0.8, cy, cx - s * 1.7, cy - s * 0.6, cx - s * 1.7, cy + s * 0.6);
    gfx.fillStyle(0x1a1a2e, 1);
    gfx.fillCircle(cx + s * 0.5, cy - s * 0.1, s * 0.15);
  }

  _positionFishContainer(fishData: any) {
    const obj = this._fishObjects.get(fishData.id);
    if (!obj) return;
    const screen = isoToScreen(fishData.x, fishData.y, this.bounds.originX, this.bounds.originY);
    obj.container.setPosition(screen.x, screen.y);
    obj.container.setDepth(10 + fishData.x + fishData.y);
  }

  // ── Main update loop ───────────────────────────────────────────────────────

  update(delta: number) {
    const dt = delta / 1000;
    const fish = this.storage.getFish();

    fish.forEach((f: any) => {
      if (f.jumping) {
        this._updateJump(f, dt);
      } else {
        this._updateSteering(f, fish, dt);
        this._maybeJump(f, dt);
      }
      this._positionFishContainer(f);
      this._refreshFishGraphics(f);
    });

    this._updateSplashes(dt);

    // Keep info panel synced if open
    if (this._infoPanelFishId) {
      const f = this.storage.getFish().find((x: any) => x.id === this._infoPanelFishId);
      if (f) this._syncInfoPanelData(f);
    }
  }

  // ── Steering (Boids) ───────────────────────────────────────────────────────

  _updateSteering(f: any, allFish: any, dt: any) {
    const spec = this.speciesDefs[f.species];
    if (!spec) return;
    this._ensureFishMotionState(f, spec);

    const maxSpeed = spec.speed / 100;
    const minCruiseSpeed = maxSpeed * 0.5;
    const WANDER_STRENGTH = 0.015;
    const SEPARATION_DIST = 0.6;
    const BOUND_MARGIN = 0.35;
    const minX = 0.1;
    const maxX = this.bounds.gridW - 0.1;
    const minY = 0.1;
    const maxY = this.bounds.gridH - 0.1;

    f.wanderAngle += (Math.random() - 0.5) * 0.15;
    let desiredVx = Math.cos(f.wanderAngle) * WANDER_STRENGTH;
    let desiredVy = Math.sin(f.wanderAngle) * WANDER_STRENGTH;

    let sx = 0, sy = 0;
    allFish.forEach((other: any) => {
      if (other.id === f.id) return;
      const dx = f.x - other.x, dy = f.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SEPARATION_DIST && dist > 0) { sx += dx / dist / dist; sy += dy / dist / dist; }
    });
    sx *= 0.05; sy *= 0.05;

    let cx = 0, cy = 0;
    if (allFish.length > 1) {
      allFish.forEach((other: any) => { if (other.id !== f.id) { cx += other.x; cy += other.y; } });
      cx /= (allFish.length - 1); cy /= (allFish.length - 1);
      desiredVx += (cx - f.x) * 0.001; desiredVy += (cy - f.y) * 0.001;
    }

    if (f.fleeTimer > 0) {
      f.fleeTimer = Math.max(0, f.fleeTimer - dt);
      const fleeStr = Math.min(1, f.fleeTimer / 0.5) * 0.3;
      desiredVx += f.fleeVx * fleeStr; desiredVy += f.fleeVy * fleeStr;
    }

    if (f.x < BOUND_MARGIN) desiredVx += 0.05;
    if (f.x > this.bounds.gridW - BOUND_MARGIN) desiredVx -= 0.05;
    if (f.y < BOUND_MARGIN) desiredVy += 0.05;
    if (f.y > this.bounds.gridH - BOUND_MARGIN) desiredVy -= 0.05;

    desiredVx += sx;
    desiredVy += sy;

    f.turnCooldown = Math.max(0, f.turnCooldown - dt);
    const currentAngle = Number.isFinite(f.headingAngle) ? f.headingAngle : Math.atan2(f.vy, f.vx);
    const desiredAngle = Math.abs(desiredVx) > 0.0001 || Math.abs(desiredVy) > 0.0001
      ? Math.atan2(desiredVy, desiredVx)
      : currentAngle;
    const wantsTurn = Math.abs(angleDelta(currentAngle, desiredAngle)) > TURN_THRESHOLD_RADIANS;
    const headingOutward =
      (f.x <= minX + 0.02 && Math.cos(currentAngle) < 0) ||
      (f.x >= maxX - 0.02 && Math.cos(currentAngle) > 0) ||
      (f.y <= minY + 0.02 && Math.sin(currentAngle) < 0) ||
      (f.y >= maxY - 0.02 && Math.sin(currentAngle) > 0);

    if (f.forceImmediateTurn || (f.turnCooldown <= 0 && (wantsTurn || headingOutward))) {
      f.headingAngle = desiredAngle;
      f.turnCooldown = this._nextTurnCooldown();
      f.forceImmediateTurn = false;
    }

    const currentSpeed = Math.hypot(f.vx, f.vy);
    let targetSpeed = f.fleeTimer > 0
      ? maxSpeed
      : Math.max(minCruiseSpeed, Math.min(maxSpeed, currentSpeed * 0.98 + Math.hypot(desiredVx, desiredVy) * 1.2));

    if (headingOutward && f.turnCooldown > 0) {
      targetSpeed = 0;
    }

    const speedLerp = targetSpeed === 0 ? 0.2 : 0.08;
    const nextSpeed = currentSpeed + (targetSpeed - currentSpeed) * speedLerp;
    f.vx = Math.cos(f.headingAngle) * nextSpeed;
    f.vy = Math.sin(f.headingAngle) * nextSpeed;

    f.x = Math.max(minX, Math.min(maxX, f.x + f.vx * dt));
    f.y = Math.max(minY, Math.min(maxY, f.y + f.vy * dt));

    this.storage.updateFish(f.id, {
      x: f.x,
      y: f.y,
      vx: f.vx,
      vy: f.vy,
      headingAngle: f.headingAngle,
      wanderAngle: f.wanderAngle,
      fleeTimer: f.fleeTimer,
      turnCooldown: f.turnCooldown,
      forceImmediateTurn: f.forceImmediateTurn,
    });
  }

  // ── Jumping ────────────────────────────────────────────────────────────────

  _maybeJump(f: any, dt: any) {
    const spec = this.speciesDefs[f.species];
    if (!spec || f.stress > 0.7) return;
    if (Math.random() < spec.jumpChance * dt * 60) this._startJump(f);
  }

  _startJump(f: any) {
    f.jumping = true; f.jumpTimer = 0;
    f.jumpDuration = 0.8 + Math.random() * 0.4;
    f.jumpStartX = f.x; f.jumpStartY = f.y; f.jumpOffsetZ = 0;
    this.storage.updateFish(f.id, { jumping: true, jumpTimer: 0 });
    this._splashAt(f.x, f.y);
  }

  _updateJump(f: any, dt: any) {
    f.jumpTimer += dt;
    const t = f.jumpTimer / f.jumpDuration;
    const arcHeight = 40 * Math.sin(Math.PI * t);

    const obj = this._fishObjects.get(f.id);
    if (obj) {
      const screen = isoToScreen(f.x, f.y, this.bounds.originX, this.bounds.originY);
      obj.container.setPosition(screen.x, screen.y - arcHeight);
      obj.container.setAlpha(t > 0.9 ? 1 - (t - 0.9) * 10 : 1);
    }

    if (f.jumpTimer >= f.jumpDuration) {
      f.jumping = false;
      if (obj) obj.container.setAlpha(1);
      this._splashAt(f.x, f.y);
      if ((this.scene as any).audio) (this.scene as any).audio.playSfx('sfx_splash');
      this.storage.updateFish(f.id, { jumping: false, jumpTimer: 0 });
    } else {
      this.storage.updateFish(f.id, { jumpTimer: f.jumpTimer });
    }
  }

  // ── Poke ──────────────────────────────────────────────────────────────────

  _pokeFish(fishId: string) {
    const f = this.storage.getFish().find((f: any) => f.id === fishId);
    if (!f) return;
    const spec = this.speciesDefs[f.species];
    const fleeDist = spec.personality === 'skittish' ? 1.5 : spec.personality === 'calm' ? 0.6 : 1.0;
    const angle = Math.random() * Math.PI * 2;
    const fleeSpeed = Math.max(spec.speed / 100, Math.hypot(f.vx ?? 0, f.vy ?? 0));
    f.headingAngle = angle;
    f.vx = Math.cos(angle) * fleeSpeed;
    f.vy = Math.sin(angle) * fleeSpeed;
    f.wanderAngle = angle;
    f.turnCooldown = this._nextTurnCooldown();
    f.fleeVx = Math.cos(angle) * fleeDist; f.fleeVy = Math.sin(angle) * fleeDist;
    f.fleeTimer = 1.2;
    f.forceImmediateTurn = false;
    this.storage.updateFish(f.id, {
      vx: f.vx,
      vy: f.vy,
      headingAngle: f.headingAngle,
      wanderAngle: f.wanderAngle,
      turnCooldown: f.turnCooldown,
      fleeVx: f.fleeVx,
      fleeVy: f.fleeVy,
      fleeTimer: f.fleeTimer,
      forceImmediateTurn: f.forceImmediateTurn,
    });
    this._splashAt(f.x, f.y);
    if ((this.scene as any).audio) (this.scene as any).audio.playSfx('sfx_splash');
  }

  // ── Splash particles ───────────────────────────────────────────────────────

  _splashAt(isoX: number, isoY: number) {
    const screen = isoToScreen(isoX, isoY, this.bounds.originX, this.bounds.originY);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this._activeSplashes.push({
        x: screen.x, y: screen.y,
        vx: Math.cos(angle) * (20 + Math.random() * 30),
        vy: Math.sin(angle) * (10 + Math.random() * 15) - 20,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
      });
    }
  }

  _updateSplashes(dt: number) {
    this._splashGraphics.clear();
    this._activeSplashes = this._activeSplashes.filter((p: any) => p.life > 0);
    this._activeSplashes.forEach((p: any) => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt;
      const alpha = p.life / p.maxLife;
      this._splashGraphics.fillStyle(0xaaddff, alpha * 0.85);
      this._splashGraphics.fillCircle(p.x, p.y, p.size * alpha);
    });
    this._splashGraphics.setDepth(50);
  }

  // ── Graphics refresh (direction + wobble + stress tint) ───────────────────

  _refreshFishGraphics(f: any) {
    const obj = this._fishObjects.get(f.id);
    if (!obj || f.jumping) return;
    const spec = this.speciesDefs[f.species];

    // --- 8-directional sprite switching ---
    const dirIdx = Math.hypot(f.vx ?? 0, f.vy ?? 0) > 0.02
      ? velocityToDir(f.vx, f.vy)
      : angleToDir(f.headingAngle ?? 0);
    const baseTexKey  = `fish_${f.species}_${DIR_BASES[dirIdx]}`;
    const fallbackKey = `fish_${f.species}`;
    const texKey = this.scene.textures.exists(baseTexKey) ? baseTexKey : fallbackKey;
    const flipX = DIR_FLIPX[dirIdx];

    const img = obj.sprite as Phaser.GameObjects.Image;
    if (img && img.setTexture) {
      // Only call setTexture if direction changed (avoids GPU churn)
      if (dirIdx !== obj.currentDirIdx) {
        img.setTexture(texKey);
        obj.currentDirIdx = dirIdx;
        // Recompute scale in case new texture has different dimensions
        const tex = this.scene.textures.get(texKey).getSourceImage() as HTMLImageElement;
        const targetW = spec.size * 2.6;
        obj.baseScale = targetW / (tex.width || 200);
      }
      img.setFlipX(flipX);

      // Wobble: subtle X-scale sine to mimic body undulation
      const t = this.scene.time.now * 0.003;
      const wobble = 1 + Math.sin(t * spec.speed * 0.04 + f.x) * 0.05;
      const scaleX = obj.baseScale * wobble;
      const scaleY = obj.baseScale;
      img.setScale(scaleX, scaleY);

      // Stress tint
      if (f.stress > 0.3) {
        const sf = Math.min(1, (f.stress - 0.3) / 0.7);
        const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
          { r: 255, g: 255, b: 255, a: 255 } as any,
          { r: 140, g: 160, b: 190, a: 255 } as any,
          100, Math.floor(sf * 80)
        );
        img.setTint(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b));
      } else {
        img.clearTint();
      }
    }
  }

  // ── Info Panel ─────────────────────────────────────────────────────────────

  _buildInfoPanel() {
    const panel = document.createElement('div');
    panel.id = 'fish-info-panel';
    Object.assign(panel.style, {
      position: 'absolute',
      top: '16px',
      left: '16px',
      width: '220px',
      background: 'rgba(8, 20, 10, 0.82)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(82, 183, 136, 0.35)',
      borderRadius: '14px',
      padding: '14px 16px 12px',
      zIndex: '200',
      display: 'none',
      fontFamily: 'Georgia, serif',
      color: '#c8e8d0',
      boxShadow: '0 6px 28px rgba(0,0,0,0.55)',
    });
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span id="fip-species" style="font-size:11px;color:#6b9b7e;letter-spacing:1px;text-transform:uppercase"></span>
        <button id="fip-close" style="background:none;border:none;color:#6b9b7e;font-size:16px;cursor:pointer;padding:0 2px;line-height:1">×</button>
      </div>
      <input id="fip-name" type="text" maxlength="20"
        style="width:100%;background:rgba(82,183,136,0.1);border:1px solid rgba(82,183,136,0.3);
               border-radius:7px;color:#e8f4e8;font-size:16px;font-family:Georgia,serif;
               padding:5px 9px;margin-bottom:12px;box-sizing:border-box;outline:none" />
      <div id="fip-stats" style="font-size:11px;line-height:2"></div>
      <button id="fip-harvest"
        style="margin-top:12px;width:100%;padding:7px 0;border-radius:8px;border:1px solid rgba(230,111,81,0.5);
               background:rgba(230,111,81,0.12);color:#e76f51;font-family:Georgia,serif;
               font-size:12px;cursor:pointer;transition:background 0.2s">
        Release Fish 🐟
      </button>`;
    document.getElementById('game-container')!.appendChild(panel);
    this._infoPanel = panel;

    // Close button
    panel.querySelector('#fip-close')!.addEventListener('click', () => this._closeInfoPanel());

    // Name rename on blur / enter
    const nameInput = panel.querySelector('#fip-name') as HTMLInputElement;
    const saveName = () => {
      if (!this._infoPanelFishId) return;
      const trimmed = nameInput.value.trim() || 'Fish';
      this.storage.updateFish(this._infoPanelFishId, { name: trimmed });
    };
    nameInput.addEventListener('blur', saveName);
    nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { saveName(); nameInput.blur(); }
    });

    // Harvest button
    const harvestBtn = panel.querySelector('#fip-harvest') as HTMLButtonElement;
    harvestBtn.addEventListener('mouseenter', () => {
      harvestBtn.style.background = 'rgba(230,111,81,0.25)';
    });
    harvestBtn.addEventListener('mouseleave', () => {
      harvestBtn.style.background = 'rgba(230,111,81,0.12)';
    });
    harvestBtn.addEventListener('click', () => {
      if (!this._infoPanelFishId) return;
      if ((this.scene as any).audio) (this.scene as any).audio.playSfx('sfx_plop');
      this.removeFish(this._infoPanelFishId);
      this._closeInfoPanel();
    });
  }

  _openInfoPanel(fishId: string) {
    const f = this.storage.getFish().find((x: any) => x.id === fishId);
    if (!f || !this._infoPanel) return;
    this._infoPanelFishId = fishId;
    this._syncInfoPanelData(f);
    this._infoPanel.style.display = 'block';
    // Small entrance animation
    this._infoPanel.style.opacity = '0';
    this._infoPanel.style.transform = 'translateY(-6px)';
    this._infoPanel.style.transition = 'opacity 0.2s, transform 0.2s';
    requestAnimationFrame(() => {
      if (!this._infoPanel) return;
      this._infoPanel.style.opacity = '1';
      this._infoPanel.style.transform = 'translateY(0)';
    });
  }

  _syncInfoPanelData(f: any) {
    if (!this._infoPanel || this._infoPanelFishId !== f.id) return;
    const spec = this.speciesDefs[f.species];

    (this._infoPanel.querySelector('#fip-species') as HTMLElement).textContent = spec?.name ?? f.species;

    // Don't overwrite name while user is typing
    const nameInput = this._infoPanel.querySelector('#fip-name') as HTMLInputElement;
    if (document.activeElement !== nameInput) {
      nameInput.value = f.name ?? f.species;
    }

    const healthPct  = Math.round((f.health ?? 1) * 100);
    const stressPct  = Math.round((f.stress ?? 0) * 100);
    const ageDays    = Math.floor((f.age ?? 0) / 1440); // 1440 mins per day
    const healthCol  = healthPct > 70 ? '#74c69d' : healthPct > 40 ? '#e9c46a' : '#e76f51';
    const stressCol  = stressPct < 20 ? '#74c69d' : stressPct < 60 ? '#e9c46a' : '#e76f51';

    (this._infoPanel.querySelector('#fip-stats') as HTMLElement).innerHTML = `
      <div style="display:flex;justify-content:space-between">
        <span style="color:#8aaa8e">Age</span>
        <span>Day ${ageDays}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:#8aaa8e">Health</span>
        <span style="color:${healthCol}">${healthPct}%</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;margin:-4px 0 4px">
        <div style="height:100%;width:${healthPct}%;background:${healthCol};border-radius:3px;transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:#8aaa8e">Stress</span>
        <span style="color:${stressCol}">${stressPct}%</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;margin:-4px 0 0">
        <div style="height:100%;width:${stressPct}%;background:${stressCol};border-radius:3px;transition:width 0.5s"></div>
      </div>`;
  }

  _closeInfoPanel() {
    if (!this._infoPanel) return;
    this._infoPanel.style.opacity = '0';
    this._infoPanel.style.transform = 'translateY(-6px)';
    setTimeout(() => { if (this._infoPanel) this._infoPanel.style.display = 'none'; }, 200);
    this._infoPanelFishId = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  removeFish(id: string) {
    const obj = this._fishObjects.get(id);
    if (obj) { obj.container.destroy(); this._fishObjects.delete(id); }
    this.storage.removeFish(id);
  }

  restoreFromStorage() {
    this.storage.getFish().forEach((f: any) => {
      const spec = this.speciesDefs[f.species];
      // Ensure legacy saves get a name
      if (!f.name) {
        f.name = this._generateFishName(f.species);
        this.storage.updateFish(f.id, { name: f.name });
      }
      if (spec) {
        this._ensureFishMotionState(f, spec);
        this._createFishSprite(f, spec);
      }
    });
  }
}
