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
// 假 GitHub 上 octocat/starme 目前的星星數（測試按星後更新）
let starMeCount = 5;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-test-'));
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
    adminUsernames: ['admin'],
    // 假的 GitHub：octocat/hello 有 1234 顆星，其他專案不存在
    githubFetch: async (url) => {
      const u = String(url).toLowerCase();
      if (u === 'https://api.github.com/repos/octocat/hello') return new Response(JSON.stringify({ stargazers_count: 1234 }));
      if (u === 'https://api.github.com/repos/octocat/starme') return new Response(JSON.stringify({ stargazers_count: starMeCount }));
      return new Response('{}', { status: 404 });
    },
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

test('分享一定要附上截圖或 YouTube 影片', async () => {
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
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
  }, [
    { name: 'screen.png', data: PNG },
  ]);
  assert.equal(res.status, 201);
  const { post } = await res.json();
  assert.deepEqual(post.media.map((m) => m.kind), ['image']);
  assert.deepEqual(post.youtube, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' });
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

test('教學連結（Learn it）：分享時填、只接受 http/https、編輯時沒送就保留（舊版 App）、可以清掉', async () => {
  const cookie = await register('learner');
  const bad = await createPost(cookie, { title: 'x', learnUrl: 'javascript:alert(1)' }, [{ name: 'a.png', data: PNG }]);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /教學連結/);

  const { post } = await (await createPost(cookie, { title: 'x', learnUrl: 'https://example.com/how' }, [{ name: 'a.png', data: PNG }])).json();
  assert.equal(post.learnUrl, 'https://example.com/how');
  const layout = JSON.stringify(post.media.map((m) => m.url));
  const patch = (fields) => fetch(`${base}/api/posts/${post.id}`, { method: 'PATCH', headers: { cookie }, body: postForm({ title: 'x', layout, ...fields }) }).then((r) => r.json());
  assert.equal((await patch({})).post.learnUrl, 'https://example.com/how');
  assert.equal((await patch({ learnUrl: '' })).post.learnUrl, '');
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

test('大頭貼：上傳、更換會刪掉舊檔、拒絕非圖片、到處都看得到、可移除', async () => {
  const cookie = await register('avatarist');
  const putAvatar = (data, name = 'me.png') => {
    const form = new FormData();
    form.append('avatar', new Blob([data]), name);
    return fetch(`${base}/api/me/avatar`, { method: 'PUT', headers: { cookie }, body: form });
  };

  const bad = await putAvatar(MP4, 'clip.mp4');
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /大頭貼只能是/);

  const first = await (await putAvatar(PNG)).json();
  assert.match(first.user.avatarUrl, /^\/uploads\/avatar-.+\.png$/);
  assert.equal((await fetch(`${base}${first.user.avatarUrl}`)).status, 200);

  const second = await (await putAvatar(PNG)).json();
  assert.notEqual(second.user.avatarUrl, first.user.avatarUrl);
  assert.equal((await fetch(`${base}${first.user.avatarUrl}`)).status, 404, '舊的大頭貼檔案要刪掉');

  const { post } = await (await createPost(cookie, { title: '有大頭貼' }, [{ name: 'a.png', data: PNG }])).json();
  assert.equal(post.author.avatarUrl, second.user.avatarUrl);
  await fetch(`${base}/api/posts/${post.id}/comments`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'hi' }),
  });
  const { comments } = await (await fetch(`${base}/api/posts/${post.id}/comments`)).json();
  assert.equal(comments[0].author.avatarUrl, second.user.avatarUrl);
  const profile = await (await fetch(`${base}/api/users/avatarist`)).json();
  assert.equal(profile.user.avatarUrl, second.user.avatarUrl);
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie } })).json();
  assert.equal(me.user.avatarUrl, second.user.avatarUrl);

  const removed = await (await fetch(`${base}/api/me/avatar`, { method: 'DELETE', headers: { cookie } })).json();
  assert.equal(removed.user.avatarUrl, null);
  assert.equal((await fetch(`${base}${second.user.avatarUrl}`)).status, 404);

  // 刪除帳號時大頭貼一起刪
  const third = await (await putAvatar(PNG)).json();
  await fetch(`${base}/api/me`, {
    method: 'DELETE', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'password123' }),
  });
  assert.equal((await fetch(`${base}${third.user.avatarUrl}`)).status, 404);
});

