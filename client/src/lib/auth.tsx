import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore, userStore } from './api';
import type { Role, User } from './types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Seeded from localStorage so a refresh does not bounce the user to /login.
  const [user, setUser] = useState<User | null>(() => userStore.get<User>());

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { token, user: loggedIn } = data.data as { token: string; user: User };
    tokenStore.set(token);
    userStore.set(loggedIn);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user && tokenStore.get()), login, logout, can }),
    [user, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
