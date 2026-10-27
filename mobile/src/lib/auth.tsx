import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loadToken, saveToken, type User } from './api';
import { unregisterPush } from './push';

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: { username: string; password: string; displayName: string; acceptTerms: boolean }) => Promise<void>;
  // 第三方登入（GitHub、Google、Apple）拿到權杖後
  signIn: (res: { user: User; token: string }) => Promise<void>;
  // 重新讀取自己的帳號資料（例如綁定了 GitHub）
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  // 有密碼的帳號送 password；第三方登入建立的帳號送 confirm（自己的帳號名稱）
  deleteAccount: (confirmation: { password?: string; confirm?: string }) => Promise<void>;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (await loadToken()) {
          const { user: me } = await api<{ user: User | null }>('/api/me');
          setUser(me);
          if (!me) await saveToken(null);
        }
      } catch {
        // 離線時先當作未登入
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    const { user: me } = await api<{ user: User | null }>('/api/me');
    setUser(me);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ user: User; token: string }>('/api/auth/login', { method: 'POST', body: { username, password } });
    await saveToken(res.token);
    setUser(res.user);
    await refresh().catch(() => {});
  }, [refresh]);

  const register = useCallback(async (input: { username: string; password: string; displayName: string; acceptTerms: boolean }) => {
    const res = await api<{ user: User; token: string }>('/api/auth/register', { method: 'POST', body: input });
    await saveToken(res.token);
    setUser(res.user);
    await refresh().catch(() => {});
  }, [refresh]);

  const signIn = useCallback(async (res: { user: User; token: string }) => {
    await saveToken(res.token);
    setUser(res.user);
    await refresh().catch(() => {});
  }, [refresh]);

  const logout = useCallback(async () => {
    await unregisterPush();
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await saveToken(null);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (confirmation: { password?: string; confirm?: string }) => {
    await api('/api/me', { method: 'DELETE', body: confirmation });
    await saveToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, signIn, refresh, logout, deleteAccount, setUser }),
    [user, ready, login, register, signIn, refresh, logout, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
