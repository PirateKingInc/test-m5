import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, cpSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { shippedFiles, stampWorker, cacheVersion } from '../tools/lib/precache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'sw.js'), 'utf8');
const SCOPE = 'https://example.test/test-m5/';

/**
 * Runs sw.js in a bare context with just enough of the ServiceWorker global
 * scope to drive its install, activate and fetch handlers.
 */
function loadWorker({ existingCaches = [] } = {}) {
  const handlers = {};
  const stores = new Map(existingCaches.map((k) => [k, new Map()]));
  const network = [];
  const keyOf = (r, ignoreSearch) => {
    const u = new URL(typeof r === 'string' ? r : r.url, SCOPE);
    if (ignoreSearch) u.search = '';
    return u.href;
  };
  const makeCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      async addAll(reqs) {
        for (const r of reqs) {
          assert.equal(r.cache, 'reload', 'precache must bypass the HTTP cache');
          m.set(keyOf(r), `cached:${keyOf(r)}`);
        }
      },
      async match(r, opts = {}) {
        const want = keyOf(r, opts.ignoreSearch);
        for (const [k, v] of m) if (keyOf(k, opts.ignoreSearch) === want) return v;
        return undefined;
      },
    };
  };
  const self = {
    registration: { scope: SCOPE },
    location: new URL('sw.js', SCOPE),
    clients: { claimed: false, async claim() { this.claimed = true; } },
    skipped: false,
    skipWaiting() { this.skipped = true; },
    addEventListener: (type, fn) => { handlers[type] = fn; },
  };
  const ctx = {
    self,
    URL,
    Request: class { constructor(url, init = {}) { this.url = new URL(url, SCOPE).href; this.cache = init.cache; } },
    caches: {
      open: async (name) => makeCache(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (r) => { network.push(r.url); return `network:${r.url}`; },
  };
  vm.runInNewContext(source, ctx);

  const run = async (type, extra = {}) => {
    let pending = null;
    const event = {
      ...extra,
      waitUntil: (p) => { pending = p; },
      respondWith: (p) => { pending = p; },
    };
    handlers[type](event);
    return { responded: pending !== null, value: await pending };
  };
  return { self, stores, network, run, handlers, cacheName: `brackenfall-${ctx.VERSION ?? vm.runInNewContext('VERSION', ctx)}` };
}

const get = (path, mode = 'no-cors') => ({ request: { method: 'GET', url: new URL(path, SCOPE).href, mode } });

test('sw.js is stamped with the current file list and version', () => {
  assert.equal(stampWorker(source, root), source, 'run `npm run sw`');
  assert.match(source, new RegExp(`const VERSION = '${cacheVersion(root)}';`));
});

test('the precache holds the page, every module, the manifest and every icon', () => {
  const files = shippedFiles(root);
  for (const f of files) assert.ok(source.includes(`'./${f}'`), `${f} is not precached`);
  assert.ok(source.includes("'./',"), 'the bare start URL is precached');
  for (const f of ['index.html', 'manifest.json', 'src/main.js', 'src/pwa.js', 'icons/icon-512.png']) {
    assert.ok(files.includes(f), `${f} should ship`);
  }
});

test('every module the page can import is precached', () => {
  // Follow the import graph from index.html so a new file cannot be missed.
  const files = new Set(shippedFiles(root));
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const todo = [...html.matchAll(/<script type="module" src="\.\/([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    assert.ok(files.has(f), `${f} is imported but not precached`);
    const js = readFileSync(join(root, f), 'utf8');
    for (const m of js.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*from\s+'([^']+)'/g)) {
      todo.push(posix.normalize(posix.join(posix.dirname(f), m[1])));
    }
  }
  assert.ok(seen.has('src/game/game.js') && seen.has('src/pwa.js'));
  for (const m of html.matchAll(/href="\.\/([^"]+)"/g)) assert.ok(files.has(m[1]), `${m[1]} is linked but not precached`);
});