test('大頭貼不可超過 5MB', async () => {
  const cookie = await register('bigavatar');
  const form = new FormData();
  form.append('avatar', new Blob([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'big.png');
  const res = await fetch(`${base}/api/me/avatar`, { method: 'PUT', headers: { cookie }, body: form });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, '大頭貼不可超過 5MB');
});

test('聯繫我：帳號或網址都能轉成連結，格式錯誤會擋下', async () => {
  const cookie = await register('contactme');
  const patch = (contacts) => fetch(`${base}/api/me`, {
    method: 'PATCH',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Contact Me', bio: '', contacts }),
  });

  const ok = await patch({
    facebook: 'https://www.facebook.com/amy.chen',
    instagram: '@amy.codes',
    threads: 'amy.codes',
    line: 'amy123',
    email: 'amy@example.com',
    x: 'https://twitter.com/amy',
    github: '@amy-chen',
    website: 'https://amy.dev',
  });
  assert.equal(ok.status, 200);
  const { user } = await (await fetch(`${base}/api/users/contactme`)).json();
  assert.deepEqual(user.contacts.map((c) => [c.type, c.url]), [
    ['facebook', 'https://www.facebook.com/amy.chen'],
    ['instagram', 'https://www.instagram.com/amy.codes'],
    ['threads', 'https://www.threads.net/@amy.codes'],
    ['line', 'https://line.me/ti/p/~amy123'],
    ['email', 'mailto:amy@example.com'],
    ['x', 'https://twitter.com/amy'],
    ['github', 'https://github.com/amy-chen'],
    ['website', 'https://amy.dev/'],
  ]);
  assert.equal(user.contacts[1].value, '@amy.codes', '保留使用者輸入的原文，方便編輯');

  // LINE 官方帳號
  await patch({ line: '@yourwowai' });
  const line = (await (await fetch(`${base}/api/users/contactme`)).json()).user.contacts;
  assert.deepEqual(line, [{ type: 'line', label: 'LINE', value: '@yourwowai', url: 'https://line.me/R/ti/p/%40yourwowai' }]);

  // 錯誤格式
  for (const [contacts, message] of [
    [{ instagram: 'https://evil.example/amy' }, /Instagram/],
    [{ email: 'not-an-email' }, /Email/],
    [{ website: 'javascript:alert(1)' }, /個人網站/],
    [{ facebook: 'amy chen' }, /Facebook/],
    [{ github: 'https://gitlab.com/amy' }, /GitHub/],
    [{ tiktok: 'amy' }, /不支援/],
  ]) {
    const res = await patch(contacts);
    assert.equal(res.status, 400, JSON.stringify(contacts));
    assert.match((await res.json()).error, message);
  }

  // 沒送 contacts 時保留；送空字串就清除
  await fetch(`${base}/api/me`, {
    method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'X', bio: '' }),
  });
  assert.equal((await (await fetch(`${base}/api/users/contactme`)).json()).user.contacts.length, 1);
  await patch({ line: '' });
  assert.equal((await (await fetch(`${base}/api/users/contactme`)).json()).user.contacts.length, 0);
});

