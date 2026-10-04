import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

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
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`YourWowAI 已啟動：http://localhost:${port}`);
});
