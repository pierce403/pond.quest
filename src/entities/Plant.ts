/**
 * Plant entity — data model for a single plant.
 * MUD-compatible flat record. Behavior lives in PlantSystem.
 */

export default class Plant {
  declare id: string;
  declare species: string;
  declare tileX: number;
  declare tileY: number;
  declare subX: number;
  declare subY: number;
  declare growthStage: number;
  declare growthProgress: number;

  constructor(data: Partial<Plant> = {}) {
    this.id = data.id || '';
    this.species = data.species || 'lotus';
    this.tileX = data.tileX || 0;    // macro tile position (0–3)
    this.tileY = data.tileY || 0;
    this.subX = data.subX || 0;      // sub-tile position within macro tile (0–3)
    this.subY = data.subY || 0;
    this.growthStage = data.growthStage || 0; // index into species.stages[]
    this.growthProgress = data.growthProgress || 0.0; // 0.0 → 1.0
  }

  toRecord() {
    return {
      id: this.id,
      species: this.species,
      tileX: this.tileX,
      tileY: this.tileY,
      subX: this.subX,
      subY: this.subY,
      growthStage: this.growthStage,
      growthProgress: this.growthProgress,
    };
  }
}
