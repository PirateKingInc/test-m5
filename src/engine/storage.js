// The only place the game touches localStorage. Every call is wrapped, because
// a browser in private mode throws on access rather than returning null.

import { SAVE_KEY } from '../game/save.js';

export function readSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function writeSave(blob) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: an unavailable store is the same as an empty one.
  }
}
