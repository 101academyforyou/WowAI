import { Platform } from 'react-native';

// 科技風：深色底、霓虹青色主色、等寬字體
const colors = {
  bg: '#05070d',
  surface: '#0b1220',
  surface2: '#111a2e',
  border: '#1c2a44',
  text: '#e6f1ff',
  muted: '#7b8bab',
  accent: '#00e5ff',
  accentText: '#00141a',
  accent2: '#7c4dff',
  cool: '#00e5ff',
  notCool: '#ff3d71',
  danger: '#ff3d71',
  success: '#39ff88',
};

export type Colors = typeof colors;

export function useColors(): Colors {
  return colors;
}

export const fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
};

// 霓虹光暈（iOS 用 shadow 呈現）
export function glow(color: string, radius = 10) {
  return { shadowColor: color, shadowOpacity: 0.55, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } };
}
