import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { suggestUsername } from '../server/oauth.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const appleJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

// 假的 GitHub／Google／Apple 伺服器
let githubUser = { id: 42, login: 'octo-cat', name: 'Octo Cat', avatar_url: 'https://avatars.example/octo.png' };
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(init.body);
    return json(body.code === 'good' && body.client_secret === 'gh-secret' ? { access_token: 'gh-token' } : { error: 'bad_verification_code' });
  }
  if (u === 'https://api.github.com/user') return init.headers.Authorization === 'Bearer gh-token' ? json(githubUser) : json({}, 401);
  if (u === 'https://oauth2.googleapis.com/token') return json({ access_token: 'g-token' });
  if (u === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ sub: 'g-1', email: 'amy.lin@example.com', name: 'Amy Lin' });
  if (u === 'https://appleid.apple.com/auth/keys') return json({ keys: [appleJwk] });
  if (u === 'https://avatars.example/octo.png') return new Response(PNG);
  throw new Error(`unexpected fetch ${u}`);
}

function appleToken(claims, key = privateKey) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid: 'test-key' });
  const body = enc({ iss: 'https://appleid.apple.com', aud: 'com.yourwowai.app', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

let server;
let base;
let tmpDir;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-auth-'));
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
    oauth: {
      publicUrl: 'https://yourwowai.example',
      github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
      google: { clientId: 'g-id', clientSecret: 'g-secret' },
      fetch: fakeFetch,
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

const jsonPost = (url, body, headers = {}) => fetch(`${base}${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

// 跑一次完整的 OAuth 流程，回傳導回 App／網頁的網址
async function oauthRound(provider, { client = 'web', code = 'good', headers = {}, link = false, sameBrowser = true } = {}) {
  const started = await jsonPost(`/api/auth/oauth/${provider}/start`, { client, link }, headers);
  const { url } = await started.json();
  const state = new URL(url).searchParams.get('state');
  // 網頁版：瀏覽器會帶著開始登入時拿到的 cookie 回來
  const cookie = sameBrowser ? (started.headers.get('set-cookie') ?? '').split(';')[0] : '';
  const res = await fetch(`${base}/api/auth/oauth/${provider}/callback?code=${code}&state=${state}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  assert.equal(res.status, 302);
  return { authorizeUrl: new URL(url), location: res.headers.get('location') };
}

test('登入方式：有設定的服務才會開啟，Apple 一律可用', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/auth/providers`)).json(), { github: true, google: true, apple: true });
  assert.equal((await jsonPost('/api/auth/oauth/facebook/start', {})).status, 404);
});

test('GitHub 登入：第一次自動建立帳號並帶入大頭貼，之後登入同一個帳號', async () => {
  const { authorizeUrl, location } = await oauthRound('github', { client: 'app' });
  assert.equal(authorizeUrl.origin, 'https://github.com');
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), 'https://yourwowai.example/api/auth/oauth/github/callback');
  assert.match(location, /^yourwowai:\/\/auth\?code=[0-9a-f]+$/);
  const code = new URL(location).searchParams.get('code');

  const exchanged = await (await jsonPost('/api/auth/oauth/exchange', { code })).json();
  assert.equal(exchanged.user.username, 'octo_cat');
  assert.equal(exchanged.user.displayName, 'Octo Cat');
  // 代碼只能用一次
  assert.equal((await jsonPost('/api/auth/oauth/exchange', { code })).status, 400);

  const me = await (await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${exchanged.token}` } })).json();
  assert.equal(me.user.hasPassword, false);
  assert.deepEqual(me.user.identities, ['github']);
  await new Promise((r) => setTimeout(r, 50));
  const profile = await (await fetch(`${base}/api/users/octo_cat`)).json();
  assert.match(profile.user.avatarUrl, /^\/uploads\/avatar-/);

  // 沒有密碼的帳號不能用空密碼登入
  assert.equal((await jsonPost('/api/auth/login', { username: 'octo_cat', password: '' })).status, 401);

  const again = await oauthRound('github');
  assert.match(again.location, /^\/auth\?code=/);
  const second = await (await jsonPost('/api/auth/oauth/exchange', { code: new URL(again.location, base).searchParams.get('code') })).json();
  assert.equal(second.user.id, exchanged.user.id);
});

