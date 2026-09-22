// The text box. Three lines at a time, one glyph every other frame, A to hurry
// and A again to turn the page.

import { TEXT_FRAMES_PER_GLYPH } from './constants.js';

export const LINES_PER_PAGE = 3;
export const MAX_LINE = 24;

/**
 * @param {string[]} lines already broken into lines by the room data
 * @returns {{pages: string[][], page: number, shown: number, tick: number}}
 */
export function openDialogue(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE).map((l) => l.slice(0, MAX_LINE)));
  }
  return { pages, page: 0, shown: 0, tick: 0 };
}

export function pageLength(d) {
  return d.pages[d.page].reduce((n, l) => n + l.length, 0);
}

export function pageComplete(d) {
  return d.shown >= pageLength(d);
}

/**
 * Advances the typewriter one frame.
 * @returns {boolean} true if a glyph was revealed this frame (for the blip)
 */
export function tickDialogue(d) {
  if (pageComplete(d)) return false;
  d.tick += 1;
  if (d.tick % TEXT_FRAMES_PER_GLYPH !== 0) return false;
  d.shown += 1;
  return true;
}

/**
 * Handles an A press.
 * @returns {'filled'|'next'|'close'} what the press did
 */
export function advanceDialogue(d) {
  if (!pageComplete(d)) {
    d.shown = pageLength(d);
    return 'filled';
  }
  if (d.page < d.pages.length - 1) {
    d.page += 1;
    d.shown = 0;
    d.tick = 0;
    return 'next';
  }
  return 'close';
}

/** The visible portion of the current page, line by line. */
export function visibleLines(d) {
  const out = [];
  let budget = d.shown;
  for (const line of d.pages[d.page]) {
    out.push(line.slice(0, Math.max(0, budget)));
    budget -= line.length;
    if (budget <= 0) budget = 0;
  }
  return out;
}
