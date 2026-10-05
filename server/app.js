import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { transaction } from './db.js';
import { sniffMedia, MEDIA_TYPES } from './media.js';
import { cleanContacts, serializeContacts } from './contacts.js';
import { PUSH_TOKEN, createNotifier, expoPushSender, notificationLink, notificationText } from './notifications.js';

const MAX_MEDIA_PER_POST = 10;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 12;
// 被不同使用者檢舉達到這個次數的貼文會自動隱藏，等待管理員處理
const AUTO_HIDE_REPORTS = 3;
const REPORT_REASONS = ['spam', 'nudity', 'violence', 'harassment', 'ip', 'other'];

// 搜尋字串 → LIKE 用的 pattern；跳脫 % 和 _，避免被當成萬用字元
function likePattern(word) {
  return `%${word.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function searchWords(value) {
  const text = typeof value === 'string' ? value.trim().slice(0, 50) : '';
  return text ? text.split(/\s+/).slice(0, 5) : [];
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function cleanText(value, { max, field, required = false }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new HttpError(400, `請填寫${field}`);
  if (text.length > max) throw new HttpError(400, `${field}不可超過 ${max} 個字`);
  return text;
}

function cleanToolUrl(value) {
  const text = cleanText(value, { max: 500, field: '工具連結' });
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, '工具連結格式不正確');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, '工具連結必須是 http 或 https');
  }
  return url.toString();
}

function parseAiTools(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const byKey = new Map();
  for (const name of raw.split(/[,，#\n]/).map((s) => s.trim().slice(0, 40)).filter(Boolean)) {
    if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  const names = [...byKey.values()];
  if (names.length > 10) throw new HttpError(400, 'AI 工具標籤最多 10 個');
  return names;
}

function sessionToken(req) {
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie).sid;
}

// 開發時允許本機與區網的網址呼叫 API（例如 expo start --web 跑在 8081 埠）
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})(:\d+)?$/;

const STATIC_FILE = /\.(?:html?|js|mjs|css|map|json|txt|xml|ico|png|jpe?g|gif|webp|svg|avif|mp4|mov|webm|woff2?|ttf|otf|webmanifest)$/i;

// webAppDir：App 用 expo export 編譯出的網頁版；publicDir：使用條款等靜態頁
export function createApp({
  db, uploadDir, publicDir, webAppDir, devCors = false, adminUsernames = [], pushSender = expoPushSender,
}) {
  const notifier = createNotifier({ db, pushSender });
  const admins = new Set(adminUsernames.map((u) => u.toLowerCase()));
  fs.mkdirSync(uploadDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  if (devCors) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && DEV_ORIGIN.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') return res.status(204).end();
      }
      next();
    });
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, _file, cb) => cb(null, `tmp-${crypto.randomUUID()}`),
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_MEDIA_PER_POST },
  });
  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, _file, cb) => cb(null, `tmp-${crypto.randomUUID()}`),
    }),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  });

  // ---- 共用查詢 ----
  const q = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userBySession: db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    ),
    postById: db.prepare('SELECT * FROM posts WHERE id = ?'),
    mediaForPost: db.prepare('SELECT filename, kind FROM post_media WHERE post_id = ? ORDER BY position'),
    toolsForPost: db.prepare('SELECT name FROM post_ai_tools WHERE post_id = ? ORDER BY rowid'),
    voteCounts: db.prepare(
      `SELECT COALESCE(SUM(value = 1), 0) AS cool, COALESCE(SUM(value = -1), 0) AS notCool
       FROM votes WHERE post_id = ?`,
    ),
    commentCount: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?'),
    myVote: db.prepare('SELECT value FROM votes WHERE user_id = ? AND post_id = ?'),
    userById: db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?'),
    blocked: db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?'),
  };

  const isAdmin = (user) => Boolean(user && admins.has(user.username.toLowerCase()));

  // 貼文對某位使用者是否可見：被隱藏、作者被封鎖、或自己檢舉過的貼文都不顯示
  function visibleSql(viewer, alias = 'p') {
    if (!viewer) return { sql: ` AND ${alias}.hidden = 0`, params: [] };
    return {
      sql: ` AND (${alias}.user_id = ? OR (${alias}.hidden = 0
        AND ${alias}.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND ${alias}.id NOT IN (SELECT post_id FROM reports WHERE reporter_id = ?)))`,
      params: [viewer.id, viewer.id, viewer.id],
    };
  }

  function canSee(post, viewer) {
    if (viewer && (viewer.id === post.user_id || isAdmin(viewer))) return true;
    if (post.hidden) return false;
    if (!viewer) return true;
    if (q.blocked.get(viewer.id, post.user_id)) return false;
    return !db.prepare('SELECT 1 FROM reports WHERE reporter_id = ? AND post_id = ?').get(viewer.id, post.id);
  }

  function deletePostAndMedia(postId) {
    const media = q.mediaForPost.all(postId);
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    media.forEach((m) => fs.rmSync(path.join(uploadDir, m.filename), { force: true }));
  }

  function publicUser(u) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatarUrl: u.avatar ? `/uploads/${u.avatar}` : null,
    };
  }

  function voteState(postId, viewer) {
    const { cool, notCool } = q.voteCounts.get(postId);
    const mine = viewer ? q.myVote.get(viewer.id, postId)?.value : undefined;
    return {
      coolCount: cool,
      notCoolCount: notCool,
      myVote: mine === 1 ? 'cool' : mine === -1 ? 'notcool' : null,
    };
  }

  function serializePost(post, viewer) {
    return {
      id: post.id,
      title: post.title,
      description: post.description,
      toolUrl: post.tool_url,
      createdAt: post.created_at,
      author: publicUser(q.userById.get(post.user_id)),
      media: q.mediaForPost.all(post.id).map((m) => ({ url: `/uploads/${m.filename}`, kind: m.kind })),
      aiTools: q.toolsForPost.all(post.id).map((t) => t.name),
      ...voteState(post.id, viewer),
      commentCount: q.commentCount.get(post.id).n,
    };
  }

  function getPostOr404(id, viewer) {
    const post = q.postById.get(Number(id));
    if (!post || !canSee(post, viewer)) throw new HttpError(404, '找不到這則貼文');
    return post;
  }

  function getUserOr404(username) {
    const user = q.userByName.get(username);
    if (!user) throw new HttpError(404, '找不到這位使用者');
    return user;
  }

  // ---- 驗證 ----
  app.use((req, _res, next) => {
    const token = sessionToken(req);
    req.user = token ? q.userBySession.get(token) ?? null : null;
    next();
  });

  function requireAuth(req, _res, next) {
    if (!req.user) return next(new HttpError(401, '請先登入'));
    next();
  }

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    res.cookie('sid', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return token;
  }

  app.post('/api/auth/register', (req, res) => {
    const username = cleanText(req.body?.username, { max: 30, field: '帳號', required: true });
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
      throw new HttpError(400, '帳號只能使用英數字、底線或句點，長度 3–30');
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8) throw new HttpError(400, '密碼至少 8 個字元');
    if (req.body?.acceptTerms !== true) throw new HttpError(400, '請先同意使用條款');
    const displayName = cleanText(req.body?.displayName, { max: 50, field: '名稱' }) || username;
    if (q.userByName.get(username)) throw new HttpError(409, '這個帳號已經有人使用');

    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, hashPassword(password));
    const token = startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: publicUser(q.userById.get(lastInsertRowid)), token });
  });

  app.post('/api/auth/login', (req, res) => {
    const user = q.userByName.get(String(req.body?.username ?? ''));
    const password = String(req.body?.password ?? '');
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, '帳號或密碼錯誤');
    }
    const token = startSession(res, user.id);
    res.json({ user: publicUser(user), token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = sessionToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie('sid');
    res.status(204).end();
  });

  app.get('/api/me', (req, res) => {
    res.json({ user: req.user ? { ...publicUser(req.user), isAdmin: isAdmin(req.user) } : null });
  });

  // 刪除帳號（App Store 規定：可以建立帳號的 App 必須能在 App 內刪除帳號）
  app.delete('/api/me', requireAuth, (req, res) => {
    const password = String(req.body?.password ?? '');
    if (!verifyPassword(password, req.user.password_hash)) throw new HttpError(401, '密碼錯誤');
    const files = db.prepare(
      'SELECT m.filename FROM post_media m JOIN posts p ON p.id = m.post_id WHERE p.user_id = ?',
    ).all(req.user.id).map((m) => m.filename);
    if (req.user.avatar) files.push(req.user.avatar);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    files.forEach((f) => fs.rmSync(path.join(uploadDir, f), { force: true }));
    res.clearCookie('sid');
    res.status(204).end();
  });

  // ---- 貼文 ----
  app.get('/api/posts', (req, res) => {
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const following = req.query.feed === 'following';
    if (following && !req.user) throw new HttpError(401, '請先登入');

    const visible = visibleSql(req.user);
    let sql = `SELECT p.* FROM posts p WHERE p.id < ?${visible.sql}`;
    const params = [before, ...visible.params];
    if (tag) {
      sql += ' AND EXISTS (SELECT 1 FROM post_ai_tools t WHERE t.post_id = p.id AND t.name = ?)';
      params.push(tag);
    }
    // 搜尋：每個關鍵字都要出現在工具名稱、介紹、AI 工具標籤或作者名稱其中之一
    for (const word of searchWords(req.query.q)) {
      sql += ` AND (p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM post_ai_tools t WHERE t.post_id = p.id AND t.name LIKE ? ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')))`;
      params.push(...Array(5).fill(likePattern(word)));
    }
    if (following) {
      sql += ' AND (p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))';
      params.push(req.user.id, req.user.id);
    }
    sql += ' ORDER BY p.id DESC LIMIT ?';
    params.push(PAGE_SIZE);

    const posts = db.prepare(sql).all(...params).map((p) => serializePost(p, req.user));
    res.json({ posts, nextBefore: posts.length === PAGE_SIZE ? posts.at(-1).id : null });
  });

  app.get('/api/posts/:id', (req, res) => {
    res.json({ post: serializePost(getPostOr404(req.params.id, req.user), req.user) });
  });

  app.post('/api/posts', requireAuth, upload.array('media', MAX_MEDIA_PER_POST), (req, res) => {
    const files = req.files ?? [];
    const cleanup = () => files.forEach((f) => fs.rmSync(f.path, { force: true }));
    try {
      // YourWowAI 的核心規則：分享一定要附上截圖或影片
      if (files.length === 0) throw new HttpError(400, '分享時一定要附上至少一張截圖或一段影片');

      const title = cleanText(req.body.title, { max: 80, field: '工具名稱', required: true });
      const description = cleanText(req.body.description, { max: 2000, field: '介紹' });
      const toolUrl = cleanToolUrl(req.body.toolUrl);
      const aiTools = parseAiTools(req.body.aiTools);

      const media = files.map((f) => {
        const type = sniffMedia(f.path);
        if (!type) throw new HttpError(400, `「${f.originalname}」不是支援的圖片或影片格式（JPG、PNG、GIF、WebP、MP4、MOV、WebM）`);
        return { file: f, ...type };
      });

      const postId = transaction(db, () => {
        const { lastInsertRowid } = db
          .prepare('INSERT INTO posts (user_id, title, description, tool_url) VALUES (?, ?, ?, ?)')
          .run(req.user.id, title, description, toolUrl);
        const insertMedia = db.prepare(
          'INSERT INTO post_media (post_id, filename, kind, position) VALUES (?, ?, ?, ?)',
        );
        media.forEach((m, i) => {
          const filename = `${crypto.randomUUID()}${m.ext}`;
          fs.renameSync(m.file.path, path.join(uploadDir, filename));
          m.file.path = path.join(uploadDir, filename);
          insertMedia.run(lastInsertRowid, filename, m.kind, i);
        });
        const insertTool = db.prepare('INSERT INTO post_ai_tools (post_id, name) VALUES (?, ?)');
        aiTools.forEach((name) => insertTool.run(lastInsertRowid, name));
        return Number(lastInsertRowid);
      });

      // 通知追蹤我的人
      db.prepare('SELECT follower_id FROM follows WHERE followee_id = ?').all(req.user.id)
        .forEach((f) => notifier.notify(f.follower_id, req.user.id, 'new_post', { postId }));
      res.status(201).json({ post: serializePost(q.postById.get(postId), req.user) });
    } catch (err) {
      cleanup();
      throw err;
    }
  });

  app.delete('/api/posts/:id', requireAuth, (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    if (post.user_id !== req.user.id && !isAdmin(req.user)) throw new HttpError(403, '只能刪除自己的貼文');
    deletePostAndMedia(post.id);
    res.status(204).end();
  });

  app.post('/api/posts/:id/report', requireAuth, (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    if (post.user_id === req.user.id) throw new HttpError(400, '不能檢舉自己的貼文');
    const reason = String(req.body?.reason ?? '');
    if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, '請選擇檢舉原因');
    db.prepare('INSERT OR IGNORE INTO reports (reporter_id, post_id, reason) VALUES (?, ?, ?)')
      .run(req.user.id, post.id, reason);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE post_id = ?').get(post.id);
    if (n >= AUTO_HIDE_REPORTS) db.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').run(post.id);
    res.status(201).json({ ok: true });
  });

  // 投 Cool 或 Not Cool（再投另一種會改票）
  app.put('/api/posts/:id/vote', requireAuth, (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    const value = { cool: 1, notcool: -1 }[req.body?.vote];
    if (!value) throw new HttpError(400, '請選擇 Cool 或 Not Cool');
    db.prepare(
      'INSERT INTO votes (user_id, post_id, value) VALUES (?, ?, ?) ON CONFLICT (user_id, post_id) DO UPDATE SET value = excluded.value',
    ).run(req.user.id, post.id, value);
    if (value === 1) notifier.notify(post.user_id, req.user.id, 'cool', { postId: post.id });
    res.json(voteState(post.id, req.user));
  });

  app.delete('/api/posts/:id/vote', requireAuth, (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    db.prepare('DELETE FROM votes WHERE user_id = ? AND post_id = ?').run(req.user.id, post.id);
    res.json(voteState(post.id, req.user));
  });

  app.get('/api/posts/:id/comments', (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    const rows = db.prepare(
      `SELECT c.id, c.body, c.created_at, u.id AS uid, u.username, u.display_name, u.avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
       ORDER BY c.id`,
    ).all(post.id, req.user?.id ?? 0);
    res.json({
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at,
        author: publicUser({ id: r.uid, username: r.username, display_name: r.display_name, avatar: r.avatar }),
      })),
    });
  });

  app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
    const post = getPostOr404(req.params.id, req.user);
    const body = cleanText(req.body?.body, { max: 1000, field: '留言', required: true });
    const { lastInsertRowid } = db
      .prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)')
      .run(post.id, req.user.id, body);
    notifier.notify(post.user_id, req.user.id, 'comment', { postId: post.id, text: body });
    res.status(201).json({
      comment: { id: Number(lastInsertRowid), body, author: publicUser(req.user) },
    });
  });

  // ---- 使用者 ----
  // 搜尋 Cooler：帳號或名稱
  app.get('/api/users', (req, res) => {
    const words = searchWords(req.query.q);
    if (!words.length) return res.json({ users: [] });
    let sql = 'SELECT * FROM users u WHERE 1 = 1';
    const params = [];
    for (const word of words) {
      sql += " AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')";
      params.push(likePattern(word), likePattern(word));
    }
    if (req.user) {
      sql += ' AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)';
      params.push(req.user.id);
    }
    // 帳號完全符合的排最前面，其次是作品多的
    sql += ' ORDER BY (lower(u.username) = lower(?)) DESC, (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.hidden = 0) DESC, u.id LIMIT 10';
    params.push(words.join(' '));
    res.json({ users: db.prepare(sql).all(...params).map(publicUser) });
  });

  app.get('/api/users/:username', (req, res) => {
    const user = getUserOr404(req.params.username);
    const count = (sql) => db.prepare(sql).get(user.id).n;
    const blockedByMe = req.user ? Boolean(q.blocked.get(req.user.id, user.id)) : false;
    const visible = visibleSql(req.user);
    const posts = blockedByMe ? [] : db.prepare(
      `SELECT p.* FROM posts p WHERE p.user_id = ?${visible.sql} ORDER BY p.id DESC`,
    ).all(user.id, ...visible.params);
    res.json({
      user: {
        ...publicUser(user),
        bio: user.bio,
        contacts: serializeContacts(user.contacts),
        postCount: posts.length,
        followerCount: count('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?'),
        followingCount: count('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?'),
        blockedByMe,
        followedByMe: req.user
          ? Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, user.id))
          : false,
      },
      posts: posts.map((p) => serializePost(p, req.user)),
    });
  });

  app.patch('/api/me', requireAuth, (req, res) => {
    const displayName = cleanText(req.body?.displayName, { max: 50, field: '名稱', required: true });
    const bio = cleanText(req.body?.bio, { max: 300, field: '自我介紹' });
    // 沒送 contacts 就保留原本的
    const contacts = cleanContacts(req.body?.contacts);
    db.prepare('UPDATE users SET display_name = ?, bio = ?, contacts = ? WHERE id = ?')
      .run(displayName, bio, contacts ? JSON.stringify(contacts) : req.user.contacts, req.user.id);
    res.json({ user: publicUser(q.userById.get(req.user.id)) });
  });

  // 上傳或更換大頭貼（只接受圖片，5MB 以內）
  app.put('/api/me/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, '請選擇一張圖片');
    const type = sniffMedia(file.path);
    if (type?.kind !== 'image') {
      fs.rmSync(file.path, { force: true });
      throw new HttpError(400, '大頭貼只能是 JPG、PNG、GIF 或 WebP 圖片');
    }
    const filename = `avatar-${crypto.randomUUID()}${type.ext}`;
    fs.renameSync(file.path, path.join(uploadDir, filename));
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(filename, req.user.id);
    if (req.user.avatar) fs.rmSync(path.join(uploadDir, req.user.avatar), { force: true });
    res.json({ user: publicUser(q.userById.get(req.user.id)) });
  });

  app.delete('/api/me/avatar', requireAuth, (req, res) => {
    if (req.user.avatar) {
      db.prepare("UPDATE users SET avatar = '' WHERE id = ?").run(req.user.id);
      fs.rmSync(path.join(uploadDir, req.user.avatar), { force: true });
    }
    res.json({ user: publicUser(q.userById.get(req.user.id)) });
  });

  app.post('/api/users/:username/follow', requireAuth, (req, res) => {
    const target = getUserOr404(req.params.username);
    if (target.id === req.user.id) throw new HttpError(400, '不能追蹤自己');
    if (q.blocked.get(req.user.id, target.id) || q.blocked.get(target.id, req.user.id)) {
      throw new HttpError(403, '無法追蹤這位使用者');
    }
    const { changes } = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)').run(req.user.id, target.id);
    if (changes) notifier.notify(target.id, req.user.id, 'follow');
    res.json({ followedByMe: true });
  });

  app.delete('/api/users/:username/follow', requireAuth, (req, res) => {
    const target = getUserOr404(req.params.username);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, target.id);
    res.json({ followedByMe: false });
  });

  app.post('/api/users/:username/block', requireAuth, (req, res) => {
    const target = getUserOr404(req.params.username);
    if (target.id === req.user.id) throw new HttpError(400, '不能封鎖自己');
    transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(req.user.id, target.id);
      db.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)')
        .run(req.user.id, target.id, target.id, req.user.id);
    });
    res.json({ blockedByMe: true });
  });

  app.delete('/api/users/:username/block', requireAuth, (req, res) => {
    const target = getUserOr404(req.params.username);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, target.id);
    res.json({ blockedByMe: false });
  });

  // 管理員：查看被檢舉的貼文（App Store 要求開發者處理檢舉）
  app.get('/api/admin/reports', requireAuth, (req, res) => {
    if (!isAdmin(req.user)) throw new HttpError(403, '需要管理員權限');
    const rows = db.prepare(
      `SELECT p.*, COUNT(r.reporter_id) AS report_count, GROUP_CONCAT(DISTINCT r.reason) AS reasons
       FROM reports r JOIN posts p ON p.id = r.post_id
       GROUP BY p.id ORDER BY report_count DESC, p.id DESC LIMIT 100`,
    ).all();
    res.json({
      reports: rows.map((r) => ({
        post: serializePost(r, req.user),
        reportCount: r.report_count,
        reasons: r.reasons.split(','),
        hidden: Boolean(r.hidden),
      })),
    });
  });

  // 管理員：檢舉不成立時恢復貼文
  app.post('/api/admin/posts/:id/restore', requireAuth, (req, res) => {
    if (!isAdmin(req.user)) throw new HttpError(403, '需要管理員權限');
    const post = getPostOr404(req.params.id, req.user);
    transaction(db, () => {
      db.prepare('DELETE FROM reports WHERE post_id = ?').run(post.id);
      db.prepare('UPDATE posts SET hidden = 0 WHERE id = ?').run(post.id);
    });
    res.json({ ok: true });
  });

  // ---- 通知 ----
  app.get('/api/notifications', requireAuth, (req, res) => {
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = db.prepare(
      `SELECT n.*, u.username, u.display_name, u.avatar, p.title AS post_title,
         (SELECT filename FROM post_media m WHERE m.post_id = n.post_id AND m.kind = 'image' ORDER BY position LIMIT 1) AS thumb
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON p.id = n.post_id
       WHERE n.user_id = ? AND n.id < ?
         AND n.actor_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = n.user_id)
       ORDER BY n.id DESC LIMIT 30`,
    ).all(req.user.id, before);
    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      read: Boolean(r.read_at),
      createdAt: r.created_at,
      actor: publicUser({ id: r.actor_id, username: r.username, display_name: r.display_name, avatar: r.avatar }),
      postId: r.post_id,
      thumbnailUrl: r.thumb ? `/uploads/${r.thumb}` : null,
      message: notificationText({ type: r.type, actorName: r.display_name || r.username, postTitle: r.post_title ?? '', text: r.text }),
      link: notificationLink({ type: r.type, actorUsername: r.username, postId: r.post_id }),
    }));
    res.json({
      notifications,
      unreadCount: notifier.unreadCount(req.user.id),
      nextBefore: rows.length === 30 ? rows.at(-1).id : null,
    });
  });

  app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
    res.json({ unreadCount: notifier.unreadCount(req.user.id) });
  });

  app.post('/api/notifications/read', requireAuth, (req, res) => {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
    notifier.broadcast(req.user.id);
    res.json({ unreadCount: 0 });
  });

  // 網頁版即時更新：Server-Sent Events，有新通知就推送未讀數
  app.get('/api/notifications/stream', requireAuth, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    notifier.subscribe(req.user.id, res);
  });

  // iPhone 推播：登入後登記，登出前移除
  app.post('/api/push-tokens', requireAuth, (req, res) => {
    const token = String(req.body?.token ?? '');
    if (!PUSH_TOKEN.test(token)) throw new HttpError(400, '推播 token 格式不正確');
    db.prepare(
      'INSERT INTO push_tokens (token, user_id) VALUES (?, ?) ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id',
    ).run(token, req.user.id);
    res.status(204).end();
  });

  app.delete('/api/push-tokens', requireAuth, (req, res) => {
    db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(String(req.body?.token ?? ''), req.user.id);
    res.status(204).end();
  });

  // 熱門 AI 工具標籤（探索頁）
  app.get('/api/tags', (_req, res) => {
    const tags = db.prepare(
      `SELECT t.name, COUNT(*) AS count FROM post_ai_tools t JOIN posts p ON p.id = t.post_id
       WHERE p.hidden = 0 GROUP BY t.name ORDER BY count DESC, t.name LIMIT 30`,
    ).all();
    res.json({ tags: tags.map((t) => ({ name: t.name, count: t.count })) });
  });

  // ---- 靜態檔案 ----
  app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      const type = MEDIA_TYPES[path.extname(filePath)];
      if (type) res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/uploads', (_req, _res, next) => next(new HttpError(404, '找不到檔案')));
  if (webAppDir) app.use(express.static(webAppDir));
  if (publicDir) app.use(express.static(publicDir));

  // 網頁版是單頁應用：/post/3、/user/amy 這類網址都回傳 App 的 index.html，交給前端路由
  if (webAppDir) {
    const indexHtml = path.join(webAppDir, 'index.html');
    app.use((req, res, next) => {
      // 帳號可以有「.」（例如 /user/kai.builds），所以只有真正的靜態檔副檔名才當成檔案
      const isPage = (req.method === 'GET' || req.method === 'HEAD')
        && !req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')
        && !STATIC_FILE.test(req.path);
      if (!isPage) return next();
      if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
      res.status(503).type('html').send(
        '<meta charset="utf-8"><p style="font-family:sans-serif">網頁版還沒有建置，請先執行 <code>npm run build:web</code>。</p>',
      );
    });
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, '找不到這個 API')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError && req.path === '/api/me/avatar') {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '大頭貼不可超過 5MB' : '一次只能上傳一張大頭貼' });
    }
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: '單一檔案不可超過 100MB',
        LIMIT_FILE_COUNT: `每則分享最多 ${MAX_MEDIA_PER_POST} 個檔案`,
        LIMIT_UNEXPECTED_FILE: `每則分享最多 ${MAX_MEDIA_PER_POST} 個檔案`,
      };
      return res.status(400).json({ error: messages[err.code] ?? '上傳失敗' });
    }
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? '伺服器發生錯誤' : err.message });
  });

  return app;
}
