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

    -- 每人對每則貼文最多一票：1 = Cool，-1 = Not Cool
    CREATE TABLE IF NOT EXISTS votes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      value   INTEGER NOT NULL CHECK (value IN (1, -1)),
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

    -- 通知分頁：誰對你做了什麼（cool、comment、follow、new_post）
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK (type IN ('cool', 'comment', 'follow', 'new_post')),
      post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      text       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at    TEXT
    );

    -- iPhone 的 Expo 推播位址，一個帳號可以有多台裝置
    CREATE TABLE IF NOT EXISTS push_tokens (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
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
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('avatar')) {
    // 大頭貼檔名（存在 uploads 資料夾），空字串代表沒有
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
  }
  if (!userColumns.includes('contacts')) {
    // 「聯繫我」的社群／通訊方式，JSON 物件，例如 {"instagram":"amy"}
    db.exec("ALTER TABLE users ADD COLUMN contacts TEXT NOT NULL DEFAULT '{}'");
  }
  // 舊版的「愛心」改成 Cool 票
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'likes'").get()) {
    transaction(db, () => {
      db.exec('INSERT OR IGNORE INTO votes (user_id, post_id, value) SELECT user_id, post_id, 1 FROM likes');
      db.exec('DROP TABLE likes');
    });
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
