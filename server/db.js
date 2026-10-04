import { DatabaseSync } from 'node:sqlite';

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      bio           TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tool_url    TEXT NOT NULL DEFAULT '',
      hidden      INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 每則貼文至少一個媒體（截圖或影片），由 API 層強制
    CREATE TABLE IF NOT EXISTS post_media (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      kind     TEXT NOT NULL CHECK (kind IN ('image', 'video')),
      position INTEGER NOT NULL
    );

    -- 開發這個工具時用到的 AI（例如 Claude、Cursor、v0）
    CREATE TABLE IF NOT EXISTS post_ai_tools (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      name    TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY (post_id, name)
    );

    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (follower_id, followee_id)
    );

    -- 檢舉與封鎖：App Store 對使用者生成內容（UGC）的要求
    CREATE TABLE IF NOT EXISTS reports (
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      reason      TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (reporter_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_media_post ON post_media(post_id, position);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);
    CREATE INDEX IF NOT EXISTS idx_ai_tools_name ON post_ai_tools(name);
  `);

  // 舊資料庫升級
  const postColumns = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
  if (!postColumns.includes('hidden')) {
    db.exec('ALTER TABLE posts ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
