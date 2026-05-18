import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { styles } from '@/app/(tabs)/chat.styles';
import { useAuth } from '@/providers/auth-context';
import {
  Conversation,
  createConversation,
  getConversations,
  getMessages,
  getPresence,
  markConversationAsRead,
  markOffline,
  markOnline,
  Message,
  sendMessage,
} from '@/services/chat';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isGroupConversation(conversation: Conversation) {
  return conversation.conversation_type === 'GROUP' || conversation.participant_ids.length === 0;
}

function getConversationTitle(conversation: Conversation, currentUserId: string) {
  if (isGroupConversation(conversation)) {
    return conversation.name ?? conversation.title ?? 'Grupo';
  }

  return (
    conversation.participant_ids.find((id) => id !== currentUserId) ??
    conversation.participant_ids[0] ??
    'Conversación'
  );
}

function getParticipantIds(conversation: Conversation, currentUserId: string, fallbackMembers: string[] = []) {
  const ids = conversation.participant_ids.length > 0 ? conversation.participant_ids : fallbackMembers;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (!uniqueIds.includes(currentUserId)) {
    uniqueIds.unshift(currentUserId);
  }

  return uniqueIds;
}

function formatParticipantLabel(participantId: string, currentUserId: string) {
  if (participantId === currentUserId) return 'Tú';
  const compactId = participantId.length > 8 ? participantId.slice(0, 8) : participantId;
  return `Usuario ${compactId}`;
}

