/**
 * PondTile entity — data model for a single tile in the macro grid.
 * Each tile has a substrate type and moisture level.
 * MUD-compatible flat record.
 */

export default class PondTile {
  constructor(data = {}) {
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.substrate = data.substrate || 'clay'; // clay, gravel, sand, mud
    this.moisture = data.moisture ?? 1.0;      // 0.0 (dry) → 1.0 (fully submerged)
  }

  toRecord() {
    return {
      x: this.x,
      y: this.y,
      substrate: this.substrate,
      moisture: this.moisture,
    };
  }
}
