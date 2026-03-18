/**
 * Fish entity — data model for a single fish.
 *
 * This is primarily a data schema (matching MUD table row) with
 * convenience methods. The actual behavior lives in FishSystem.
 */

export default class Fish {
  constructor(data = {}) {
    this.id = data.id || '';
    this.species = data.species || 'koi';
    this.x = data.x || 2.0;   // iso-space position (float 0–4)
    this.y = data.y || 2.0;
    this.age = data.age || 0;  // in-game days
    this.health = data.health ?? 1.0;
    this.stress = data.stress || 0.0;

    // Physics state (not persisted long-term, but included in save for resume)
    this.vx = data.vx || 0;
    this.vy = data.vy || 0;
    this.wanderAngle = data.wanderAngle || 0;
    this.fleeTimer = data.fleeTimer || 0;
    this.fleeVx = data.fleeVx || 0;
    this.fleeVy = data.fleeVy || 0;
    this.jumping = data.jumping || false;
    this.jumpTimer = data.jumpTimer || 0;
  }

  /** Serialize to MUD-compatible flat object */
  toRecord() {
    return {
      id: this.id,
      species: this.species,
      x: this.x,
      y: this.y,
      age: this.age,
      health: this.health,
      stress: this.stress,
      vx: this.vx,
      vy: this.vy,
      wanderAngle: this.wanderAngle,
      fleeTimer: this.fleeTimer,
      fleeVx: this.fleeVx,
      fleeVy: this.fleeVy,
      jumping: this.jumping,
      jumpTimer: this.jumpTimer,
    };
  }
}