function getConversationInitials(title: string) {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function mergeConversations(conversations: Conversation[]) {
  const byId = new Map<string, Conversation>();
  conversations.forEach((conversation) => {
    byId.set(conversation.id, conversation);
  });
  return Array.from(byId.values());
}

export default function ChatScreen() {
  const { user, accessToken } = useAuth();
  const params = useLocalSearchParams<{
    groupConversationId?: string | string[];
    groupName?: string | string[];
    spaceId?: string | string[];
    groupMembers?: string | string[];
  }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const scrollRef = useRef<FlatList<Message> | null>(null);
  const openedGroupConversationRef = useRef<string | null>(null);

  const token = accessToken ?? undefined;
  const groupConversationId = routeParam(params.groupConversationId);
  const groupName = routeParam(params.groupName);
  const spaceId = routeParam(params.spaceId);
  const groupMembersParam = routeParam(params.groupMembers);

  const routeGroupMembers = useMemo(() => {
    if (!groupMembersParam) return [];
    try {
      const parsed = JSON.parse(groupMembersParam);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }, [groupMembersParam]);

  const selectedParticipantId = useMemo(() => {
    if (!selectedConversation || !user) return null;
    if (isGroupConversation(selectedConversation)) return null;
    return (
      selectedConversation.participant_ids.find((id) => id !== user.id) ??
      selectedConversation.participant_ids[0] ??
      null
    );
  }, [selectedConversation, user]);

  const loadConversationList = useCallback(async () => {
    if (!token) return;

    const directConversations = await getConversations(token);
    let groupConversations: Conversation[] = [];

    try {
      groupConversations = (await getGroupConversations(token)).map((conversation) => ({
        ...conversation,
        conversation_type: 'GROUP',
        participant_ids: conversation.participant_ids ?? [],
        match_id: conversation.match_id ?? null,
        unread_count: conversation.unread_count ?? 0,
      }));
    } catch {
      groupConversations = [];
    }

    const nextConversations = mergeConversations([...directConversations, ...groupConversations]);
    setConversations(nextConversations);
    return nextConversations;
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      setErrorMessage(null);
      setLoadingConversations(true);
      try {
        await loadConversationList();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Error al cargar conversaciones.');
      } finally {
        setLoadingConversations(false);
      }
    };

    load();
  }, [loadConversationList, token]);

  useEffect(() => {
    if (!token) return;

    markOnline(token).catch(() => undefined);
    return () => {
      markOffline(token).catch(() => undefined);
    };
  }, [token]);

  const refreshConversationList = async () => {
    if (!token) return;
    try {
      await loadConversationList();
    } catch {
      // preserve existing list if refresh fails
    }
  };

  const loadConversationMessages = useCallback(async (conversation: Conversation) => {
    if (!token || !user) return;

    setSelectedConversation(conversation);
    setMessagesError(null);
    setLoadingMessages(true);

    try {
      const fetchedMessages = isGroupConversation(conversation)
        ? await getGroupMessages(conversation.id, { limit: 50, skip: 0 }, token)
        : await getMessages(conversation.id, { limit: 50, skip: 0 }, token);
      const orderedMessages = [...fetchedMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setMessages(orderedMessages);
      if (!isGroupConversation(conversation)) {
        await markConversationAsRead(conversation.id, token);
        setConversations((current) =>
          current.map((item) =>
            item.id === conversation.id ? { ...item, unread_count: 0 } : item,
          ),
        );
      }
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'No se pudieron cargar mensajes.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
      if (isGroupConversation(conversation)) {
        setOnlineStatus(null);
        return;
      }
      const conversationParticipantId =
        conversation.participant_ids.find((id) => id !== user.id) ??
        conversation.participant_ids[0];

      if (conversationParticipantId) {
        getPresence(conversationParticipantId, token)
          .then((presence) => {
            setOnlineStatus(presence.is_online ? 'En línea' : 'Offline');
          })
          .catch(() => {
            setOnlineStatus(null);
          });
      }
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !groupConversationId || openedGroupConversationRef.current === groupConversationId) {
      return;
    }

    openedGroupConversationRef.current = groupConversationId;

    const openGroupConversation = async () => {
      setLoadingConversations(true);
      try {
        const loadedConversations = await loadConversationList();
        const existingConversation = loadedConversations?.find(
          (conversation) => conversation.id === groupConversationId,
        );
        const groupConversation =
          existingConversation ?? {
            id: groupConversationId,
            participant_ids: routeGroupMembers,
            match_id: null,
            conversation_type: 'GROUP' as const,
            name: groupName ?? 'Grupo',
            title: groupName ?? 'Grupo',
            space_id: spaceId ?? null,
            last_message: null,
            last_message_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            unread_count: 0,
          };

        setConversations((current) => mergeConversations([...current, groupConversation]));
        await loadConversationMessages(groupConversation);
      } catch (error) {
        setMessagesError(error instanceof Error ? error.message : 'No se pudo abrir el chat del grupo.');
      } finally {
        setLoadingConversations(false);
      }
    };

    openGroupConversation();
  }, [loadConversationList, loadConversationMessages, token, groupConversationId, groupName, spaceId, routeGroupMembers]);

  useEffect(() => {
    if (selectedConversation || conversations.length === 0 || groupConversationId) return;
    loadConversationMessages(conversations[0]);
  }, [conversations, groupConversationId, loadConversationMessages, selectedConversation]);

  const handleSelectConversation = async (conversation: Conversation) => {
    await loadConversationMessages(conversation);
  };

  const handleSendMessage = async () => {
    if (!token || !selectedConversation) return;

    const trimmed = messageText.trim();
    if (!trimmed) return;

    try {
      setSendingMessage(true);
      const sentMessage = isGroupConversation(selectedConversation)
        ? await sendGroupMessage(selectedConversation.id, trimmed, token)
        : await sendMessage(selectedConversation.id, trimmed, token);
      setMessages((current) => [...current, sentMessage]);
      setMessageText('');
      await refreshConversationList();
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSendingMessage(false);
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  };

  if (!user || !token) {
    return null;
  }

  const selectedParticipants = selectedConversation
    ? getParticipantIds(
        selectedConversation,
        user.id,
        selectedConversation.id === groupConversationId ? routeGroupMembers : [],
      )
    : [];

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MENSAJES</Text>
            <Text style={styles.title}>Chat</Text>
          </View>
          <View style={styles.headerBadge}>
            <View style={styles.headerBadgeDot} />
            <Text style={styles.headerBadgeText}>{conversations.length}</Text>
          </View>
        </View>


        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conversaciones</Text>
          {loadingConversations ? (
            <ActivityIndicator />
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Aún no hay chats</Text>
              <Text style={styles.emptyStateText}>
                Cuando tengas matches o entres a un grupo, tus conversaciones aparecerán aquí.
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.horizontalList}
              contentContainerStyle={styles.conversationListContent}
              data={conversations}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedConversation?.id === item.id;
                const conversationTitle = getConversationTitle(item, user.id);
                const group = isGroupConversation(item);
                const participantCount = getParticipantIds(
                  item,
                  user.id,
                  item.id === groupConversationId ? routeGroupMembers : [],
                ).length;
                return (
                  <Pressable
                    onPress={() => handleSelectConversation(item)}
                    style={[styles.conversationItem, isSelected && styles.conversationItemSelected]}
                  >
                    <View style={[styles.avatar, group && styles.avatarGroup]}>
                      <Text style={styles.avatarText}>{getConversationInitials(conversationTitle)}</Text>
                    </View>
                    <View style={styles.conversationTitleRow}>
                      <Text numberOfLines={1} style={styles.conversationTitle}>{conversationTitle}</Text>
                      {item.unread_count > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.conversationType}>
                      {group ? `${participantCount} participantes` : 'Chat directo'}
                    </Text>
                    <Text style={styles.conversationSnippet}>
                      {item.last_message ?? 'Sin mensajes aún'}
                    </Text>
                    <Text style={styles.conversationMeta}>
                      {item.last_message_at ? formatDate(item.last_message_at) : 'Sin actividad'}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={styles.chatArea}>
          {selectedConversation ? (
            <View style={{ flex: 1 }}>
              <View style={styles.conversationHeader}>
                <View style={styles.activeConversationTitle}>
                  <View
                    style={[
                      styles.avatarSmall,
                      isGroupConversation(selectedConversation) && styles.avatarGroup,
                    ]}
                  >
                    <Text style={styles.avatarSmallText}>
                      {getConversationInitials(getConversationTitle(selectedConversation, user.id))}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.conversationHeaderTitle}>
                      {isGroupConversation(selectedConversation)
                        ? getConversationTitle(selectedConversation, user.id)
                        : `Conversación con ${selectedParticipantId ?? 'participante'}`}
                    </Text>
                    <Text style={styles.conversationHeaderMeta}>
                      {isGroupConversation(selectedConversation) ? 'Chat compartido del grupo' : 'Chat directo'}
                    </Text>
                  </View>
                </View>
                {onlineStatus && !isGroupConversation(selectedConversation) ? (
                  <Text style={styles.presenceText}>{onlineStatus}</Text>
                ) : null}
              </View>

              <View style={styles.participantsPanel}>
                <Text style={styles.participantsTitle}>Participantes</Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.participantListContent}
                  data={selectedParticipants}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <View style={styles.participantChip}>
                      <Text style={styles.participantChipText}>
                        {formatParticipantLabel(item, user.id)}
                      </Text>
                    </View>
                  )}
                />
              </View>

              {loadingMessages ? (
                <ActivityIndicator />
              ) : messagesError ? (
                <View style={styles.emptyState}>
                  <Text style={styles.errorText}>{messagesError}</Text>
                </View>
              ) : messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Sin mensajes en esta conversación.</Text>
                </View>
              ) : (
                <FlatList
                  ref={scrollRef}
                  style={styles.messageList}
                  contentContainerStyle={styles.messageListContent}
                  data={[...messages].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                  )}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isSentByUser = item.sender_id === user.id;
                    return (
                      <View
                        style={[
                          styles.messageContainer,
                          isSentByUser ? styles.messageContainerSent : styles.messageContainerReceived,
                        ]}
                      >
                        <Text style={[styles.messageText, isSentByUser && styles.messageTextSent]}>
                          {item.content}
                        </Text>
                        <Text style={[styles.messageMeta, isSentByUser && styles.messageMetaSent]}>
                          {formatDate(item.created_at)}
                        </Text>
                      </View>
                    );
                  }}
                />
              )}

              <View style={styles.composer}>
                <View style={styles.composerRow}>
                  <TextInput
                    value={messageText}
                    onChangeText={setMessageText}
                    placeholder='Escribe un mensaje'
                    style={styles.messageInput}
                    editable={!sendingMessage}
                    placeholderTextColor='rgba(255,78,122,0.45)'
                  />
                  <Pressable
                    style={[styles.sendButton, (sendingMessage || messageText.trim().length === 0) && styles.buttonDisabled]}
                    onPress={handleSendMessage}
                    disabled={sendingMessage || messageText.trim().length === 0}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator color='#ffffff' />
                    ) : (
                      <Text style={styles.sendButtonText}>Enviar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Selecciona una conversación para ver mensajes.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
