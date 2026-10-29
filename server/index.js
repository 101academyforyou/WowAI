import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { createResendMailer } from './mail.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ?? path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const app = createApp({
  db: openDatabase(path.join(dataDir, 'wowai.db')),
  uploadDir: path.join(dataDir, 'uploads'),
  publicDir: path.join(root, 'public'),
  webAppDir: path.join(root, 'web-dist'),
  devCors: process.env.NODE_ENV !== 'production',
  adminUsernames: (process.env.ADMIN_USERNAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // 用註冊時驗證過的 Email 指定管理員（逗號分隔）
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // 作品的 GitHub 星星數（GITHUB_TOKEN 選填：任何 GitHub 個人權杖，不需要任何權限，只是提高查詢上限）
  githubFetch: fetch,
  githubToken: process.env.GITHUB_TOKEN ?? '',
  // 第三方登入：有填 client ID 與 secret 的才會出現在登入畫面
  // 註冊驗證 Email：填了 RESEND_API_KEY 才會要求驗證
  mailer: process.env.RESEND_API_KEY
    ? createResendMailer({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || 'YourWowAI <no-reply@onepointzeroone.org>' })
    : null,
  // iPhone 1.0 的註冊畫面沒有 Email 欄位：1.1 上架後再設成 1，App 也一律要驗證
  requireEmailForApp: process.env.REQUIRE_EMAIL_FOR_APP === '1',
  oauth: {
    publicUrl: process.env.PUBLIC_URL,
    github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET },
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    appleAudiences: (process.env.APPLE_AUDIENCES ?? 'com.yourwowai.app').split(',').map((s) => s.trim()).filter(Boolean),
  },
});

const port = Number(process.env.PORT) || 3000;
// HOST=127.0.0.1：只讓同一台機器的反向代理（例如 Caddy）連進來
const host = process.env.HOST || undefined;
app.listen(port, host, () => {
  console.log(`YourWowAI 已啟動：http://${host ?? 'localhost'}:${port}`);
});
