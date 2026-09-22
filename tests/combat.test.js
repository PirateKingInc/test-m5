import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, placeAt, run, BTN } from './helpers/sandbox.js';
import { SCENE } from '../src/game/game.js';
import { swingBox, playerBox, overlaps, connects } from '../src/game/combat.js';
import {
  SUB, TILE, SWING_REACH, IFRAMES, CHARGE_FRAMES,
} from '../src/game/constants.js';
import { makeShockwave, maybeDrop, STATS, BRUMBLER_WINDUP, DROP_CHANCE } from '../src/game/enemies.js';
import { makeRng } from '../src/game/rng.js';
import { WORLD_SEED } from '../src/game/constants.js';

test('the swing reaches in front of her and nowhere else', () => {
  const g = sandbox({ at: [5, 4] });
  const p = g.player;
  for (const dir of ['up', 'down', 'left', 'right']) {
    p.swingDir = dir;
    const b = swingBox(p);
    assert.equal(b.w === SWING_REACH * SUB || b.h === SWING_REACH * SUB, true,
      `${dir}: the blade should reach ${SWING_REACH}px`);
    assert.equal(overlaps(b, playerBox(p)), false, `${dir}: the blade must not overlap her own body`);
  }
  // And the box actually sits on the correct side.
  p.swingDir = 'right';
  assert.ok(swingBox(p).x > p.x);
  p.swingDir = 'left';
  assert.ok(swingBox(p).x < p.x);
  p.swingDir = 'up';
  assert.ok(swingBox(p).y < p.y);
  p.swingDir = 'down';
  assert.ok(swingBox(p).y > p.y);
});

test('a swing kills a Snag in front of her and misses one behind her', () => {
  const infront = sandbox({ at: [4, 4], entities: [{ type: 'snag', x: 5, y: 4 }] });
  infront.entities[0].timer = 100000; // stop it wandering out of the way
  run(infront, 1, BTN.RIGHT);
  run(infront, 4, BTN.RIGHT | BTN.A);
  assert.equal(infront.entities.filter((e) => e.alive).length, 0);

  const behind = sandbox({ at: [4, 4], entities: [{ type: 'snag', x: 3, y: 4 }] });
  behind.entities[0].timer = 100000;
  run(behind, 1, BTN.RIGHT);
  run(behind, 4, BTN.RIGHT | BTN.A);
  assert.equal(behind.entities.filter((e) => e.alive).length, 1);
});

test('damage grants exactly 60 invincibility frames', () => {
  const g = sandbox({ at: [4, 4], entities: [{ type: 'snag', x: 4, y: 4 }] });
  g.entities[0].timer = 100000;
  g.step(0);
  const afterFirst = g.player.hp;
  assert.ok(afterFirst < 6, 'standing on a Snag should hurt');
  assert.equal(g.player.iframes, IFRAMES);
  run(g, IFRAMES - 2, 0);
  assert.equal(g.player.hp, afterFirst, 'no further damage while flickering');
});

test('damage knocks her away from the source, not toward it', () => {
  const g = sandbox({ at: [5, 4], entities: [{ type: 'snag', x: 5, y: 4 }] });
  g.entities[0].timer = 100000;
  g.entities[0].x -= 4 * SUB; // put the Snag just to her left
  const x0 = g.player.x;
  g.step(0);
  assert.ok(g.player.knock > 0, 'she should be knocked back');
  run(g, 12, 0);
  assert.ok(g.player.x > x0, 'knocked away from the monster on her left');
});

test('a Palebuckler only takes a hit from the side it is looking at', () => {
  // It faces down, so the swing that lands is a downward one - from above it.
  const wrong = sandbox({ at: [4, 4], entities: [{ type: 'palebuckler', x: 4, y: 5, face: 'up' }] });
  const right = sandbox({ at: [4, 4], entities: [{ type: 'palebuckler', x: 4, y: 5, face: 'down' }] });
  for (const g of [wrong, right]) { g.entities[0].hp = 99; }
  run(wrong, 1, BTN.DOWN); run(wrong, 4, BTN.DOWN | BTN.A);
  run(right, 1, BTN.DOWN); run(right, 4, BTN.DOWN | BTN.A);
  assert.equal(wrong.entities[0].hp, 99, 'a swing into its shield is deflected');
  assert.ok(right.entities[0].hp < 99, 'a swing from behind lands');
  assert.equal(connects({ shielded: true, dir: 'down' }, null), true, 'a spin ignores shields');
});

