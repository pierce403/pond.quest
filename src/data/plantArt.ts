/** Tight atlas frames; source alpha is retained, no background-removal pass. */
export const PLANT_ART_SPECIES = ['lotus', 'cattail', 'waterlily', 'hornwort'];
export const PLANT_ART_FRAMES = [
  [127,111,78,103], [443,68,65,153], [734,142,100,58], [1072,112,47,109],
  [59,321,195,204], [422,292,132,231], [687,387,193,120], [1026,309,158,218],
  [31,570,294,277], [379,564,215,286], [668,633,276,191], [1000,579,211,267],
  [19,874,302,316], [352,865,255,320], [647,927,297,241], [981,896,244,293],
];
export function plantFrame(species: string, stage: number) {
  const column = PLANT_ART_SPECIES.indexOf(species);
  // Hornwort has three biological stages, with the dense stage using its fullest art.
  const row = species === 'hornwort' && stage === 2 ? 3 : Math.min(3, stage);
  return `${row * 4 + column}`;
}
