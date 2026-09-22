// Turning "be over there" into button presses.
//
// The route comes from the same tile graph the softlock prover uses, so the bot
// and the prover agree about what is walkable. Everything here reads game state
// and returns a button mask; it never writes to the game.

import { BTN } from '../../src/game/game.js';
import { SUB, TILE, HB_W, HB_H, ROOM_W, ROOM_H } from '../../src/game/constants.js';
import { buildGraph, key } from './reach.js';
import { ROOMS, materialize } from '../../src/game/world.js';

const MONSTER_TYPES = new Set([
  'snag', 'brumbler', 'palebuckler', 'mothkin', 'thudder', 'spitfen',
]);

export const DIR_BIT = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT };
export const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function centre(p) {
  return { x: (p.x + (HB_W * SUB) / 2) / SUB, y: (p.y + (HB_H * SUB) / 2) / SUB };
}

export function tileOf(p) {
  const c = centre(p);
  return { tx: Math.floor(c.x / TILE), ty: Math.floor(c.y / TILE) };
}

export function parse(node) {
  const [room, xy] = node.split(':');
  const [x, y] = xy.split(',').map(Number);
  return { room, x, y };
}

/** A signature of everything that changes what is walkable. */
export function capsSignature(game) {
  const u = game.progress.upgrades;
  return [u.blade, u.charm, u.sandals,
    [...game.progress.bossesBeaten].sort().join(','),
    [...game.progress.openedDoors].sort().join(',')].join('|');
}

export function capsOf(game) {
  return { ...game.progress.upgrades, beaten: game.progress.bossesBeaten };
}

/** Shortest tile route, as a list of "room:x,y" nodes, or null. */
export function route(edges, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of edges.get(node) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === to) {
        const path = [next];
        let cur = node;
        while (cur) { path.push(cur); cur = prev.get(cur); }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * How expensive a room is to walk through. Everything costs one step; rooms
 * with monsters in them cost more, so a route that is two rooms longer but
 * goes round the Guardroom wins. Shortest is not the same as cheapest when
 * every room repopulates behind you.
 */
export const ROOM_COST = Object.fromEntries(Object.entries(ROOMS).map(([id, data]) => [
  id,
  1 + 1 * (data.entities ?? []).filter((e) => MONSTER_TYPES.has(e.type)).length,
]));

/**
 * Jumps are cheap in steps and expensive in hearts: being airborne is the only
 * way a Mothkin can touch her, and the Drop is full of them. Charging a jump
 * edge extra keeps her on the floor whenever the floor goes the same way.
 */
function jumpPenalty(from, to) {
  const a = parse(from);
  const b = parse(to);
  if (a.room !== b.room) return 0;
  const steps = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return steps > 1 ? 8 : 0;
}

/**
 * The cheapest node in `targets` reachable from `from`, and the route to it.
 * Uniform-cost search rather than breadth-first, so room danger counts.
 */
export function routeToAny(edges, from, targets) {
  const want = new Set(targets);
  if (want.has(from)) return [from];
  const prev = new Map([[from, null]]);
  const cost = new Map([[from, 0]]);
  // A small sorted frontier is plenty: the graph is ~3000 nodes.
  const frontier = [[0, from]];
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [spent, node] = frontier.shift();
    if (spent > (cost.get(node) ?? Infinity)) continue;
    if (want.has(node)) {
      const path = [node];
      let cur = prev.get(node);
      while (cur) { path.push(cur); cur = prev.get(cur); }
      return path.reverse();
    }
    for (const next of edges.get(node) ?? []) {
      const step = (ROOM_COST[next.split(':')[0]] ?? 1) + jumpPenalty(node, next);
      const total = spent + step;
      if (total >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, total);
      prev.set(next, node);
      frontier.push([total, next]);
    }
  }
  return null;
}

/** Steers toward a point in the current room. Returns 0 once she is on it. */
export function steer(player, px, py, tol = 1) {
  const c = centre(player);
  if (Math.abs(c.x - px) > tol) return c.x < px ? BTN.RIGHT : BTN.LEFT;
  if (Math.abs(c.y - py) > tol) return c.y < py ? BTN.DOWN : BTN.UP;
  return 0;
}

export const tileCentre = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** Which room edge a tile sits on, if any. */
export function edgeDirOf(x, y) {
  if (x === 0) return 'left';
  if (x === ROOM_W - 1) return 'right';
  if (y === 0) return 'up';
  if (y === ROOM_H - 1) return 'down';
  return null;
}

/** The tile immediately ahead of her centre, in the current room. */
export function tileAhead(game, dir, reach = 1) {
  const c = centre(game.player);
  const [dx, dy] = VEC[dir];
  const tx = Math.floor((c.x + dx * reach) / TILE);
  const ty = Math.floor((c.y + dy * reach) / TILE);
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return null;
  return game.room.grid[ty][tx];
}

export { buildGraph, key, materialize, ROOMS };