test('搜尋：作品名稱、介紹、AI 標籤、作者都搜得到；多個關鍵字要同時符合；% 不是萬用字元', async () => {
  const kai = await register('kai_search');
  await fetch(`${base}/api/me`, {
    method: 'PATCH', headers: { cookie: kai, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: '阿凱', bio: '' }),
  });
  const mk = async (fields) => (await (await createPost(kai, fields, [{ name: 'a.png', data: PNG }])).json()).post;
  const invoice = await mk({ title: 'AI 發票記帳', description: '拍照自動分類', aiTools: 'Claude, Cursor' });
  const resume = await mk({ title: '履歷產生器', description: '100% 用 AI 寫的', aiTools: 'v0' });
  const other = await register('someone_else');
  const lonely = (await (await createPost(other, { title: '天氣小工具' }, [{ name: 'a.png', data: PNG }])).json()).post;
  const noUnderscore = await register('plainuser');
  await createPost(noUnderscore, { title: '沒有底線' }, [{ name: 'a.png', data: PNG }]);

  const search = async (q, cookie = '') => (await (await fetch(`${base}/api/posts?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json())
    .posts.map((p) => p.id);
  assert.deepEqual(await search('發票'), [invoice.id], '作品名稱');
  assert.deepEqual(await search('自動分類'), [invoice.id], '介紹');
  assert.deepEqual(await search('cursor'), [invoice.id], 'AI 標籤，不分大小寫');
  assert.deepEqual(await search('阿凱'), [resume.id, invoice.id], '作者名稱');
  assert.deepEqual(await search('kai_search 履歷'), [resume.id], '多個關鍵字');
  assert.deepEqual(await search('100%'), [resume.id], '% 當成一般文字');
  assert.deepEqual(await search('%'), [resume.id]);
  assert.deepEqual(await search('_'), [lonely.id, resume.id, invoice.id], '_ 只符合帳號裡真的有 _ 的（kai_search、someone_else）');
  assert.ok((await search('天氣')).includes(lonely.id));
  assert.deepEqual(await search('找不到的東西'), []);

  // 搜尋 Cooler
  const users = async (q, cookie = '') => (await (await fetch(`${base}/api/users?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json())
    .users.map((u) => u.username);
  assert.deepEqual(await users('阿凱'), ['kai_search']);
  assert.deepEqual(await users('KAI'), ['kai_search']);
  assert.deepEqual(await users(''), []);
  await fetch(`${base}/api/users/kai_search/block`, { method: 'POST', headers: { cookie: other } });
  assert.deepEqual(await users('阿凱', other), [], '封鎖的人搜不到');
  assert.deepEqual(await search('發票', other), [], '封鎖的人的作品也搜不到');
});

test('GitHub 專案：owner/repo 或網址都會轉成專案連結，可以用專案名稱搜尋，其他網域會擋下', async () => {
  const cookie = await register('ghuser');
  const png = [{ name: 'a.png', data: PNG }];
  for (const [input, expected] of [
    ['amy-chen/ai-ledger', 'https://github.com/amy-chen/ai-ledger'],
    ['https://github.com/amy-chen/ai-ledger.git', 'https://github.com/amy-chen/ai-ledger'],
    ['github.com/amy-chen/ai-ledger/tree/main/src', 'https://github.com/amy-chen/ai-ledger'],
    ['https://www.github.com/Amy/My.Repo?tab=readme', 'https://github.com/Amy/My.Repo'],
  ]) {
    const res = await createPost(cookie, { title: 'GitHub 工具', githubUrl: input }, png);
    assert.equal(res.status, 201, input);
    assert.equal((await res.json()).post.githubUrl, expected, input);
  }

  const none = await (await createPost(cookie, { title: '沒有 GitHub' }, png)).json();
  assert.equal(none.post.githubUrl, '');

  for (const bad of ['https://gitlab.com/amy/repo', 'amy', 'https://github.com/amy', 'amy/../x', 'javascript:alert(1)']) {
    const res = await createPost(cookie, { title: 'x', githubUrl: bad }, png);
    assert.equal(res.status, 400, bad);
    assert.match((await res.json()).error, /GitHub/);
  }

  const { posts } = await (await fetch(`${base}/api/posts?q=ai-ledger`)).json();
  assert.ok(posts.length >= 3);
  assert.ok(posts.every((p) => p.githubUrl.includes('ai-ledger')));
});

test('舊資料庫會自動加上 GitHub 專案與 YouTube 影片欄位', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(tmpDir, 'old-github.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', tool_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  old.close();
  const db = openDatabase(file);
  const columns = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
  assert.ok(columns.includes('github_url'));
  assert.ok(columns.includes('youtube_url'));
  db.close();
});

test('健康檢查：給主機確認伺服器與資料庫正常', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('示範影片用 YouTube 連結：各種網址格式都能用，只有影片連結也能分享，不再接受上傳影片檔', async () => {
  const cookie = await register('ytuser');
  for (const input of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ?si=x',
    'youtu.be/dQw4w9WgXcQ',
  ]) {
    const res = await createPost(cookie, { title: '只有影片', youtubeUrl: input });
    assert.equal(res.status, 201, input);
    const { post } = await res.json();
    assert.equal(post.youtube.id, 'dQw4w9WgXcQ', input);
    assert.deepEqual(post.media, []);
  }

  for (const bad of ['https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)']) {
    const res = await createPost(cookie, { title: 'x', youtubeUrl: bad });
    assert.equal(res.status, 400, bad);
    assert.match((await res.json()).error, /YouTube/);
  }

  const before = uploadedFiles().length;
  const video = await createPost(cookie, { title: '影片檔' }, [{ name: 'demo.mp4', data: MP4 }]);
  assert.equal(video.status, 400);
  assert.match((await video.json()).error, /YouTube/);
  assert.equal(uploadedFiles().length, before, '被拒絕的影片檔不會留在伺服器');

  const plain = await (await createPost(cookie, { title: '只有截圖' }, [{ name: 'a.png', data: PNG }])).json();
  assert.equal(plain.post.youtube, null);
});

test('英文版 App：錯誤訊息依 Accept-Language 回英文，沒送語言時維持中文', async () => {
  const cookie = await register('lang_user');
  const send = (headers) => fetch(`${base}/api/posts`, { method: 'POST', headers: { cookie, ...headers }, body: postForm({ title: 'x' }) });
  assert.equal((await (await send({ 'Accept-Language': 'en' })).json()).error, 'Every post needs at least one screenshot or a YouTube link');
  assert.equal((await (await send({ 'Accept-Language': 'en-US,en;q=0.9' })).json()).error, 'Every post needs at least one screenshot or a YouTube link');
  assert.equal((await (await send({ 'Accept-Language': 'zh-TW' })).json()).error, '分享時一定要附上至少一張截圖或一個 YouTube 影片連結');
  assert.equal((await (await send({})).json()).error, '分享時一定要附上至少一張截圖或一個 YouTube 影片連結');

  const long = await fetch(`${base}/api/posts`, { method: 'POST', headers: { cookie, 'Accept-Language': 'en' }, body: postForm({ title: 'x'.repeat(81) }, [{ name: 'a.png', data: PNG }]) });
  assert.equal((await long.json()).error, 'Tool name must be 80 characters or fewer');

  const contact = await fetch(`${base}/api/me`, {
    method: 'PATCH',
    headers: { cookie, 'Content-Type': 'application/json', 'Accept-Language': 'en' },
    body: JSON.stringify({ displayName: 'L', bio: '', contacts: { instagram: 'https://evil.example/x' } }),
  });
  assert.equal((await contact.json()).error, 'Enter your Instagram username or a link from instagram.com');
});

test('公開統計：註冊人數與公開作品數，任何網站都能讀取', async () => {
  const before = await (await fetch(`${base}/api/stats`)).json();
  const cookie = await register('stats_user');
  await createPost(cookie, { title: '統計用作品' }, [{ name: 'a.png', data: PNG }]);
  const res = await fetch(`${base}/api/stats`, { headers: { Origin: 'https://101academyforyou.github.io' } });
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const after = await res.json();
  assert.equal(after.users, before.users + 1);
  assert.equal(after.posts, before.posts + 1);
  assert.deepEqual(Object.keys(after).sort(), ['posts', 'users']);
});

test('編輯貼文：改文字與連結、保留／移除／新增截圖並調整順序，只有作者能改', async () => {
  const cookie = await register('editor');
  const other = await register('not_editor');
  const created = await (await createPost(cookie, { title: '舊名稱', aiTools: 'Claude', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }, [
    { name: 'a.png', data: PNG },
    { name: 'b.png', data: PNG },
  ])).json();
  const [first, second] = created.post.media.map((m) => m.url);
  const patch = (c, fields, files = []) => fetch(`${base}/api/posts/${created.post.id}`, { method: 'PATCH', headers: { cookie: c }, body: postForm(fields, files) });

  // 別人不能改
  assert.equal((await patch(other, { title: 'x', layout: JSON.stringify([first]) })).status, 403);

  // 移除第一張、在前面加一張新圖；改名稱、介紹、標籤、拿掉 YouTube
  const res = await patch(cookie, {
    title: '新名稱',
    description: '更新後的介紹',
    aiTools: 'Cursor, v0',
    githubUrl: 'amy/new-repo',
    youtubeUrl: '',
    layout: JSON.stringify(['new:0', second]),
  }, [{ name: 'c.png', data: PNG }]);
  assert.equal(res.status, 200);
  const { post } = await res.json();
  assert.equal(post.title, '新名稱');
  assert.equal(post.description, '更新後的介紹');
  assert.deepEqual(post.aiTools, ['Cursor', 'v0']);
  assert.equal(post.githubUrl, 'https://github.com/amy/new-repo');
  assert.equal(post.youtube, null);
  assert.equal(post.media.length, 2);
  assert.notEqual(post.media[0].url, first);
  assert.equal(post.media[1].url, second);
  assert.equal((await fetch(`${base}${first}`)).status, 404, '被移除的舊圖會從伺服器刪掉');
  assert.equal((await fetch(`${base}${post.media[0].url}`)).status, 200);

  // 不能清空到沒有截圖也沒有 YouTube；不能偷用別則貼文的圖
  const empty = await patch(cookie, { title: '新名稱', layout: '[]' });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /截圖|YouTube/);
  const foreign = await patch(cookie, { title: '新名稱', layout: JSON.stringify(['/uploads/not-mine.png']) });
  assert.equal(foreign.status, 400);
  const still = (await (await fetch(`${base}/api/posts/${created.post.id}`)).json()).post;
  assert.equal(still.media.length, 2, '失敗的編輯不會改到原本的貼文');
});

