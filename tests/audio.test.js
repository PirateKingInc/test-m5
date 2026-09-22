// The score, checked as data.
//
// The engine itself needs a browser, so what is testable here is everything
// that decides what it will play: that every token parses, that every sound
// the game can ask for exists, and that the music is in fact music rather than
// a pile of notes - each track in a key, each voice in a sensible register.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, AREA_TRACK, VOICES, noteHz, rows } from '../src/data/music.js';
import { SFX } from '../src/game/game.js';
import { ROOMS } from '../src/game/world.js';

const MELODIC = ['lead', 'harmony', 'bass'];

test('note names parse to the pitches they name', () => {
  assert.equal(noteHz('A4'), 440);
  assert.equal(Math.round(noteHz('A3')), 220);
  assert.equal(Math.round(noteHz('A5')), 880);
  assert.equal(Math.round(noteHz('C4')), 262);
  // Enharmonics are the same pitch, which is the point of accepting both.
  assert.equal(noteHz('A#3'), noteHz('Bb3'));
  assert.equal(noteHz('.'), null, 'a rest is not a pitch');
  assert.equal(noteHz('-'), null, 'nor is a hold');
});

test('bars join into flat rows without swallowing a note', () => {
  assert.deepEqual(rows(['A4 -  .  . ', 'B4 -  .  . ']), ['A4', '-', '.', '.', 'B4', '-', '.', '.']);
});

test('every track has all four voices and a workable tempo', () => {
  for (const [name, t] of Object.entries(TRACKS)) {
    assert.ok(t.bpm >= 60 && t.bpm <= 200, `${name}: ${t.bpm} bpm`);
    for (const voice of [...MELODIC, 'drums']) {
      assert.ok(Array.isArray(t[voice]) && t[voice].length > 0, `${name} has no ${voice}`);
      assert.equal(t[voice].length % 16, 0, `${name}.${voice} is not a whole number of bars`);
    }
  }
});

test('every token in every track is a note, a rest, a hold or a drum', () => {
  for (const [name, t] of Object.entries(TRACKS)) {
    for (const voice of MELODIC) {
      for (const tok of t[voice]) {
        assert.ok(tok === '.' || tok === '-' || noteHz(tok) !== null,
          `${name}.${voice}: "${tok}" is not playable`);
      }
    }
    for (const tok of t.drums) {
      assert.ok(['.', '-', 'k', 's', 'h'].includes(tok), `${name}.drums: "${tok}"`);
    }
  }
});

test('no voice opens on a hold, which would sound nothing', () => {
  for (const [name, t] of Object.entries(TRACKS)) {
    for (const voice of MELODIC) {
      assert.notEqual(t[voice][0], '-', `${name}.${voice} starts mid-note`);
    }
  }
});

test('the bass stays under the lead in every track', () => {
  const lowest = (part) => Math.min(...part.map(noteHz).filter((h) => h !== null));
  for (const [name, t] of Object.entries(TRACKS)) {
    const bass = lowest(t.bass);
    const lead = lowest(t.lead);
    assert.ok(bass < lead, `${name}: the bass is not below the lead`);
    assert.ok(bass > 30, `${name}: ${bass.toFixed(0)}Hz is below anything that will reproduce`);
  }
});

test('every area of the world has a theme, and every theme an area', () => {
  const areas = new Set(Object.values(ROOMS).map((r) => r.area));
  for (const area of areas) {
    assert.ok(AREA_TRACK[area], `no theme for area "${area}"`);
    assert.ok(TRACKS[AREA_TRACK[area]], `theme "${AREA_TRACK[area]}" does not exist`);
  }
  for (const area of Object.keys(AREA_TRACK)) {
    assert.ok(areas.has(area), `theme mapped to area "${area}", which no room uses`);
  }
  // Plus the two that are not places.
  assert.ok(TRACKS.title && TRACKS.ending);
});

test('the two bosses do not share an arrangement', () => {
  assert.notDeepEqual(TRACKS.boss_mire.lead, TRACKS.boss_aerie.lead);
  assert.ok(TRACKS.boss_aerie.bpm > TRACKS.boss_mire.bpm, 'the second boss should drive harder');
});

test('every sound the game can ask for has a voice', () => {
  for (const name of Object.values(SFX)) {
    assert.ok(VOICES[name], `SFX.${name} has no voice`);
  }
});

test('no voice is listed that nothing ever plays', () => {
  const used = new Set(Object.values(SFX));
  for (const name of Object.keys(VOICES)) {
    assert.ok(used.has(name), `voice "${name}" is never played`);
  }
});

