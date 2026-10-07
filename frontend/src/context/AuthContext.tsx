import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import type { AuthUser, ProfileInput } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  login: (identifier: string, pin: string) => Promise<void>;
  register: (data: ProfileInput & { pin: string }) => Promise<void>;
  updateProfile: (data: ProfileInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hollandia_auth_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('hollandia_auth_token');
    if (!savedToken) {
      setLoading(false);
      return;
    }

    authApi.getMe()
      .then(u => {
        setUser(u);
        setToken(savedToken);
      })
      .catch(() => {
        localStorage.removeItem('hollandia_auth_token');
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (identifier: string, pin: string) => {
    const res = await authApi.login({ identifier, pin });
    localStorage.setItem('hollandia_auth_token', res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const register = async (data: ProfileInput & { pin: string }) => {
    const res = await authApi.register(data);
    localStorage.setItem('hollandia_auth_token', res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const updateProfile = async (data: ProfileInput) => {
    const u = await authApi.updateProfile(data);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('hollandia_auth_token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await authApi.getMe();
      setUser(u);
    } catch {
      // ignore
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, token, loading, isAdmin, login, register, updateProfile, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}