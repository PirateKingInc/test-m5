// Validates manifest.json against the PWA installability requirements.
//   node tools/verify-manifest.js

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './lib/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
} catch (e) {
  console.error(`manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const errors = validateManifest(manifest, root);
if (errors.length) {
  for (const e of errors) console.error(`manifest: ${e}`);
  process.exit(1);
}
console.log(`manifest OK: "${manifest.short_name}", display ${manifest.display}, ${manifest.icons.length} icons`);
