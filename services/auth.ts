import { apiRequest } from '@/services/api';

export type AuthUser = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  role: string;
  plan: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
};

export type RegisterPayload = {
  nombre: string;
  password: string;
  email?: string;
  telefono?: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

export async function registerUser(payload: RegisterPayload): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/register', {
    method: 'POST',
    body: payload,
  });
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });
}
