import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Contact } from './contacts';
import { lang, tr } from './i18n';

function resolveApiUrl() {
  if (Platform.OS === 'web') {
    // 網頁版和後端放在同一個網址，直接用相對路徑。
    // 用 `npx expo start --web` 開發時網頁跑在 8081 埠，後端則在同一台電腦的 3000 埠。
    const loc = globalThis.location;
    return __DEV__ && loc ? `${loc.protocol}//${loc.hostname}:3000` : '';
  }
  // iPhone：開發時用 EXPO_PUBLIC_API_URL 指向自己的電腦（例如 http://192.168.1.10:3000），
  // 正式版則用 app.json 的 extra.apiUrl（必須是 https）。
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export const API_URL = resolveApiUrl();

// 給人看的網址（分享連結、使用條款）：網頁版用目前網站，iPhone 用後端網址（後端也提供網頁版）
export function siteUrl(path: string) {
  const origin = Platform.OS === 'web' && globalThis.location ? globalThis.location.origin : API_URL;
  return `${origin}${path}`;
}

export const MAX_MEDIA = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// hasPassword、identities 只有 /api/me 會回傳（自己的帳號）
export type User = {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  hasPassword?: boolean;
  identities?: string[];
  // 自己的 GitHub 帳號（綁定的 GitHub 登入，或「聯繫我」填的 GitHub）；login 空字串代表只知道 GitHub 的數字 ID
  github?: { login: string; id: string | null } | null;
  // 自己的 AI Webhook 狀態（完整網址只在產生時顯示一次）
  webhook?: { active: boolean; hint?: string; createdAt?: string; lastUsedAt?: string | null };
};
export type Media = { url: string; kind: 'image' | 'video' };
export type Post = {
  id: number;
  title: string;
  description: string;
  toolUrl: string;
  // 教學連結（Learn it）；舊版伺服器沒有這個欄位
  learnUrl?: string;
  githubUrl: string;
  // GitHub 上的星星數（伺服器每幾小時更新一次）；還沒查到或找不到是 null
  githubStars?: number | null;
  youtube: { id: string; url: string } | null;
  createdAt: string;
  author: User;
  media: Media[];
  aiTools: string[];
  categories: string[];
  categoryOther: string;
  coolCount: number;
  notCoolCount: number;
  myVote: Vote | null;
  commentCount: number;
  repostCount: number;
  repostedByMe: boolean;
  // 釘選在作者個人頁最上方（最多 3 則）
  pinned?: boolean;
};
export type Vote = 'cool' | 'notcool';
export type Comment = { id: number; body: string; edited?: boolean; author: User };
export type Profile = User & {
  bio: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  blockedByMe: boolean;
  contacts: Contact[];
};

export type AppNotification = {
  id: number;
  type: 'cool' | 'comment' | 'follow' | 'new_post' | 'repost';
  read: boolean;
  createdAt: string;
  actor: User;
  postId: number | null;
  thumbnailUrl: string | null;
  message: string;
  link: string;
};

export const REPORT_REASONS = [
  { value: 'spam', label: tr('垃圾訊息或詐騙', 'Spam or scam') },
  { value: 'nudity', label: tr('色情或裸露內容', 'Nudity or sexual content') },
  { value: 'violence', label: tr('暴力或危險內容', 'Violence or dangerous content') },
  { value: 'harassment', label: tr('騷擾或仇恨言論', 'Harassment or hate speech') },
  { value: 'ip', label: tr('侵害智慧財產權', 'Intellectual property violation') },
  { value: 'other', label: tr('其他', 'Other') },
] as const;

// ---- 登入權杖：iPhone 存在鑰匙圈（SecureStore），網頁預覽時用 localStorage ----
const TOKEN_KEY = 'yourwowai.token';
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

const offlineMessage = () => tr('無法連線到伺服器，請檢查網路', "Can't reach the server. Check your connection.");
const uploadFailedMessage = () => tr('上傳失敗，請再試一次', 'Upload failed. Please try again.');

// Accept-Language：讓伺服器用同一種語言回覆錯誤訊息與通知
function authHeaders(): Record<string, string> {
  return { 'Accept-Language': lang, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
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
    throw new ApiError(offlineMessage(), 0);
  }
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || tr('發生錯誤，請再試一次', 'Something went wrong. Please try again.'), res.status);
  return data as T;
}

