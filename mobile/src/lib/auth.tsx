import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loadToken, saveToken, type User } from './api';

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: { username: string; password: string; displayName: string; acceptTerms: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
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

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ user: User; token: string }>('/api/auth/login', { method: 'POST', body: { username, password } });
    await saveToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (input: { username: string; password: string; displayName: string; acceptTerms: boolean }) => {
    const res = await api<{ user: User; token: string }>('/api/auth/register', { method: 'POST', body: input });
    await saveToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await saveToken(null);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await api('/api/me', { method: 'DELETE', body: { password } });
    await saveToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, deleteAccount, setUser }),
    [user, ready, login, register, logout, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
