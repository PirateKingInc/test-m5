import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('the project declares no runtime dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.type, 'module');
});

test('CI runs on every push and pull request', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /^on:\n\s+push:\n\s+pull_request:/m);
  assert.match(ci, /npm run ci/);
});

test('the site deploys to GitHub Pages from main', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /actions\/deploy-pages/);
  assert.match(pages, /branches: \[main\]/);
});

test('the design spec and backlog are committed', () => {
  for (const f of ['SPEC.md', 'BACKLOG.md', 'index.html']) {
    assert.ok(existsSync(join(root, f)), `${f} should exist`);
  }
  const spec = read('SPEC.md');
  for (const heading of ['Premise', 'Controls', 'World map', 'Monsters', 'Bosses', 'Out of scope']) {
    assert.ok(spec.includes(heading), `SPEC.md should cover ${heading}`);
  }
});
