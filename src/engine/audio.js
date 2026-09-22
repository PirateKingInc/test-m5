// The audio engine. Web Audio only: four synthesised voices, no files.
//
// Two rules shape everything here.
//
// The simulation never makes a sound. `Game` pushes names onto `game.sounds`
// and this drains them, which is what keeps the game logic pure enough for the
// bot to replay twenty-seven thousand frames into an identical state.
//
// And a browser will not start an AudioContext outside a gesture, so nothing
// is created until `start()` is called from the first keypress or touch. Until
// then every method here is a no-op, and the game runs silently rather than
// throwing.

import { TRACKS, AREA_TRACK, VOICES, noteHz } from '../data/music.js';
import { SCENE } from '../game/game.js';

/** How far ahead of the clock notes are queued, in seconds. */
const LOOKAHEAD = 0.25;
/** A row is a sixteenth note. */
const ROWS_PER_BEAT = 4;

/**
 * A pulse wave of a given duty cycle, as a PeriodicWave.
 *
 * `OscillatorNode` offers 'square', which is the 50% case and the least
 * characterful of the three the hardware could do. The thin 12.5% duty is what
 * makes a lead cut through a bass line, so it is worth the Fourier series.
 */
function pulseWave(ctx, duty, harmonics = 24) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n += 1) {
    // Fourier coefficients of a duty-cycle pulse train.
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** A second of white noise, reused by every noise voice. */
function noiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A fixed sequence rather than Math.random: the same explosion every time is
  // a feature, and nothing in this project is allowed to be non-deterministic
  // without saying so.
  let s = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
    data[i] = (s / 0x7fffffff) % 1;
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.trackName = null;
    this.track = null;
    this.trackStart = 0;
    this.nextRow = 0;
    this.waves = new Map();
    this.noise = null;
  }

  /** Called from the first real input, where a browser will allow it. */
  start() {
    if (this.ctx) return;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    // Four voices at once, on small speakers, with no limiter: leave headroom.
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    for (const duty of [0.125, 0.25, 0.5]) {
      this.waves.set(duty, pulseWave(this.ctx, duty));
    }
    this.noise = noiseBuffer(this.ctx);
  }

  get ready() {
    return this.ctx !== null && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  // --- one-shots -------------------------------------------------------------

  /**
   * A single effect: one voice, a pitch sweep and a decay. Every node is
   * created, started and stopped in one go, so there is nothing to clean up.
   */
  fire(name, at = 0) {
    if (!this.ready) return;
    const v = VOICES[name];
    if (!v) return;
    const t = Math.max(at, this.ctx.currentTime);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(v.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + v.secs);
    gain.connect(this.master);

    if (v.wave === 'noise') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      // The sweep becomes a filter sweep: noise has no pitch to bend.
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.4;
      filter.frequency.setValueAtTime(v.from, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(v.to, 20), t + v.secs);
      src.connect(filter).connect(gain);
      src.start(t);
      src.stop(t + v.secs);
      return;
    }

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.waves.get(v.wave) ?? this.waves.get(0.5));
    osc.frequency.setValueAtTime(v.from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(v.to, 20), t + v.secs);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + v.secs);
  }

  // --- the score -------------------------------------------------------------

  /** Switches tracks, restarting the clock. A repeat of the same name is a no-op. */
  setTrack(name) {
    if (name === this.trackName) return;
    this.trackName = name;
    this.track = name ? TRACKS[name] ?? null : null;
    if (!this.ctx) return;
    this.trackStart = this.ctx.currentTime + 0.05;
    this.nextRow = 0;
  }

  rowSeconds() {
    return 60 / (this.track.bpm * ROWS_PER_BEAT);
  }

  /**
   * Queues every row that falls inside the lookahead window.
   *
   * Scheduling from the animation frame directly would put every note on a
   * 16ms grid and make the whole score swing drunkenly under load. Queueing
   * ahead against the audio clock is the only way to get a steady sixteenth.
   */
  schedule() {
    if (!this.ready || !this.track) return;
    const dt = this.rowSeconds();
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.trackStart + this.nextRow * dt < horizon) {
      const at = this.trackStart + this.nextRow * dt;
      this.playRow(this.nextRow, at, dt);
      this.nextRow += 1;
    }
  }

  /**
   * One row of the four voices.
   *
   * Each voice wraps at its own length, so a four-bar bass under a sixteen-bar
   * melody drifts in and out of phase with it instead of repeating in lockstep.
   */
  playRow(row, at, dt) {
    const t = this.track;
    this.voice(t.lead, row, at, dt, 0.125, 0.105);
    this.voice(t.harmony, row, at, dt, 0.5, 0.06);
    this.voice(t.bass, row, at, dt, 0.25, 0.115, -12);
    this.percussion(t.drums, row, at);
  }

  /** Strikes one note, holding it for as long as the following `-` rows run. */
  voice(part, row, at, dt, duty, gain, transpose = 0) {
    if (!part || part.length === 0) return;
    const i = row % part.length;
    const hz = noteHz(part[i]);
    if (hz === null) return;
    let held = 1;
    while (held < 64 && part[(i + held) % part.length] === '-') held += 1;
    const secs = held * dt;

    const g = this.ctx.createGain();
    // A hard attack and a long-ish tail: pulse voices with a soft attack stop
    // sounding like a Game Boy and start sounding like a synth pad.
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.006);
    g.gain.setValueAtTime(gain, at + secs * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + secs);
    g.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.waves.get(duty));
    osc.frequency.value = hz * (2 ** (transpose / 12));
    osc.connect(g);
    osc.start(at);
    osc.stop(at + secs + 0.02);
  }

  /** Kick, snare and hat, all out of the same noise buffer. */
  percussion(part, row, at) {
    if (!part || part.length === 0) return;
    const tok = part[row % part.length];
    if (tok !== 'k' && tok !== 's' && tok !== 'h') return;
    const shape = {
      k: { from: 220, to: 46, secs: 0.13, gain: 0.2, q: 1.2 },
      s: { from: 1500, to: 600, secs: 0.11, gain: 0.12, q: 0.8 },
      h: { from: 7000, to: 5200, secs: 0.03, gain: 0.05, q: 1.6 },
    }[tok];

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(shape.gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + shape.secs);
    g.connect(this.master);

    const filter = this.ctx.createBiquadFilter();
    filter.type = tok === 'k' ? 'lowpass' : 'bandpass';
    filter.Q.value = shape.q;
    filter.frequency.setValueAtTime(shape.from, at);
    filter.frequency.exponentialRampToValueAtTime(shape.to, at + shape.secs);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(filter).connect(g);
    src.start(at);
    src.stop(at + shape.secs);
  }

  // --- the frame hook --------------------------------------------------------

  /** Which track the game's current state calls for. */
  static trackFor(game) {
    if (game.scene === SCENE.TITLE) return 'title';
    if (game.scene === SCENE.ENDING || game.scene === SCENE.CREDITS) return 'ending';
    if (game.scene === SCENE.GAMEOVER) return null;
    return AREA_TRACK[game.room?.area] ?? 'overworld';
  }

  /**
   * Called once a frame, straight after `game.step`: drain this frame's
   * effects and follow the music. The queue belongs to the game, which clears
   * it at the top of every step, so this only ever reads it.
   */
  update(game) {
    if (this.ctx) for (const name of game.sounds) this.fire(name);
    this.setTrack(AudioEngine.trackFor(game));
    this.schedule();
  }
}
