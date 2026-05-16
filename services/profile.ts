import { apiRequest } from '@/services/api';

type ProfileMemoryResponse = {
  profile_memory: Record<string, unknown> | null;
  context_memory: Record<string, unknown> | null;
  preference_memory: Record<string, unknown> | null;
  updated_at: string | null;
  raw: unknown;
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
    updated_at: typeof record?.updated_at === 'string' ? record.updated_at : null,
    raw: payload,
  };
}

export async function saveProfileMemory(userId: string, token: string, memory: unknown) {
  const path = `/auth/profile-memory/${encodeURIComponent(userId)}`;
  return apiRequest(path, { method: 'POST', token, body: memory });
}

export async function getProfileMemory(userId: string, token: string) {
  const path = `/auth/profile-memory/${encodeURIComponent(userId)}`;
  const payload = await apiRequest(path, { method: 'GET', token });
  return normalizeProfileMemoryResponse(payload);
}