test('the whorl spin needs A held for 30 frames and then hits every side', () => {
  const g = sandbox({
    at: [4, 4],
    upgrades: { charm: true },
    entities: [
      { type: 'palebuckler', x: 3, y: 4, face: 'up' },
      { type: 'palebuckler', x: 5, y: 4, face: 'up' },
    ],
  });
  for (const e of g.entities) e.hp = 99;
  run(g, CHARGE_FRAMES + 1, BTN.A);
  assert.ok(g.player.charge >= CHARGE_FRAMES);
  g.step(0);
  assert.ok(g.spinning, 'releasing a full charge should spin');
  run(g, 6, 0);
  assert.ok(g.entities.every((e) => e.hp < 99), 'the spin hits both shields at once');
});

test('releasing A early is just an ordinary swing', () => {
  const g = sandbox({ at: [4, 4], upgrades: { charm: true } });
  run(g, CHARGE_FRAMES - 10, BTN.A);
  g.step(0);
  assert.equal(g.spinning, false);
  assert.equal(g.player.charge, 0);
});

test('a Mothkin can only be killed from the air', () => {
  const ground = sandbox({ at: [4, 4], entities: [{ type: 'mothkin', x: 5, y: 4 }] });
  run(ground, 1, BTN.RIGHT);
  run(ground, 6, BTN.RIGHT | BTN.A);
  assert.equal(ground.entities[0].alive, true, 'a grounded swing passes under it');

  const air = sandbox({ at: [4, 4], entities: [{ type: 'mothkin', x: 5, y: 4 }] });
  air.step(BTN.RIGHT);
  air.step(BTN.RIGHT | BTN.B);          // jump
  run(air, 5, BTN.RIGHT);               // rise to swing height
  run(air, 5, BTN.RIGHT | BTN.A);
  assert.equal(air.entities.filter((e) => e.alive).length, 0, 'an airborne swing connects');
});

test('a shockwave hurts her on the ground and passes under a jump', () => {
  const grounded = sandbox({ at: [5, 4] });
  grounded.hazards.push(makeShockwave(2 * TILE * SUB, 4 * TILE * SUB + 8 * SUB, 'right'));
  run(grounded, 60, 0);
  assert.ok(grounded.player.hp < 6, 'standing still in a shockwave should hurt');

  const jumping = sandbox({ at: [5, 4] });
  jumping.hazards.push(makeShockwave(2 * TILE * SUB, 4 * TILE * SUB + 8 * SUB, 'right'));
  // Hold B so she is airborne as it arrives, and keep re-jumping.
  for (let i = 0; i < 60; i += 1) jumping.step(i % 20 === 0 ? BTN.B : 0);
  assert.equal(jumping.player.hp, 6, 'a shockwave must be avoidable by jumping');
});

test('a Brumbler charges only when Summer lines up with it, and stuns on a wall', () => {
  const g = sandbox({ at: [8, 4], entities: [{ type: 'brumbler', x: 2, y: 4 }] });
  const e = g.entities[0];
  run(g, 4, 0);
  assert.equal(e.state, 'winding', 'sharing a row should start the wind-up');
  assert.equal(e.dir, 'right');
  const wound = e.x;
  run(g, BRUMBLER_WINDUP - 8, 0);
  assert.equal(e.state, 'winding', 'the wind-up lasts long enough to react to');
  assert.equal(e.x, wound, 'and it stays put for all of it');
  const x0 = e.x;
  run(g, 8, 0);
  assert.equal(e.state, 'charging', 'then it goes');
  run(g, 80, 0);
  assert.ok(e.x > x0, 'it should have travelled');
  assert.equal(e.state, 'stunned', 'and be recovering after hitting something');
});

test('a Spitfen shoots along its facing and its seed dies on a wall', () => {
  const g = sandbox({ at: [2, 2], entities: [{ type: 'spitfen', x: 5, y: 4, face: 'right' }] });
  g.player.iframes = 100000; // we are testing the projectile, not the damage
  run(g, 90, 0);
  assert.ok(g.hazards.some((h) => h.kind === 'seed'), 'it should have fired');
  const seed = g.hazards.find((h) => h.kind === 'seed');
  assert.ok(seed.vx !== 0 && seed.vy === 0, 'the seed travels along the facing axis');
  run(g, 120, 0);
  assert.equal(g.hazards.filter((h) => h.kind === 'seed' && h.life > 0).length <= 1, true,
    'seeds do not accumulate forever against the wall');
});

