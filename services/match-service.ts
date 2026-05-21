// services/match-service.ts
// Cliente HTTP para el match-service backend

import { Platform } from "react-native";

const MATCH_SERVICE_URL =
  process.env.EXPO_PUBLIC_MATCH_SERVICE_URL ?? "http://192.168.0.253:8002";
const MATCH_GATEWAY_URL = process.env.EXPO_PUBLIC_MATCH_GATEWAY_URL?.trim();
const MATCH_PAYLOAD_ENDPOINT =
  process.env.EXPO_PUBLIC_MATCH_PAYLOAD_ENDPOINT ?? "/match";

export type MatchStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface PotentialMatch {
  user_id: string;
  user_a_id?: string;
  user_b_id?: string;
  score: number;
  reasons: string[];
  display_name?: string;
}

export interface MatchResponse {
  id: string;
  user_a_id: string;
  user_b_id: string;
  user_a_display_name?: string;
  user_b_display_name?: string;
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

export class MatchServiceError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`match-service ${status}: ${body}`);
    this.name = "MatchServiceError";
    this.status = status;
    this.body = body;
  }
}

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token.trim().replace(/^Bearer\s+/i, "")}` };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function pickDisplayName(value: unknown, depth = 0): string {
  const record = asRecord(value);
  if (!record || depth > 3) return "";

  const keys = [
    "name",
    "user_name",
    "userName",
    "nombre",
    "display_name",
    "displayName",
    "full_name",
    "fullName",
    "real_name",
    "realName",
    "username",
    "nickname",
  ];

  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }

  const firstName = asString(record.first_name) || asString(record.firstName);
  const lastName = asString(record.last_name) || asString(record.lastName);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  for (const key of [
    "user",
    "candidate",
    "profile",
    "person",
    "account",
    "data",
    "payload",
    "result",
  ]) {
    const nested = pickDisplayName(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = pickDisplayName(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return "";
}

function pickList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const candidates = [
    record.matches,
    record.potential_matches,
    record.potentialMatches,
    record.candidates,
    record.items,
    record.data,
    record.results,
  ];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list : [];
}

function normalizePotentialMatch(payload: unknown): PotentialMatch | null {
  const record = asRecord(payload);
  if (!record) return null;
  const userId =
    asString(record.user_id) ||
    asString(record.userId) ||
    asString(record.candidate_id) ||
    asString(record.candidateId) ||
    asString(record.id) ||
    asString(asRecord(record.user)?.id) ||
    asString(asRecord(record.user)?.user_id) ||
    asString(asRecord(record.candidate)?.id) ||
    asString(asRecord(record.candidate)?.user_id);
  const score = Number(
    record.score ??
      record.compatibility_score ??
      record.compatibilityScore ??
      record.compatibility,
  );
  if (!userId || !Number.isFinite(score)) return null;
  return {
    user_id: userId,
    user_a_id:
      asString(record.user_a_id) || asString(record.userAId) || undefined,
    user_b_id:
      asString(record.user_b_id) || asString(record.userBId) || undefined,
    score: Math.max(0, Math.min(100, score)),
    reasons: asStringArray(record.reasons),
    display_name: pickDisplayName(record) || undefined,
  };
}

function normalizeMatch(payload: unknown): MatchResponse | null {
  const record = asRecord(payload);
  if (!record) return null;
  const nested =
    asRecord(record.match) ??
    asRecord(record.data) ??
    asRecord(record.result) ??
    asRecord(record.item);
  if (nested) return normalizeMatch(nested);

  const id = asString(record.id) || asString(record._id);
  const userAId = asString(record.user_a_id) || asString(record.userAId);
  const userBId = asString(record.user_b_id) || asString(record.userBId);
  if (!id || !userAId || !userBId) return null;
  return {
    id,
    user_a_id: userAId,
    user_b_id: userBId,
    user_a_display_name:
      pickDisplayName(record.user_a) ||
      pickDisplayName(record.userA) ||
      asString(record.user_a_display_name) ||
      asString(record.userADisplayName) ||
      undefined,
    user_b_display_name:
      pickDisplayName(record.user_b) ||
      pickDisplayName(record.userB) ||
      asString(record.user_b_display_name) ||
      asString(record.userBDisplayName) ||
      undefined,
    status: (asString(record.status) || "PENDING") as MatchStatus,
    compatibility_score:
      Number(
        record.compatibility_score ?? record.compatibilityScore ?? record.score,
      ) || 0,
    reasons: asStringArray(record.reasons),
    created_at: asString(record.created_at) || asString(record.createdAt),
    updated_at: asString(record.updated_at) || asString(record.updatedAt),
    expires_at:
      asString(record.expires_at) || asString(record.expiresAt) || null,
    metadata: asRecord(record.metadata) ?? {},
  };
}

function normalizePotentialMatchList(
  payload: unknown,
): PotentialMatchListResponse {
  const matches = pickList(payload)
    .map(normalizePotentialMatch)
    .filter((match): match is PotentialMatch => Boolean(match));
  const total =
    Number(asRecord(payload)?.total ?? matches.length) || matches.length;
  return { total, matches };
}

function normalizeMatchList(payload: unknown): MatchListResponse {
  const matches = pickList(payload)
    .map(normalizeMatch)
    .filter((match): match is MatchResponse => Boolean(match));
  const total =
    Number(asRecord(payload)?.total ?? matches.length) || matches.length;
  return { total, matches };
}

async function request<T>(
  path: string,
  options: MatchRequestOptions = {},
): Promise<T> {
  const { token, ...requestOptions } = options;
  const baseUrl =
    Platform.OS === "web" && MATCH_GATEWAY_URL
      ? MATCH_GATEWAY_URL
      : MATCH_SERVICE_URL;
  const fullUrl = `${baseUrl.replace(/\/$/, "")}${path}`;
  // Dev log: show request target and whether a token is included (do not print token raw)
  if (process.env.NODE_ENV !== "production") {
    console.debug("[match-service] request", {
      url: fullUrl,
      method: requestOptions.method ?? "GET",
      hasToken: Boolean(options.token),
    });
  }

  const res = await fetch(fullUrl, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
      ...requestOptions.headers,
    },
    ...requestOptions,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new MatchServiceError(res.status, body);
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
  const payload = await request<unknown>(
    `/users/${encodeURIComponent(userId)}/matches?limit=${limit}&skip=${skip}`,
    { token },
  );
  return normalizePotentialMatchList(payload);
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
  const params = new URLSearchParams({
    limit: String(limit),
    skip: String(skip),
  });
  if (status) params.append("status", status);
  const payload = await request<unknown>(
    `/users/${encodeURIComponent(userId)}/all-matches?${params.toString()}`,
    { token },
  );
  return normalizeMatchList(payload);
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
  const payload = await request<unknown>("/matches", {
    method: "POST",
    token,
    body: JSON.stringify({ user_a_id: userAId, user_b_id: userBId }),
  });
  const match = normalizeMatch(payload);
  return (
    match ?? {
      id: `${userAId}:${userBId}:${Date.now()}`,
      user_a_id: userAId,
      user_b_id: userBId,
      status: "PENDING",
      compatibility_score: 0,
      reasons: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
      metadata: {},
    }
  );
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
    method: "POST",
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
    method: "PUT",
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
  return request(`/matches/${matchId}`, { method: "DELETE" });
}

/**
 * Calcula compatibilidad entre dos usuarios sin crear match.
 * Endpoint: POST /compatibility
 */
export async function calculateCompatibility(
  userAId: string,
  userBId: string,
  token?: string | null,
): Promise<{
  user_a_id: string;
  user_b_id: string;
  score: number;
  reasons: string[];
}> {
  return request("/compatibility", {
    method: "POST",
    token,
    body: JSON.stringify({ user_a_id: userAId, user_b_id: userBId }),
  });
}
