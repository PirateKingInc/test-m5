// The bot playthrough, as a test.
//
// This is the end-to-end proof that the game is finishable: a scripted stream
// of button presses that starts at New Game and stops on the credits. It is
// not a smoke test. If a room, a gate, a monster or a boss changes in a way
// that makes the ending unreachable in practice - as opposed to unreachable in
// the tile model, which the progression prover covers - this is what notices.
//
// It is deliberately the slowest test in the suite. Twenty-seven thousand
// frames of simulation is about a second and a half; the ending is worth it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { playthrough, replay, digest } from '../tools/bot.js';
import { SCENE } from '../src/game/game.js';
import { ROUTE } from '../tools/lib/objectives.js';

const run = playthrough();

test('a scripted run reaches the ending and the credits', () => {
  assert.equal(run.game.scene, SCENE.CREDITS, 'the run should end on the credits');
  assert.ok(run.game.progress.bossesBeaten.has('sapwarden'), 'the Sap-Warden should be beaten');
  assert.ok(run.game.progress.bossesBeaten.has('chorister'), 'the Chorister should be beaten');
  assert.ok(run.game.player.hp > 0, 'and she should still be standing');
});

test('every objective on the route is ticked off, in order', () => {
  assert.equal(run.finished, ROUTE.length, `only ${run.finished}/${ROUTE.length} objectives done`);
  const labels = run.log.map((e) => e.did);
  assert.deepEqual(labels, ROUTE.map((o) => o.label));
});

test('the run finds every upgrade and both Wick-Stones', () => {
  const u = run.game.progress.upgrades;
  assert.equal(u.blade, true);
  assert.equal(u.charm, true);
  assert.equal(u.sandals, true);
});

test('the recorded input stream replays to a byte-identical state', () => {
  // The whole simulation is a pure function of its inputs, so the same buttons
  // in the same order must land in exactly the same place - same subpixel,
  // same RNG state. This is what makes the run above evidence rather than
  // anecdote, and it is the guard against any hidden clock or Math.random.
  assert.equal(digest(replay(run.frames)), digest(run.game));
});

test('the run is a plausible length for a person to play', () => {
  const minutes = run.frames.length / 60 / 60;
  assert.ok(minutes > 3, `a perfect route should still take a few minutes, not ${minutes.toFixed(1)}`);
  assert.ok(minutes < 25, `a perfect route should not take ${minutes.toFixed(1)} minutes`);
});
