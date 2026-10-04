import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { API_URL, api } from './api';
import { useAuth } from './auth';
import { registerForPush, setAppBadge } from './push';

type NotificationsState = {
  unreadCount: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsState | null>(null);
const POLL_MS = 30000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [count, setUnreadCount] = useState(0);
  // 登出時一律是 0
  const unreadCount = userId ? count : 0;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api<{ unreadCount: number }>('/api/notifications/unread-count');
      setUnreadCount(res.unreadCount);
    } catch {
      // 離線時保留原本的數字
    }
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await api('/api/notifications/read', { method: 'POST' }).catch(() => {});
    setUnreadCount(0);
  }, [userId]);

  // 登入後：讀未讀數、登記 iPhone 推播
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api<{ unreadCount: number }>('/api/notifications/unread-count')
      .then((res) => {
        if (!cancelled) setUnreadCount(res.unreadCount);
      })
      .catch(() => {});
    registerForPush();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 保險：每 30 秒、以及 App 回到前景時重新整理
  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, refresh]);

  // 即時：iPhone 收到推播時更新；網頁版用 Server-Sent Events
  useEffect(() => {
    if (!userId) return;
    if (Platform.OS !== 'web') {
      const sub = Notifications.addNotificationReceivedListener(() => refresh());
      return () => sub.remove();
    }
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API_URL}/api/notifications/stream`, { withCredentials: true });
    source.addEventListener('notification', (event) => {
      setUnreadCount(JSON.parse((event as MessageEvent).data).unreadCount);
    });
    return () => source.close();
  }, [userId, refresh]);

  // iPhone App 圖示上的紅色數字
  useEffect(() => {
    setAppBadge(unreadCount);
  }, [unreadCount]);

  const value = useMemo(() => ({ unreadCount, refresh, markAllRead }), [unreadCount, refresh, markAllRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
