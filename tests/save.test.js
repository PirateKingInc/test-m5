import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BTN, SCENE } from '../src/game/game.js';
import { serialize, deserialize, parseSave, SAVE_VERSION } from '../src/game/save.js';
import { ROOMS, edgeId } from '../src/game/world.js';
import { placeAt } from './helpers/sandbox.js';

/** A game that has actually been played a bit, so the round trip has work to do. */
function midGame() {
  const g = new Game();
  g.newGame();
  g.progress.upgrades.blade = true;
  g.progress.upgrades.charm = true;
  g.progress.keys.mire = 2;
  g.progress.keys.aerie = 1;
  g.progress.bossKeys.mire = true;
  g.progress.openedDoors.add(edgeId('d1_guard', 'd1_shortcut'));
  g.progress.openedDoors.add(edgeId('ow_cinderhome', 'ow_whorlgrove'));
  g.progress.chests.add('ch_blade');
  g.progress.chests.add('ch_d1_key1');
  g.progress.heartsTaken.add('hc_grove');
  g.progress.bossesBeaten.add('sapwarden');
  g.progress.pillars.add('ow_northgate');
  g.progress.maxHp = 10;
  g.enterRoom('d1_pitroom');
  placeAt(g.player, 6, 3);
  g.player.hp = 7;
  g.player.dir = 'left';
  for (let i = 0; i < 40; i += 1) g.step(BTN.LEFT);
  return g;
}

test('a save round trip restores the exact state', () => {
  const before = midGame();
  const blob = before.toSave();

  const after = new Game();
  assert.equal(after.loadSave(blob), true);

  assert.equal(after.room.id, before.room.id);
  assert.equal(after.player.x, before.player.x, 'down to the subpixel');
  assert.equal(after.player.y, before.player.y);
  assert.equal(after.player.dir, before.player.dir);
  assert.equal(after.player.hp, before.player.hp);
  assert.equal(after.progress.maxHp, before.progress.maxHp);
  assert.deepEqual(after.progress.upgrades, before.progress.upgrades);
  assert.deepEqual(after.progress.keys, before.progress.keys);
  assert.deepEqual(after.progress.bossKeys, before.progress.bossKeys);
  assert.deepEqual([...after.progress.openedDoors].sort(), [...before.progress.openedDoors].sort());
  assert.deepEqual([...after.progress.chests].sort(), [...before.progress.chests].sort());
  assert.deepEqual([...after.progress.heartsTaken].sort(), [...before.progress.heartsTaken].sort());
  assert.deepEqual([...after.progress.bossesBeaten].sort(), [...before.progress.bossesBeaten].sort());
  assert.deepEqual([...after.progress.pillars].sort(), [...before.progress.pillars].sort());
  assert.equal(after.rng.s, before.rng.s, 'the random stream resumes where it left off');
});

test('saving a reloaded run reproduces the same blob', () => {
  // A save is a checkpoint, not a freeze-frame: monsters, projectiles and the
  // swing she was mid-way through are deliberately not in it. What must
  // survive exactly is progress and position, and this is the strongest way
  // to say so - load it, save it again, get the same bytes.
  const blob = midGame().toSave();
  const reloaded = new Game();
  assert.equal(reloaded.loadSave(blob), true);
  assert.deepEqual(reloaded.toSave(), blob);
});

test('two runs loaded from one save play out identically', () => {
  const blob = midGame().toSave();
  const a = new Game();
  const b = new Game();
  a.loadSave(blob);
  b.loadSave(blob);

  const script = [BTN.LEFT, BTN.LEFT, BTN.B | BTN.LEFT, BTN.LEFT, BTN.A, 0, BTN.DOWN, BTN.DOWN];
  for (let i = 0; i < 400; i += 1) {
    const btn = script[i % script.length];
    a.step(btn);
    b.step(btn);
  }
  assert.deepEqual(a.describe(), b.describe());
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.player.y, b.player.y);
  assert.deepEqual(
    a.entities.map((e) => [e.kind, e.x, e.y, e.hp]),
    b.entities.map((e) => [e.kind, e.x, e.y, e.hp]),
    'including where every monster ended up',
  );
});

test('a reload puts the room back the way a room entry does', () => {
  // Monsters respawn, which is the genre convention and also what keeps a save
  // point from being a way to freeze a fight in place.
  const before = midGame();
  const after = new Game();
  after.loadSave(before.toSave());
  const fresh = new Game();
  fresh.loadSave(before.toSave());
  fresh.enterRoom(fresh.room.id);
  assert.deepEqual(
    after.entities.map((e) => [e.kind, e.x, e.y, e.hp]),
    fresh.entities.map((e) => [e.kind, e.x, e.y, e.hp]),
  );
});


