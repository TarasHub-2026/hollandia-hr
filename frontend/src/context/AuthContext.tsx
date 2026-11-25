import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import type { AuthUser, ProfileInput, AccessArea } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  can: (area: AccessArea, level?: 'view' | 'edit') => boolean;
  login: (identifier: string, pin: string) => Promise<void>;
  register: (data: ProfileInput & { pin: string }) => Promise<void>;
  updateProfile: (data: ProfileInput) => Promise<void>;
  savePhoto: (photo: string) => Promise<void>;
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

  const savePhoto = async (photo: string) => {
    const u = await authApi.savePhoto(photo);
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
  // Can the signed-in administrator see ('view') or change ('edit') this area? Administrators with no saved restriction have full access.
  const can = (area: AccessArea, level: 'view' | 'edit' = 'edit') => {
    if (!isAdmin) return false;
    const have = user?.permissions?.[area] ?? 'edit';
    return level === 'view' ? have !== 'none' : have === 'edit';
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isAdmin, can, login, register, updateProfile, savePhoto, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}