test('install precaches everything into a versioned cache and does not take over', async () => {
  const w = loadWorker();
  await w.run('install');
  const names = [...w.stores.keys()];
  assert.equal(names.length, 1);
  assert.match(names[0], /^brackenfall-[0-9a-f]{12}$/);
  const cached = w.stores.get(names[0]);
  assert.equal(cached.size, shippedFiles(root).length + 1);
  assert.ok(cached.has(`${SCOPE}src/game/game.js`));
  assert.ok(cached.has(SCOPE));
  assert.equal(w.self.skipped, false, 'an update must wait for the player');
});

test('activate deletes older Brackenfall caches and nothing else', async () => {
  const w = loadWorker({ existingCaches: ['brackenfall-000000000000', 'brackenfall-old', 'someone-elses-cache'] });
  await w.run('install');
  await w.run('activate');
  const names = [...w.stores.keys()];
  assert.deepEqual(names.sort(), ['someone-elses-cache', w.cacheName].sort());
  assert.equal(w.self.clients.claimed, true);
});

test('precached files are served cache-first, with no network at all', async () => {
  const w = loadWorker();
  await w.run('install');
  for (const f of shippedFiles(root)) {
    const r = await w.run('fetch', get(f));
    assert.equal(r.value, `cached:${SCOPE}${f}`);
  }
  const busted = await w.run('fetch', get('src/main.js?v=2'));
  assert.equal(busted.value, `cached:${SCOPE}src/main.js`, 'a query string still hits the cache');
  assert.deepEqual(w.network, []);
});

test('every navigation inside the app gets the cached page', async () => {
  const w = loadWorker();
  await w.run('install');
  for (const path of ['', 'index.html', '?utm_source=homescreen', 'some/deep/link']) {
    const r = await w.run('fetch', get(path, 'navigate'));
    assert.equal(r.value, `cached:${SCOPE}index.html`, path);
  }
  assert.deepEqual(w.network, []);
});

test('the worker leaves alone what is not its business', async () => {
  const w = loadWorker();
  await w.run('install');
  const post = await w.run('fetch', { request: { method: 'POST', url: `${SCOPE}x`, mode: 'cors' } });
  assert.equal(post.responded, false);
  const foreign = await w.run('fetch', { request: { method: 'GET', url: 'https://elsewhere.test/a.js', mode: 'cors' } });
  assert.equal(foreign.responded, false);
  const outside = await w.run('fetch', { request: { method: 'GET', url: 'https://example.test/other/a.js', mode: 'cors' } });
  assert.equal(outside.responded, false);
  const miss = await w.run('fetch', get('README.md'));
  assert.equal(miss.value, `network:${SCOPE}README.md`, 'an unknown file falls through to the network');
});

test('the page can ask a waiting worker to take over', () => {
  const w = loadWorker();
  w.handlers.message({ data: { type: 'SOMETHING_ELSE' } });
  assert.equal(w.self.skipped, false);
  w.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(w.self.skipped, true);
});

test('changing, adding or removing any shipped file changes the worker', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'brackenfall-sw-'));
  try {
    for (const f of ['index.html', 'manifest.json', 'sw.js']) cpSync(join(root, f), join(tmp, f));
    cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true });
    cpSync(join(root, 'icons'), join(tmp, 'icons'), { recursive: true });
    const sw = readFileSync(join(tmp, 'sw.js'), 'utf8');
    assert.equal(stampWorker(sw, tmp), sw, 'a faithful copy stamps identically');

    const v0 = cacheVersion(tmp);
    writeFileSync(join(tmp, 'src/game/rng.js'), `${readFileSync(join(tmp, 'src/game/rng.js'), 'utf8')}\n// changed\n`);
    const v1 = cacheVersion(tmp);
    assert.notEqual(v1, v0, 'an edited file');
    assert.notEqual(stampWorker(sw, tmp), sw);

    writeFileSync(join(tmp, 'src/extra.js'), 'export {};\n');
    assert.notEqual(cacheVersion(tmp), v1, 'an added file');
    assert.ok(stampWorker(sw, tmp).includes("'./src/extra.js'"));

    rmSync(join(tmp, 'src/extra.js'));
    rmSync(join(tmp, 'icons', readdirSync(join(tmp, 'icons'))[0]));
    assert.notEqual(cacheVersion(tmp), v1, 'a removed file');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
