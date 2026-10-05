import type { Ionicons } from '@expo/vector-icons';
import type { KeyboardTypeOptions } from 'react-native';

export type ContactType = 'facebook' | 'instagram' | 'threads' | 'line' | 'email' | 'x' | 'github' | 'website';
export type Contact = { type: ContactType; label: string; value: string; url: string };

type ContactField = {
  type: ContactType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
};

// 顯示順序與後端 server/contacts.js 一致
export const CONTACT_FIELDS: ContactField[] = [
  { type: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877f2', placeholder: '帳號或 facebook.com/… 網址', keyboardType: 'url' },
  { type: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#e4405f', placeholder: '@帳號' },
  { type: 'threads', label: 'Threads', icon: 'logo-threads', color: '#e6f1ff', placeholder: '@帳號' },
  { type: 'line', label: 'LINE', icon: 'chatbubble-ellipses', color: '#06c755', placeholder: 'LINE ID 或 line.me 加好友網址' },
  { type: 'email', label: 'Email', icon: 'mail', color: '#00e5ff', placeholder: 'you@example.com', keyboardType: 'email-address' },
  { type: 'x', label: 'X', icon: 'logo-x', color: '#e6f1ff', placeholder: '@帳號' },
  { type: 'github', label: 'GitHub', icon: 'logo-github', color: '#e6f1ff', placeholder: 'GitHub 帳號' },
  { type: 'website', label: '個人網站', icon: 'globe-outline', color: '#7c4dff', placeholder: 'https://…', keyboardType: 'url' },
];

export function contactField(type: ContactType) {
  return CONTACT_FIELDS.find((f) => f.type === type)!;
}
