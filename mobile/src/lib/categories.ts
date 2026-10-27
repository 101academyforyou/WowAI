// 應用領域分類（和伺服器 server/categories.js 的順序一致）
import type { Ionicons } from '@expo/vector-icons';
import { tr } from './i18n';

export type Category = { slug: string; icon: keyof typeof Ionicons.glyphMap; label: string };

export const CATEGORIES: Category[] = [
  { slug: 'education', icon: 'school-outline', label: tr('教育學習', 'Education') },
  { slug: 'productivity', icon: 'checkmark-done-outline', label: tr('效率工具', 'Productivity') },
  { slug: 'work', icon: 'briefcase-outline', label: tr('職場商業', 'Work & Business') },
  { slug: 'finance', icon: 'wallet-outline', label: tr('理財記帳', 'Finance') },
  { slug: 'health', icon: 'fitness-outline', label: tr('健康運動', 'Health & Fitness') },
  { slug: 'lifestyle', icon: 'cafe-outline', label: tr('生活日常', 'Lifestyle') },
  { slug: 'marketing', icon: 'megaphone-outline', label: tr('行銷社群', 'Marketing') },
  { slug: 'design', icon: 'color-palette-outline', label: tr('設計創作', 'Design & Creative') },
  { slug: 'developer', icon: 'code-slash-outline', label: tr('開發工具', 'Developer Tools') },
  { slug: 'data', icon: 'bar-chart-outline', label: tr('資料分析', 'Data & Analytics') },
  { slug: 'games', icon: 'game-controller-outline', label: tr('遊戲娛樂', 'Games & Fun') },
  { slug: 'other', icon: 'apps-outline', label: tr('其他', 'Other') },
];

export const MAX_CATEGORIES = 3;

export function categoryOf(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}
