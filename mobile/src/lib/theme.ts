import { useColorScheme } from 'react-native';

const light = {
  bg: '#fafafa',
  surface: '#ffffff',
  surface2: '#f0f0f5',
  border: '#e3e3ea',
  text: '#16161d',
  muted: '#6b6b7b',
  accent: '#7c5cff',
  accent2: '#ff4fa3',
  danger: '#e5484d',
  success: '#2fa86b',
};

const dark: typeof light = {
  bg: '#0b0b10',
  surface: '#15151d',
  surface2: '#1f1f2a',
  border: '#2a2a38',
  text: '#f2f2f7',
  muted: '#9a9aad',
  accent: '#8b70ff',
  accent2: '#ff5fae',
  danger: '#ff5c7a',
  success: '#3ecf8e',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
