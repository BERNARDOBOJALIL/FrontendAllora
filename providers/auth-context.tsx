import React, { createContext, useContext, useMemo, useState } from 'react';

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
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = async (input: LoginInput) => {
    const result = await loginUser(input);
    setUser(result.user);
    setAccessToken(result.access_token);
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

    setUser(result.user);
    setAccessToken(result.access_token);
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
  };

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      login,
      register,
      logout,
    }),
    [accessToken, user],
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
