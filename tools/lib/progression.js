// The whole game as a state machine, so questions about it can be answered by
// search rather than by argument.
//
// A state is what Summer is carrying and what she has permanently changed:
// which chests are open, which doors are open, which bosses are down. Her
// position is not part of it, because from any state she can walk anywhere the
// reachability model says she can.
//
// Two different questions fall out of the same search:
//   - Is the ending reachable at all?           (verify-progression.js)
//   - Is it reachable from EVERY state you can  (verify-softlock.js)
//     get into, however you spent your keys?

import { ROOMS, dungeonOf, edgeId } from '../../src/game/world.js';
import { reachable, approachTiles, doorApproaches, key } from './reach.js';

export const START = { room: 'ow_cinderhome', x: 4, y: 4 };

/** Every chest in the game, with where it is and what it gives. */
export const CHESTS = Object.entries(ROOMS).flatMap(([room, data]) =>
  (data.entities ?? [])
    .filter((e) => e.type === 'chest')
    .map((e) => ({ id: e.id, room, x: e.x, y: e.y, gives: e.gives, dungeon: dungeonOf(room) })));

/** Every heart container, likewise. Hearts gate nothing, but they are worth counting. */
export const HEARTS = Object.entries(ROOMS).flatMap(([room, data]) =>
  (data.entities ?? [])
    .filter((e) => e.type === 'heart')
    .map((e) => ({ id: e.id, room, x: e.x, y: e.y })));

/** Every barrier in the world, as an openable edge. */
export const DOORS = Object.entries(ROOMS).flatMap(([room, data]) =>
  Object.entries(data.doors ?? {})
    .map(([dir, kind]) => ({ id: edgeId(room, data.exits[dir]), room, dir, kind, dungeon: dungeonOf(room) })))
  // Both rooms declare the same door; keep one copy of each.
  .filter((d, i, all) => all.findIndex((o) => o.id === d.id) === i);

export const BOSSES = Object.entries(ROOMS).flatMap(([room, data]) =>
  (data.entities ?? [])
    .filter((e) => e.type === 'boss')
    .map((e) => ({ kind: e.kind, room, needs: e.kind === 'sapwarden' ? 'blade' : 'sandals' })));

const UPGRADE_GIVES = new Set(['blade', 'charm', 'sandals']);

export function emptyState() {
  return { chests: new Set(), doors: new Set(), bosses: new Set() };
}

export function capsOf(state) {
  const caps = { blade: false, charm: false, sandals: false, beaten: state.bosses };
  for (const c of CHESTS) {
    if (state.chests.has(c.id) && UPGRADE_GIVES.has(c.gives)) caps[c.gives] = true;
  }
  return caps;
}

/** Small keys held right now: collected, minus spent on locks. */
export function keysOf(state) {
  const keys = { mire: 0, aerie: 0 };
  for (const c of CHESTS) {
    if (c.gives === 'smallkey' && state.chests.has(c.id) && c.dungeon) keys[c.dungeon] += 1;
  }
  for (const d of DOORS) {
    if (d.kind === 'lock' && state.doors.has(d.id) && d.dungeon) keys[d.dungeon] -= 1;
  }
  return keys;
}

export function bossKeysOf(state) {
  const held = { mire: false, aerie: false };
  for (const c of CHESTS) {
    if (c.gives === 'bosskey' && state.chests.has(c.id) && c.dungeon) held[c.dungeon] = true;
  }
  return held;
}

/** Stable text for a state, so the search can remember where it has been. */
export function fingerprint(state) {
  return [
    [...state.chests].sort().join(','),
    [...state.doors].sort().join(','),
    [...state.bosses].sort().join(','),
  ].join('|');
}

const reachCache = new Map();

function reachOf(state) {
  const caps = capsOf(state);
  const ck = [
    caps.blade, caps.charm, caps.sandals,
    [...state.bosses].sort().join(','),
    [...state.doors].sort().join(','),
  ].join('|');
  if (!reachCache.has(ck)) reachCache.set(ck, reachable(START, caps, state.doors));
  return reachCache.get(ck);
}

/**
 * Everything Summer could do next from here. Each move is a single irreversible
 * act: take a chest, open a door, beat a boss.
 */
