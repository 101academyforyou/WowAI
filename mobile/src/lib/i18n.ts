// 介面語言：手機（或瀏覽器）設定是中文就顯示中文，其他語言一律顯示英文。
// 用法：tr('中文', 'English')，兩種語言寫在一起，改文案時不會漏掉另一邊。

function deviceLocale(): string {
  const nav = globalThis.navigator as { language?: string } | undefined;
  if (nav?.language) return nav.language;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'zh-TW';
  }
}

export type Lang = 'zh' | 'en';

export const lang: Lang = deviceLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en';

export function tr(zh: string, en: string) {
  return lang === 'zh' ? zh : en;
}

// 英文單複數：plural(3, 'comment') → '3 comments'
export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}
