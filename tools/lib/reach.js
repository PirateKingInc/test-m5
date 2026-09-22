// Tile-level reachability across the whole world.
//
// This is deliberately a *separate* model of the game from src/game: it reads
// the same room data and re-derives what Summer can physically get to, from the
// rules in SPEC.md rather than from the movement code. If the two ever disagree
// about whether somewhere is reachable, one of them is wrong and I want to know.

import { ROOMS, OPENINGS, OPPOSITE, DIRS, materialize, edgeId } from '../../src/game/world.js';
import { ROOM_W, ROOM_H } from '../../src/game/constants.js';

const FLOOR = new Set(['.', ',', 'V', 'D']);
const PIT = 'P';
const LEDGE = 'J';

export const key = (room, x, y) => `${room}:${x},${y}`;

/**
 * Push blocks are treated as walls here even though A can shove them, and
 * loose rocks likewise. Being pessimistic about what Summer can clear makes a
 * "reachable" answer stronger, and neither is load-bearing in any room.
 */
function walkable(ch) {
  return FLOOR.has(ch);
}

/**
 * Every tile reachable from a starting tile, given what Summer is carrying and
 * which doors are already open.
 *
 * @param {{room: string, x: number, y: number}} start
 * @param {{blade?: boolean, charm?: boolean, sandals?: boolean, beaten?: Set<string>}} caps
 * @param {Set<string>} openedDoors
 * @returns {Set<string>} keys of the form "room:x,y"
 */
export function buildGraph(caps, openedDoors) {
  const maxJump = caps.sandals ? 2 : 1;
  const grids = new Map();
  const gridOf = (room) => {
    if (!grids.has(room)) grids.set(room, materialize(room, openedDoors));
    return grids.get(room);
  };
  const at = (room, x, y) => {
    if (x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H) return null;
    return gridOf(room)[y][x];
  };

  /** @type {Map<string, string[]>} */
  const edges = new Map();
  const add = (from, to) => {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push(to);
  };

  for (const room of Object.keys(ROOMS)) {
    for (let y = 0; y < ROOM_H; y += 1) {
      for (let x = 0; x < ROOM_W; x += 1) {
        const here = at(room, x, y);
        const standable = walkable(here) || here === LEDGE;
        if (!standable) continue;
        const from = key(room, x, y);
        const onLedge = here === LEDGE;

        for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
          const nx = x + dx;
          const ny = y + dy;

          // Stepping out of the room through one of its four openings.
          if (nx < 0 || ny < 0 || nx >= ROOM_W || ny >= ROOM_H) {
            const isOpening = OPENINGS[dir].some(([ox, oy]) => ox === x && oy === y);
            if (!isOpening) continue;
            const dest = ROOMS[room].exits[dir];
            if (!dest) continue;
            const kind = ROOMS[room].doors?.[dir];
            if (kind && !openedDoors.has(edgeId(room, dest))) continue;
            // Openings line up, so the arrival tile is this one mirrored.
            const ax = dir === 'e' ? 0 : dir === 'w' ? ROOM_W - 1 : x;
            const ay = dir === 's' ? 0 : dir === 'n' ? ROOM_H - 1 : y;
            add(from, key(dest, ax, ay));
            continue;
          }

          const target = at(room, nx, ny);

          if (walkable(target)) {
            add(from, key(room, nx, ny));
            continue;
          }

          // Onto a raised ledge: needs the Gale Sandals, or already being up there.
          if (target === LEDGE) {
            if (caps.sandals || onLedge) add(from, key(room, nx, ny));
            continue;
          }

          // Over a run of pit tiles, as far as this jump carries.
          if (target === PIT) {
            for (let k = 1; k <= maxJump; k += 1) {
              let clear = true;
              for (let i = 1; i <= k; i += 1) {
                if (at(room, x + dx * i, y + dy * i) !== PIT) clear = false;
              }
              if (!clear) break;
              const lx = x + dx * (k + 1);
              const ly = y + dy * (k + 1);
              if (lx < 0 || ly < 0 || lx >= ROOM_W || ly >= ROOM_H) continue;
              const landing = at(room, lx, ly);
              if (walkable(landing)) add(from, key(room, lx, ly));
              else if (landing === LEDGE && caps.sandals) add(from, key(room, lx, ly));
            }
          }
        }

        // Stairs between the overworld and a dungeon. Some wait on a lit stone.
        for (const p of ROOMS[room].portals ?? []) {
          if (p.x !== x || p.y !== y) continue;
          if (p.needs && !(caps.beaten?.has(p.needs))) continue;
          add(from, key(p.to, p.tx, p.ty));
        }
      }
    }
  }

  return edges;
}

/** Breadth-first closure over an adjacency map. */
export function closure(edges, seeds) {
  const seen = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const node = queue.pop();
    for (const next of edges.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function reverse(edges) {
  /** @type {Map<string, string[]>} */
  const back = new Map();
  for (const [from, tos] of edges) {
    for (const to of tos) {
      if (!back.has(to)) back.set(to, []);
      back.get(to).push(from);
    }
  }
  return back;
}

/**
 * Every tile reachable from a starting tile, given what Summer is carrying and
 * which doors are already open.
 *
 * @param {{room: string, x: number, y: number}} start
 * @param {{blade?: boolean, charm?: boolean, sandals?: boolean, beaten?: Set<string>}} caps
 * @param {Set<string>} openedDoors
 * @returns {Set<string>} keys of the form "room:x,y"
 */
export function reachable(start, caps, openedDoors) {
  return closure(buildGraph(caps, openedDoors), [key(start.room, start.x, start.y)]);
}

/** The tiles from which A can be pressed at something standing on (x, y). */
export function approachTiles(room, x, y) {
  return Object.values(DIRS)
    .map(([dx, dy]) => [x - dx, y - dy])
    .filter(([ax, ay]) => ax >= 0 && ay >= 0 && ax < ROOM_W && ay < ROOM_H)
    .map(([ax, ay]) => key(room, ax, ay));
}

/** The tiles from which a door in `dir` can be opened, from either side. */
export function doorApproaches(room, dir) {
  const dest = ROOMS[room].exits[dir];
  const [dx, dy] = DIRS[dir];
  const mine = OPENINGS[dir].map(([ox, oy]) => key(room, ox - dx, oy - dy));
  const back = OPPOSITE[dir];
  const [bx, by] = DIRS[back];
  const theirs = OPENINGS[back].map(([ox, oy]) => key(dest, ox - bx, oy - by));
  return [...mine, ...theirs];
}
