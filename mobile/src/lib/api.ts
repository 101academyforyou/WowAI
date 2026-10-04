import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// 開發時用 EXPO_PUBLIC_API_URL 指向自己的電腦（例如 http://192.168.1.10:3000），
// 正式版則用 app.json 的 extra.apiUrl（必須是 https）。
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3000'
).replace(/\/$/, '');

export const MAX_MEDIA = 10;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type User = { id: number; username: string; displayName: string; isAdmin?: boolean };
export type Media = { url: string; kind: 'image' | 'video' };
export type Post = {
  id: number;
  title: string;
  description: string;
  toolUrl: string;
  createdAt: string;
  author: User;
  media: Media[];
  aiTools: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};
export type Comment = { id: number; body: string; author: User };
export type Profile = User & {
  bio: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  blockedByMe: boolean;
};

export const REPORT_REASONS = [
  { value: 'spam', label: '垃圾訊息或詐騙' },
  { value: 'nudity', label: '色情或裸露內容' },
  { value: 'violence', label: '暴力或危險內容' },
  { value: 'harassment', label: '騷擾或仇恨言論' },
  { value: 'ip', label: '侵害智慧財產權' },
  { value: 'other', label: '其他' },
] as const;

// ---- 登入權杖：iPhone 存在鑰匙圈（SecureStore），網頁預覽時用 localStorage ----
const TOKEN_KEY = 'wowai.token';
let token: string | null = null;

export async function loadToken() {
  token = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
    : await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(value: string | null) {
  token = value;
  if (Platform.OS === 'web') {
    if (value) globalThis.localStorage?.setItem(TOKEN_KEY, value);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
  } else if (value) {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = unknown>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...authHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('無法連線到伺服器，請檢查網路', 0);
  }
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || '發生錯誤，請再試一次', res.status);
  return data as T;
}

export function mediaUri(url: string) {
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

export type PickedMedia = { uri: string; kind: 'image' | 'video'; name: string; mimeType: string };

// 用 XMLHttpRequest 上傳，才能顯示上傳進度（影片可能很大）
export async function uploadPost(
  fields: { title: string; description: string; toolUrl: string; aiTools: string },
  media: PickedMedia[],
  onProgress: (ratio: number) => void,
): Promise<Post> {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  for (const m of media) {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(m.uri)).blob();
      form.append('media', blob, m.name);
    } else {
      // React Native 的 FormData 接受 { uri, name, type } 物件
      form.append('media', { uri: m.uri, name: m.name, type: m.mimeType } as unknown as Blob);
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/posts`);
    Object.entries(authHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { post?: Post; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // 非 JSON 回應
      }
      if (xhr.status === 201 && data.post) resolve(data.post);
      else reject(new ApiError(data.error || '上傳失敗，請再試一次', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('無法連線到伺服器，請檢查網路', 0));
    xhr.send(form);
  });
}

export function timeAgo(sqlDate: string) {
  const then = new Date(`${sqlDate.replace(' ', 'T')}Z`).getTime();
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return new Date(then).toLocaleDateString('zh-TW');
}