test('OAuth：state 錯誤、使用者取消、授權碼錯誤都會帶回錯誤訊息', async () => {
  const bad = await fetch(`${base}/api/auth/oauth/github/callback?code=good&state=nope`, { redirect: 'manual' });
  assert.match(bad.headers.get('location'), /^\/auth\?error=/);

  const { url } = await (await jsonPost('/api/auth/oauth/github/start', { client: 'app' })).json();
  const state = new URL(url).searchParams.get('state');
  const cancelled = await fetch(`${base}/api/auth/oauth/github/callback?error=access_denied&state=${state}`, { redirect: 'manual' });
  assert.equal(cancelled.headers.get('location'), 'yourwowai://auth?cancelled=1');
  // 同一個 state 不能再用
  const reused = await fetch(`${base}/api/auth/oauth/github/callback?code=good&state=${state}`, { redirect: 'manual' });
  assert.match(reused.headers.get('location'), /error=/);

  // 別人把自己的回呼連結寄給你（不是你的瀏覽器開始的登入）：拒絕
  const forwarded = await oauthRound('github', { sameBrowser: false });
  assert.match(forwarded.location, /^\/auth\?error=/);

  const failed = await oauthRound('github', { code: 'bad' });
  assert.match(new URL(failed.location, base).searchParams.get('error'), /GitHub 登入失敗/);
});

test('Google 登入用 email 前半段當帳號；已登入的人可以綁定 GitHub，同一個 GitHub 不能綁兩個帳號', async () => {
  const { location } = await oauthRound('google');
  const google = await (await jsonPost('/api/auth/oauth/exchange', { code: new URL(location, base).searchParams.get('code') })).json();
  assert.equal(google.user.username, 'amy.lin');

  assert.equal((await jsonPost('/api/auth/oauth/github/start', { link: true })).status, 401);
  githubUser = { ...githubUser, id: 7, login: 'amy' };
  const auth = { Authorization: `Bearer ${google.token}` };
  const linked = await oauthRound('github', { headers: auth, link: true });
  assert.equal(linked.location, '/auth?linked=github');
  const me = await (await fetch(`${base}/api/me`, { headers: auth })).json();
  assert.deepEqual(me.user.identities, ['github', 'google']);

  // 用這個 GitHub 登入，會進到 amy.lin
  const login = await oauthRound('github');
  const viaGithub = await (await jsonPost('/api/auth/oauth/exchange', { code: new URL(login.location, base).searchParams.get('code') })).json();
  assert.equal(viaGithub.user.id, google.user.id);

  // 另一個帳號想綁同一個 GitHub
  const other = await (await jsonPost('/api/auth/register', { username: 'someone', password: 'password123', acceptTerms: true })).json();
  const conflict = await oauthRound('github', { headers: { Authorization: `Bearer ${other.token}` }, link: true });
  assert.match(new URL(conflict.location, base).searchParams.get('error'), /已經綁定其他 YourWowAI 帳號/);
});

test('Sign in with Apple：驗證 Apple 簽章、對象與期限；沒有密碼的帳號用帳號名稱確認刪除', async () => {
  const forged = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal((await jsonPost('/api/auth/apple', { identityToken: appleToken({ sub: 'a-1' }, forged) })).status, 401);
  assert.equal((await jsonPost('/api/auth/apple', { identityToken: appleToken({ sub: 'a-1', aud: 'com.other.app' }) })).status, 401);
  assert.equal((await jsonPost('/api/auth/apple', { identityToken: appleToken({ sub: 'a-1', exp: 1 }) })).status, 401);
  assert.equal((await jsonPost('/api/auth/apple', { identityToken: 'garbage' })).status, 401);

  const res = await jsonPost('/api/auth/apple', { identityToken: appleToken({ sub: 'a-1', email: 'x@privaterelay.appleid.com' }), fullName: 'Kai Chen' });
  assert.equal(res.status, 201);
  const { user, token } = await res.json();
  assert.equal(user.username, 'KaiChen');
  assert.equal(user.displayName, 'Kai Chen');
  const again = await (await jsonPost('/api/auth/apple', { identityToken: appleToken({ sub: 'a-1' }) })).json();
  assert.equal(again.user.id, user.id);

  const del = (body) => fetch(`${base}/api/me`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  assert.equal((await del({ confirm: 'wrong' })).status, 400);
  assert.equal((await del({ confirm: 'kaichen' })).status, 204);
});

test('從第三方名稱產生帳號：去掉不允許的字、太短補字、重複加數字', () => {
  assert.equal(suggestUsername('my-name', () => false), 'my_name');
  assert.equal(suggestUsername('陳', () => false), 'builder');
  assert.match(suggestUsername('taken', (u) => u === 'taken'), /^taken\d+$/);
});
