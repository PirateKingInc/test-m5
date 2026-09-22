import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOMS, START_ROOM, OPENINGS, OPPOSITE, edgeId, doorKind,
  dungeonOf, areaOf, materialize, openingDirAt, portalAt, signAt,
} from '../src/game/world.js';
import { blocks, isPit, isLedge, SOLID, FLOOR } from '../src/game/tilemap.js';
import { ROOM_W, ROOM_H } from '../src/game/constants.js';

test('the world is the size SPEC.md says it is', () => {
  const ids = Object.keys(ROOMS);
  assert.equal(ids.length, 41);
  assert.equal(ids.filter((i) => i.startsWith('ow_')).length, 12);
  assert.equal(ids.filter((i) => i.startsWith('d1_')).length, 14);
  assert.equal(ids.filter((i) => i.startsWith('d2_')).length, 15);
  assert.ok(ROOMS[START_ROOM]);
});

test('every room is a 10x8 grid', () => {
  for (const [id, room] of Object.entries(ROOMS)) {
    assert.equal(room.tiles.length, ROOM_H, id);
    for (const row of room.tiles) assert.equal(row.length, ROOM_W, id);
  }
});

test('edge ids are the same from either side of a door', () => {
  assert.equal(edgeId('a', 'b'), edgeId('b', 'a'));
  assert.equal(edgeId('d1_guard', 'd1_shortcut'), 'd1_guard~d1_shortcut');
});

test('every door edge is declared identically by both rooms', () => {
  let doors = 0;
  for (const [id, room] of Object.entries(ROOMS)) {
    for (const [dir, dest] of Object.entries(room.exits)) {
      const kind = doorKind(id, dir);
      if (!kind) continue;
      doors += 1;
      assert.equal(kind, doorKind(dest, OPPOSITE[dir]), `${id} ${dir} -> ${dest}`);
    }
  }
  // Each door is counted once per side: 3 locks + 1 crack + 1 gate + 1 boss door
  // in each dungeon, plus one crack and one gate in the overworld.
  assert.equal(doors / 2, 12);
});

test('the three upgrades and both boss keys each exist exactly once', () => {
  const gives = Object.values(ROOMS)
    .flatMap((r) => r.entities ?? [])
    .filter((e) => e.type === 'chest')
    .map((e) => e.gives);
  assert.equal(gives.filter((g) => g === 'blade').length, 1);
  assert.equal(gives.filter((g) => g === 'charm').length, 1);
  assert.equal(gives.filter((g) => g === 'sandals').length, 1);
  assert.equal(gives.filter((g) => g === 'bosskey').length, 2);
  assert.equal(gives.filter((g) => g === 'smallkey').length, 6, 'three small keys per dungeon');
});

test('there are seven heart containers, all with unique ids', () => {
  const hearts = Object.values(ROOMS)
    .flatMap((r) => r.entities ?? [])
    .filter((e) => e.type === 'heart');
  assert.equal(hearts.length, 7);
  assert.equal(new Set(hearts.map((h) => h.id)).size, 7);
});

test('all six monster types are used, and both bosses are placed', () => {
  const types = new Set(
    Object.values(ROOMS).flatMap((r) => (r.entities ?? []).map((e) => e.type)),
  );
  for (const m of ['snag', 'brumbler', 'palebuckler', 'mothkin', 'thudder', 'spitfen']) {
    assert.ok(types.has(m), `${m} is never placed anywhere`);
  }
  const bosses = Object.values(ROOMS)
    .flatMap((r) => r.entities ?? [])
    .filter((e) => e.type === 'boss')
    .map((e) => e.kind);
  assert.deepEqual(bosses.sort(), ['chorister', 'sapwarden']);
});

test('materialize opens only the doors the save says are open', () => {
  const shut = materialize('d1_guard', new Set());
  for (const [x, y] of OPENINGS.e) assert.equal(shut[y][x], 'L');

  const open = materialize('d1_guard', new Set([edgeId('d1_guard', 'd1_shortcut')]));
  for (const [x, y] of OPENINGS.e) assert.equal(open[y][x], '.');
  // The gate north of the guardroom is a different edge and must stay shut.
  for (const [x, y] of OPENINGS.n) assert.equal(open[y][x], 'G');
});

test('materialize returns a fresh grid each time', () => {
  const a = materialize('d1_guard', new Set());
  a[1][1] = '#';
  assert.notEqual(materialize('d1_guard', new Set())[1][1], '#');
});

test('room lookup helpers answer about the right tiles', () => {
  assert.equal(openingDirAt('ow_cinderhome', 4, 0), 'n');
  assert.equal(openingDirAt('ow_cinderhome', 4, 4), null);
  assert.equal(portalAt('ow_mirevault', 2, 1).to, 'd1_entry');
  assert.equal(portalAt('ow_mirevault', 5, 5), null);
  assert.ok(signAt('ow_cinderhome', 3, 3)[0].includes('CINDERHOME'));
  assert.equal(signAt('ow_cinderhome', 0, 0), null);
});

test('rooms report their dungeon and area', () => {
  assert.equal(dungeonOf('d1_boss'), 'mire');
  assert.equal(dungeonOf('d2_foyer'), 'aerie');
  assert.equal(dungeonOf('ow_cinderhome'), null);
  assert.equal(areaOf('d1_boss'), 'boss_mire');
  assert.equal(areaOf('d2_boss'), 'boss_aerie');
});

test('tile semantics match the legend', () => {
  for (const ch of SOLID) assert.equal(blocks(ch), true, ch);
  for (const ch of FLOOR) assert.equal(blocks(ch), false, ch);
  for (const ch of ['C', 'L', 'B', 'G']) assert.equal(blocks(ch), true, ch);

  // A pit never blocks: Summer walks in and falls. That is the whole point.
  assert.equal(blocks('P'), false);
  assert.equal(isPit('P'), true);
  assert.equal(isPit('.'), false);

  // A ledge needs the Gale Sandals AND being off the ground.
  assert.equal(isLedge('J'), true);
  assert.equal(blocks('J', {}), true);
  assert.equal(blocks('J', { airborne: true }), true, 'jumping alone is not enough');
  assert.equal(blocks('J', { hasSandals: true }), true, 'sandals alone are not enough');
  assert.equal(blocks('J', { hasSandals: true, airborne: true }), false);
  assert.equal(blocks('J', { hasSandals: true, onLedge: true }), false, 'walk along a ledge once up');
});
