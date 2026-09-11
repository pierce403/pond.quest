/**
 * Isometric math helpers.
 * Coordinate system: iso (isoX, isoY) are tile grid coords; screen (sx, sy) are canvas pixels.
 *
 * Standard isometric projection:
 *   screenX = (isoX - isoY) * tileHalfWidth
 *   screenY = (isoX + isoY) * tileHalfHeight
 *
 * Origin is top of the diamond (northernmost tile corner).
 */

export const TILE_W = 96;   // full tile width in pixels
export const TILE_H = 48;   // full tile height in pixels
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/**
 * Convert isometric grid coordinates to screen (canvas) coordinates.
 * @param {number} isoX - Column in the grid
 * @param {number} isoY - Row in the grid
 * @param {number} originX - Screen X of the grid origin (top diamond point)
 * @param {number} originY - Screen Y of the grid origin
 * @returns {{ x: number, y: number }}
 */
export function isoToScreen(isoX: number, isoY: number, originX: number, originY: number) {
  return {
    x: originX + (isoX - isoY) * HALF_W,
    y: originY + (isoX + isoY) * HALF_H,
  };
}

/**
 * Convert screen coordinates back to isometric grid coordinates.
 * @param {number} sx - Screen X
 * @param {number} sy - Screen Y
 * @param {number} originX - Screen X of the grid origin
 * @param {number} originY - Screen Y of the grid origin
 * @returns {{ isoX: number, isoY: number }} Floating-point grid coords (floor to get tile)
 */
export function screenToIso(sx: number, sy: number, originX: number, originY: number) {
  const relX = sx - originX;
  const relY = sy - originY;
  return {
    isoX: (relX / HALF_W + relY / HALF_H) / 2,
    isoY: (relY / HALF_H - relX / HALF_W) / 2,
  };
}

/**
 * Calculate render depth for correct painter's-algorithm sorting.
 * Higher depth = rendered later = appears on top.
 * @param {number} isoX
 * @param {number} isoY
 * @returns {number}
 */
export function isoDepth(isoX: number, isoY: number) {
  return isoX + isoY;
}

/**
 * Convert sub-tile coordinates (0–3 within a macro tile) to screen position.
 * Sub-tiles are 1/4 the size of a macro tile.
 */
export function subTileToScreen(macroIsoX: number, macroIsoY: number, subX: number, subY: number, originX: number, originY: number) {
  // A cell is [n, n+1); use its center for both rendering and placement.
  return isoToScreen(macroIsoX + (subX + 0.5) / 4, macroIsoY + (subY + 0.5) / 4, originX, originY);
}
