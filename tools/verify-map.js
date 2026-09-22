#!/usr/bin/env node
// Map integrity, run in CI.
//
// Proves, for the shipped room data:
//   1. every room is exactly ROOM_W x ROOM_H and uses only legend characters;
//   2. every exit has a matching reverse exit on the neighbour;
//   3. the ASCII border openings agree with the declared exits, in both
//      directions - an opening with no exit, or an exit with no opening, fails;
//   4. both sides of a door agree about what kind of door it is;
//   5. every room is reachable from the start ignoring locks, so nothing is
//      orphaned;
//   6. portals are reciprocal and land on floor;
//   7. signs sit on sign tiles and entities sit somewhere they can exist.

import { ROOMS, START_ROOM, OPENINGS, OPPOSITE, DIRS } from '../src/game/world.js';
import { ROOM_W, ROOM_H } from '../src/game/constants.js';
import { ALL_TILES, SOLID, OPENABLE, FLOOR, PIT, LEDGE } from '../src/game/tilemap.js';

const problems = [];
const fail = (msg) => problems.push(msg);

const DOOR_CHAR = { lock: 'L', boss: 'B', crack: 'C' };
const doorChar = (kind) => (kind?.startsWith('gate') ? 'G' : DOOR_CHAR[kind] ?? '.');

// --- 1. shape ---------------------------------------------------------------
for (const [id, room] of Object.entries(ROOMS)) {
  if (room.tiles.length !== ROOM_H) {
    fail(`${id}: has ${room.tiles.length} rows, expected ${ROOM_H}`);
    continue;
  }
  room.tiles.forEach((row, y) => {
    if (row.length !== ROOM_W) fail(`${id}: row ${y} is ${row.length} wide, expected ${ROOM_W}`);
    [...row].forEach((ch, x) => {
      if (!ALL_TILES.has(ch)) fail(`${id}: illegal tile "${ch}" at ${x},${y}`);
    });
  });
  if (!room.name || !room.area) fail(`${id}: needs a name and an area`);
}

// --- 2/3/4. exits, openings and doors ---------------------------------------
const PASSABLE_OPENING = new Set([...FLOOR, ...OPENABLE, PIT, LEDGE]);

for (const [id, room] of Object.entries(ROOMS)) {
  for (const dir of ['n', 's', 'e', 'w']) {
    const dest = room.exits[dir];
    const cells = OPENINGS[dir].map(([x, y]) => room.tiles[y]?.[x]);

    if (!dest) {
      for (const [i, ch] of cells.entries()) {
        if (!SOLID.has(ch)) {
          const [x, y] = OPENINGS[dir][i];
          fail(`${id}: no ${dir} exit declared but ${x},${y} is "${ch}", which is not solid`);
        }
      }
      continue;
    }

    if (!ROOMS[dest]) {
      fail(`${id}: ${dir} exit points at "${dest}", which does not exist`);
      continue;
    }
    const back = ROOMS[dest].exits[OPPOSITE[dir]];
    if (back !== id) {
      fail(`${id}: ${dir} exit to ${dest}, but ${dest}'s ${OPPOSITE[dir]} exit is ${back ?? 'missing'}`);
    }

    const want = doorChar(room.doors?.[dir]);
    for (const [i, ch] of cells.entries()) {
      const [x, y] = OPENINGS[dir][i];
      if (!PASSABLE_OPENING.has(ch)) {
        fail(`${id}: ${dir} exit to ${dest} but ${x},${y} is "${ch}", which cannot be walked through`);
      }
      if (ch !== want) {
        fail(`${id}: ${dir} exit declares door "${room.doors?.[dir] ?? 'open'}" (expects "${want}") but ${x},${y} is "${ch}"`);
      }
    }

    const mine = room.doors?.[dir] ?? null;
    const theirs = ROOMS[dest].doors?.[OPPOSITE[dir]] ?? null;
    if (mine !== theirs) {
      fail(`${id}/${dest}: the two sides disagree about the door (${mine} vs ${theirs})`);
    }

    // The tile just inside an opening has to be reachable, or the exit is a lie.
    const [dx, dy] = DIRS[dir];
    for (const [x, y] of OPENINGS[dir]) {
      const ix = x - dx;
      const iy = y - dy;
      if (ix < 0 || iy < 0 || ix >= ROOM_W || iy >= ROOM_H) continue;
      const inner = room.tiles[iy][ix];
      if (SOLID.has(inner)) {
        fail(`${id}: ${dir} exit is walled in from the inside at ${ix},${iy} ("${inner}")`);
      }
    }
  }
}