export function mediaUri(url: string) {
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

export type PickedMedia = { uri: string; kind: 'image' | 'video'; name: string; mimeType: string };

async function appendFile(form: FormData, field: string, m: Pick<PickedMedia, 'uri' | 'name' | 'mimeType'>) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(m.uri)).blob();
    form.append(field, blob, m.name);
  } else {
    // React Native 的 FormData 接受 { uri, name, type } 物件
    form.append(field, { uri: m.uri, name: m.name, type: m.mimeType } as unknown as Blob);
  }
}

export async function uploadAvatar(file: Pick<PickedMedia, 'uri' | 'name' | 'mimeType'>): Promise<User> {
  const form = new FormData();
  await appendFile(form, 'avatar', file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/me/avatar`, { method: 'PUT', headers: authHeaders(), body: form });
  } catch {
    throw new ApiError(offlineMessage(), 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || uploadFailedMessage(), res.status);
  return data.user;
}

export type PostFields = { title: string; description: string; toolUrl: string; learnUrl: string; githubUrl: string; youtubeUrl: string; aiTools: string; categories: string; categoryOther: string };
// 表單裡的截圖：existingUrl 有值代表是貼文原本就有的圖（編輯時）
export type EditorMedia = PickedMedia & { existingUrl?: string };

// 用 XMLHttpRequest 上傳，才能顯示上傳進度
function sendPostForm(method: 'POST' | 'PATCH', path: string, form: FormData, onProgress: (ratio: number) => void): Promise<Post> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`);
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
      if (xhr.status >= 200 && xhr.status < 300 && data.post) resolve(data.post);
      else reject(new ApiError(data.error || uploadFailedMessage(), xhr.status));
    };
    xhr.onerror = () => reject(new ApiError(offlineMessage(), 0));
    xhr.send(form);
  });
}

export async function uploadPost(fields: PostFields, media: EditorMedia[], onProgress: (ratio: number) => void): Promise<Post> {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  for (const m of media) await appendFile(form, 'media', m);
  return sendPostForm('POST', '/api/posts', form, onProgress);
}

// 編輯：layout 依顯示順序列出截圖，舊圖寫網址，新圖寫 new:第幾個上傳檔
export async function updatePost(id: number, fields: PostFields, media: EditorMedia[], onProgress: (ratio: number) => void): Promise<Post> {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const layout: string[] = [];
  let newIndex = 0;
  for (const m of media) {
    if (m.existingUrl) {
      layout.push(m.existingUrl);
    } else {
      layout.push(`new:${newIndex++}`);
      await appendFile(form, 'media', m);
    }
  }
  form.append('layout', JSON.stringify(layout));
  return sendPostForm('PATCH', `/api/posts/${id}`, form, onProgress);
}

export function timeAgo(sqlDate: string) {
  const then = new Date(`${sqlDate.replace(' ', 'T')}Z`).getTime();
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return tr('剛剛', 'just now');
  if (s < 3600) return tr(`${Math.floor(s / 60)} 分鐘前`, `${Math.floor(s / 60)}m ago`);
  if (s < 86400) return tr(`${Math.floor(s / 3600)} 小時前`, `${Math.floor(s / 3600)}h ago`);
  if (s < 86400 * 7) return tr(`${Math.floor(s / 86400)} 天前`, `${Math.floor(s / 86400)}d ago`);
  return new Date(then).toLocaleDateString(tr('zh-TW', 'en-US'));
}
