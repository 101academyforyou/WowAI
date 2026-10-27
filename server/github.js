// GitHub 專案連結：接受 owner/repo 或 github.com 的網址，統一存成 https://github.com/owner/repo

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseGitHubRepo(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || /^(www\.)?github\.com\//i.test(value)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'github.com') return null;
    value = url.pathname.replace(/^\/+/, '');
  }
  const [owner, rawRepo] = value.split('/');
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

// GitHub 星星數：在背景向 GitHub 查詢並存進資料庫，同一個專案 6 小時內只查一次。
// 動態牆一次顯示很多貼文，不能每次都問 GitHub（沒有權杖時每小時只能查 60 次）。
const STARS_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;
const MAX_IN_FLIGHT = 4;
// 有人按了「到 GitHub 按星」回來後立刻重新查詢；同一個專案至少間隔幾秒，避免被拿來狂打 GitHub
const MANUAL_REFRESH_GAP_MS = 5000;

export function createStarCache({ db, fetch, token }) {
  const get = db.prepare('SELECT stars, checked_at FROM repo_stars WHERE repo = ?');
  const save = db.prepare(
    "INSERT INTO repo_stars (repo, stars, checked_at) VALUES (?, ?, datetime('now')) ON CONFLICT (repo) DO UPDATE SET stars = excluded.stars, checked_at = excluded.checked_at",
  );
  const inFlight = new Map(); // repo → 進行中的查詢
  const lastManual = new Map(); // repo → 上次手動重新查詢的時間
  let pausedUntil = 0;

  const keyOf = (url) => {
    const repo = parseGitHubRepo(url);
    return repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : null;
  };

  function refresh(key) {
    if (!inFlight.has(key)) inFlight.set(key, query(key).finally(() => inFlight.delete(key)));
    return inFlight.get(key);
  }

  async function query(key) {
    try {
      const res = await fetch(`https://api.github.com/repos/${key}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'YourWowAI', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 403 || res.status === 429) {
        pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
        return;
      }
      if (res.status === 404) return save.run(key, null);
      if (!res.ok) return;
      const data = await res.json();
      save.run(key, Number.isFinite(data.stargazers_count) ? data.stargazers_count : null);
    } catch {
      // 網路錯誤：下次再試
    }
  }

  return {
    // 回傳目前存著的星星數（不知道就是 null），過期的話在背景更新
    stars(url) {
      const key = keyOf(url);
      if (!key) return null;
      const row = get.get(key);
      const stale = !row || Date.now() - Date.parse(`${row.checked_at.replace(' ', 'T')}Z`) > STARS_TTL_MS;
      if (fetch && stale && !inFlight.has(key) && inFlight.size < MAX_IN_FLIGHT && Date.now() >= pausedUntil) refresh(key);
      return row ? row.stars : null;
    },
    // 馬上向 GitHub 重新查詢（例如使用者剛去 GitHub 按了星），回傳最新的星星數
    async refreshNow(url) {
      const key = keyOf(url);
      if (!key) return null;
      const last = lastManual.get(key) ?? 0;
      if (fetch && Date.now() - last >= MANUAL_REFRESH_GAP_MS && Date.now() >= pausedUntil) {
        lastManual.set(key, Date.now());
        await refresh(key);
      } else if (inFlight.has(key)) {
        await inFlight.get(key);
      }
      return get.get(key)?.stars ?? null;
    },
  };
}
