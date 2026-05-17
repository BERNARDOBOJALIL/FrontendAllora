import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function ChatScreen() {
  const { user, accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const scrollRef = useRef<FlatList<Message> | null>(null);

  const token = accessToken ?? undefined;

  const selectedParticipantId = useMemo(() => {
    if (!selectedConversation || !user) return null;
    return (
      selectedConversation.participant_ids.find((id) => id !== user.id) ??
      selectedConversation.participant_ids[0] ??
      null
    );
  }, [selectedConversation, user]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      setErrorMessage(null);
      setLoadingConversations(true);
      try {
        const response = await getConversations(token);
        setConversations(response);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Error al cargar conversaciones.');
      } finally {
        setLoadingConversations(false);
      }
    };

    load();
  }, [token]);

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
      const response = await getConversations(token);
      setConversations(response);
    } catch (error) {
      // preserve existing list if refresh fails
    }
  };

  const loadConversationMessages = async (conversation: Conversation) => {
    if (!token) return;

    setSelectedConversation(conversation);
    setMessagesError(null);
    setLoadingMessages(true);

    try {
      const fetchedMessages = await getMessages(conversation.id, { limit: 50, skip: 0 }, token);
      const orderedMessages = [...fetchedMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setMessages(orderedMessages);
      await markConversationAsRead(conversation.id, token);
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id ? { ...item, unread_count: 0 } : item,
        ),
      );
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'No se pudieron cargar mensajes.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
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
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    await loadConversationMessages(conversation);
  };

  const handleCreateConversation = async () => {
    if (!token) return;
    setConversationError(null);

    const trimmedParticipantId = participantId.trim();
    const trimmedMatchId = matchId.trim();

    if (!trimmedParticipantId) {
      setConversationError('Ingresa el ID del participante.');
      return;
    }

    try {
      setCreatingConversation(true);
      const conversation = await createConversation(trimmedParticipantId, trimmedMatchId || undefined, token);
      setParticipantId('');
      setMatchId('');
      await refreshConversationList();
      await loadConversationMessages(conversation);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : 'No se pudo crear la conversación.');
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleSendMessage = async () => {
    if (!token || !selectedConversation) return;

    const trimmed = messageText.trim();
    if (!trimmed) return;

    try {
      setSendingMessage(true);
      const sentMessage = await sendMessage(selectedConversation.id, trimmed, token);
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

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.description}>Comunícate con tus conversaciones protegidas por JWT.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nueva conversación</Text>
          <View style={styles.card}>
            <TextInput
              value={participantId}
              onChangeText={setParticipantId}
              placeholder='Participant ID'
              style={styles.input}
              autoCapitalize='none'
              placeholderTextColor='#9ca3af'
            />
            <TextInput
              value={matchId}
              onChangeText={setMatchId}
              placeholder='Match ID (opcional)'
              style={styles.input}
              autoCapitalize='none'
              placeholderTextColor='#9ca3af'
            />
            {conversationError ? <Text style={styles.errorText}>{conversationError}</Text> : null}
            <Pressable
              style={[styles.button, creatingConversation && styles.buttonDisabled]}
              onPress={handleCreateConversation}
              disabled={creatingConversation}
            >
              {creatingConversation ? (
                <ActivityIndicator color='#ffffff' />
              ) : (
                <Text style={styles.buttonText}>Crear o abrir conversación</Text>
              )}
            </Pressable>
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
              <Text style={styles.emptyStateText}>No hay conversaciones. Crea una nueva para comenzar.</Text>
            </View>
          ) : (
            <FlatList
              style={styles.horizontalList}
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedConversation?.id === item.id;
                const otherId = item.participant_ids.find((id) => id !== user.id) ?? item.participant_ids[0];
                return (
                  <Pressable
                    onPress={() => handleSelectConversation(item)}
                    style={[styles.conversationItem, isSelected && styles.conversationItemSelected]}
                  >
                    <View style={styles.conversationTitleRow}>
                      <Text style={styles.conversationTitle}>{otherId ?? 'Conversación'}</Text>
                      {item.unread_count > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                        </View>
                      ) : null}
                    </View>
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
                <Text style={styles.conversationTitle}>
                  Conversación con {selectedParticipantId ?? 'participante'}
                </Text>
                {onlineStatus ? <Text style={styles.presenceText}>{onlineStatus}</Text> : null}
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
                        <Text style={styles.messageMeta}>{formatDate(item.created_at)}</Text>
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
                    placeholderTextColor='#9ca3af'
                  />
                  <Pressable
                    style={[styles.button, (sendingMessage || messageText.trim().length === 0) && styles.buttonDisabled]}
                    onPress={handleSendMessage}
                    disabled={sendingMessage || messageText.trim().length === 0}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator color='#ffffff' />
                    ) : (
                      <Text style={styles.buttonText}>Enviar</Text>
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
