// A seeded 32-bit PRNG (mulberry32). The whole game's randomness lives in one
// integer that travels in the save file, so a replayed input stream produces a
// byte-identical run. Nothing here may ever call Math.random().

/** @typedef {{ s: number }} RngState */

/** @param {number} seed @returns {RngState} */
export function makeRng(seed) {
  return { s: seed >>> 0 };
}

/** Advances the stream and returns a float in [0, 1). @param {RngState} r */
export function next(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** An integer in [0, n). @param {RngState} r @param {number} n */
export function int(r, n) {
  return Math.floor(next(r) * n);
}

/** True with probability p. @param {RngState} r @param {number} p */
export function chance(r, p) {
  return next(r) < p;
}

/** Picks one element. @param {RngState} r @param {readonly T[]} list @template T */
export function pick(r, list) {
  return list[int(r, list.length)];
}
