import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(8)]);

let server;
let base;
let tmpDir;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wowai-test-'));
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function register(username) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
}

function postForm(fields, files = []) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append('media', new Blob([f.data]), f.name);
  return form;
}

async function createPost(cookie, fields, files) {
  return fetch(`${base}/api/posts`, { method: 'POST', headers: { cookie }, body: postForm(fields, files) });
}

function uploadedFiles() {
  return fs.readdirSync(path.join(tmpDir, 'uploads'));
}

test('分享一定要附上截圖或影片', async () => {
  const cookie = await register('nomedia');
  const res = await createPost(cookie, { title: '沒有截圖的工具' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /截圖|影片/);
});

test('拒絕偽裝成圖片的檔案，且不留下暫存檔', async () => {
  const cookie = await register('faker');
  const before = uploadedFiles().length;
  const res = await createPost(cookie, { title: '假圖片' }, [
    { name: 'shot.png', data: PNG },
    { name: 'evil.png', data: Buffer.from('<html><script>alert(1)</script></html>') },
  ]);
  assert.equal(res.status, 400);
  assert.equal(uploadedFiles().length, before);
});

test('未登入不能分享', async () => {
  const res = await createPost('', { title: 'x' }, [{ name: 'a.png', data: PNG }]);
  assert.equal(res.status, 401);
});

test('完整流程：分享、動態牆、按讚、留言、追蹤', async () => {
  const alice = await register('alice');
  const bob = await register('bob');

  const res = await createPost(alice, {
    title: 'AI 記帳 App',
    description: '用 Claude 寫的記帳工具',
    toolUrl: 'https://example.com/app',
    aiTools: 'Claude, Cursor, claude',
  }, [
    { name: 'screen.png', data: PNG },
    { name: 'demo.mp4', data: MP4 },
  ]);
  assert.equal(res.status, 201);
  const { post } = await res.json();
  assert.deepEqual(post.media.map((m) => m.kind), ['image', 'video']);
  assert.deepEqual(post.aiTools, ['Claude', 'Cursor']);

  const media = await fetch(`${base}${post.media[0].url}`);
  assert.equal(media.headers.get('content-type'), 'image/png');

  // Bob 追蹤 Alice 前，追蹤動態是空的
  let feed = await (await fetch(`${base}/api/posts?feed=following`, { headers: { cookie: bob } })).json();
  assert.equal(feed.posts.length, 0);
  assert.equal((await fetch(`${base}/api/users/alice/follow`, { method: 'POST', headers: { cookie: bob } })).status, 200);
  feed = await (await fetch(`${base}/api/posts?feed=following`, { headers: { cookie: bob } })).json();
  assert.equal(feed.posts[0].id, post.id);

  // 依 AI 工具標籤探索（不分大小寫）
  const tagged = await (await fetch(`${base}/api/posts?tag=cursor`)).json();
  assert.ok(tagged.posts.some((p) => p.id === post.id));

  const like = await (await fetch(`${base}/api/posts/${post.id}/like`, { method: 'POST', headers: { cookie: bob } })).json();
  assert.deepEqual(like, { likeCount: 1, likedByMe: true });

  const comment = await fetch(`${base}/api/posts/${post.id}/comments`, {
    method: 'POST',
    headers: { cookie: bob, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: '太酷了！' }),
  });
  assert.equal(comment.status, 201);
  const { comments } = await (await fetch(`${base}/api/posts/${post.id}/comments`)).json();
  assert.equal(comments[0].body, '太酷了！');

  const profile = await (await fetch(`${base}/api/users/alice`, { headers: { cookie: bob } })).json();
  assert.equal(profile.user.followerCount, 1);
  assert.equal(profile.user.followedByMe, true);
  assert.equal(profile.posts.length, 1);

  // 只有作者能刪除，刪除時會一併移除媒體檔
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: { cookie: bob } })).status, 403);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: { cookie: alice } })).status, 204);
  assert.equal((await fetch(`${base}${post.media[0].url}`)).status, 404);
});

test('工具連結只接受 http/https', async () => {
  const cookie = await register('linker');
  const res = await createPost(cookie, { title: 'x', toolUrl: 'javascript:alert(1)' }, [{ name: 'a.png', data: PNG }]);
  assert.equal(res.status, 400);
});
