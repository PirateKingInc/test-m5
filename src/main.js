// Wiring: build the game, the renderer, the input and the loop, and hand them
// to each other. This is the only file that assumes a browser.

import { Game } from './game/game.js';
import { Renderer } from './engine/render.js';
import { Input } from './engine/input.js';
import { Loop } from './engine/loop.js';

const canvas = document.getElementById('screen');
const shell = document.getElementById('shell');
const controls = document.getElementById('controls');

const game = new Game();
const renderer = new Renderer(canvas);
const input = new Input();

input.attachKeyboard(window);
input.attachTouch(document.body);

function fit() {
  const pad = controls.classList.contains('hidden') ? 16 : 8;
  const availH = shell.clientHeight - (controls.offsetHeight || 0) - pad;
  renderer.fit(shell.clientWidth - pad, Math.max(64, availH));
}

const loop = new Loop(
  () => { game.step(input.buttons); },
  () => { renderer.draw(game); },
);

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));

fit();
loop.start(performance.now());

// Handy for poking at a live game from the console; not used by the game itself.
window.brackenfall = { game, renderer, input, loop };
