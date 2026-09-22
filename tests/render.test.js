import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakecanvas.js';

const makeCanvas = installFakeDom();

const { Renderer } = await import('../src/engine/render.js');
const { Game, BTN, SCENE } = await import('../src/game/game.js');
const { SCREEN_W, SCREEN_H, HUD_H } = await import('../src/game/constants.js');

function renderedGame(setup = () => {}) {
  const game = new Game();
  const renderer = new Renderer(makeCanvas(SCREEN_W, SCREEN_H));
  setup(game);
  renderer.draw(game);
  return { game, renderer };
}

const onlyPaletteIndices = (buf) => buf.every((v) => v >= 0 && v <= 3);

test('the frame buffer is exactly 160x144', () => {
  const { renderer } = renderedGame();
  assert.equal(renderer.buf.length, SCREEN_W * SCREEN_H);
  assert.equal(SCREEN_W, 160);
  assert.equal(SCREEN_H, 144);
});

test('nothing ever writes a fifth colour', () => {
  for (const setup of [
    () => {},
    (g) => { g.step(0); g.step(BTN.A); g.step(0); },
    (g) => { g.newGame(); for (let i = 0; i < 120; i += 1) g.step(BTN.RIGHT); },
    (g) => { g.newGame(); g.step(BTN.B); g.step(0); },
    (g) => { g.newGame(); g.step(0); g.step(BTN.START); },
    (g) => { g.newGame(); g.player.hp = 0; g.scene = SCENE.GAMEOVER; },
  ]) {
    const { renderer } = renderedGame(setup);
    assert.ok(onlyPaletteIndices(renderer.buf), 'a pixel outside 0..3 was written');
  }
});

test('the title screen draws something recognisable', () => {
  const { renderer } = renderedGame();
  const used = new Set(renderer.buf);
  assert.ok(used.size >= 3, 'the title screen should use most of the palette');
});

test('the HUD occupies the top 16 pixels and the room the rest', () => {
  const { renderer } = renderedGame((g) => { g.newGame(); g.step(0); });
  // The HUD band is drawn dark and then has hearts punched into it.
  const hudRow = renderer.buf.slice(0, SCREEN_W);
  assert.ok(hudRow.every((v) => v === 3), 'the top HUD row should be solid ink');
  // The room area is not blank.
  const room = renderer.buf.slice(HUD_H * SCREEN_W);
  assert.ok(new Set(room).size >= 3, 'the room should be drawn under the HUD');
});

test('mid-transition both rooms are on screen at once', () => {
  const { game, renderer } = renderedGame((g) => {
    g.newGame();
    for (let i = 0; i < 400; i += 1) {
      g.step(BTN.RIGHT);
      if (g.scene === SCENE.TRANSITION) break;
    }
  });
  assert.equal(game.scene, SCENE.TRANSITION);
  assert.ok(game.transition.from.id !== game.room.id);
  renderer.draw(game);
  assert.ok(onlyPaletteIndices(renderer.buf));
});

test('hearts in the HUD track current and maximum health', () => {
  const { game, renderer } = renderedGame((g) => { g.newGame(); g.step(0); });
  const litWith = (hp) => {
    game.player.hp = hp;
    renderer.draw(game);
    let n = 0;
    for (let y = 4; y < 12; y += 1) {
      for (let x = 0; x < 90; x += 1) if (renderer.buf[y * SCREEN_W + x] === 0) n += 1;
    }
    return n;
  };
  const full = litWith(6);
  const half = litWith(3);
  const empty = litWith(0);
  assert.ok(full > half && half > empty, `expected ${full} > ${half} > ${empty}`);
});

test('the renderer scales to whole-number multiples only', () => {
  const canvas = makeCanvas(0, 0);
  const renderer = new Renderer(canvas);
  assert.equal(renderer.fit(320, 288), 2);
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 288);
  assert.equal(renderer.fit(500, 500), 3, 'should floor, not stretch');
  assert.equal(renderer.fit(10, 10), 1, 'never smaller than 1x');
});