test('every voice is a pulse duty the engine has, or noise', () => {
  for (const [name, v] of Object.entries(VOICES)) {
    assert.ok(v.wave === 'noise' || [0.125, 0.25, 0.5].includes(v.wave), `${name}: ${v.wave}`);
    assert.ok(v.from > 20 && v.to > 20, `${name} sweeps below hearing`);
    assert.ok(v.secs > 0 && v.secs <= 1.5, `${name} lasts ${v.secs}s`);
    assert.ok(v.gain > 0 && v.gain <= 0.3, `${name} is at ${v.gain}`);
  }
});

test('nothing in the score is fetched from anywhere', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['src/data/music.js', 'src/engine/audio.js']) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/fetch\(|XMLHttpRequest|\.(mp3|ogg|wav|flac)\b|decodeAudioData/.test(src),
      `${file} loads audio from outside the repository`);
  }
});

// --- the engine, against a stub AudioContext ---------------------------------
//
// There is no Web Audio in node, so this stands in a recording fake and checks
// the engine's shape: that it stays silent until it is started, that it builds
// its waves once, that a frame of play queues notes, and that every sound the
// game can emit survives being fired. It is not a test of what it sounds like.
// It is a test that it does not throw at someone on the title screen.

function stubContext(log) {
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
  });
  const node = (kind) => ({
    kind,
    frequency: param(),
    gain: param(),
    Q: param(),
    connect(next) { return next ?? this; },
    start(t) { log.push([kind, 'start', t]); },
    stop() {},
    setPeriodicWave() {},
  });
  return {
    currentTime: 0,
    sampleRate: 8000,
    destination: node('destination'),
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBufferSource: () => node('src'),
    createBiquadFilter: () => node('filter'),
    createBuffer: (_c, len) => ({ getChannelData: () => new Float32Array(len) }),
    createPeriodicWave: (real, imag) => { log.push(['wave', real.length, imag.length]); return {}; },
  };
}

test('the engine is silent, and harmless, before it is started', async () => {
  const { AudioEngine } = await import('../src/engine/audio.js');
  const a = new AudioEngine();
  assert.equal(a.ready, false);
  a.fire('swing');
  a.setTrack('overworld');
  a.schedule();
  assert.equal(a.ctx, null, 'nothing should have been built');
});

test('starting builds one wave per duty cycle, and only once', async () => {
  const { AudioEngine } = await import('../src/engine/audio.js');
  const log = [];
  globalThis.AudioContext = function AC() { return stubContext(log); };
  try {
    const a = new AudioEngine();
    a.start();
    a.start();
    assert.equal(log.filter((e) => e[0] === 'wave').length, 3, '12.5%, 25% and 50%');
    assert.equal(a.ready, true);
  } finally {
    delete globalThis.AudioContext;
  }
});

test('every sound the game can emit fires without throwing', async () => {
  const { AudioEngine } = await import('../src/engine/audio.js');
  const log = [];
  globalThis.AudioContext = function AC() { return stubContext(log); };
  try {
    const a = new AudioEngine();
    a.start();
    for (const name of Object.values(SFX)) a.fire(name);
    assert.equal(log.filter((e) => e[1] === 'start').length, Object.values(SFX).length);
    a.fire('no-such-sound'); // and an unknown one is simply ignored
  } finally {
    delete globalThis.AudioContext;
  }
});

test('a frame of play queues notes ahead of the clock', async () => {
  const { AudioEngine } = await import('../src/engine/audio.js');
  const { Game } = await import('../src/game/game.js');
  const log = [];
  globalThis.AudioContext = function AC() { return stubContext(log); };
  try {
    const a = new AudioEngine();
    a.start();
    const g = new Game();
    g.newGame();
    g.step(0);
    a.update(g);
    assert.equal(a.trackName, 'overworld', 'the valley theme in the valley');
    assert.ok(a.nextRow > 1, 'rows should be queued ahead, not one per frame');
    const times = log.filter((e) => e[1] === 'start').map((e) => e[2]);
    assert.ok(times.every((t) => t >= 0 && t < 1), 'and all inside the lookahead');
    // Following the game: the title screen and the credits have their own.
    g.scene = 'title';
    a.update(g);
    assert.equal(a.trackName, 'title');
    g.scene = 'credits';
    a.update(g);
    assert.equal(a.trackName, 'ending');
  } finally {
    delete globalThis.AudioContext;
  }
});

test('muting silences the master and unmuting restores it', async () => {
  const { AudioEngine } = await import('../src/engine/audio.js');
  globalThis.AudioContext = function AC() { return stubContext([]); };
  try {
    const a = new AudioEngine();
    a.start();
    assert.equal(a.toggleMute(), true);
    assert.equal(a.master.gain.value, 0);
    assert.equal(a.ready, false, 'a muted engine schedules nothing');
    assert.equal(a.toggleMute(), false);
    assert.ok(a.master.gain.value > 0);
  } finally {
    delete globalThis.AudioContext;
  }
});
