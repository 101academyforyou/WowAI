// 第三方登入：GitHub、Google（網頁 OAuth 流程）與 Sign in with Apple（iPhone 原生，驗證 identity token）
import crypto from 'node:crypto';

export const OAUTH_PROVIDERS = ['github', 'google'];

// 每個服務：登入網址、用授權碼換使用者資料
const PROVIDERS = {
  github: {
    authorizeUrl({ clientId, redirectUri, state }) {
      const u = new URL('https://github.com/login/oauth/authorize');
      u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'read:user', state, allow_signup: 'true' });
      return u.toString();
    },
    async profile({ clientId, clientSecret, redirectUri, code, fetch }) {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      });
      const { access_token: accessToken } = await tokenRes.json();
      if (!accessToken) throw new Error('GitHub token exchange failed');
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'YourWowAI' },
      });
      if (!userRes.ok) throw new Error('GitHub profile request failed');
      const u = await userRes.json();
      return { subject: String(u.id), login: u.login, usernameHint: u.login, displayName: u.name || u.login, avatarUrl: u.avatar_url };
    },
  },
  google: {
    authorizeUrl({ clientId, redirectUri, state }) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
      });
      return u.toString();
    },
    async profile({ clientId, clientSecret, redirectUri, code, fetch }) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const { access_token: accessToken } = await tokenRes.json();
      if (!accessToken) throw new Error('Google token exchange failed');
      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!userRes.ok) throw new Error('Google profile request failed');
      const u = await userRes.json();
      // email 只在 Google 驗證過時才帶出來（用來比對管理員，一般使用者不會存）
      return { subject: String(u.sub), usernameHint: (u.email ?? '').split('@')[0], displayName: u.name || '', avatarUrl: u.picture, email: u.email_verified === true ? u.email : '' };
    },
  },
};

export function authorizeUrl(provider, options) {
  return PROVIDERS[provider].authorizeUrl(options);
}

export function fetchProfile(provider, options) {
  return PROVIDERS[provider].profile(options);
}

// ---- Sign in with Apple：用 Apple 公開金鑰驗證 iPhone 傳來的 identity token（JWT, RS256）----
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

function base64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function createAppleVerifier({ audiences, fetch }) {
  let cache = { keys: [], at: 0 };

  async function keyFor(kid) {
    const fresh = Date.now() - cache.at < 60 * 60 * 1000;
    let jwk = fresh ? cache.keys.find((k) => k.kid === kid) : undefined;
    if (!jwk) {
      // 金鑰會輪替：找不到時重新抓一次
      const res = await fetch(APPLE_KEYS_URL);
      cache = { keys: (await res.json()).keys ?? [], at: Date.now() };
      jwk = cache.keys.find((k) => k.kid === kid);
    }
    return jwk ? crypto.createPublicKey({ key: jwk, format: 'jwk' }) : null;
  }

  // 回傳 { subject, email } 或 null（驗證失敗）
  return async function verify(identityToken) {
    const parts = typeof identityToken === 'string' ? identityToken.split('.') : [];
    if (parts.length !== 3) return null;
    let header;
    let payload;
    try {
      header = base64urlJson(parts[0]);
      payload = base64urlJson(parts[1]);
    } catch {
      return null;
    }
    if (header.alg !== 'RS256') return null;
    const key = await keyFor(header.kid);
    if (!key) return null;
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== APPLE_ISSUER || !aud.some((a) => audiences.includes(a))) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (!payload.sub) return null;
    return { subject: String(payload.sub), email: typeof payload.email === 'string' ? payload.email : '' };
  };
}

// 從第三方帳號名稱產生 YourWowAI 帳號（英數字、底線、句點，3–30 字），重複時加數字
export function suggestUsername(hint, isTaken) {
  let base = String(hint ?? '').replace(/-/g, '_').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 24);
  if (base.length < 3) base = `builder${base}`;
  if (!isTaken(base)) return base;
  for (let i = 0; i < 50; i += 1) {
    const candidate = `${base.slice(0, 24)}${crypto.randomInt(10, 99999)}`;
    if (!isTaken(candidate)) return candidate;
  }
  return `builder${crypto.randomBytes(6).toString('hex')}`;
}