// --- 5. reachability --------------------------------------------------------
const seen = new Set([START_ROOM]);
const queue = [START_ROOM];
while (queue.length) {
  const id = queue.shift();
  const room = ROOMS[id];
  const neighbours = [
    ...Object.values(room.exits),
    ...(room.portals ?? []).map((p) => p.to),
  ];
  for (const n of neighbours) {
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
}
for (const id of Object.keys(ROOMS)) {
  if (!seen.has(id)) fail(`${id}: orphaned - unreachable from ${START_ROOM} even ignoring locks`);
}

// --- 6. portals -------------------------------------------------------------
for (const [id, room] of Object.entries(ROOMS)) {
  for (const p of room.portals ?? []) {
    if (room.tiles[p.y]?.[p.x] !== 'D') {
      fail(`${id}: portal at ${p.x},${p.y} is not on a "D" tile`);
    }
    const dest = ROOMS[p.to];
    if (!dest) {
      fail(`${id}: portal points at "${p.to}", which does not exist`);
      continue;
    }
    const landing = dest.tiles[p.ty]?.[p.tx];
    if (!FLOOR.has(landing)) {
      fail(`${id}: portal lands on "${landing}" at ${p.tx},${p.ty} in ${p.to}, which is not floor`);
    }
    const backwards = (dest.portals ?? []).some((q) => q.to === id);
    if (!backwards) fail(`${id}: portal to ${p.to} has no way back`);
  }
}

// --- 7. signs and entities --------------------------------------------------
const ENTITY_TYPES = new Set([
  'snag', 'brumbler', 'palebuckler', 'mothkin', 'thudder', 'spitfen',
  'chest', 'heart', 'npc', 'boss',
]);
const chestIds = new Map();

for (const [id, room] of Object.entries(ROOMS)) {
  for (const key of Object.keys(room.signs ?? {})) {
    const [x, y] = key.split(',').map(Number);
    if (room.tiles[y]?.[x] !== 'S') fail(`${id}: sign text at ${key} but that tile is not "S"`);
  }
  for (const e of room.entities ?? []) {
    if (!ENTITY_TYPES.has(e.type)) fail(`${id}: unknown entity type "${e.type}"`);
    if (e.x < 1 || e.y < 1 || e.x > ROOM_W - 2 || e.y > ROOM_H - 2) {
      fail(`${id}: ${e.type} at ${e.x},${e.y} is outside the playable interior`);
    }
    const ch = room.tiles[e.y]?.[e.x];
    if (SOLID.has(ch) || OPENABLE.has(ch)) {
      fail(`${id}: ${e.type} at ${e.x},${e.y} is standing inside "${ch}"`);
    }
    if (e.type !== 'mothkin' && ch === PIT) {
      fail(`${id}: ${e.type} at ${e.x},${e.y} is standing in a pit`);
    }
    if ((e.type === 'chest' || e.type === 'heart') && !e.id) {
      fail(`${id}: ${e.type} at ${e.x},${e.y} needs a stable id for the save file`);
    }
    if (e.type === 'chest') {
      if (chestIds.has(e.id)) fail(`duplicate chest id "${e.id}" in ${id} and ${chestIds.get(e.id)}`);
      chestIds.set(e.id, id);
    }
  }
}

// --- report -----------------------------------------------------------------
const rooms = Object.keys(ROOMS).length;
if (problems.length) {
  console.error(`map integrity: ${problems.length} problem(s) across ${rooms} rooms\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const exits = Object.values(ROOMS).reduce((n, r) => n + Object.keys(r.exits).length, 0);
const portals = Object.values(ROOMS).reduce((n, r) => n + (r.portals?.length ?? 0), 0);
console.log(
  `map integrity OK: ${rooms} rooms, ${exits / 2} two-way connections, ` +
  `${portals / 2} portal pairs, every room reachable from ${START_ROOM}.`,
);
