// Writes the app icons from Summer's sprite. `--check` compares the committed
// PNGs pixel for pixel with what this would write, and fails if they drift.
//
//   node tools/make-icons.js          regenerate icons/
//   node tools/make-icons.js --check  verify icons/ is current

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, decodePng } from './lib/png.js';
import { ICONS, PALETTE, renderIcon } from './lib/icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
let stale = 0;

for (const icon of ICONS) {
  const path = join(root, icon.file);
  const pixels = renderIcon(icon.size, icon.purpose);
  if (check) {
    const ok = existsSync(path) && (() => {
      const png = decodePng(readFileSync(path));
      return png.width === icon.size && png.height === icon.size
        && png.palette.join() === PALETTE.join()
        && Buffer.from(png.pixels).equals(Buffer.from(pixels));
    })();
    if (!ok) {
      console.error(`${icon.file} is missing or out of date`);
      stale += 1;
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(icon.size, icon.size, pixels, PALETTE));
    console.log(`wrote ${icon.file} (${icon.size}x${icon.size}, ${icon.purpose})`);
  }
}

if (stale) {
  console.error('run `node tools/make-icons.js` and commit the result');
  process.exit(1);
}
if (check) console.log(`icons OK: ${ICONS.length} icons match Summer's sprite in the Brackenfall palette`);
