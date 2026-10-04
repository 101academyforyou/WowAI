import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

let server;
let base;
let tmpDir;
const sent = [];
let nextTickets = null;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-notify-'));
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
    // 假的推播服務：記下要送的訊息
    pushSender: async (messages) => {
      sent.push(...messages);
      return nextTickets ?? messages.map(() => ({ status: 'ok' }));
    },
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));

async function register(username) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', acceptTerms: true, displayName: username.toUpperCase() }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

const json = (cookie, method, url, body) => fetch(`${base}${url}`, {
  method,
  headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

async function createPost(cookie, title) {
  const form = new FormData();
  form.append('title', title);
  form.append('media', new Blob([PNG]), 'a.png');
  return (await (await fetch(`${base}/api/posts`, { method: 'POST', headers: { cookie }, body: form })).json()).post;
}

const list = async (cookie) => (await json(cookie, 'GET', '/api/notifications')).json();

test('Cool、留言、追蹤、追蹤對象發新作品都會通知；自己的動作與 Not Cool 不會', async () => {
  const amy = await register('amy');
  const bob = await register('bob');
  const post = await createPost(amy, '記帳 App');

  await json(amy, 'PUT', `/api/posts/${post.id}/vote`, { vote: 'cool' }); // 自己按 → 不通知
  await json(amy, 'POST', `/api/posts/${post.id}/comments`, { body: '自己留言' });
  await json(bob, 'PUT', `/api/posts/${post.id}/vote`, { vote: 'notcool' }); // Not Cool → 不通知
  await json(bob, 'PUT', `/api/posts/${post.id}/vote`, { vote: 'cool' });
  await json(bob, 'DELETE', `/api/posts/${post.id}/vote`);
  await json(bob, 'PUT', `/api/posts/${post.id}/vote`, { vote: 'cool' }); // 重按 Cool → 不重複
  await json(bob, 'POST', `/api/posts/${post.id}/comments`, { body: '太實用了！' });
  await json(bob, 'POST', '/api/users/amy/follow');

  const data = await list(amy);
  assert.equal(data.unreadCount, 3);
  assert.deepEqual(data.notifications.map((n) => [n.type, n.message, n.link]), [
    ['follow', 'BOB 開始追蹤你', '/user/bob'],
    ['comment', 'BOB 留言：太實用了！', `/post/${post.id}`],
    ['cool', 'BOB 覺得你的「記帳 App」很 Cool ⚡', `/post/${post.id}`],
  ]);
  assert.equal(data.notifications[1].actor.username, 'bob');
  assert.match(data.notifications[1].thumbnailUrl, /^\/uploads\//);

  // Bob 追蹤 Amy → Amy 發新作品時 Bob 收到通知
  const second = await createPost(amy, '第二個作品');
  const bobs = await list(bob);
  assert.equal(bobs.notifications[0].type, 'new_post');
  assert.equal(bobs.notifications[0].message, 'AMY 分享了新作品「第二個作品」');
  assert.equal(bobs.notifications[0].link, `/post/${second.id}`);

  // 全部標為已讀
  assert.deepEqual(await (await json(amy, 'POST', '/api/notifications/read')).json(), { unreadCount: 0 });
  assert.equal((await (await json(amy, 'GET', '/api/notifications/unread-count')).json()).unreadCount, 0);
  assert.equal((await list(amy)).notifications.every((n) => n.read), true);
});

test('被封鎖的人不會產生通知', async () => {
  const cara = await register('cara');
  const troll = await register('troll');
  const post = await createPost(cara, '作品');
  await json(troll, 'POST', `/api/posts/${post.id}/comments`, { body: '封鎖前' });
  assert.equal((await list(cara)).unreadCount, 1);
  await json(cara, 'POST', '/api/users/troll/block');
  await json(troll, 'POST', `/api/posts/${post.id}/comments`, { body: '難聽的話' });
  const data = await list(cara);
  assert.equal(data.unreadCount, 0, '封鎖後，對方之前的通知也不算未讀');
  assert.equal(data.notifications.length, 0);
});

test('iPhone 推播：送到登記的裝置、帶連結與未讀數；失效的 token 會被清掉；登出時可移除', async () => {
  const dan = await register('dan');
  const eve = await register('eve');
  const post = await createPost(dan, '推播測試');

  assert.equal((await json(dan, 'POST', '/api/push-tokens', { token: 'not-a-token' })).status, 400);
  assert.equal((await json(dan, 'POST', '/api/push-tokens', { token: 'ExponentPushToken[dan-phone]' })).status, 204);

  sent.length = 0;
  await json(eve, 'POST', `/api/posts/${post.id}/comments`, { body: '推播來囉' });
  await wait();
  assert.deepEqual(sent, [{
    to: 'ExponentPushToken[dan-phone]',
    title: 'YourWowAI',
    body: 'EVE 留言：推播來囉',
    sound: 'default',
    badge: 1,
    data: { url: `/post/${post.id}` },
  }]);

  // Expo 回報裝置已失效 → 清掉 token，下一則就不會再送
  nextTickets = [{ status: 'error', details: { error: 'DeviceNotRegistered' } }];
  await json(eve, 'PUT', `/api/posts/${post.id}/vote`, { vote: 'cool' });
  await wait();
  nextTickets = null;
  sent.length = 0;
  await json(eve, 'POST', `/api/posts/${post.id}/comments`, { body: '還有嗎' });
  await wait();
  assert.equal(sent.length, 0);

  // 登出前移除 token
  await json(dan, 'POST', '/api/push-tokens', { token: 'ExponentPushToken[dan-phone]' });
  await json(dan, 'DELETE', '/api/push-tokens', { token: 'ExponentPushToken[dan-phone]' });
  await json(eve, 'POST', `/api/posts/${post.id}/comments`, { body: '登出後' });
  await wait();
  assert.equal(sent.length, 0);
});

test('網頁版即時更新：有新通知時 stream 立刻送出未讀數', async () => {
  const fay = await register('fay');
  const gus = await register('gus');
  const post = await createPost(fay, '即時');

  const controller = new AbortController();
  const res = await fetch(`${base}/api/notifications/stream`, { headers: { cookie: fay }, signal: controller.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = '';
  const readUntil = async (pattern) => {
    while (!pattern.test(received)) received += decoder.decode((await reader.read()).value);
  };
  await readUntil(/"unreadCount":0/);

  await json(gus, 'POST', `/api/posts/${post.id}/comments`, { body: '哈囉' });
  await readUntil(/"unreadCount":1/);
  assert.match(received, /event: notification/);
  controller.abort();

  assert.equal((await fetch(`${base}/api/notifications/stream`)).status, 401);
});