test('the opened doors survive, so a re-entered room is still unlocked', () => {
  const before = midGame();
  const after = new Game();
  after.loadSave(before.toSave());
  after.enterRoom('d1_shortcut');
  assert.equal(after.room.grid[3][0], '.', 'the lock stays spent');
  after.enterRoom('ow_cinderhome');
  assert.equal(after.room.grid[0][4], '.', 'the cracked wall stays broken');
});

test('a chest already opened does not come back', () => {
  const before = midGame();
  const after = new Game();
  after.loadSave(before.toSave());
  after.enterRoom('d1_keyroom');
  assert.equal(after.props.filter((q) => q.kind === 'chest').length, 0);
  after.enterRoom('ow_whorlgrove');
  assert.equal(after.props.filter((q) => q.kind === 'heart').length, 0, 'nor does a taken container');
  assert.equal(after.props.filter((q) => q.kind === 'chest').length, 1, 'but an untouched chest does');
});

test('rubbish is refused rather than thrown at', () => {
  const good = new Game();
  good.newGame();
  const blob = good.toSave();

  for (const bad of [
    null, undefined, 42, 'nope', [],
    { ...blob, version: SAVE_VERSION + 1 },
    { ...blob, version: undefined },
    { ...blob, room: 'ow_atlantis' },
    { ...blob, room: 42 },
    { ...blob, x: 1.5 },
    { ...blob, hp: -1 },
    { ...blob, hp: 99 },
    { ...blob, maxHp: 0 },
    { ...blob, rng: 'abc' },
  ]) {
    assert.equal(deserialize(bad, ROOMS), null, `should have refused ${JSON.stringify(bad)}`);
  }

  const g = new Game();
  assert.equal(g.loadSave({ version: 9 }), false);
  assert.equal(g.scene, SCENE.TITLE, 'a refused load leaves the title screen alone');
});

test('malformed JSON is refused without throwing', () => {
  assert.equal(parseSave('', ROOMS), null);
  assert.equal(parseSave('{oh no', ROOMS), null);
  assert.equal(parseSave(null, ROOMS), null);
  assert.equal(parseSave('null', ROOMS), null);
  const g = new Game();
  g.newGame();
  assert.ok(parseSave(JSON.stringify(g.toSave()), ROOMS));
});

test('odd but survivable fields are normalised, not rejected', () => {
  const g = new Game();
  g.newGame();
  const blob = { ...g.toSave(), dir: 'sideways', keys: { mire: -5, aerie: 'x' } };
  const s = deserialize(blob, ROOMS);
  assert.equal(s.dir, 'down');
  assert.deepEqual(s.keys, { mire: 0, aerie: 0 });
});

test('entering a room asks for an autosave', () => {
  const g = new Game();
  g.newGame();
  assert.equal(g.saveRequested, true, 'new game enters a room');
  g.step(0);
  assert.equal(g.saveRequested, false, 'and does not keep asking');
  for (let i = 0; i < 400 && !g.saveRequested; i += 1) g.step(BTN.RIGHT);
  assert.equal(g.saveRequested, true, 'walking into the next room asks again');
  assert.equal(g.room.id, 'ow_southmire');
});

test('New Game always starts clean', () => {
  const dirty = midGame();
  dirty.newGame();
  assert.equal(dirty.room.id, 'ow_cinderhome');
  assert.equal(dirty.player.hp, 6);
  assert.equal(dirty.progress.maxHp, 6);
  assert.deepEqual(dirty.progress.upgrades, { blade: false, charm: false, sandals: false });
  assert.equal(dirty.progress.openedDoors.size, 0);
  assert.equal(dirty.progress.chests.size, 0);
});

test('the title screen offers Continue only when a save was handed in', () => {
  const fresh = new Game();
  assert.equal(fresh.titleOptions()[0].enabled, false);
  const saved = new Game({ hasSave: true });
  assert.equal(saved.titleOptions()[0].enabled, true);

  let asked = false;
  saved.onContinue = () => { asked = true; };
  saved.step(0);
  saved.step(BTN.A);
  assert.equal(asked, true, 'choosing Continue hands off to the host');
});

test('serialize only emits JSON-safe values', () => {
  const blob = serialize(midGame());
  const round = JSON.parse(JSON.stringify(blob));
  assert.deepEqual(round, blob, 'Sets and Maps must already be arrays');
});
