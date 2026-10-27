// 「用了哪些 AI 開發」的常用選項（分享時點選），其他工具可以自己輸入
import type { Ionicons } from '@expo/vector-icons';

export type AiTool = { name: string; icon: keyof typeof Ionicons.glyphMap };

export const AI_TOOLS: AiTool[] = [
  { name: 'Claude', icon: 'sparkles-outline' },
  { name: 'Claude Code', icon: 'terminal-outline' },
  { name: 'ChatGPT', icon: 'chatbubbles-outline' },
  { name: 'Codex', icon: 'code-working-outline' },
  { name: 'Gemini', icon: 'diamond-outline' },
  { name: 'Grok', icon: 'planet-outline' },
  { name: 'GitHub Copilot', icon: 'logo-github' },
  { name: 'Cursor', icon: 'navigate-outline' },
  { name: 'Lovable', icon: 'heart-outline' },
  { name: 'Bolt', icon: 'flash-outline' },
  { name: 'Replit', icon: 'cube-outline' },
  { name: 'Windsurf', icon: 'boat-outline' },
];

export const MAX_AI_TOOLS = 10;

export function presetTool(name: string) {
  return AI_TOOLS.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
}

export function aiToolIcon(name: string): AiTool['icon'] {
  return presetTool(name)?.icon ?? 'hardware-chip-outline';
}

// 「Claude, Cursor，v0」→ ['Claude', 'Cursor', 'v0']，去掉重複（不分大小寫）
export function splitTools(text: string) {
  const seen = new Set<string>();
  return text.split(/[,，#\n]/).map((s) => s.trim()).filter((s) => {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
