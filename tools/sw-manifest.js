// Writes the precache list and cache version into sw.js. `--check` fails if
// sw.js is out of date, which is what stops a deploy from changing a file
// without also changing the worker (and so without anyone being told).
//
//   node tools/sw-manifest.js          restamp sw.js
//   node tools/sw-manifest.js --check  verify sw.js is current
//   node tools/sw-manifest.js --root=DIR  operate on another copy of the site

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampWorker, shippedFiles, cacheVersion } from './lib/precache.js';

const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? resolve(rootArg.slice(7)) : join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'sw.js');
const current = readFileSync(path, 'utf8');
const next = stampWorker(current, root);
const summary = `${shippedFiles(root).length} files, cache version ${cacheVersion(root)}`;

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('sw.js is stale: a shipped file changed, or was added or removed, without a new cache version.');
    console.error('run `npm run sw` and commit sw.js');
    process.exit(1);
  }
  console.log(`service worker OK: precaches ${summary}`);
} else {
  writeFileSync(path, next);
  console.log(`stamped sw.js: ${summary}`);
}
