// Local development compiles the shared API and serves public assets directly.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.dev.json'], { stdio: 'inherit' });
const { createHandler } = await import('../.fala/dev-build/src/api.js');
const { settingsFromEnv } = await import('../.fala/dev-build/src/config.js');
const { connectDatabase } = await import('../.fala/dev-build/src/database.js');
let settings, database;
const handler = createHandler({ settings: () => settings ??= settingsFromEnv(), database: config => database ??= connectDatabase(config), region: () => 'local' });
const port = Number(process.env.FALA_DEV_PORT || 8888), root = path.resolve('public');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Use a local development port from 1024 to 65535.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const name = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(name));
    if (req.method === 'GET' && file.startsWith(root + path.sep) && await stat(file).then(entry => entry.isFile(), () => false)) {
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file)); return;
    }
    const response = await handler(new Request(url, { method: req.method, headers: req.headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) }), req.socket.remoteAddress || 'local');
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Local request failed. Check the development configuration.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Fala local development: http://127.0.0.1:${port}/app/ (restart after backend edits)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.closeAllConnections(); server.close(); await database?.close(); process.exit(0); });
