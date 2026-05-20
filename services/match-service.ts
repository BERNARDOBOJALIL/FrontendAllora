// services/match-service.ts
// Cliente HTTP para el match-service backend

import { Platform } from 'react-native';

import { API_BASE_URL } from '@/services/api';

const MATCH_SERVICE_URL = process.env.EXPO_PUBLIC_MATCH_SERVICE_URL ?? 'http://localhost:8002';
const MATCH_GATEWAY_URL = process.env.EXPO_PUBLIC_MATCH_GATEWAY_URL ?? API_BASE_URL;
const MATCH_PAYLOAD_ENDPOINT = process.env.EXPO_PUBLIC_MATCH_PAYLOAD_ENDPOINT ?? '/match';

export type MatchStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface PotentialMatch {
  user_id: string;
  score: number;
  reasons: string[];
}

export interface MatchResponse {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: MatchStatus;
  compatibility_score: number;
  reasons: string[];
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface MatchListResponse {
  total: number;
  matches: MatchResponse[];
}

export interface PotentialMatchListResponse {
  total: number;
  matches: PotentialMatch[];
}

export type MatchPayload = {
  user_id: string;
  profile_memory: Record<string, unknown>;
  preference_memory: Record<string, unknown>;
  profile_completion: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

type MatchRequestOptions = RequestInit & {
  token?: string | null;
};

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}` };
}

async function request<T>(
  path: string,
  options: MatchRequestOptions = {},
): Promise<T> {
  const { token, ...requestOptions } = options;
  const baseUrl = Platform.OS === 'web' ? MATCH_GATEWAY_URL : MATCH_SERVICE_URL;
  const fullUrl = `${baseUrl.replace(/\/$/, '')}${path}`;
  // Dev log: show request target and whether a token is included (do not print token raw)
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[match-service] request', {
      url: fullUrl,
      method: requestOptions.method ?? 'GET',
      hasToken: Boolean(options.token),
    });
  }

  const res = await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
      ...requestOptions.headers,
    },
    ...requestOptions,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`match-service ${res.status}: ${body}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Obtiene candidatos potenciales para el usuario según compatibilidad.
 * Endpoint: GET /users/{user_id}/matches
 */
export async function getPotentialMatches(
  userId: string,
  limit = 10,
  skip = 0,
  token?: string | null,
): Promise<PotentialMatchListResponse> {
  return request(
    `/users/${encodeURIComponent(userId)}/matches?limit=${limit}&skip=${skip}`,
    { token },
  );
}

/**
 * Obtiene todos los matches existentes del usuario (PENDING, ACCEPTED, etc.).
 * Endpoint: GET /users/{user_id}/all-matches
 */
export async function getUserMatches(
  userId: string,
  status?: MatchStatus,
  limit = 20,
  skip = 0,
  token?: string | null,
): Promise<MatchListResponse> {
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (status) params.append('status', status);
  return request(
    `/users/${encodeURIComponent(userId)}/all-matches?${params.toString()}`,
    { token },
  );
}

/**
 * Crea un match (like) entre dos usuarios.
 * Endpoint: POST /matches
 */
export async function createMatch(
  userAId: string,
  userBId: string,
  token?: string | null,
): Promise<MatchResponse> {
  return request('/matches', {
    method: 'POST',
    token,
    body: JSON.stringify({ user_a_id: userAId, user_b_id: userBId }),
  });
}

/**
 * Envía al match-service el perfil consolidado por el profile-agent.
 * Por defecto usa POST /match, como indica el contrato nuevo del agente.
 */
export async function syncMatchPayload(
  payload: MatchPayload,
  token?: string | null,
): Promise<unknown> {
  return request(MATCH_PAYLOAD_ENDPOINT, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

/**
 * Actualiza el estado de un match (aceptar / rechazar).
 * Endpoint: PUT /matches/{match_id}
 */
export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
  token?: string | null,
): Promise<MatchResponse> {
  return request(`/matches/${matchId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ status }),
  });
}

/**
 * Obtiene un match por ID.
 * Endpoint: GET /matches/{match_id}
 */
export async function getMatch(matchId: string): Promise<MatchResponse> {
  return request(`/matches/${matchId}`);
}

/**
 * Elimina un match.
 * Endpoint: DELETE /matches/{match_id}
 */
export async function deleteMatch(matchId: string): Promise<void> {
  return request(`/matches/${matchId}`, { method: 'DELETE' });
}

/**
 * Calcula compatibilidad entre dos usuarios sin crear match.
 * Endpoint: POST /compatibility
 */
export async function calculateCompatibility(
  userAId: string,
  userBId: string,
): Promise<{ user_a_id: string; user_b_id_id: string; score: number; reasons: string[] }> {
  return request('/compatibility', {
    method: 'POST',
    body: JSON.stringify({ user_a_id: userAId, user_b_id: userBId }),
  });
}
