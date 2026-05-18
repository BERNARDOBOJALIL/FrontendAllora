import { apiRequest } from '@/services/api';

export type Conversation = {
  id: string;
  participant_ids: string[];
  match_id: string | null;
  conversation_type?: 'DIRECT' | 'GROUP';
  name?: string | null;
  title?: string | null;
  space_id?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  unread_count: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id?: string | null;
  content: string;
  message_type: 'TEXT';
  status: 'SENT' | 'DELIVERED' | 'READ';
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  deleted_at: string | null;
};

export type PresenceResponse = {
  user_id: string;
  is_online: boolean;
};

export type CreateConversationBody = {
  participant_id: string;
  match_id?: string | null;
};

export type SendMessageBody = {
  content: string;
  message_type?: 'TEXT';
};

export async function getConversations(token: string) {
  return apiRequest<Conversation[]>('/chat/conversations', {
    token,
  });
}

export async function getGroupConversations(token: string) {
  return apiRequest<Conversation[]>('/chat/group-conversations', {
    token,
  });
}

export async function createConversation(
  participantId: string,
  matchId: string | undefined,
  token: string,
) {
  const body: CreateConversationBody = {
    participant_id: participantId,
    match_id: matchId === undefined ? null : matchId,
  };

  return apiRequest<Conversation>('/chat/conversations', {
    method: 'POST',
    token,
    body,
  });
}

export async function getMessages(
  conversationId: string,
  params: { limit?: number; skip?: number } = {},
  token: string,
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.skip !== undefined) query.set('skip', String(params.skip));

  const path = `/chat/conversations/${conversationId}/messages${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  return apiRequest<Message[]>(path, {
    token,
  });
}

export async function getGroupMessages(
  conversationId: string,
  params: { limit?: number; skip?: number } = {},
  token: string,
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.skip !== undefined) query.set('skip', String(params.skip));

  const path = `/chat/group-conversations/${conversationId}/messages${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  return apiRequest<Message[]>(path, {
    token,
  });
}

export async function sendMessage(
  conversationId: string,
  content: string,
  token: string,
) {
  const body: SendMessageBody = {
    content,
    message_type: 'TEXT',
  };

  return apiRequest<Message>(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    token,
    body,
  });
}

export async function sendGroupMessage(
  conversationId: string,
  content: string,
  token: string,
) {
  const body: SendMessageBody = {
    content,
    message_type: 'TEXT',
  };

  return apiRequest<Message>(`/chat/group-conversations/${conversationId}/messages`, {
    method: 'POST',
    token,
    body,
  });
}

export async function markConversationAsRead(conversationId: string, token: string) {
  return apiRequest<void>(`/chat/conversations/${conversationId}/read`, {
    method: 'POST',
    token,
  });
}

export async function markOnline(token: string) {
  return apiRequest<void>('/chat/presence/online', {
    method: 'POST',
    token,
  });
}

export async function markOffline(token: string) {
  return apiRequest<void>('/chat/presence/offline', {
    method: 'POST',
    token,
  });
}

export async function getPresence(userId: string, token: string) {
  return apiRequest<PresenceResponse>(`/chat/presence/${userId}`, {
    token,
  });
}
