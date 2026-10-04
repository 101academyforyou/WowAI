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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-test-'));
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
    adminUsernames: ['admin'],
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
    body: JSON.stringify({ username, password: 'password123', acceptTerms: true }),
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

test('完整流程：分享、動態牆、Cool／Not Cool、留言、追蹤', async () => {
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

  const vote = (cookie, v) => fetch(`${base}/api/posts/${post.id}/vote`, {
    method: v ? 'PUT' : 'DELETE',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: v ? JSON.stringify({ vote: v }) : undefined,
  }).then((r) => r.json());
  assert.deepEqual(await vote(bob, 'cool'), { coolCount: 1, notCoolCount: 0, myVote: 'cool' });
  assert.deepEqual(await vote(alice, 'notcool'), { coolCount: 1, notCoolCount: 1, myVote: 'notcool' });
  // 改票：同一人只會有一票
  assert.deepEqual(await vote(alice, 'cool'), { coolCount: 2, notCoolCount: 0, myVote: 'cool' });
  assert.deepEqual(await vote(alice, null), { coolCount: 1, notCoolCount: 0, myVote: null });
  assert.equal((await vote(bob, 'meh')).error, '請選擇 Cool 或 Not Cool');
  const seen = await (await fetch(`${base}/api/posts/${post.id}`, { headers: { cookie: bob } })).json();
  assert.equal(seen.post.myVote, 'cool');
  assert.equal(seen.post.coolCount, 1);

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

test('註冊必須同意使用條款', async () => {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'noterms', password: 'password123' }),
  });
  assert.equal(res.status, 400);
});

test('iPhone App 用 Bearer token 登入', async () => {
  await register('mobileuser');
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'mobileuser', password: 'password123' }),
  })).json();
  assert.ok(login.token);
  const me = await (await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${login.token}` } })).json();
  assert.equal(me.user.username, 'mobileuser');
  await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${login.token}` } });
  const after = await (await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${login.token}` } })).json();
  assert.equal(after.user, null);
});

test('檢舉：檢舉者不再看到貼文，3 人檢舉後自動隱藏，管理員可恢復', async () => {
  const author = await register('spammer');
  const { post } = await (await createPost(author, { title: '可疑工具' }, [{ name: 'a.png', data: PNG }])).json();
  const visibleTo = async (cookie) => (await fetch(`${base}/api/posts/${post.id}`, { headers: { cookie } })).status;

  const r1 = await register('reporter1');
  const bad = await fetch(`${base}/api/posts/${post.id}/report`, {
    method: 'POST', headers: { cookie: r1, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'nope' }),
  });
  assert.equal(bad.status, 400);

  const report = (cookie) => fetch(`${base}/api/posts/${post.id}/report`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'spam' }),
  });
  assert.equal((await report(r1)).status, 201);
  assert.equal(await visibleTo(r1), 404);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 200);

  await report(await register('reporter2'));
  await report(await register('reporter3'));
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 404);
  assert.equal(await visibleTo(author), 200, '作者仍看得到自己的貼文');

  const admin = await register('admin');
  const { reports } = await (await fetch(`${base}/api/admin/reports`, { headers: { cookie: admin } })).json();
  const entry = reports.find((r) => r.post.id === post.id);
  assert.equal(entry.reportCount, 3);
  assert.equal(entry.hidden, true);
  assert.equal((await fetch(`${base}/api/admin/reports`, { headers: { cookie: author } })).status, 403);
  await fetch(`${base}/api/admin/posts/${post.id}/restore`, { method: 'POST', headers: { cookie: admin } });
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 200);
});

test('封鎖：看不到對方的貼文與留言，並解除追蹤', async () => {
  const troll = await register('troll');
  const victim = await register('victim');
  const { post } = await (await createPost(victim, { title: '我的工具' }, [{ name: 'a.png', data: PNG }])).json();
  await fetch(`${base}/api/posts/${post.id}/comments`, {
    method: 'POST', headers: { cookie: troll, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: '難聽的話' }),
  });
  const { post: trollPost } = await (await createPost(troll, { title: '洗版' }, [{ name: 'a.png', data: PNG }])).json();
  await fetch(`${base}/api/users/troll/follow`, { method: 'POST', headers: { cookie: victim } });

  const block = await fetch(`${base}/api/users/troll/block`, { method: 'POST', headers: { cookie: victim } });
  assert.deepEqual(await block.json(), { blockedByMe: true });

  const feed = await (await fetch(`${base}/api/posts`, { headers: { cookie: victim } })).json();
  assert.ok(!feed.posts.some((p) => p.id === trollPost.id));
  const { comments } = await (await fetch(`${base}/api/posts/${post.id}/comments`, { headers: { cookie: victim } })).json();
  assert.equal(comments.length, 0);
  const profile = await (await fetch(`${base}/api/users/troll`, { headers: { cookie: victim } })).json();
  assert.equal(profile.user.blockedByMe, true);
  assert.equal(profile.user.followerCount, 0);
  assert.equal(profile.posts.length, 0);

  await fetch(`${base}/api/users/troll/block`, { method: 'DELETE', headers: { cookie: victim } });
  const again = await (await fetch(`${base}/api/posts`, { headers: { cookie: victim } })).json();
  assert.ok(again.posts.some((p) => p.id === trollPost.id));
});

test('在 App 內刪除帳號，會一併刪除貼文與媒體檔', async () => {
  const cookie = await register('leaver');
  const { post } = await (await createPost(cookie, { title: '再見' }, [{ name: 'a.png', data: PNG }])).json();
  const del = (password) => fetch(`${base}/api/me`, {
    method: 'DELETE', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  });
  assert.equal((await del('wrong-password')).status, 401);
  assert.equal((await del('password123')).status, 204);
  assert.equal((await fetch(`${base}/api/users/leaver`)).status, 404);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 404);
  assert.equal((await fetch(`${base}${post.media[0].url}`)).status, 404);
});

test('舊資料庫的愛心會轉成 Cool 票', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(tmpDir, 'legacy.db');
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, bio TEXT DEFAULT '', password_hash TEXT, created_at TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, description TEXT DEFAULT '', tool_url TEXT DEFAULT '', created_at TEXT);
    CREATE TABLE likes (user_id INTEGER, post_id INTEGER, PRIMARY KEY (user_id, post_id));
    INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'old', 'old', 'x');
    INSERT INTO posts (id, user_id, title) VALUES (1, 1, 'old post');
    INSERT INTO likes VALUES (1, 1);
  `);
  legacy.close();
  const db = openDatabase(file);
  assert.deepEqual({ ...db.prepare('SELECT user_id, post_id, value FROM votes').get() }, { user_id: 1, post_id: 1, value: 1 });
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'likes'").get(), undefined);
  db.close();
});
