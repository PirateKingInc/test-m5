// A dependency-free static server for local play and the browser tests.
// It serves the site under a path prefix, the way GitHub Pages serves it
// under /test-m5/, so relative URLs and the worker's scope are tested as
// deployed.
//
//   node tools/serve.js [--root=DIR] [--port=8000] [--base=/test-m5/]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * @param {{root: string, port?: number, base?: string}} opts
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>, requests: string[]}>}
 */
export function serve({ root, port = 0, base = '/test-m5/' }) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    requests.push(path);
    if (path === base.slice(0, -1)) {
      res.writeHead(301, { Location: base }).end();
      return;
    }
    if (!path.startsWith(base)) {
      res.writeHead(404).end('not found');
      return;
    }
    let rel = path.slice(base.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(normalize(root))) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      // Pages serves everything with a ten-minute max-age; do the same.
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'max-age=600',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      ok({
        url: `http://127.0.0.1:${actual}${base}`,
        port: actual,
        requests,
        close: () => new Promise((done) => {
          server.closeAllConnections?.();
          server.close(() => done());
        }),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
  const root = resolve(arg('root', join(dirname(fileURLToPath(import.meta.url)), '..')));
  const s = await serve({ root, port: Number(arg('port', 8000)), base: arg('base', '/test-m5/') });
  console.log(`serving ${root} at ${s.url}`);
}
