// Saving and loading. Pure: it turns game state into a plain object and back,
// and knows nothing about localStorage or any other place to put it.

export const SAVE_KEY = 'brackenfall.save.v1';
export const SAVE_VERSION = 1;

const setOf = (v) => new Set(Array.isArray(v) ? v : []);
const listOf = (s) => [...s].sort();

/**
 * Everything a run consists of. Position is stored in subpixels so a reload
 * puts Summer back on the exact pixel she saved on, not the nearest tile.
 *
 * @param {import('./game.js').Game} game
 */
export function serialize(game) {
  const p = game.player;
  const g = game.progress;
  return {
    version: SAVE_VERSION,
    room: game.room.id,
    x: p.x,
    y: p.y,
    dir: p.dir,
    hp: p.hp,
    maxHp: g.maxHp,
    upgrades: { ...g.upgrades },
    keys: { ...g.keys },
    bossKeys: { ...g.bossKeys },
    openedDoors: listOf(g.openedDoors),
    chests: listOf(g.chests),
    heartsTaken: listOf(g.heartsTaken),
    bossesBeaten: listOf(g.bossesBeaten),
    pillars: listOf(g.pillars),
    rng: game.rng.s,
  };
}

/**
 * Validates a blob and normalises it. Anything malformed, from a future
 * version, or naming a room that no longer exists comes back as null rather
 * than throwing - a corrupt save should offer New Game, not a stack trace.
 *
 * @param {unknown} blob
 * @param {Record<string, unknown>} rooms the room table to validate against
 */
export function deserialize(blob, rooms) {
  if (!blob || typeof blob !== 'object') return null;
  const b = /** @type {Record<string, any>} */ (blob);
  if (b.version !== SAVE_VERSION) return null;
  if (typeof b.room !== 'string' || !rooms[b.room]) return null;
  if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return null;
  if (!Number.isInteger(b.hp) || !Number.isInteger(b.maxHp)) return null;
  if (b.hp < 0 || b.maxHp <= 0 || b.hp > b.maxHp) return null;
  if (!Number.isInteger(b.rng)) return null;

  return {
    room: b.room,
    x: b.x,
    y: b.y,
    dir: ['up', 'down', 'left', 'right'].includes(b.dir) ? b.dir : 'down',
    hp: b.hp,
    maxHp: b.maxHp,
    upgrades: {
      blade: b.upgrades?.blade === true,
      charm: b.upgrades?.charm === true,
      sandals: b.upgrades?.sandals === true,
    },
    keys: {
      mire: Math.max(0, Number(b.keys?.mire) || 0),
      aerie: Math.max(0, Number(b.keys?.aerie) || 0),
    },
    bossKeys: {
      mire: b.bossKeys?.mire === true,
      aerie: b.bossKeys?.aerie === true,
    },
    openedDoors: setOf(b.openedDoors),
    chests: setOf(b.chests),
    heartsTaken: setOf(b.heartsTaken),
    bossesBeaten: setOf(b.bossesBeaten),
    pillars: setOf(b.pillars),
    rng: b.rng >>> 0,
  };
}

/** Parses JSON without throwing. */
export function parseSave(text, rooms) {
  if (typeof text !== 'string' || text === '') return null;
  try {
    return deserialize(JSON.parse(text), rooms);
  } catch {
    return null;
  }
}
