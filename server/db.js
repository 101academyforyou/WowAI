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

    -- 第三方登入（github、google、apple）綁定的帳號；一個 YourWowAI 帳號可以綁多個
    CREATE TABLE IF NOT EXISTS user_identities (
      provider   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, subject)
    );
    CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);

    -- OAuth 進行中的請求（防 CSRF 的 state），10 分鐘內有效；user_id 有值代表是「綁定」而不是登入
    CREATE TABLE IF NOT EXISTS oauth_states (
      state      TEXT PRIMARY KEY,
      provider   TEXT NOT NULL,
      client     TEXT NOT NULL CHECK (client IN ('web', 'app')),
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 第三方登入成功後的一次性代碼，App／網頁用它換登入權杖，5 分鐘內有效
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code       TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AI Webhook：每人一組專屬網址，讓 AI 或自動化工具代為發文。只存權杖的 SHA-256，hint 是末四碼方便辨認
    CREATE TABLE IF NOT EXISTS webhooks (
      user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      hint         TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    -- 作品 GitHub 專案的星星數快取（repo 是小寫的 owner/repo；stars 為 NULL 代表找不到）
    CREATE TABLE IF NOT EXISTS repo_stars (
      repo       TEXT PRIMARY KEY,
      stars      INTEGER,
      checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tool_url    TEXT NOT NULL DEFAULT '',
      github_url  TEXT NOT NULL DEFAULT '',
      youtube_url TEXT NOT NULL DEFAULT '',
      category_other TEXT NOT NULL DEFAULT '',
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

    -- 應用領域分類（教育、理財、遊戲…），每則最多 3 個
    CREATE TABLE IF NOT EXISTS post_categories (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      slug    TEXT NOT NULL,
      PRIMARY KEY (post_id, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_post_categories_slug ON post_categories(slug);

    -- 在 YourWowAI 裡轉分享別人的作品，會顯示在自己個人頁的「分享」分頁
    CREATE TABLE IF NOT EXISTS reposts (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, post_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reposts_post ON reposts(post_id);

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      edited_at  TEXT
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

    -- 通知分頁：誰對你做了什麼（cool、comment、follow、new_post、repost）
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK (type IN ('cool', 'comment', 'follow', 'new_post', 'repost')),
      post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      text       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at    TEXT
    );

    -- iPhone 的 Expo 推播位址，一個帳號可以有多台裝置
    CREATE TABLE IF NOT EXISTS push_tokens (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lang       TEXT NOT NULL DEFAULT 'zh',
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
  if (!postColumns.includes('github_url')) {
    // 作品的 GitHub 專案，例如 https://github.com/amy/ai-ledger
    db.exec("ALTER TABLE posts ADD COLUMN github_url TEXT NOT NULL DEFAULT ''");
  }
  const tokenColumns = db.prepare('PRAGMA table_info(push_tokens)').all().map((c) => c.name);
  if (!tokenColumns.includes('lang')) {
    // 推播語言：zh 或 en，依裝置登記時的 App 語言
    db.exec("ALTER TABLE push_tokens ADD COLUMN lang TEXT NOT NULL DEFAULT 'zh'");
  }
  if (!postColumns.includes('youtube_url')) {
    // 示範影片的 YouTube 連結，例如 https://www.youtube.com/watch?v=dQw4w9WgXcQ
    db.exec("ALTER TABLE posts ADD COLUMN youtube_url TEXT NOT NULL DEFAULT ''");
  }
  if (!postColumns.includes('category_other')) {
    // 選「其他」分類時，使用者自己填的領域名稱，例如「烹飪」
    db.exec("ALTER TABLE posts ADD COLUMN category_other TEXT NOT NULL DEFAULT ''");
  }
  const identityColumns = db.prepare('PRAGMA table_info(user_identities)').all().map((c) => c.name);
  if (!identityColumns.includes('username')) {
    // 第三方帳號的名稱（例如 GitHub 的 login），用來列出自己的 GitHub 專案
    db.exec("ALTER TABLE user_identities ADD COLUMN username TEXT NOT NULL DEFAULT ''");
  }
  const commentColumns = db.prepare('PRAGMA table_info(comments)').all().map((c) => c.name);
  if (!commentColumns.includes('edited_at')) {
    // 留言最後編輯時間，NULL 代表沒改過
    db.exec('ALTER TABLE comments ADD COLUMN edited_at TEXT');
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
  // 舊資料庫的通知類型不含 repost：SQLite 不能改 CHECK，只能重建資料表
  const notificationsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get().sql;
  if (!notificationsSql.includes("'repost'")) {
    transaction(db, () => {
      db.exec(`ALTER TABLE notifications RENAME TO notifications_old`);
      db.exec(notificationsSql.replace("'new_post')", "'new_post', 'repost')"));
      db.exec('INSERT INTO notifications SELECT * FROM notifications_old');
      db.exec('DROP TABLE notifications_old');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC)');
    });
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
