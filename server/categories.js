// 應用領域分類：讓不同興趣的人找到想看的作品。顯示名稱與圖示在 App 的 mobile/src/lib/categories.ts。
export const CATEGORIES = [
  'education', 'productivity', 'work', 'finance', 'health', 'lifestyle',
  'marketing', 'design', 'developer', 'data', 'games', 'other',
];

export const MAX_CATEGORIES = 10;

// 'education, games' → ['education', 'games']；依固定順序排列、去除重複
export function parseCategories(value) {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value.join(',') : '';
  const slugs = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (slugs.some((s) => !CATEGORIES.includes(s))) throw Object.assign(new Error('不支援的分類'), { status: 400 });
  if (slugs.length > MAX_CATEGORIES) throw Object.assign(new Error(`分類最多 ${MAX_CATEGORIES} 個`), { status: 400 });
  return CATEGORIES.filter((c) => slugs.includes(c));
}