test('應用領域分類：分享時選、編輯時改、依分類瀏覽、分類數量', async () => {
  const cookie = await register('cat_user');
  const png = [{ name: 'a.png', data: PNG }];
  const created = await (await createPost(cookie, { title: '單字卡', categories: 'games, education, games' }, png)).json();
  assert.deepEqual(created.post.categories, ['education', 'games'], '依固定順序、去除重複');

  for (const [categories, message] of [['cooking', /分類/], ['education,finance,health,games', /分類/]]) {
    const res = await createPost(cookie, { title: 'x', categories }, png);
    assert.equal(res.status, 400, categories);
    assert.match((await res.json()).error, message);
  }

  const before = Object.fromEntries((await (await fetch(`${base}/api/categories`)).json()).categories.map((c) => [c.slug, c.count]));
  assert.ok(before.education >= 1);

  const { posts } = await (await fetch(`${base}/api/posts?category=education`)).json();
  assert.ok(posts.some((p) => p.id === created.post.id));
  assert.ok(posts.every((p) => p.categories.includes('education')));

  const edited = await (await fetch(`${base}/api/posts/${created.post.id}`, {
    method: 'PATCH',
    headers: { cookie },
    body: postForm({ title: '單字卡', categories: 'finance', layout: JSON.stringify(created.post.media.map((m) => m.url)) }),
  })).json();
  assert.deepEqual(edited.post.categories, ['finance']);
  const { posts: still } = await (await fetch(`${base}/api/posts?category=education`)).json();
  assert.ok(!still.some((p) => p.id === created.post.id));
});

