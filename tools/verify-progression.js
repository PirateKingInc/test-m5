#!/usr/bin/env node
// Progression: prove the ending is reachable from a new game, and print the
// chain of gates that gets there.
//
// The model is built from the room data, not from the movement code, so this
// is a second opinion rather than an echo.

import {
  explore, pathTo, isEnding, CHESTS, DOORS, BOSSES, HEARTS,
  heartsAvailable, roomsSeen, emptyState, capsOf,
} from './lib/progression.js';
import { ROOMS } from '../src/game/world.js';

const { states, parents, winning } = explore();

if (!winning) {
  console.error('progression: THE ENDING IS NOT REACHABLE FROM A NEW GAME.');
  console.error(`explored ${states.size} states and never lit the second wick-stone.`);
  const best = [...states.values()].reduce((a, b) =>
    (b.chests.size + b.doors.size + b.bosses.size > a.chests.size + a.doors.size + a.bosses.size ? b : a));
  console.error('furthest state reached:');
  console.error(`  chests: ${[...best.chests].join(', ') || 'none'}`);
  console.error(`  doors:  ${[...best.doors].join(', ') || 'none'}`);
  console.error(`  bosses: ${[...best.bosses].join(', ') || 'none'}`);
  process.exit(1);
}

const chain = pathTo(parents, winning);
const problems = [];

// Every upgrade and every boss should be load-bearing. Appearing in the
// shortest chain is not proof of that - the search might simply have picked it
// up on the way past. So take each one away and re-search: if the ending is
// still reachable without it, it gates nothing.
const necessity = [];
for (const up of ['blade', 'charm', 'sandals']) {
  const chest = CHESTS.find((c) => c.gives === up);
  const without = explore({ ban: [chest.id] });
  necessity.push([up, !without.winning, without.states.size]);
  if (without.winning) {
    problems.push(`${up} gates nothing: the ending is reachable without ${chest.id}`);
  }
}
for (const b of BOSSES) {
  const without = explore({ ban: [b.kind] });
  necessity.push([b.kind, !without.winning, without.states.size]);
  if (b.kind === 'sapwarden' && without.winning) {
    problems.push('the Sap-Warden can be skipped: the ending is reachable without it');
  }
}

// Nothing should be unreachable across the whole game. Not every room is on
// the shortest winning chain - the Drain Loop and the East Loop sit behind an
// optional lock and the Rootcarver shortcut - so this asks whether a player
// could ever get there, not whether the speedrun does.
const everyRoom = new Set();
const everyHeart = new Set();
for (const state of states.values()) {
  for (const r of roomsSeen(state)) everyRoom.add(r);
  for (const h of heartsAvailable(state)) everyHeart.add(h.id);
}
for (const room of Object.keys(ROOMS)) {
  if (!everyRoom.has(room)) problems.push(`${room} is not reachable in any state of the game`);
}
for (const h of HEARTS) {
  if (!everyHeart.has(h.id)) problems.push(`heart container ${h.id} in ${h.room} can never be collected`);
}

console.log(`progression: ${states.size} reachable states explored.`);
console.log(`the ending is reachable from a new game in ${chain.length} gated steps:\n`);
chain.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m.label}`));
console.log(`\nall ${everyRoom.size}/${Object.keys(ROOMS).length} rooms reachable, ` +
  `all ${everyHeart.size}/${HEARTS.length} heart containers obtainable.`);
console.log(`content: ${CHESTS.length} chests, ${DOORS.length} doors, ${BOSSES.length} bosses.`);
console.log('\nnecessity - each taken away in turn, then the whole game re-searched:');
for (const [what, required, size] of necessity) {
  console.log(`  ${required ? 'REQUIRED    ' : 'not required'}  without ${what}: ` +
    `${size} states reachable, ending ${required ? 'unreachable' : 'STILL REACHABLE'}`);
}

if (problems.length) {
  console.error(`\nprogression: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
