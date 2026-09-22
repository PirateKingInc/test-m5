// The score.
//
// Everything here is original and everything here is data: no audio files, no
// samples, nothing fetched. A track is four voices - two pulse channels, a
// triangle bass and a noise channel - written as rows of tokens, one row to a
// sixteenth note, which is close enough to a tracker that it can be read and
// edited by eye.
//
// Tokens:
//   C4, F#3, Bb5   a note, struck on this row
//   -              hold the note that is already sounding
//   .              silence
//   k s h          on the noise channel: kick, snare, hat
//
// Rows are grouped into bars of sixteen purely so the strings line up on the
// page; the parser joins them and does not care where the breaks fall. Each
// voice loops independently at its own length, which is how a four-bar bass
// and a sixteen-bar melody stay interesting for longer than either would
// alone - the oldest trick in the chiptune book and still the cheapest.

const SEMITONE = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Concert pitch of a note name, or null for a rest or a hold. */
export function noteHz(token) {
  if (token === '.' || token === '-' || token === undefined) return null;
  const m = /^([A-G][#b]?)(-?\d)$/.exec(token);
  if (!m) return null;
  const midi = (Number(m[2]) + 1) * 12 + SEMITONE[m[1]];
  return 440 * (2 ** ((midi - 69) / 12));
}

/** Splits a voice written as bars into one flat array of row tokens. */
export function rows(bars) {
  return bars.join(' ').trim().split(/\s+/);
}

/**
 * BRACKENFALL - the valley.
 *
 * D dorian: a minor scale with the sixth raised, which is what stops it
 * sounding sad. The valley is quiet and emptying, not mourning.
 */
const OVERWORLD = {
  bpm: 112,
  lead: rows([
    'D4 -  -  .  F4 -  A4 -  G4 -  -  .  E4 -  -  . ',
    'F4 -  -  .  A4 -  C5 -  A4 -  -  -  -  .  .  . ',
    'D5 -  -  C5 A4 -  G4 -  F4 -  -  .  E4 -  D4 - ',
    'C4 -  -  .  E4 -  G4 -  A4 -  -  -  -  -  .  . ',
    'D4 -  -  .  F4 -  A4 -  D5 -  -  .  C5 -  -  . ',
    'B4 -  -  .  A4 -  G4 -  F4 -  -  -  -  .  .  . ',
    'E4 -  G4 -  A4 -  C5 -  B4 -  A4 -  G4 -  F4 - ',
    'D4 -  -  -  -  -  -  .  .  .  .  .  A3 -  C4 - ',
  ]),
  harmony: rows([
    'A3 -  -  .  D4 -  F4 -  E4 -  -  .  C4 -  -  . ',
    'D4 -  -  .  F4 -  A4 -  F4 -  -  -  -  .  .  . ',
    'A4 -  -  A4 F4 -  E4 -  D4 -  -  .  C4 -  A3 - ',
    'A3 -  -  .  C4 -  E4 -  F4 -  -  -  -  -  .  . ',
  ]),
  bass: rows([
    'D2 -  .  D2 -  .  A2 -  .  D2 -  .  F2 -  .  . ',
    'F2 -  .  F2 -  .  C3 -  .  F2 -  .  A2 -  .  . ',
    'G2 -  .  G2 -  .  D3 -  .  G2 -  .  B2 -  .  . ',
    'A2 -  .  A2 -  .  E3 -  .  A2 -  .  C3 -  .  . ',
  ]),
  drums: rows([
    'k  .  h  .  s  .  h  .  k  .  h  k  s  .  h  . ',
    'k  .  h  .  s  .  h  .  k  .  h  k  s  .  h  h ',
  ]),
};

/**
 * THE SUNKEN MIRE - Dungeon 1.
 *
 * Everything an octave lower than it wants to be, on a limping five-beat
 * bass figure that never quite lands where the drum does. The room is
 * underwater and the music is not sure which way is up.
 */
const MIRE = {
  bpm: 96,
  lead: rows([
    'A3 -  -  -  C4 -  -  .  B3 -  -  .  .  .  .  . ',
    'E4 -  -  -  D4 -  C4 -  B3 -  -  -  -  .  .  . ',
    'A3 -  -  .  E3 -  -  .  F3 -  -  .  E3 -  -  . ',
    'D#4 - -  -  E4 -  -  -  -  .  .  .  .  .  .  . ',
    'A3 -  -  -  C4 -  -  .  B3 -  -  .  G3 -  -  . ',
    'C4 -  -  -  B3 -  A3 -  G#3 - -  -  -  .  .  . ',
    'F3 -  -  .  G3 -  -  .  A3 -  -  .  B3 -  -  . ',
    'E3 -  -  -  -  -  -  -  -  .  .  .  .  .  .  . ',
  ]),
  harmony: rows([
    '.  .  .  .  E3 -  .  .  .  .  G3 -  .  .  .  . ',
    '.  .  A3 -  .  .  .  .  E3 -  .  .  .  .  .  . ',
    '.  .  .  .  C3 -  .  .  .  .  B2 -  .  .  .  . ',
    'A2 -  -  .  .  .  .  .  B2 -  -  .  .  .  .  . ',
  ]),
  bass: rows([
    'A1 -  .  .  .  A1 -  .  .  .  E2 -  .  .  .  . ',
    'A1 -  .  .  .  A1 -  .  .  .  G1 -  .  .  .  . ',
    'F1 -  .  .  .  F1 -  .  .  .  C2 -  .  .  .  . ',
    'E1 -  .  .  .  E1 -  .  .  .  E1 -  .  E1 -  . ',
  ]),
  drums: rows([
    'k  .  .  .  h  .  s  .  .  .  h  .  k  .  .  h ',
  ]),
};

/**
 * THE WINDCUT AERIE - Dungeon 2.
 *
 * High, fast, and in constant sixteenths, because the whole dungeon is open
 * air and two-tile drops. E minor with a flattened second leaning on it.
 */
const AERIE = {
  bpm: 132,
  lead: rows([
    'E5 -  B4 -  E5 -  G5 -  F#5 - E5 -  B4 -  .  . ',
    'C5 -  B4 -  A4 -  B4 -  C5 -  D5 -  E5 -  .  . ',
    'F5 -  E5 -  D5 -  C5 -  B4 -  A4 -  G4 -  .  . ',
    'A4 -  B4 -  C5 -  E5 -  B4 -  -  -  -  .  .  . ',
    'E5 -  B4 -  E5 -  G5 -  A5 -  G5 -  F#5 - .  . ',
    'B5 -  A5 -  G5 -  F#5 - E5 -  D5 -  C5 -  .  . ',
    'B4 -  C5 -  D5 -  E5 -  F#5 - G5 -  A5 -  .  . ',
    'B5 -  -  -  E5 -  -  -  -  -  .  .  .  .  .  . ',
  ]),
  harmony: rows([
    'E4 -  .  .  G4 -  .  .  B4 -  .  .  G4 -  .  . ',
    'A4 -  .  .  C5 -  .  .  E5 -  .  .  C5 -  .  . ',
    'D4 -  .  .  F#4 - .  .  A4 -  .  .  F#4 - .  . ',
    'E4 -  .  .  G4 -  .  .  B4 -  .  .  E5 -  .  . ',
  ]),
  bass: rows([
    'E2 -  E2 -  .  .  E2 -  B1 -  .  .  E2 -  .  . ',
    'A1 -  A1 -  .  .  A1 -  E2 -  .  .  A1 -  .  . ',
    'D2 -  D2 -  .  .  D2 -  A1 -  .  .  D2 -  .  . ',
    'E2 -  E2 -  .  .  B1 -  E2 -  .  .  G1 -  .  . ',
  ]),
  drums: rows([
    'k  h  .  h  s  h  .  h  k  h  k  h  s  h  .  h ',
    'k  h  .  h  s  h  .  h  k  h  k  h  s  s  s  . ',
  ]),
};

/**
 * THE HUSH ITSELF - both bosses.
 *
 * One theme, two arrangements. The Sap-Warden's is slower and lower and sits
 * on its root; the Chorister's is faster, a fourth up, and the bass walks
 * chromatically because nothing in that fight stays where you put it.
 */
const BOSS_MIRE = {
  bpm: 140,
  lead: rows([
    'D4 -  D4 -  Eb4 - D4 -  A3 -  D4 -  F4 -  E4 - ',
    'D4 -  D4 -  Eb4 - F4 -  G4 -  F4 -  E4 -  D4 - ',
    'Bb3 - Bb3 - C4 -  Bb3 - F3 -  Bb3 - D4 -  C4 - ',
    'A3 -  -  -  G#3 - -  -  A3 -  -  -  -  .  .  . ',
  ]),
  harmony: rows([
    'A3 -  .  .  A3 -  .  .  Bb3 - .  .  A3 -  .  . ',
    'F3 -  .  .  F3 -  .  .  G3 -  .  .  F3 -  .  . ',
  ]),
  bass: rows([
    'D2 D2 .  D2 .  D2 .  .  D2 D2 .  D2 .  Eb2 . . ',
    'D2 D2 .  D2 .  D2 .  .  Bb1 Bb1 . Bb1 . A1 .  . ',
  ]),
  drums: rows([
    'k  .  k  .  s  .  .  k  .  k  .  .  s  .  s  . ',
  ]),
};

const BOSS_AERIE = {
  bpm: 156,
  lead: rows([
    'G4 -  G4 -  Ab4 - G4 -  D4 -  G4 -  Bb4 - A4 - ',
    'G4 -  G4 -  Ab4 - Bb4 - C5 -  Bb4 - A4 -  G4 - ',
    'Eb4 - Eb4 - F4 -  Eb4 - Bb3 - Eb4 - G4 -  F4 - ',
    'D4 -  -  -  C#4 - -  -  D4 -  -  -  -  .  .  . ',
    'G5 -  F5 -  Eb5 - D5 -  C5 -  Bb4 - A4 -  G4 - ',
    'F#4 - G4 -  A4 -  Bb4 - C5 -  D5 -  Eb5 - F5 - ',
    'G5 -  -  -  D5 -  -  -  Bb4 - -  -  G4 -  -  . ',
    'D4 -  -  -  -  -  -  -  -  .  .  .  .  .  .  . ',
  ]),
  harmony: rows([
    'D4 -  .  .  D4 -  .  .  Eb4 - .  .  D4 -  .  . ',
    'Bb3 - .  .  Bb3 - .  .  C4 -  .  .  Bb3 - .  . ',
  ]),
  bass: rows([
    'G1 G1 .  G1 .  G1 .  .  G1 G1 .  Ab1 . A1 .  . ',
    'Bb1 Bb1 . B1 . C2 .  .  C#2 - .  .  D2 -  .  . ',
  ]),
  drums: rows([
    'k  h  k  h  s  h  .  k  h  k  .  h  s  h  s  h ',
  ]),
};

/**
 * THE LONG HUSH - the title screen. The overworld melody, slowed to a crawl
 * and stripped to one voice over a held root, which is what it will sound
 * like if Summer does not go.
 */
const TITLE = {
  bpm: 64,
  lead: rows([
    'D4 -  -  -  -  -  F4 -  A4 -  -  -  -  .  .  . ',
    'G4 -  -  -  E4 -  -  -  D4 -  -  -  -  -  -  . ',
    'A3 -  -  -  -  -  C4 -  D4 -  -  -  -  .  .  . ',
    'E4 -  -  -  D4 -  -  -  -  -  -  -  -  .  .  . ',
  ]),
  harmony: rows(['.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . ']),
  bass: rows([
    'D2 -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
    'A1 -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
  ]),
  drums: rows(['.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . ']),
};

/**
 * WICKFIRE - the ending and the credits. The overworld theme at last in
 * D major, with the sixth it was always leaning towards.
 */
const ENDING = {
  bpm: 100,
  lead: rows([
    'D4 -  -  .  F#4 - A4 -  B4 -  -  .  A4 -  -  . ',
    'D5 -  -  .  C#5 - B4 -  A4 -  -  -  -  .  .  . ',
    'B4 -  -  A4 G4 -  F#4 - E4 -  -  .  D4 -  E4 - ',
    'F#4 - -  -  A4 -  -  -  D5 -  -  -  -  -  .  . ',
    'A4 -  -  .  D5 -  F#5 - E5 -  -  .  D5 -  -  . ',
    'B4 -  -  .  A4 -  G4 -  F#4 - -  -  -  .  .  . ',
    'E4 -  F#4 - G4 -  A4 -  B4 -  C#5 - D5 -  E5 - ',
    'D5 -  -  -  -  -  -  -  -  -  .  .  .  .  .  . ',
  ]),
  harmony: rows([
    'F#3 - .  .  A3 -  .  .  D4 -  .  .  A3 -  .  . ',
    'G3 -  .  .  B3 -  .  .  D4 -  .  .  B3 -  .  . ',
    'E3 -  .  .  G3 -  .  .  B3 -  .  .  G3 -  .  . ',
    'A3 -  .  .  C#4 - .  .  E4 -  .  .  A3 -  .  . ',
  ]),
  bass: rows([
    'D2 -  .  D2 -  .  A2 -  .  D2 -  .  F#2 - .  . ',
    'G2 -  .  G2 -  .  D3 -  .  G2 -  .  B2 -  .  . ',
    'E2 -  .  E2 -  .  B2 -  .  E2 -  .  G2 -  .  . ',
    'A2 -  .  A2 -  .  E3 -  .  A2 -  .  C#3 - .  . ',
  ]),
  drums: rows([
    'k  .  h  .  s  .  h  .  k  .  h  k  s  .  h  . ',
  ]),
};

export const TRACKS = {
  title: TITLE,
  overworld: OVERWORLD,
  mire: MIRE,
  aerie: AERIE,
  boss_mire: BOSS_MIRE,
  boss_aerie: BOSS_AERIE,
  ending: ENDING,
};

/** Which track plays in which area of the world. */
export const AREA_TRACK = {
  overworld: 'overworld',
  mire: 'mire',
  aerie: 'aerie',
  boss_mire: 'boss_mire',
  boss_aerie: 'boss_aerie',
};

/**
 * Sound effects, as recipes rather than samples.
 *
 * `wave` picks the voice: a pulse duty as a number, or 'noise'. The pitch
 * sweeps from `from` to `to` over `secs`, which is enough shape for a sword
 * swing, a coin-bright pickup and a boss's death rattle to all be distinct.
 */
export const VOICES = {
  jump: { wave: 0.5, from: 300, to: 620, secs: 0.09, gain: 0.16 },
  land: { wave: 'noise', from: 900, to: 260, secs: 0.05, gain: 0.1 },
  fall: { wave: 0.25, from: 520, to: 70, secs: 0.6, gain: 0.2 },
  menu: { wave: 0.5, from: 640, to: 640, secs: 0.04, gain: 0.12 },
  confirm: { wave: 0.5, from: 520, to: 1040, secs: 0.12, gain: 0.16 },
  door: { wave: 'noise', from: 340, to: 120, secs: 0.3, gain: 0.16 },
  swing: { wave: 'noise', from: 1700, to: 700, secs: 0.07, gain: 0.11 },
  spin: { wave: 'noise', from: 900, to: 1900, secs: 0.3, gain: 0.16 },
  clink: { wave: 0.125, from: 1500, to: 1100, secs: 0.05, gain: 0.13 },
  hit: { wave: 0.25, from: 400, to: 190, secs: 0.09, gain: 0.18 },
  kill: { wave: 'noise', from: 1200, to: 180, secs: 0.2, gain: 0.2 },
  hurt: { wave: 0.25, from: 300, to: 110, secs: 0.3, gain: 0.24 },
  shot: { wave: 0.125, from: 900, to: 1400, secs: 0.08, gain: 0.12 },
  stomp: { wave: 'noise', from: 260, to: 60, secs: 0.35, gain: 0.24 },
  heart: { wave: 0.5, from: 700, to: 1050, secs: 0.1, gain: 0.16 },
  charged: { wave: 0.125, from: 1200, to: 1600, secs: 0.14, gain: 0.13 },
  blip: { wave: 0.5, from: 1000, to: 1000, secs: 0.02, gain: 0.06 },
  chest: { wave: 0.25, from: 400, to: 900, secs: 0.22, gain: 0.18 },
  key: { wave: 0.125, from: 1000, to: 1500, secs: 0.16, gain: 0.16 },
  locked: { wave: 0.25, from: 200, to: 140, secs: 0.12, gain: 0.16 },
  shatter: { wave: 'noise', from: 2200, to: 300, secs: 0.3, gain: 0.2 },
  save: { wave: 0.5, from: 600, to: 1200, secs: 0.3, gain: 0.15 },
  pillar: { wave: 'noise', from: 500, to: 160, secs: 0.5, gain: 0.2 },
  container: { wave: 0.5, from: 600, to: 1400, secs: 0.45, gain: 0.18 },
  portal: { wave: 0.25, from: 260, to: 760, secs: 0.4, gain: 0.16 },
  roar: { wave: 0.25, from: 220, to: 90, secs: 0.6, gain: 0.24 },
  bossdown: { wave: 'noise', from: 900, to: 50, secs: 1.2, gain: 0.26 },
  wickstone: { wave: 0.5, from: 300, to: 1500, secs: 0.9, gain: 0.2 },
};
