import { apiRequest } from '@/services/api';
import { PROFILE_AGENT_BASE_URL } from '@/services/profile-agent-base';

export type ProfileMemoryResponse = {
  profile_memory: Record<string, unknown> | null;
  context_memory: Record<string, unknown> | null;
  preference_memory: Record<string, unknown> | null;
  match_preference_memory: Record<string, unknown> | null;
  profile_completion: number | null;
  updated_at: string | null;
  raw: unknown;
};

export type ProfileMemoryPatch = {
  edad?: number | null;
  genero?: string | null;
  bio?: string | null;
  location?: {
    lat?: number | null;
    lng?: number | null;
  } | null;
  interests?: string[];
  hobbies?: string[];
  personality_traits?: string[];
  favorite_environments?: string[];
  social_style?: string | null;
  vibe_summary?: string | null;
  dislikes?: string[];
  emotional_style?: string | null;
};

export type MatchPreferenceMemoryPatch = {
  edad_minima?: number | null;
  edad_maxima?: number | null;
  distancia_maxima_km?: number | null;
  genero_preferido?: string | null;
};

export type MatchPayload = {
  user_id: string;
  profile_memory: Record<string, unknown>;
  preference_memory: Record<string, unknown>;
  profile_completion: number;
};

export type ProfileMemoryCategory =
  | 'interests'
  | 'personality_traits'
  | 'traits'
  | 'social_style'
  | 'vibe_summary'
  | 'favorite_environments'
  | 'hobbies'
  | 'dislikes'
  | 'emotional_style';

export type PatchProfileMemoryCategoryResponse = ProfileMemoryResponse & {
  user_id: string | null;
  category: ProfileMemoryCategory | string | null;
  formatted_value: unknown;
  profile_completion: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeProfileMemoryResponse(payload: unknown): ProfileMemoryResponse {
  const record = asRecord(payload);
  const memoryUpdates = asRecord(record?.memory_updates);
  const profileMemory =
    asRecord(record?.profile_memory) ??
    asRecord(memoryUpdates?.profile_memory) ??
    asRecord(record?.profile);
  const completion = record?.profile_completion;

  return {
    profile_memory: profileMemory,
    context_memory:
      asRecord(record?.context_memory) ??
      asRecord(memoryUpdates?.context_memory) ??
      asRecord(profileMemory?.context_memory),
    preference_memory:
      asRecord(record?.preference_memory) ??
      asRecord(memoryUpdates?.preference_memory) ??
      asRecord(profileMemory?.preference_memory),
    match_preference_memory: asRecord(record?.match_preference_memory),
    profile_completion: typeof completion === 'number' ? completion : null,
    updated_at: typeof record?.updated_at === 'string' ? record.updated_at : null,
    raw: payload,
  };
}

function normalizePatchProfileMemoryCategoryResponse(
  payload: unknown,
): PatchProfileMemoryCategoryResponse {
  const base = normalizeProfileMemoryResponse(payload);
  const record = asRecord(payload);
  const completion = record?.profile_completion;

  return {
    ...base,
    user_id: typeof record?.user_id === 'string' ? record.user_id : null,
    category: typeof record?.category === 'string' ? record.category : null,
    formatted_value: record?.formatted_value,
    profile_completion: typeof completion === 'number' ? completion : null,
  };
}

export async function getProfileMemory(userId: string, token?: string | null) {
  const encodedUserId = encodeURIComponent(userId);
  const payload = await apiRequest(`/profile/${encodedUserId}`, {
    method: 'GET',
    token: token ?? undefined,
    baseUrl: PROFILE_AGENT_BASE_URL,
  });
  return normalizeProfileMemoryResponse(payload);
}

export async function patchProfileMemory(
  userId: string,
  token: string,
  body: ProfileMemoryPatch,
) {
  const encodedUserId = encodeURIComponent(userId);
  const payload = await apiRequest(`/profile/${encodedUserId}/profile-memory`, {
    method: 'PATCH',
    token,
    body,
    baseUrl: PROFILE_AGENT_BASE_URL,
  });
  return normalizeProfileMemoryResponse(payload);
}

export async function patchPreferenceMemory(
  userId: string,
  token: string,
  body: MatchPreferenceMemoryPatch,
) {
  const encodedUserId = encodeURIComponent(userId);
  const payload = await apiRequest(`/profile/${encodedUserId}/preference-memory`, {
    method: 'PATCH',
    token,
    body,
    baseUrl: PROFILE_AGENT_BASE_URL,
  });
  return normalizeProfileMemoryResponse(payload);
}

export async function getMatchPayload(
  userId: string,
  token: string,
): Promise<MatchPayload> {
  const encodedUserId = encodeURIComponent(userId);
  return apiRequest<MatchPayload>(`/profile/${encodedUserId}/match-payload`, {
    method: 'GET',
    token,
    baseUrl: PROFILE_AGENT_BASE_URL,
  });
}

export async function patchProfileMemoryCategory(
  userId: string,
  token: string,
  category: ProfileMemoryCategory,
  text: string,
) {
  const encodedUserId = encodeURIComponent(userId);
  const encodedCategory = encodeURIComponent(category);
  const body = { text };

  const payload = await apiRequest(
    `/profile/${encodedUserId}/profile-memory/${encodedCategory}`,
    { method: 'PATCH', token, body, baseUrl: PROFILE_AGENT_BASE_URL },
  );
  return normalizePatchProfileMemoryCategoryResponse(payload);
}
