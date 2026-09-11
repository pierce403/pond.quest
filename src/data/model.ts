/** Persisted fields stay flat so a pond can still be represented as MUD tables. */
export interface Chemistry {
  pH: number;
  ammonia: number; // TAN: NH3-N + NH4-N, mg N/L
  nitrite: number; // mg N/L
  nitrate: number; // mg N/L
  dissolvedOxygen: number; // mg O2/L
  temperature: number; // degrees C
  alkalinity: number; // mg/L as CaCO3
  inorganicCarbon: number; // mmol C/L
  detritus: number; // mg N/L, mineralizable plant material
  bacteriaLevel: number;
  nitriteBacteriaLevel: number;
  lastTick: number;
}
export interface FishRecord {
  id: string;
  species: string;
  x: number;
  y: number;
  age?: number;
  health?: number;
  stress?: number;
  [key: string]: any; // existing steering/animation fields
}
export interface PlantRecord {
  id: string;
  species: string;
  tileX: number;
  tileY: number;
  subX: number;
  subY: number;
  growthStage: number;
  growthProgress: number;
  age: number; // game minutes
  health: number;
  sickness: number;
  effectiveness: number;
  oxygenRate: number; // actual net mg O2/min for this cluster
  nitrateRate: number; // actual mg N/min for this cluster
  ammoniaRate: number; // actual mg N/min for this cluster
  nitrogenStored: number; // mg N held in living tissue
  isSick: boolean;
  condition: string;
}
export interface PondState {
  _version: number;
  pond: { width: number; height: number; name: string; createdAt: number };
  tiles: { x: number; y: number; substrate: string; moisture: number }[];
  fish: FishRecord[];
  plants: PlantRecord[];
  chemistry: Chemistry;
  gameTime: { totalMinutes: number; dayLength: number };
}
