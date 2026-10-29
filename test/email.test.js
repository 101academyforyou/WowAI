import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

// 開一台有寄信功能的伺服器；寄出的信存在 sent 裡
async function start(options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourwowai-email-'));
  const sent = [];
  const app = createApp({
    db: openDatabase(':memory:'),
    uploadDir: path.join(tmpDir, 'uploads'),
    mailer: async (mail) => { sent.push(mail); },
    ...options,
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, headers = {}) => fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const close = () => { server.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); };
  return { base, post, sent, close };
}

const WEB = { Origin: 'https://yourwowai.onepointzeroone.org' };
const lastCode = (sent) => sent.at(-1).text.match(/\d{6}/)[0];
const signup = (extra) => ({ username: 'amy', password: 'password123', acceptTerms: true, ...extra });

test('註冊驗證 Email：寄驗證碼、錯的碼擋下、對的碼註冊成功、同一個 Email 不能再註冊', async () => {
  const { base, post, sent, close } = await start();
  try {
    assert.equal((await (await fetch(`${base}/api/auth/providers`)).json()).emailVerification, true);

    // 網站註冊一定要 Email 與驗證碼
    let res = await post('/api/auth/register', signup(), WEB);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Email/);
    res = await post('/api/auth/register', signup({ email: 'amy@example.com', emailCode: '123456' }), WEB);
    assert.match((await res.json()).error, /驗證碼/);

    assert.equal((await post('/api/auth/email-code', { email: 'not-an-email' })).status, 400);
    res = await post('/api/auth/email-code', { email: ' Amy@Example.com ' }, { ...WEB, 'Accept-Language': 'en' });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'amy@example.com');
    assert.match(sent[0].subject, /^Your YourWowAI code: \d{6}$/);
    const code = lastCode(sent);

    // 60 秒內不能重寄
    assert.equal((await post('/api/auth/email-code', { email: 'amy@example.com' })).status, 429);

    const wrong = code === '000000' ? '111111' : '000000';
    res = await post('/api/auth/register', signup({ email: 'amy@example.com', emailCode: wrong }), WEB);
    assert.equal((await res.json()).error, '驗證碼錯誤');

    res = await post('/api/auth/register', signup({ email: 'AMY@example.com', emailCode: ` ${code.slice(0, 3)} ${code.slice(3)} ` }), WEB);
    assert.equal(res.status, 201);
    // Email 不公開
    assert.equal((await res.json()).user.email, undefined);

    res = await post('/api/auth/email-code', { email: 'amy@example.com' }, WEB);
    assert.equal(res.status, 409);
    res = await post('/api/auth/register', signup({ username: 'amy2', email: 'amy@example.com', emailCode: code }), WEB);
    assert.equal(res.status, 409);
  } finally {
    close();
  }
});

test('驗證碼錯 5 次就要重寄', async () => {
  const { post, sent, close } = await start();
  try {
    await post('/api/auth/email-code', { email: 'bob@example.com' });
    const code = lastCode(sent);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await post('/api/auth/register', signup({ username: 'bob', email: 'bob@example.com', emailCode: wrong }), WEB);
    const res = await post('/api/auth/register', signup({ username: 'bob', email: 'bob@example.com', emailCode: code }), WEB);
    assert.match((await res.json()).error, /太多次/);
  } finally {
    close();
  }
});

