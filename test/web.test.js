import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

let tmpDir;
const servers = [];

async function start(opts) {
  const app = createApp({ db: openDatabase(':memory:'), uploadDir: path.join(tmpDir, 'uploads'), ...opts });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-web-'));
  fs.mkdirSync(path.join(tmpDir, 'web'));
  fs.writeFileSync(path.join(tmpDir, 'web', 'index.html'), '<html>YourWowAI web app</html>');
  fs.mkdirSync(path.join(tmpDir, 'public'));
  fs.writeFileSync(path.join(tmpDir, 'public', 'terms.html'), '<html>terms</html>');
});

after(() => {
  servers.forEach((s) => s.close());
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('網頁版：任何頁面網址都回傳 App 的 index.html，API 和檔案不受影響', async () => {
  const base = await start({ webAppDir: path.join(tmpDir, 'web'), publicDir: path.join(tmpDir, 'public') });
  for (const page of ['/', '/post/12', '/user/amy', '/explore?tag=Claude']) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200, page);
    assert.match(await res.text(), /YourWowAI web app/, page);
  }
  assert.match(await (await fetch(`${base}/terms.html`)).text(), /terms/);
  const api = await fetch(`${base}/api/nope`);
  assert.equal(api.status, 404);
  assert.equal((await api.json()).error, '找不到這個 API');
  assert.equal((await fetch(`${base}/missing.png`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/missing.png`)).status, 404);
});

test('網頁版還沒建置時，提示要先執行 build:web', async () => {
  const base = await start({ webAppDir: path.join(tmpDir, 'not-built') });
  const res = await fetch(`${base}/post/1`);
  assert.equal(res.status, 503);
  assert.match(await res.text(), /npm run build:web/);
});

test('開發模式只允許本機與區網網址跨來源呼叫 API', async () => {
  const base = await start({ devCors: true });
  const preflight = await fetch(`${base}/api/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  const lan = await fetch(`${base}/api/me`, { headers: { Origin: 'http://172.20.10.8:8081' } });
  assert.equal(lan.headers.get('access-control-allow-origin'), 'http://172.20.10.8:8081');
  const evil = await fetch(`${base}/api/me`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const prod = await start({ devCors: false });
  const res = await fetch(`${prod}/api/me`, { headers: { Origin: 'http://localhost:8081' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