test('「其他」分類可以自己填領域名稱，搜尋得到；沒選「其他」時不會存', async () => {
  const cookie = await register('other_cat');
  const png = [{ name: 'a.png', data: PNG }];
  const res = await createPost(cookie, { title: '食譜產生器', categories: 'other,lifestyle', categoryOther: '  烹飪料理  ' }, png);
  const { post } = await res.json();
  assert.deepEqual(post.categories, ['lifestyle', 'other']);
  assert.equal(post.categoryOther, '烹飪料理');

  const found = (await (await fetch(`${base}/api/posts?q=${encodeURIComponent('烹飪')}`)).json()).posts;
  assert.ok(found.some((p) => p.id === post.id));

  const plain = await (await createPost(cookie, { title: '另一個', categories: 'lifestyle', categoryOther: '不該存' }, png)).json();
  assert.equal(plain.post.categoryOther, '');

  const tooLong = await createPost(cookie, { title: 'x', categories: 'other', categoryOther: '字'.repeat(31) }, png);
  assert.equal(tooLong.status, 400);

  const edited = await (await fetch(`${base}/api/posts/${post.id}`, {
    method: 'PATCH',
    headers: { cookie },
    body: postForm({ title: '食譜產生器', categories: 'lifestyle', categoryOther: '烹飪料理', layout: JSON.stringify(post.media.map((m) => m.url)) }),
  })).json();
  assert.equal(edited.post.categoryOther, '', '取消「其他」後清掉自訂名稱');
});

test('在 YourWowAI 裡分享：顯示在個人頁的「分享」分頁、有分享數、通知作者，可以取消，不能分享自己的', async () => {
  const author = await register('repost_author');
  const fan = await register('repost_fan');
  const { post } = await (await createPost(author, { title: '轉分享測試' }, [{ name: 'a.png', data: PNG }])).json();
  assert.equal(post.repostCount, 0);
  assert.equal(post.repostedByMe, false);

  const own = await fetch(`${base}/api/posts/${post.id}/repost`, { method: 'PUT', headers: { cookie: author } });
  assert.equal(own.status, 400);
  assert.equal((await fetch(`${base}/api/posts/${post.id}/repost`, { method: 'PUT' })).status, 401);

  const shared = await (await fetch(`${base}/api/posts/${post.id}/repost`, { method: 'PUT', headers: { cookie: fan } })).json();
  assert.deepEqual(shared, { repostCount: 1, repostedByMe: true });
  // 重複分享不會重複計算
  await fetch(`${base}/api/posts/${post.id}/repost`, { method: 'PUT', headers: { cookie: fan } });

  const profile = await (await fetch(`${base}/api/users/repost_fan`)).json();
  assert.deepEqual(profile.reposts.map((p) => p.id), [post.id]);
  assert.equal(profile.posts.length, 0, '轉分享不算自己的作品');
  assert.equal((await (await fetch(`${base}/api/posts/${post.id}`)).json()).post.repostCount, 1);

  const notes = (await (await fetch(`${base}/api/notifications`, { headers: { cookie: author } })).json()).notifications;
  assert.equal(notes.filter((n) => n.type === 'repost').length, 1);
  assert.match(notes[0].message, /轉分享測試/);

  const undone = await (await fetch(`${base}/api/posts/${post.id}/repost`, { method: 'DELETE', headers: { cookie: fan } })).json();
  assert.deepEqual(undone, { repostCount: 0, repostedByMe: false });
  assert.equal((await (await fetch(`${base}/api/users/repost_fan`)).json()).reposts.length, 0);
});

