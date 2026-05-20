import { apiRequest } from '@/services/api';
import { PROFILE_AGENT_BASE_URL } from '@/services/profile-agent-base';

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type ProfileSnapshot = {
  interests: string[];
  traits: string[];
  socialStyle: string;
  vibeSummary: string;
  favoriteEnvironments: string[];
  hobbies: string[];
  dislikes: string[];
  emotionalStyle: string;
  currentMoodTheme: string;
  depthPreference: string;
};

export type ProfileAgentResult = {
  assistantText: string | null;
  profileSnapshot: Partial<ProfileSnapshot> | null;
  conversationState: Record<string, unknown> | null;
  raw: unknown;
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function pickAssistantText(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload.trim().length > 0 ? payload.trim() : null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directFields = [
    'assistant_message',
    'assistantMessage',
    'message',
    'reply',
    'response',
    'text',
    'output',
    'content',
  ];

  for (const field of directFields) {
    const text = asText(record[field]);
    if (text) return text;
  }

  const nestedFields = [record.assistant, record.data, record.result, record.chat];
  for (const nested of nestedFields) {
    const nestedText = pickAssistantText(nested);
    if (nestedText) return nestedText;
  }

  return null;
}

function pickProfileSnapshot(payload: unknown): Partial<ProfileSnapshot> | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const memoryUpdates = asRecord(record.memory_updates);
  const profileMemory =
    asRecord(record.profile_memory) ??
    asRecord(memoryUpdates?.profile_memory) ??
    asRecord(record.profile);
  const contextMemory =
    asRecord(record.context_memory) ??
    asRecord(memoryUpdates?.context_memory) ??
    asRecord(profileMemory?.context_memory);
  const preferenceMemory =
    asRecord(record.preference_memory) ??
    asRecord(memoryUpdates?.preference_memory) ??
    asRecord(profileMemory?.preference_memory);

  const profileSource = profileMemory ?? memoryUpdates ?? record;

  const snapshot: Partial<ProfileSnapshot> = {};

  const interests = asStringArray(profileSource.interests);
  if (interests) snapshot.interests = interests;

  const traits = asStringArray(
    profileSource.personality_traits ?? profileSource.traits,
  );
  if (traits) snapshot.traits = traits;

  const favoriteEnvironments = asStringArray(
    profileSource.favorite_environments,
  );
  if (favoriteEnvironments) snapshot.favoriteEnvironments = favoriteEnvironments;

  const hobbies = asStringArray(profileSource.hobbies);
  if (hobbies) snapshot.hobbies = hobbies;

  const dislikes = asStringArray(profileSource.dislikes);
  if (dislikes) snapshot.dislikes = dislikes;

  const socialStyle = asText(profileSource.social_style);
  if (socialStyle) snapshot.socialStyle = socialStyle;

  const vibeSummary = asText(profileSource.vibe_summary);
  if (vibeSummary) snapshot.vibeSummary = vibeSummary;

  const emotionalStyle = asText(profileSource.emotional_style);
  if (emotionalStyle) snapshot.emotionalStyle = emotionalStyle;

  const currentMoodTheme = asText(
    contextMemory?.current_mood_theme ?? profileSource.current_mood_theme,
  );
  if (currentMoodTheme) snapshot.currentMoodTheme = currentMoodTheme;

  const depthPreference = asText(
    preferenceMemory?.depth_preference ?? profileSource.depth_preference,
  );
  if (depthPreference) snapshot.depthPreference = depthPreference;

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function pickConversationState(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const topLevel = asRecord(record.conversation_state);
  if (topLevel) return topLevel;

  const memoryUpdates = asRecord(record.memory_updates);
  const nested = asRecord(memoryUpdates?.conversation_state);
  if (nested) return nested;

  return null;
}

export async function sendProfileMessage(input: {
  text: string;
  history: AgentMessage[];
  userId?: string;
  name?: string;
  email?: string | null;
  token?: string;
}): Promise<ProfileAgentResult> {
  if (!input.userId || !input.token) {
    throw new Error('Necesitas iniciar sesión para continuar el onboarding.');
  }

  const raw = await apiRequest<unknown>(
    '/chat',
    {
      method: 'POST',
      token: input.token,
      baseUrl: PROFILE_AGENT_BASE_URL,
      body: {
        user_id: input.userId,
        thread_id: `onboarding-${input.userId}`,
        message: input.text,
        name: input.name,
        email: input.email,
      },
    },
  );

  return {
    assistantText: pickAssistantText(raw),
    profileSnapshot: pickProfileSnapshot(raw),
    conversationState: pickConversationState(raw),
    raw,
  }
}
