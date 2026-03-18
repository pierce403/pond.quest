/**
 * FishSystem — manages fish AI behavior, animation, and interaction.
 *
 * Fish use simplified Boids-style steering:
 *   - Wander: gentle random drift
 *   - Separation: avoid overlapping other fish
 *   - Cohesion: loosely stay near the group
 *   - Bounds: stay within pond boundary
 *   - Flee: triggered by poke/click
 *
 * Fish also occasionally jump (projectile arc, splash particle).
 */

import speciesDefs from '../data/species';
import { generateId } from './StorageSystem';
import { isoToScreen, TILE_W, TILE_H } from '../utils/iso';

export default class FishSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {StorageSystem} storage
   * @param {{ originX, originY, gridW, gridH }} pondBounds - isometric bounds
   */
  constructor(scene, storage, pondBounds) {
    this.scene = scene;
    this.storage = storage;
    this.bounds = pondBounds;
    this.speciesDefs = speciesDefs.fish;

    // Phaser graphics/containers for rendering
    this._fishObjects = new Map(); // fishId → { gfx, body, label, state }
    this._particles = null;
    this._setupParticles();
  }

  _setupParticles() {
    // Splash particles for jumps and pokes — drawn as tiny white/blue circles
    this._splashGraphics = this.scene.add.graphics();
    this._activeSplashes = [];
  }

  /**
   * Spawn a new fish of the given species at a random pond position.
   */
  spawnFish(species = 'koi') {
    const spec = this.speciesDefs[species];
    if (!spec) return;

    const id = generateId();
    // Random position within the pond (in iso tile-space floats, 0.3–3.7)
    const fishData = {
      id,
      species,
      x: 0.5 + Math.random() * 3.0,
      y: 0.5 + Math.random() * 3.0,
      age: 0,
      health: 1.0,
      stress: 0.0,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      wanderAngle: Math.random() * Math.PI * 2,
      fleeTimer: 0,
      fleeVx: 0,
      fleeVy: 0,
      jumping: false,
      jumpTimer: 0,
    };
    this.storage.addFish(fishData);
    this._createFishSprite(fishData, spec);
    return id;
  }

  _createFishSprite(fishData, spec) {
    const container = this.scene.add.container(0, 0);
    container.setDepth(10 + fishData.x + fishData.y);

    // Fish body — drawn procedurally as an ellipse + tail
    const gfx = this.scene.add.graphics();
    this._drawFishShape(gfx, spec, 0, 0, fishData.stress || 0);

    // Subtle label (species name, tiny) — hidden by default
    const label = this.scene.add.text(0, -22, spec.name, {
      fontSize: '9px',
      color: '#e8f4e8',
      alpha: 0,
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    container.add([gfx, label]);
    container.setInteractive(
      new Phaser.Geom.Circle(0, 0, spec.size + 6),
      Phaser.Geom.Circle.Contains
    );
    container.on('pointerover', () => {
      this.scene.tweens.add({ targets: label, alpha: 0.8, duration: 200 });
    });
    container.on('pointerout', () => {
      this.scene.tweens.add({ targets: label, alpha: 0, duration: 300 });
    });
    container.on('pointerdown', () => this._pokeFish(fishData.id));

    this._fishObjects.set(fishData.id, { container, gfx, label, spec });
    this._positionFishContainer(fishData);
  }

  _drawFishShape(gfx, spec, cx, cy, stress = 0) {
    gfx.clear();

    // Body color shifts slightly blue-gray when stressed
    const bodyColor = stress > 0.3
      ? Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(spec.color),
          Phaser.Display.Color.IntegerToColor(0x8899aa),
          100, Math.floor(stress * 70)
        )
      : null;
    const color = bodyColor
      ? Phaser.Display.Color.GetColor(bodyColor.r, bodyColor.g, bodyColor.b)
      : spec.color;

    const s = spec.size;
    gfx.fillStyle(color, 0.92);
    gfx.fillEllipse(cx, cy, s * 2, s);

    // Tail fin (fans outward from body)
    gfx.fillStyle(spec.color, 0.75);
    gfx.fillTriangle(cx - s * 0.8, cy, cx - s * 1.7, cy - s * 0.6, cx - s * 1.7, cy + s * 0.6);

    // Eye
    gfx.fillStyle(0x1a1a2e, 1);
    gfx.fillCircle(cx + s * 0.5, cy - s * 0.1, s * 0.15);
  }

  /**
   * Convert fish's iso-space position to screen position for the container.
   */
  _positionFishContainer(fishData) {
    const obj = this._fishObjects.get(fishData.id);
    if (!obj) return;
    const screen = isoToScreen(fishData.x, fishData.y, this.bounds.originX, this.bounds.originY);
    obj.container.setPosition(screen.x, screen.y);
    obj.container.setDepth(10 + fishData.x + fishData.y);
  }

  /**
   * Main update loop — called every Phaser frame.
   */
  update(delta) {
    const dt = delta / 1000; // seconds
    const fish = this.storage.getFish();

    fish.forEach(f => {
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
  }

  _updateSteering(f, allFish, dt) {
    const spec = this.speciesDefs[f.species];
    if (!spec) return;

    const speed = spec.speed / 100; // normalize to tile-units per second
    const WANDER_STRENGTH = 0.015;
    const SEPARATION_DIST = 0.6;
    const BOUND_MARGIN = 0.3;
    const MAX_SPEED = speed;

    // Wander: slowly rotate a target angle
    f.wanderAngle += (Math.random() - 0.5) * 0.4;
    let wx = Math.cos(f.wanderAngle) * WANDER_STRENGTH;
    let wy = Math.sin(f.wanderAngle) * WANDER_STRENGTH;

    // Separation: push away from nearby fish
    let sx = 0, sy = 0;
    allFish.forEach(other => {
      if (other.id === f.id) return;
      const dx = f.x - other.x, dy = f.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SEPARATION_DIST && dist > 0) {
        sx += dx / dist / dist;
        sy += dy / dist / dist;
      }
    });
    sx *= 0.05; sy *= 0.05;

    // Cohesion: gently drift toward center of mass
    let cx = 0, cy = 0;
    if (allFish.length > 1) {
      allFish.forEach(other => { if (other.id !== f.id) { cx += other.x; cy += other.y; } });
      cx /= (allFish.length - 1); cy /= (allFish.length - 1);
      const coheX = (cx - f.x) * 0.001;
      const coheY = (cy - f.y) * 0.001;
      wx += coheX; wy += coheY;
    }

    // Flee: if recently poked, override with flee vector
    if (f.fleeTimer > 0) {
      f.fleeTimer -= dt;
      const fleeStr = Math.min(1, f.fleeTimer / 0.5) * 0.3;
      wx += f.fleeVx * fleeStr;
      wy += f.fleeVy * fleeStr;
    }

    // Boundary: push back from pond edges
    if (f.x < BOUND_MARGIN) wx += 0.05;
    if (f.x > 4 - BOUND_MARGIN) wx -= 0.05;
    if (f.y < BOUND_MARGIN) wy += 0.05;
    if (f.y > 4 - BOUND_MARGIN) wy -= 0.05;

    // Integrate velocity
    f.vx = (f.vx + wx + sx) * 0.85;
    f.vy = (f.vy + wy + sy) * 0.85;

    // Clamp speed
    const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (spd > MAX_SPEED) { f.vx = f.vx / spd * MAX_SPEED; f.vy = f.vy / spd * MAX_SPEED; }

    f.x = Math.max(0.1, Math.min(3.9, f.x + f.vx * dt));
    f.y = Math.max(0.1, Math.min(3.9, f.y + f.vy * dt));

    this.storage.updateFish(f.id, { x: f.x, y: f.y, vx: f.vx, vy: f.vy, wanderAngle: f.wanderAngle, fleeTimer: f.fleeTimer });
  }

  _maybeJump(f, dt) {
    const spec = this.speciesDefs[f.species];
    if (!spec || f.stress > 0.7) return; // stressed fish don't jump
    // jumpChance is per-tick probability; scale by dt (at 60fps, dt≈0.016)
    if (Math.random() < spec.jumpChance * dt * 60) {
      this._startJump(f);
    }
  }

  _startJump(f) {
    f.jumping = true;
    f.jumpTimer = 0;
    f.jumpDuration = 0.8 + Math.random() * 0.4; // 0.8–1.2 seconds
    f.jumpStartX = f.x;
    f.jumpStartY = f.y;
    f.jumpOffsetZ = 0; // vertical screen offset during arc
    this.storage.updateFish(f.id, { jumping: true, jumpTimer: 0 });

    // Splash at jump-start position
    this._splashAt(f.x, f.y);
  }

  _updateJump(f, dt) {
    f.jumpTimer += dt;
    const t = f.jumpTimer / f.jumpDuration;
    // Parabolic arc: sin(π * t) gives a natural jump
    const arcHeight = 40 * Math.sin(Math.PI * t); // pixels at peak

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
      if (this.scene.audio) {
        this.scene.audio.playSfx('sfx_splash');
      }
      this.storage.updateFish(f.id, { jumping: false, jumpTimer: 0 });
    } else {
      this.storage.updateFish(f.id, { jumpTimer: f.jumpTimer });
    }
  }

  _pokeFish(fishId) {
    const f = this.storage.getFish().find(f => f.id === fishId);
    if (!f) return;
    const spec = this.speciesDefs[f.species];

    // Flee direction = away from screen center (approximate)
    const fleeDist = spec.personality === 'skittish' ? 1.5 : spec.personality === 'calm' ? 0.6 : 1.0;
    const angle = Math.random() * Math.PI * 2;
    f.fleeVx = Math.cos(angle) * fleeDist;
    f.fleeVy = Math.sin(angle) * fleeDist;
    f.fleeTimer = 1.2;
    this.storage.updateFish(f.id, { fleeVx: f.fleeVx, fleeVy: f.fleeVy, fleeTimer: f.fleeTimer });

    this._splashAt(f.x, f.y);
    if (this.scene.audio) this.scene.audio.playSfx('sfx_splash');
  }

  _splashAt(isoX, isoY) {
    const screen = isoToScreen(isoX, isoY, this.bounds.originX, this.bounds.originY);
    const particles = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particles.push({
        x: screen.x, y: screen.y,
        vx: Math.cos(angle) * (20 + Math.random() * 30),
        vy: Math.sin(angle) * (10 + Math.random() * 15) - 20,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
      });
    }
    this._activeSplashes.push(...particles);
  }

  _updateSplashes(dt) {
    this._splashGraphics.clear();
    this._activeSplashes = this._activeSplashes.filter(p => p.life > 0);
    this._activeSplashes.forEach(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt; // gravity
      const alpha = p.life / p.maxLife;
      this._splashGraphics.fillStyle(0xaaddff, alpha * 0.85);
      this._splashGraphics.fillCircle(p.x, p.y, p.size * alpha);
    });
    this._splashGraphics.setDepth(50);
  }

  _refreshFishGraphics(f) {
    const obj = this._fishObjects.get(f.id);
    if (!obj || f.jumping) return;
    const spec = this.speciesDefs[f.species];
    // Redraw if stress changed significantly (avoid redrawing every frame)
    this._drawFishShape(obj.gfx, spec, 0, 0, f.stress || 0);

    // Flip graphics based on movement direction (only flip gfx so text stays readable)
    const movingLeft = (f.vx - f.vy) < 0;
    obj.gfx.setScale(movingLeft ? -1 : 1, 1);
  }

  /** Remove a fish entity and its sprite */
  removeFish(id) {
    const obj = this._fishObjects.get(id);
    if (obj) { obj.container.destroy(); this._fishObjects.delete(id); }
    this.storage.removeFish(id);
  }

  /** Restore all fish from saved state (called on scene load) */
  restoreFromStorage() {
    this.storage.getFish().forEach(f => {
      const spec = this.speciesDefs[f.species];
      if (spec) this._createFishSprite(f, spec);
    });
  }
}
