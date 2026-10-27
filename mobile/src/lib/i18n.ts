// 介面語言
// - iPhone：跟著手機語言，中文就顯示中文，其他語言一律英文
// - 網頁版：預設英文，右上角可以切換中文（記在瀏覽器）
// 用法：tr('中文', 'English')，兩種語言寫在一起，改文案時不會漏掉另一邊。
import { Platform } from 'react-native';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'yourwowai.lang';
const SITE = 'https://101academyforyou.github.io/YourWowAI/';

function deviceLocale(): string {
  const nav = globalThis.navigator as { language?: string } | undefined;
  if (nav?.language) return nav.language;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'zh-TW';
  }
}

function webChoice(): Lang | null {
  if (Platform.OS !== 'web') return null;
  try {
    // 官方網站的中文頁會用 ?lang=zh 連過來，記下這個選擇
    const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
    if (fromUrl === 'zh' || fromUrl === 'en') globalThis.localStorage?.setItem(STORAGE_KEY, fromUrl);
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === 'zh' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

function initialLang(): Lang {
  if (Platform.OS === 'web') return webChoice() ?? 'en';
  return deviceLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const lang: Lang = initialLang();

if (Platform.OS === 'web' && globalThis.document) {
  globalThis.document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
}

// 網頁版切換語言：記下選擇後重新載入
export function setWebLang(next: Lang) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // 無痕模式等情況存不了，至少這次切換有效
  }
  globalThis.location?.reload();
}

export function tr(zh: string, en: string) {
  return lang === 'zh' ? zh : en;
}

// 英文單複數：plural(3, 'comment') → '3 comments'
export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

// 使用條款、隱私權政策等頁面放在官方網站，依語言開對應版本
export function siteDoc(page: 'terms' | 'privacy' | 'support') {
  return `${SITE}${lang === 'zh' ? 'zh/' : ''}${page}.html`;
}