test('iPhone 1.0（不送 email、沒有 Origin）暫時不用驗證；打開 requireEmailForApp 後要求更新 App', async () => {
  let server = await start();
  try {
    assert.equal((await server.post('/api/auth/register', signup())).status, 201);
  } finally {
    server.close();
  }
  server = await start({ requireEmailForApp: true });
  try {
    const res = await server.post('/api/auth/register', signup(), { 'Accept-Language': 'en' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Please update the app to the latest version to sign up');
  } finally {
    server.close();
  }
});

test('寄信失敗回 502，沒有設定寄信時不需要驗證', async () => {
  let server = await start({ mailer: async () => { throw new Error('down'); } });
  try {
    assert.equal((await server.post('/api/auth/email-code', { email: 'c@example.com' })).status, 502);
  } finally {
    server.close();
  }
  server = await start({ mailer: null });
  try {
    assert.equal((await (await fetch(`${server.base}/api/auth/providers`)).json()).emailVerification, false);
    assert.equal((await server.post('/api/auth/register', signup(), WEB)).status, 201);
    assert.equal((await server.post('/api/auth/email-code', { email: 'c@example.com' })).status, 404);
  } finally {
    server.close();
  }
});

test('忘記密碼：用註冊時驗證的 Email 收驗證碼、設定新密碼後自動登入、其他裝置登出、舊密碼失效', async () => {
  const { base, post, sent, close } = await start();
  try {
    await post('/api/auth/email-code', { email: 'reset@example.com' }, WEB);
    let res = await post('/api/auth/register', signup({ username: 'resetme', email: 'reset@example.com', emailCode: lastCode(sent) }), WEB);
    const oldToken = (await res.json()).token;

    assert.equal((await post('/api/auth/password-reset/code', { email: 'nobody@example.com' })).status, 404);
    // 剛註冊完那組驗證碼已經用掉，不能拿來重設
    res = await post('/api/auth/password-reset', { email: 'reset@example.com', code: lastCode(sent), password: 'newpassword1' });
    assert.equal(res.status, 400);

    res = await post('/api/auth/password-reset/code', { email: 'Reset@Example.com' }, { 'Accept-Language': 'en' });
    assert.equal(res.status, 200);
    assert.match(sent.at(-1).subject, /^Reset your YourWowAI password: \d{6}$/);
    const code = lastCode(sent);

    assert.equal((await post('/api/auth/password-reset', { email: 'reset@example.com', code, password: 'short' })).status, 400);
    const wrong = code === '000000' ? '111111' : '000000';
    assert.equal((await post('/api/auth/password-reset', { email: 'reset@example.com', code: wrong, password: 'newpassword1' })).status, 400);

    res = await post('/api/auth/password-reset', { email: 'reset@example.com', code, password: 'newpassword1' });
    assert.equal(res.status, 200);
    const { user, token } = await res.json();
    assert.equal(user.username, 'resetme');
    assert.ok(token);

    // 舊的登入失效、舊密碼不能用、新密碼可以
    assert.equal((await (await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${oldToken}` } })).json()).user, null);
    assert.equal((await (await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${token}` } })).json()).user.username, 'resetme');
    assert.equal((await post('/api/auth/login', { username: 'resetme', password: 'password123' })).status, 401);
    assert.equal((await post('/api/auth/login', { username: 'resetme', password: 'newpassword1' })).status, 200);
    // 驗證碼只能用一次
    assert.equal((await post('/api/auth/password-reset', { email: 'reset@example.com', code, password: 'another123' })).status, 400);
  } finally {
    close();
  }
});

test('ADMIN_EMAILS：註冊時驗證過的 Email 是管理員，其他人不是', async () => {
  const { base, post, sent, close } = await start({ adminEmails: ['Boss@Example.com'] });
  try {
    await post('/api/auth/email-code', { email: 'boss@example.com' }, WEB);
    const boss = (await (await post('/api/auth/register', signup({ username: 'boss', email: 'boss@example.com', emailCode: lastCode(sent) }), WEB)).json()).token;
    await post('/api/auth/email-code', { email: 'someone@example.com' }, WEB);
    const someone = (await (await post('/api/auth/register', signup({ username: 'someone', email: 'someone@example.com', emailCode: lastCode(sent) }), WEB)).json()).token;
    const me = async (token) => (await (await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${token}` } })).json()).user;
    assert.equal((await me(boss)).isAdmin, true);
    assert.equal((await me(someone)).isAdmin, false);
    assert.equal((await fetch(`${base}/api/admin/reports`, { headers: { authorization: `Bearer ${boss}` } })).status, 200);
    assert.equal((await fetch(`${base}/api/admin/reports`, { headers: { authorization: `Bearer ${someone}` } })).status, 403);
  } finally {
    close();
  }
});
