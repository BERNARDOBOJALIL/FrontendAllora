// services/match-service.ts
// Cliente HTTP para el match-service backend

const MATCH_SERVICE_URL = process.env.EXPO_PUBLIC_MATCH_SERVICE_URL ?? 'http://localhost:8002';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${MATCH_SERVICE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
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
): Promise<PotentialMatchListResponse> {
  return request(`/users/${userId}/matches?limit=${limit}&skip=${skip}`);
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
): Promise<MatchListResponse> {
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (status) params.append('status', status);
  return request(`/users/${userId}/all-matches?${params.toString()}`);
}

/**
 * Crea un match (like) entre dos usuarios.
 * Endpoint: POST /matches
 */
export async function createMatch(
  userAId: string,
  userBId: string,
): Promise<MatchResponse> {
  return request('/matches', {
    method: 'POST',
    body: JSON.stringify({ user_a_id: userAId, user_b_id: userBId }),
  });
}

/**
 * Actualiza el estado de un match (aceptar / rechazar).
 * Endpoint: PUT /matches/{match_id}
 */
export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
): Promise<MatchResponse> {
  return request(`/matches/${matchId}`, {
    method: 'PUT',
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
