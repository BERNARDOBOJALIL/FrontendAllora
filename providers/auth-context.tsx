import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  type AuthUser,
  type RegisterPayload,
  loginUser,
  registerUser,
} from '@/services/auth';

type LoginInput = {
  identifier: string;
  password: string;
};

type RegisterInput = RegisterPayload;

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_STORAGE_KEY = 'allora-auth-session';

type StoredSession = {
  user: AuthUser;
  accessToken: string;
};

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  return trimmed.replace(/^Bearer\s+/i, '');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (!active) return;

        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredSession>;
          if (parsed.user && parsed.accessToken) {
            const nextToken = normalizeToken(parsed.accessToken);
            setUser(parsed.user);
            setAccessToken(nextToken);
            await SecureStore.setItemAsync(
              AUTH_STORAGE_KEY,
              JSON.stringify({ user: parsed.user, accessToken: nextToken }),
            );
          }
        }
      } catch {
        // If hydration fails, fall back to a logged-out state.
      } finally {
        if (active) setIsHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const persistSession = async (nextUser: AuthUser, nextToken: string) => {
    const normalizedToken = normalizeToken(nextToken);
    setUser(nextUser);
    setAccessToken(normalizedToken);
    await SecureStore.setItemAsync(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user: nextUser, accessToken: normalizedToken }),
    );
  };

  const login = async (input: LoginInput) => {
    const result = await loginUser(input);
    await persistSession(result.user, result.access_token);
  };

  const register = async (input: RegisterInput) => {
    await registerUser(input);

    const identifier = input.email?.trim() || input.telefono?.trim();
    if (!identifier) {
      throw new Error('Necesitas email o telefono para iniciar sesion.');
    }

    const result = await loginUser({
      identifier,
      password: input.password,
    });

    await persistSession(result.user, result.access_token);
  };

  const logout = async () => {
    setUser(null);
    setAccessToken(null);
    //await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isHydrated,
      login,
      register,
      logout,
    }),
    [accessToken, isHydrated, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
