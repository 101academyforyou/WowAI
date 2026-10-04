// 「聯繫我」：使用者在個人頁公開的社群／通訊方式。
// 可以填帳號（例如 @amy）或貼上完整網址，伺服器會驗證並轉成可點的連結。

const HANDLE = /^@?[A-Za-z0-9._]{1,50}$/;

function parseUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function hostMatches(url, hosts) {
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  return hosts.includes(host);
}

// 社群平台：帳號 → 個人頁網址；網址則必須是該平台的網域
function social({ label, hosts, profileUrl }) {
  return {
    label,
    toUrl(value) {
      if (/^https?:\/\//i.test(value)) {
        const url = parseUrl(value);
        return url && hostMatches(url, hosts) ? url.toString() : null;
      }
      return HANDLE.test(value) ? profileUrl(value.replace(/^@/, '')) : null;
    },
    error: `請輸入 ${label} 帳號或 ${hosts[0]} 的網址`,
  };
}

export const CONTACT_TYPES = {
  facebook: social({ label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'], profileUrl: (h) => `https://www.facebook.com/${h}` }),
  instagram: social({ label: 'Instagram', hosts: ['instagram.com'], profileUrl: (h) => `https://www.instagram.com/${h}` }),
  threads: social({ label: 'Threads', hosts: ['threads.net', 'threads.com'], profileUrl: (h) => `https://www.threads.net/@${h}` }),
  line: {
    label: 'LINE',
    toUrl(value) {
      if (/^https?:\/\//i.test(value)) {
        const url = parseUrl(value);
        return url && hostMatches(url, ['line.me', 'lin.ee']) ? url.toString() : null;
      }
      // @ 開頭是官方帳號，其他是個人 LINE ID
      if (/^@[A-Za-z0-9._-]{1,40}$/.test(value)) return `https://line.me/R/ti/p/${encodeURIComponent(value)}`;
      if (/^[A-Za-z0-9._-]{1,40}$/.test(value)) return `https://line.me/ti/p/~${value}`;
      return null;
    },
    error: '請輸入 LINE ID 或 line.me 的加好友網址',
  },
  email: {
    label: 'Email',
    toUrl: (value) => (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? `mailto:${value}` : null),
    error: 'Email 格式不正確',
  },
  x: social({ label: 'X', hosts: ['x.com', 'twitter.com'], profileUrl: (h) => `https://x.com/${h}` }),
  website: {
    label: '個人網站',
    toUrl: (value) => parseUrl(value)?.toString() ?? null,
    error: '個人網站必須是 http 或 https 開頭的網址',
  },
};

// 驗證使用者送來的 { facebook: '...', ... }，回傳要存的物件；空字串代表刪除
export function cleanContacts(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('聯繫方式格式不正確'), { status: 400 });
  const result = {};
  for (const [type, raw] of Object.entries(input)) {
    const def = CONTACT_TYPES[type];
    if (!def) throw Object.assign(new Error('不支援的聯繫方式'), { status: 400 });
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    if (value.length > 200 || !def.toUrl(value)) throw Object.assign(new Error(def.error), { status: 400 });
    result[type] = value;
  }
  return result;
}

// 依固定順序輸出 [{ type, label, value, url }]
export function serializeContacts(json) {
  let stored = {};
  try {
    stored = JSON.parse(json || '{}');
  } catch {
    // 壞掉的資料當作沒有
  }
  return Object.entries(CONTACT_TYPES)
    .filter(([type]) => typeof stored[type] === 'string' && stored[type])
    .map(([type, def]) => ({ type, label: def.label, value: stored[type], url: def.toUrl(stored[type]) }))
    .filter((c) => c.url);
}
