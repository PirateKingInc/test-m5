// The app icons, drawn from Summer's own sprite in the Brackenfall palette.
// Nothing here is an external image: every icon is a pixel-string sprite laid
// on a small logical grid and scaled up nearest-neighbour, exactly the way the
// game scales its 160x144 screen.

import { PALETTE, LIGHT, INK } from '../../src/data/palette.js';
import { SUMMER } from '../../src/data/sprites.js';

const SPRITE = SUMMER.down[0];

/**
 * `any` icons sit on a 24-unit grid with an ink frame, so Summer fills most of
 * the tile. `maskable` icons sit on a 32-unit grid with no frame: the sprite
 * spans units 8..24, so its corners are 0.354 of the width from the centre,
 * inside the 0.4 safe circle every launcher mask keeps.
 */
const STYLES = {
  any: { grid: 24, frame: true },
  maskable: { grid: 32, frame: false },
};

export const ICONS = [
  { file: 'icons/icon-192.png', size: 192, purpose: 'any' },
  { file: 'icons/icon-512.png', size: 512, purpose: 'any' },
  { file: 'icons/icon-maskable-192.png', size: 192, purpose: 'maskable' },
  { file: 'icons/icon-maskable-512.png', size: 512, purpose: 'maskable' },
  // iOS draws its own rounded mask and fills transparency with black, so the
  // home-screen icon is the full-bleed maskable design.
  { file: 'icons/apple-touch-icon.png', size: 180, purpose: 'maskable', apple: true },
];

/** The logical icon: a grid of palette indices before scaling. */
export function logicalIcon(purpose) {
  const { grid, frame } = STYLES[purpose];
  const cells = new Uint8Array(grid * grid).fill(LIGHT);
  if (frame) {
    for (let i = 0; i < grid; i += 1) {
      cells[i] = INK;
      cells[(grid - 1) * grid + i] = INK;
      cells[i * grid] = INK;
      cells[i * grid + grid - 1] = INK;
    }
  }
  const off = (grid - 16) / 2;
  SPRITE.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.') cells[(y + off) * grid + x + off] = Number(ch);
    });
  });
  return { grid, cells };
}

/** The icon at its final size, as palette indices. */
export function renderIcon(size, purpose) {
  const { grid, cells } = logicalIcon(purpose);
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const gy = Math.floor((y * grid) / size);
    for (let x = 0; x < size; x += 1) {
      out[y * size + x] = cells[gy * grid + Math.floor((x * grid) / size)];
    }
  }
  return out;
}

export { PALETTE };