/**
 * Chest ids and boss kinds the search is forbidden to take. Used to prove an
 * upgrade is load-bearing: ban it and the ending should become unreachable.
 * @type {Set<string>}
 */
let banned = new Set();

export function setBanned(ids) {
  banned = new Set(ids);
}

export function movesFrom(state) {
  const seen = reachOf(state);
  const caps = capsOf(state);
  const keys = keysOf(state);
  const bossKeys = bossKeysOf(state);
  const moves = [];

  for (const c of CHESTS) {
    if (state.chests.has(c.id) || banned.has(c.id)) continue;
    if (!approachTiles(c.room, c.x, c.y).some((k) => seen.has(k))) continue;
    moves.push({ kind: 'chest', id: c.id, label: `open ${c.id} (${c.gives}) in ${c.room}` });
  }

  for (const d of DOORS) {
    if (state.doors.has(d.id)) continue;
    if (!doorApproaches(d.room, d.dir).some((k) => seen.has(k))) continue;
    if (d.kind === 'lock' && (!d.dungeon || keys[d.dungeon] <= 0)) continue;
    if (d.kind === 'boss' && (!d.dungeon || !bossKeys[d.dungeon])) continue;
    if (d.kind === 'crack' && !caps.blade) continue;
    if (d.kind === 'gate:pillar' && !caps.charm) continue;
    moves.push({ kind: 'door', id: d.id, label: `open ${d.kind} ${d.id}` });
  }

  for (const b of BOSSES) {
    if (state.bosses.has(b.kind) || banned.has(b.kind)) continue;
    if (!seen.has(key(b.room, 4, 4)) && !someTileOf(b.room, seen)) continue;
    if (!caps[b.needs]) continue;
    moves.push({ kind: 'boss', id: b.kind, label: `defeat ${b.kind}` });
  }

  return moves;
}

function someTileOf(room, seen) {
  for (const k of seen) if (k.startsWith(`${room}:`)) return true;
  return false;
}

export function applyMove(state, move) {
  const next = {
    chests: new Set(state.chests),
    doors: new Set(state.doors),
    bosses: new Set(state.bosses),
  };
  if (move.kind === 'chest') next.chests.add(move.id);
  if (move.kind === 'door') next.doors.add(move.id);
  if (move.kind === 'boss') next.bosses.add(move.id);
  return next;
}

export function isEnding(state) {
  return state.bosses.has('chorister');
}

/** Which heart containers this state could have picked up along the way. */
export function heartsAvailable(state) {
  const seen = reachOf(state);
  return HEARTS.filter((h) => seen.has(key(h.room, h.x, h.y)));
}

/** Every room this state can stand in. */
export function roomsSeen(state) {
  const rooms = new Set();
  for (const k of reachOf(state)) rooms.add(k.split(':')[0]);
  return rooms;
}

/**
 * Explores the entire reachable state space.
 * @param {{limit?: number}} [opts]
 */
export function explore(opts = {}) {
  const limit = opts.limit ?? 2_000_000;
  setBanned(opts.ban ?? []);
  const start = emptyState();
  const states = new Map();            // fingerprint -> state
  const parents = new Map();           // fingerprint -> [parentFingerprint, move]
  const queue = [start];
  states.set(fingerprint(start), start);
  parents.set(fingerprint(start), null);

  let winning = null;
  while (queue.length) {
    if (states.size > limit) throw new Error('state space blew past the limit');
    const state = queue.shift();
    const fp = fingerprint(state);
    if (isEnding(state) && !winning) winning = fp;
    for (const move of movesFrom(state)) {
      const next = applyMove(state, move);
      const nfp = fingerprint(next);
      if (states.has(nfp)) continue;
      states.set(nfp, next);
      parents.set(nfp, [fp, move]);
      queue.push(next);
    }
  }

  setBanned([]);
  return { states, parents, winning };
}

/** The sequence of moves that first reached a state. */
export function pathTo(parents, fp) {
  const steps = [];
  let cur = fp;
  while (parents.get(cur)) {
    const [prev, move] = parents.get(cur);
    steps.push(move);
    cur = prev;
  }
  return steps.reverse();
}