test('舊資料庫的通知表會升級成可以存「分享」通知，舊通知保留', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(tmpDir, 'legacy-notifications.db');
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, bio TEXT DEFAULT '', password_hash TEXT, created_at TEXT);
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cool', 'comment', 'follow', 'new_post')),
      post_id INTEGER, text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), read_at TEXT
    );
    INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'a', 'a', 'x'), (2, 'b', 'b', 'x');
    INSERT INTO notifications (user_id, actor_id, type) VALUES (1, 2, 'follow');
  `);
  legacy.close();
  const db = openDatabase(file);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 1);
  db.prepare("INSERT INTO notifications (user_id, actor_id, type) VALUES (1, 2, 'repost')").run();
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'notifications_old'").get(), undefined);
  db.close();
  // 再開一次不會重複升級
  openDatabase(file).close();
});

test('留言：自己可以編輯與刪除；貼文作者可以刪除別人在自己貼文下的留言；其他人不行', async () => {
  const author = await register('cm_author');
  const fan = await register('cm_fan');
  const stranger = await register('cm_stranger');
  const { post } = await (await createPost(author, { title: '留言測試' }, [{ name: 'a.png', data: PNG }])).json();
  const add = async (cookie, body) => (await (await fetch(`${base}/api/posts/${post.id}/comments`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
  })).json()).comment;
  const c1 = await add(fan, '好酷');
  const c2 = await add(fan, '第二則');
  const edit = (cookie, id, body) => fetch(`${base}/api/comments/${id}`, {
    method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
  });
  const del = (cookie, id) => fetch(`${base}/api/comments/${id}`, { method: 'DELETE', headers: { cookie } });

  assert.equal((await edit(author, c1.id, '改掉')).status, 403, '貼文作者不能改別人的留言');
  assert.equal((await edit(fan, c1.id, '  ')).status, 400);
  const edited = await (await edit(fan, c1.id, '好酷！已經在用了')).json();
  assert.equal(edited.comment.body, '好酷！已經在用了');
  assert.equal(edited.comment.edited, true);

  const list = (await (await fetch(`${base}/api/posts/${post.id}/comments`)).json()).comments;
  assert.deepEqual(list.map((c) => [c.body, c.edited]), [['好酷！已經在用了', true], ['第二則', false]]);

  assert.equal((await del(stranger, c1.id)).status, 403);
  assert.deepEqual(await (await del(fan, c1.id)).json(), { commentCount: 1 });
  assert.deepEqual(await (await del(author, c2.id)).json(), { commentCount: 0 });
  assert.equal((await del(fan, c2.id)).status, 404);
});

test('回覆留言與對留言按 Cool：只有一層、通知被回覆的人與貼文作者、重複按 Cool 只通知一次、刪掉留言連回覆一起刪', async () => {
  const author = await register('rp_author');
  const amy = await register('rp_amy');
  const bob = await register('rp_bob');
  const { post } = await (await createPost(author, { title: '回覆測試' }, [{ name: 'a.png', data: PNG }])).json();
  const add = async (cookie, body, parentId) => (await (await fetch(`${base}/api/posts/${post.id}/comments`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ body, parentId }),
  })).json()).comment;
  const notes = async (cookie) => (await (await fetch(`${base}/api/notifications`, { headers: { cookie } })).json()).notifications;
  const cool = (cookie, id, on = true) => fetch(`${base}/api/comments/${id}/cool`, { method: on ? 'PUT' : 'DELETE', headers: { cookie } }).then((r) => r.json());

  const top = await add(amy, '好酷');
  assert.equal(top.parentId, null);
  const r1 = await add(bob, '@rp_amy 同意', top.id);
  assert.equal(r1.parentId, top.id);
  // 回覆「回覆」也掛在最上層那則底下
  const r2 = await add(amy, '@rp_bob 謝謝', r1.id);
  assert.equal(r2.parentId, top.id);
  const bad = await fetch(`${base}/api/posts/${post.id}/comments`, { method: 'POST', headers: { cookie: amy, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'x', parentId: 999999 }) });
  assert.equal(bad.status, 404);

  // Amy 收到 Bob 的回覆；Bob 收到 Amy 回覆他；作者收到三則留言通知
  assert.ok((await notes(amy)).some((n) => n.type === 'reply' && n.message.includes('同意')));
  assert.ok((await notes(bob)).some((n) => n.type === 'reply' && n.message.includes('謝謝')));
  assert.equal((await notes(author)).filter((n) => n.type === 'comment').length, 3);

  assert.deepEqual(await cool(bob, top.id), { coolCount: 1, cooledByMe: true });
  assert.deepEqual(await cool(author, top.id), { coolCount: 2, cooledByMe: true });
  assert.deepEqual(await cool(bob, top.id, false), { coolCount: 1, cooledByMe: false });
  await cool(bob, top.id);
  assert.equal((await notes(amy)).filter((n) => n.type === 'comment_cool').length, 2, 'Bob 取消再按不重複通知');

  const list = (await (await fetch(`${base}/api/posts/${post.id}/comments`, { headers: { cookie: bob } })).json()).comments;
  assert.deepEqual(list.map((c) => [c.body, c.parentId, c.coolCount, c.cooledByMe]), [
    ['好酷', null, 2, true], ['@rp_amy 同意', top.id, 0, false], ['@rp_bob 謝謝', top.id, 0, false],
  ]);

  // 刪掉最上層留言，回覆一起刪
  assert.deepEqual(await (await fetch(`${base}/api/comments/${top.id}`, { method: 'DELETE', headers: { cookie: author } })).json(), { commentCount: 0 });
});

test('自己的 GitHub 帳號：沒有綁定 GitHub 時，用「聯繫我」填的 GitHub', async () => {
  const cookie = await register('gh_contact');
  const me = async () => (await (await fetch(`${base}/api/me`, { headers: { cookie } })).json()).user;
  assert.equal((await me()).github, null);
  const save = (github) => fetch(`${base}/api/me`, {
    method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'x', contacts: { github } }),
  });
  await save('@amy-dev');
  assert.deepEqual((await me()).github, { login: 'amy-dev', id: null });
  await save('https://github.com/Kai123');
  assert.equal((await me()).github.login, 'Kai123');
});

test('AI Webhook：產生網址、讀說明、用 JSON（base64 截圖）或 multipart 發文、只改有送的欄位、重新產生後舊網址失效', async () => {
  const cookie = await register('hook_user');
  const created = await (await fetch(`${base}/api/me/webhook`, { method: 'POST', headers: { cookie } })).json();
  assert.match(created.url, /\/api\/hooks\/ywa_[0-9a-f]{48}$/);
  assert.equal(created.webhook.active, true);
  assert.equal(created.webhook.hint, created.url.slice(-4));
  const hook = created.url.replace(/^https?:\/\/[^/]+/, base);

  // 說明：給 AI 讀
  const info = await (await fetch(hook)).json();
  assert.equal(info.account, 'hook_user');
  assert.ok(info.create.fields.title);

  const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // 沒有截圖也沒有影片：英文錯誤訊息
  const bad = await send('POST', hook, { title: 'x' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /screenshot or a YouTube link/);
  // 不是圖片的 base64
  assert.equal((await send('POST', hook, { title: 'x', images: [Buffer.from('hello').toString('base64')] })).status, 400);

  const res = await send('POST', hook, {
    title: 'AI Receipt Tracker',
    description: 'Snap a receipt',
    images: [`data:image/png;base64,${PNG.toString('base64')}`],
    aiTools: ['Claude Code', 'Cursor'],
    categories: ['finance'],
    githubUrl: 'octocat/receipt',
  });
  assert.equal(res.status, 201);
  const { post, url } = await res.json();
  assert.equal(post.author.username, 'hook_user');
  assert.equal(post.media.length, 1);
  assert.deepEqual(post.aiTools, ['Claude Code', 'Cursor']);
  assert.match(url, new RegExp(`/post/${post.id}$`));

  // multipart 也可以
  const form = postForm({ title: 'Multipart tool', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal((await fetch(hook, { method: 'POST', body: form })).status, 201);

  // 只改介紹，其他保留
  const patched = await (await send('PATCH', `${hook}/posts/${post.id}`, { description: 'v2: now with charts' })).json();
  assert.equal(patched.post.description, 'v2: now with charts');
  assert.equal(patched.post.title, 'AI Receipt Tracker');
  assert.deepEqual(patched.post.categories, ['finance']);
  assert.equal(patched.post.media.length, 1);
  // 換成只有 YouTube：移除截圖
  const swapped = await (await send('PATCH', `${hook}/posts/${post.id}`, { images: [], youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' })).json();
  assert.equal(swapped.post.media.length, 0);
  assert.equal(swapped.post.youtube.id, 'dQw4w9WgXcQ');

  // 不能改別人的貼文
  const other = await register('hook_other');
  const { post: theirs } = await (await createPost(other, { title: 'theirs' }, [{ name: 'a.png', data: PNG }])).json();
  assert.equal((await send('PATCH', `${hook}/posts/${theirs.id}`, { title: 'hacked' })).status, 403);

  const me = await (await fetch(`${base}/api/me`, { headers: { cookie } })).json();
  assert.ok(me.user.webhook.lastUsedAt);

  // 重新產生：舊網址失效
  const again = await (await fetch(`${base}/api/me/webhook`, { method: 'POST', headers: { cookie } })).json();
  assert.notEqual(again.url, created.url);
  assert.equal((await fetch(hook)).status, 404);
  // 關閉
  await fetch(`${base}/api/me/webhook`, { method: 'DELETE', headers: { cookie } });
  assert.equal((await fetch(again.url.replace(/^https?:\/\/[^/]+/, base))).status, 404);
  assert.equal((await fetch(`${base}/api/hooks/not-a-token`)).status, 404);
});

test('AI Webhook：每小時最多 20 則', async () => {
  const cookie = await register('hook_spam');
  const { url } = await (await fetch(`${base}/api/me/webhook`, { method: 'POST', headers: { cookie } })).json();
  const hook = url.replace(/^https?:\/\/[^/]+/, base);
  for (let i = 0; i < 20; i += 1) {
    const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `t${i}`, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }) });
    assert.equal(r.status, 201);
  }
  const limited = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'one more', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }) });
  assert.equal(limited.status, 429);
});

test('GitHub 星星數：背景查詢後顯示在貼文上，同一個專案共用快取；沒有 GitHub 專案或找不到時是 null', async () => {
  const cookie = await register('stars_user');
  const png = [{ name: 'a.png', data: PNG }];
  const { post } = await (await createPost(cookie, { title: 'Hello', githubUrl: 'octocat/hello' }, png)).json();
  const { post: missing } = await (await createPost(cookie, { title: 'Missing', githubUrl: 'octocat/nope' }, png)).json();
  const { post: plain } = await (await createPost(cookie, { title: 'No repo' }, png)).json();
  await new Promise((r) => setTimeout(r, 50));
  const get = async (id) => (await (await fetch(`${base}/api/posts/${id}`)).json()).post.githubStars;
  assert.equal(await get(post.id), 1234);
  assert.equal(await get(missing.id), null);
  assert.equal(await get(plain.id), null);
  // 另一則貼同一個專案（網址寫法不同）直接用快取
  const { post: same } = await (await createPost(cookie, { title: 'Again', githubUrl: 'https://github.com/OctoCat/Hello' }, png)).json();
  assert.equal(same.githubStars, 1234);
});

test('釘選：最多 3 則、排在個人頁最前面（最近釘選的在前）、只能釘選自己的、可以取消', async () => {
  const cookie = await register('pin_user');
  const png = [{ name: 'a.png', data: PNG }];
  const ids = [];
  for (let i = 1; i <= 5; i += 1) ids.push((await (await createPost(cookie, { title: `p${i}` }, png)).json()).post.id);
  const pin = (id, method = 'PUT', c = cookie) => fetch(`${base}/api/posts/${id}/pin`, { method, headers: { cookie: c } });
  const order = async () => (await (await fetch(`${base}/api/users/pin_user`)).json()).posts.map((p) => [p.title, p.pinned]);

  assert.equal((await pin(ids[0])).status, 200);
  await pin(ids[2]);
  await pin(ids[1]);
  assert.deepEqual(await order(), [['p2', true], ['p3', true], ['p1', true], ['p5', false], ['p4', false]]);
  // 第 4 則：擋下來（英文錯誤訊息也正確）
  const fourth = await fetch(`${base}/api/posts/${ids[3]}/pin`, { method: 'PUT', headers: { cookie, 'Accept-Language': 'en' } });
  assert.equal(fourth.status, 400);
  assert.match((await fourth.json()).error, /up to 3 posts/);
  // 已經釘選的再釘一次沒關係
  assert.equal((await pin(ids[0])).status, 200);
  // 別人不能釘選
  const other = await register('pin_other');
  assert.equal((await pin(ids[3], 'PUT', other)).status, 403);
  // 取消後可以釘新的
  await pin(ids[2], 'DELETE');
  assert.equal((await pin(ids[3])).status, 200);
  assert.deepEqual((await order()).slice(0, 3), [['p4', true], ['p2', true], ['p1', true]]);
});

test('到 GitHub 按星回來：立刻重新查詢星星數，同一個專案 5 秒內不重複查', async () => {
  const cookie = await register('star_refresh');
  const { post } = await (await createPost(cookie, { title: 'Star me', githubUrl: 'octocat/starme' }, [{ name: 'a.png', data: PNG }])).json();
  await new Promise((r) => setTimeout(r, 50));
  const refresh = async () => (await (await fetch(`${base}/api/posts/${post.id}/github-stars`, { method: 'POST' })).json()).githubStars;
  assert.equal(await refresh(), 5);
  starMeCount = 6; // 有人在 GitHub 按了星
  assert.equal(await refresh(), 5, '5 秒內不會再問 GitHub');
  const { post: plain } = await (await createPost(cookie, { title: 'No repo' }, [{ name: 'a.png', data: PNG }])).json();
  assert.deepEqual(await (await fetch(`${base}/api/posts/${plain.id}/github-stars`, { method: 'POST' })).json(), { githubStars: null });
});

test('動態牆排序：random 同一個 seed 順序固定、分頁不重複不漏，換 seed 順序不同；top 依 Cool 數排行並可依期間篩選', async () => {
  const author = await register('sort_author');
  const ids = [];
  for (let i = 1; i <= 15; i += 1) ids.push((await (await createPost(author, { title: `s${i}`, categories: 'games' }, [{ name: 'a.png', data: PNG }])).json()).post.id);
  const list = async (qs) => (await fetch(`${base}/api/posts?category=games&${qs}`)).json();

  // random：兩頁合起來剛好是全部，沒有重複
  const p1 = await list('sort=random&seed=42');
  assert.equal(p1.posts.length, 12);
  assert.equal(p1.nextOffset, 12);
  const p2 = await list('sort=random&seed=42&offset=12');
  const all = [...p1.posts, ...p2.posts].map((p) => p.id);
  assert.equal(p2.nextOffset, null);
  assert.deepEqual([...all].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  assert.deepEqual((await list('sort=random&seed=42')).posts.map((p) => p.id), p1.posts.map((p) => p.id), '同一個 seed 順序一樣');
  const other = (await list('sort=random&seed=7')).posts.map((p) => p.id);
  assert.notDeepEqual(other, p1.posts.map((p) => p.id), '換 seed 順序不同');
  assert.notDeepEqual(p1.posts.map((p) => p.id), [...ids].reverse().slice(0, 12), '不是新到舊');

  // top：s3 有 2 個 Cool、s7 有 1 個 Cool 1 個 Not Cool、s9 有 1 個 Cool
  const fans = [await register('sort_fan1'), await register('sort_fan2')];
  const vote = (cookie, id, v) => fetch(`${base}/api/posts/${id}/vote`, { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ vote: v }) });
  await vote(fans[0], ids[2], 'cool'); await vote(fans[1], ids[2], 'cool');
  await vote(fans[0], ids[6], 'cool'); await vote(fans[1], ids[6], 'notcool');
  await vote(fans[0], ids[8], 'cool');
  const top = (await list('sort=top')).posts.map((p) => p.title);
  assert.deepEqual(top.slice(0, 3), ['s3', 's9', 's7']);
  assert.deepEqual((await list('sort=top&period=week')).posts.map((p) => p.title).slice(0, 3), ['s3', 's9', 's7'], '這週發的也算');

  // 預設仍是新到舊（舊版 App 不受影響）
  const latest = await list('');
  assert.deepEqual(latest.posts.map((p) => p.id), [...ids].reverse().slice(0, 12));
  assert.equal(latest.nextBefore, latest.posts.at(-1).id);
});
