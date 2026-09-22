// The world: all rooms, how they join up, and how a room's tiles look once the
// save file's opened doors and shattered walls have been applied.

import { OVERWORLD } from '../data/rooms/overworld.js';
import { DUNGEON1 } from '../data/rooms/dungeon1.js';
import { DUNGEON2 } from '../data/rooms/dungeon2.js';
import { ROOM_W, ROOM_H } from './constants.js';

/** Every room in the game, keyed by id. */
export const ROOMS = { ...OVERWORLD, ...DUNGEON1, ...DUNGEON2 };

export const START_ROOM = 'ow_cinderhome';

export const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export const OPPOSITE = { n: 's', s: 'n', w: 'e', e: 'w' };

/** Where each border opening sits, in metatile coordinates. */
export const OPENINGS = {
  n: [[4, 0], [5, 0]],
  s: [[4, ROOM_H - 1], [5, ROOM_H - 1]],
  w: [[0, 3], [0, 4]],
  e: [[ROOM_W - 1, 3], [ROOM_W - 1, 4]],
};

/**
 * The stable name for the barrier between two rooms. Both sides of a door are
 * the same door, so opening it from either side has to record the same thing.
 */
export function edgeId(roomA, roomB) {
  return [roomA, roomB].sort().join('~');
}

/** What kind of barrier, if any, sits in a room's exit: lock, boss, crack, gate:*. */
export function doorKind(roomId, dir) {
  return ROOMS[roomId]?.doors?.[dir] ?? null;
}

/** Which dungeon a room belongs to, for per-dungeon key counts. Null in the overworld. */
export function dungeonOf(roomId) {
  if (roomId.startsWith('d1_')) return 'mire';
  if (roomId.startsWith('d2_')) return 'aerie';
  return null;
}

/** Which music an area wants. */
export function areaOf(roomId) {
  return ROOMS[roomId].area;
}

/**
 * A room's tiles with progress applied: doors the save says are open become
 * floor, and so do cracked walls that have been shattered.
 *
 * @param {string} roomId
 * @param {Set<string>} openedDoors edge ids
 * @returns {string[][]} a fresh mutable grid, [y][x]
 */
export function materialize(roomId, openedDoors) {
  const room = ROOMS[roomId];
  const grid = room.tiles.map((row) => [...row]);
  for (const [dir, dest] of Object.entries(room.exits)) {
    if (!room.doors?.[dir]) continue;
    if (!openedDoors.has(edgeId(roomId, dest))) continue;
    for (const [x, y] of OPENINGS[dir]) grid[y][x] = '.';
  }
  return grid;
}

/** Which exit, if any, a metatile coordinate sits in. */
export function openingDirAt(roomId, x, y) {
  const room = ROOMS[roomId];
  for (const dir of Object.keys(room.exits)) {
    for (const [ox, oy] of OPENINGS[dir]) {
      if (ox === x && oy === y) return dir;
    }
  }
  return null;
}

/** The portal on a given tile, or null. */
export function portalAt(roomId, x, y) {
  return ROOMS[roomId].portals?.find((p) => p.x === x && p.y === y) ?? null;
}

/** The sign text on a given tile, or null. */
export function signAt(roomId, x, y) {
  return ROOMS[roomId].signs?.[`${x},${y}`] ?? null;
}
