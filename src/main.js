// Wiring: build the game, the renderer, the input and the loop, and hand them
// to each other. This is the only file that assumes a browser.

import { Game } from './game/game.js';
import { parseSave } from './game/save.js';
import { ROOMS } from './game/world.js';
import { Renderer } from './engine/render.js';
import { Input } from './engine/input.js';
import { Loop } from './engine/loop.js';
import { AudioEngine } from './engine/audio.js';
import { readSave, writeSave, clearSave } from './engine/storage.js';

const canvas = document.getElementById('screen');
const shell = document.getElementById('shell');
const controls = document.getElementById('controls');

let stored = parseSave(readSave(), ROOMS);
if (readSave() !== null && stored === null) clearSave(); // unreadable: start clean

const game = new Game({ hasSave: stored !== null });
game.onContinue = () => {
  if (!game.loadSave(JSON.parse(readSave()))) game.newGame();
};

const renderer = new Renderer(canvas);
const input = new Input();
const audio = new AudioEngine();

// A browser will not start an AudioContext outside a gesture, so the engine
// waits for the first real button press and builds itself then. Everything it
// offers before that is a no-op, and the game runs silently rather than
// throwing at someone who has not touched anything yet.
input.onEngage = () => audio.start();

input.attachKeyboard(window);
input.attachTouch(document.body);

// Sound on and off. Deliberately not a game button: it is not on the pad, it
// never reaches the button mask, and M is not one of the game's keys. Two
// buttons is a design rule about playing, not about the speaker.
const muteButton = document.getElementById('mute');
function toggleSound() {
  audio.start();
  const off = audio.toggleMute();
  muteButton.textContent = off ? '\u266a SOUND OFF' : '\u266a SOUND ON';
  muteButton.setAttribute('aria-pressed', String(off));
}
muteButton.addEventListener('click', toggleSound);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) toggleSound();
});

function fit() {
  const pad = controls.classList.contains('hidden') ? 16 : 8;
  const availH = shell.clientHeight - (controls.offsetHeight || 0) - pad;
  renderer.fit(shell.clientWidth - pad, Math.max(64, availH));
}

const loop = new Loop(
  () => {
    game.step(input.buttons);
    audio.update(game);
    // Autosave on every room entry and at every save marker. Both set the
    // same flag, so there is one place that writes.
    if (game.saveRequested) {
      writeSave(game.toSave());
      game.hasSave = true;
    }
  },
  () => { renderer.draw(game); },
);

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));

fit();
loop.start(performance.now());

// Handy for poking at a live game from the console; not used by the game itself.
window.brackenfall = { game, renderer, input, loop, audio };
