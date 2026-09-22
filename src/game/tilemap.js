// Tile semantics. The legend lives in SPEC.md; this module is the only place
// that decides what a character means.

/** Tiles that always stop Summer, whatever she is wearing or doing. */
export const SOLID = new Set(['#', 'T', '~', 'S', 'W', 'o', 'x']);

/** Tiles that stop her until something in the save opens them. */
export const OPENABLE = new Set(['C', 'L', 'B', 'G']);

/** Tiles she walks on freely. */
export const FLOOR = new Set(['.', ',', 'V', 'D']);

export const PIT = 'P';
export const LEDGE = 'J';

export const ALL_TILES = new Set([...SOLID, ...OPENABLE, ...FLOOR, PIT, LEDGE]);

/**
 * Does this tile stop movement?
 *
 * Pits never stop her — she walks straight in and falls, which is deliberate:
 * a pit you cannot enter is a wall, and a wall cannot teach a jump. The fall is
 * handled after the move, by `landsInPit`.
 *
 * @param {string} ch tile character (already materialised, so any door that the
 *   save says is open has been replaced with floor)
 * @param {{airborne?: boolean, hasSandals?: boolean, onLedge?: boolean}} ctx
 */
export function blocks(ch, ctx = {}) {
  if (SOLID.has(ch) || OPENABLE.has(ch)) return true;
  if (ch === PIT) return false;
  if (ch === LEDGE) return !(ctx.hasSandals && (ctx.airborne || ctx.onLedge));
  return false;
}

/** True for a tile Summer falls into when she is standing on it. */
export function isPit(ch) {
  return ch === PIT;
}

export function isLedge(ch) {
  return ch === LEDGE;
}

/** True for tiles A can do something with when Summer is facing them. */
export function isInteractiveTile(ch) {
  return ch === 'S' || ch === 'x' || ch === 'o' || ch === 'C' || ch === 'L' || ch === 'B' || ch === 'W';
}