test('a Snag wanders, and wanders the same way for the same seed', () => {
  const path = () => {
    const g = sandbox({ at: [8, 6], entities: [{ type: 'snag', x: 3, y: 3 }] });
    g.player.iframes = 100000;
    const seen = [];
    for (let i = 0; i < 200; i += 1) { g.step(0); seen.push(g.entities[0].x, g.entities[0].y); }
    return seen.join(',');
  };
  const a = path();
  assert.equal(a, path(), 'the seeded stream makes wandering reproducible');
  const g = sandbox({ at: [8, 6], entities: [{ type: 'snag', x: 3, y: 3 }] });
  const start = { x: g.entities[0].x, y: g.entities[0].y };
  run(g, 200, 0);
  assert.notDeepEqual({ x: g.entities[0].x, y: g.entities[0].y }, start, 'it should actually move');
});

test('half-heart drops come from the seeded stream at the documented rate', () => {
  const rng = makeRng(WORLD_SEED);
  const fake = { x: 0, y: 0 };
  let drops = 0;
  for (let i = 0; i < 400; i += 1) if (maybeDrop(fake, rng)) drops += 1;
  const rate = drops / 400;
  assert.ok(Math.abs(rate - DROP_CHANCE) < 0.08, `drop rate ${rate} is not close to ${DROP_CHANCE}`);
});

test('the same seed drops the same hearts in the same places', () => {
  const massacre = () => {
    const g = sandbox({
      at: [4, 4],
      entities: Array.from({ length: 24 }, (_, i) => ({ type: 'snag', x: 1 + (i % 8), y: 1 + (i % 5) })),
    });
    g.player.iframes = 1e6;
    for (const e of g.entities) e.hp = 1;
    for (const e of [...g.entities]) {
      placeAt(g.player, 4, 4);
      e.x = g.player.x + 10 * SUB;
      e.y = g.player.y;
      g.step(BTN.RIGHT);
      run(g, 4, BTN.RIGHT | BTN.A);
    }
    return g;
  };
  const a = massacre();
  const b = massacre();
  assert.equal(a.entities.filter((e) => e.alive).length, 0, 'all 24 should be dead');
  assert.ok(a.pickups.length > 0, 'twenty-four kills should drop something');
  assert.deepEqual(
    a.pickups.map((q) => [q.x, q.y]),
    b.pickups.map((q) => [q.x, q.y]),
  );
});

test('a half-heart heals one half and never overfills', () => {
  const g = sandbox({ at: [4, 4] });
  g.player.hp = 2;
  g.pickups.push({ kind: 'halfheart', x: g.player.x, y: g.player.y, life: 100 });
  g.step(0);
  assert.equal(g.player.hp, 3);
  g.player.hp = g.progress.maxHp;
  g.pickups.push({ kind: 'halfheart', x: g.player.x, y: g.player.y, life: 100 });
  g.step(0);
  assert.equal(g.player.hp, g.progress.maxHp);
});

test('running out of hearts ends the run', () => {
  const g = sandbox({ at: [4, 4] });
  g.player.hp = 1;
  g.damage(2, 0, 0, true);
  assert.equal(g.player.hp, 0);
  assert.equal(g.scene, SCENE.GAMEOVER);
});

test('a room with nothing alive in it reports itself clear', () => {
  const g = sandbox({ at: [4, 4], entities: [{ type: 'snag', x: 7, y: 6 }] });
  assert.equal(g.roomCleared(), false);
  g.entities[0].alive = false;
  assert.equal(g.roomCleared(), true);
});

test('every monster type has stats and a behaviour that runs without throwing', () => {
  for (const kind of Object.keys(STATS)) {
    const g = sandbox({ at: [8, 6], entities: [{ type: kind, x: 4, y: 3 }] });
    g.player.iframes = 100000;
    run(g, 300, 0);
    assert.ok(g.entities.length >= 0, kind);
  }
});
