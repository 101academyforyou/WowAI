import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, type User } from './api';

export type OAuthProvider = 'github' | 'google';
export type Providers = { github: boolean; google: boolean; apple: boolean };
export const PROVIDER_LABEL = { github: 'GitHub', google: 'Google', apple: 'Apple' } as const;

// 伺服器導回來時帶的結果：登入代碼、綁定成功、錯誤或使用者取消
export type OAuthResult = { code?: string; linked?: string; error?: string; cancelled?: boolean };

export function fetchProviders() {
  return api<Providers>('/api/auth/providers');
}

function one(value: unknown) {
  return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

export function parseOAuthResult(params: Record<string, unknown>): OAuthResult {
  return { code: one(params.code), linked: one(params.linked), error: one(params.error), cancelled: one(params.cancelled) === '1' };
}

// GitHub／Google 登入或綁定。網頁版會整頁跳轉（結果由 /auth 頁處理，這裡回傳 null）；
// iPhone 開系統的登入視窗，登入完回到 yourwowai://auth
export async function startOAuth(provider: OAuthProvider, { link = false } = {}): Promise<OAuthResult | null> {
  const { url } = await api<{ url: string }>(`/api/auth/oauth/${provider}/start`, {
    method: 'POST',
    body: { client: Platform.OS === 'web' ? 'web' : 'app', link },
  });
  if (Platform.OS === 'web') {
    globalThis.location.assign(url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, 'yourwowai://auth');
  if (result.type !== 'success') return { cancelled: true };
  return parseOAuthResult(Linking.parse(result.url).queryParams ?? {});
}

export function exchangeCode(code: string) {
  return api<{ user: User; token: string }>('/api/auth/oauth/exchange', { method: 'POST', body: { code } });
}
