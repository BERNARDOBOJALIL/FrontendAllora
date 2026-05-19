import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";

import { styles } from "@/app/(tabs)/chat.styles";
import { useAuth } from "@/providers/auth-context";
import {
    Conversation,
    getConversations,
    getGroupConversations,
    getGroupMessages,
    getMessages,
    getPresence,
    markConversationAsRead,
    markOffline,
    markOnline,
    Message,
    sendGroupMessage,
    sendMessage,
} from "@/services/chat";

const AUTH_SERVICE_URL =
  process.env.EXPO_PUBLIC_AUTH_SERVICE_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "http://localhost:8000";

type UserNameMap = Record<string, string>;
type NameCandidate = { id: string; name: string };

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function extractProfileName(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return "";
  const record = payload as Record<string, unknown>;
  const direct =
    record.nombre ??
    record.name ??
    record.full_name ??
    record.fullName ??
    record.display_name ??
    record.displayName ??
    record.username;

  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return extractProfileName(
    record.user ?? record.profile ?? record.data ?? record.result,
  );
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function collectNameCandidates(value: unknown): NameCandidate[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap(collectNameCandidates);
  }

  const record = value as Record<string, unknown>;
  const id =
    readString(record, "id") ||
    readString(record, "user_id") ||
    readString(record, "userId") ||
    readString(record, "sender_id") ||
    readString(record, "senderId") ||
    readString(record, "participant_id") ||
    readString(record, "participantId");
  const name = extractProfileName(record);
  const candidates: NameCandidate[] =
    id && name && name !== id ? [{ id, name }] : [];

  const maps = [
    record.participant_names,
    record.participantNames,
    record.user_names,
    record.userNames,
    record.names_by_user_id,
    record.namesByUserId,
    record.users_by_id,
    record.usersById,
  ];

  maps.forEach((mapValue) => {
    if (!mapValue || typeof mapValue !== "object" || Array.isArray(mapValue))
      return;
    Object.entries(mapValue as Record<string, unknown>).forEach(
      ([mapId, mapNameValue]) => {
        const mapName =
          typeof mapNameValue === "string"
            ? mapNameValue.trim()
            : extractProfileName(mapNameValue);
        if (mapId && mapName && mapName !== mapId) {
          candidates.push({ id: mapId, name: mapName });
        }
      },
    );
  });

  [
    "participants",
    "members",
    "users",
    "sender",
    "receiver",
    "user",
    "profile",
    "data",
  ].forEach((key) => {
    candidates.push(...collectNameCandidates(record[key]));
  });

  return candidates;
}

async function fetchUserDisplayName(userId: string, token?: string) {
  const baseUrl = AUTH_SERVICE_URL.replace(/\/$/, "");
  const encodedId = encodeURIComponent(userId);
  const response = await fetch(`${baseUrl}/users/${encodedId}`, {
    headers: {
      Accept: "application/json",
      ...(token
        ? { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` }
        : {}),
    },
  });

  if (!response.ok) {
    return "";
  }

  const name = extractProfileName(await response.json());
  return name && name !== userId ? name : "";
}

function isGroupConversation(conversation: Conversation) {
  return (
    conversation.conversation_type === "GROUP" ||
    conversation.participant_ids.length === 0
  );
}

function getParticipantIds(
  conversation: Conversation,
  currentUserId: string,
  fallbackMembers: string[] = [],
) {
  const ids =
    conversation.participant_ids.length > 0
      ? conversation.participant_ids
      : fallbackMembers;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (!uniqueIds.includes(currentUserId)) {
    uniqueIds.unshift(currentUserId);
  }

  return uniqueIds;
}

function getConversationTitle(
  conversation: Conversation,
  currentUserId: string,
  nameForUser: (userId: string) => string,
) {
  if (isGroupConversation(conversation)) {
    return conversation.name ?? conversation.title ?? "Grupo";
  }

  const participantId =
    conversation.participant_ids.find((id) => id !== currentUserId) ??
    conversation.participant_ids[0];

  return participantId ? nameForUser(participantId) : "Conversacion";
}

function getConversationInitials(title: string) {
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "A";
}

function formatParticipantLabel(
  participantId: string,
  currentUserId: string,
  nameForUser: (userId: string) => string,
) {
  if (participantId === currentUserId) return "Tu";
  return nameForUser(participantId);
}

function mergeConversations(conversations: Conversation[]) {
  const byId = new Map<string, Conversation>();
  conversations.forEach((conversation) => {
    byId.set(conversation.id, conversation);
  });
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() -
      new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime(),
  );
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map<string, Message>();
  [...current, ...incoming].forEach((message) => {
    byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
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
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<UserNameMap>({});
  const scrollRef = useRef<FlatList<Message> | null>(null);
  const openedGroupConversationRef = useRef<string | null>(null);
  const fetchedNameIdsRef = useRef(new Set<string>());
  const fetchingNameIdsRef = useRef(new Set<string>());

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

  const nameForUser = useCallback(
    (userId: string) => {
      if (userId === user?.id) return user?.nombre ?? "Tu";
      const knownName = userNames[userId]?.trim();
      if (knownName) return knownName;
      return userId ? `Usuario ${userId.slice(0, 6)}` : "Usuario";
    },
    [user?.id, user?.nombre, userNames],
  );

  const applyNameCandidates = useCallback(
    (values: unknown[]) => {
      const nextNames: UserNameMap = {};
      values.forEach((value) => {
        collectNameCandidates(value).forEach(({ id, name }) => {
          if (id && name && id !== user?.id) {
            nextNames[id] = name;
          }
        });
      });

      if (Object.keys(nextNames).length === 0) return;
      setUserNames((current) => ({ ...current, ...nextNames }));
    },
    [user?.id],
  );

  const ensureNamesForIds = useCallback(
    async (ids: string[]) => {
      if (!token || !user?.id) return;

      const uniqueIds = Array.from(new Set(ids.filter(Boolean))).filter(
        (id) => id !== user.id,
      );
      if (uniqueIds.length === 0) return;

      const pending = uniqueIds.filter(
        (id) =>
          !userNames[id] &&
          !fetchedNameIdsRef.current.has(id) &&
          !fetchingNameIdsRef.current.has(id),
      );
      if (pending.length === 0) return;

      pending.forEach((id) => fetchingNameIdsRef.current.add(id));

      await Promise.all(
        pending.map(async (id) => {
          try {
            const name = await fetchUserDisplayName(id, token);
            if (name) {
              setUserNames((current) => ({ ...current, [id]: name }));
            }
          } catch {
            // Ignore individual lookup failures; UI will keep existing fallback.
          } finally {
            fetchedNameIdsRef.current.add(id);
            fetchingNameIdsRef.current.delete(id);
          }
        }),
      );
    },
    [token, user?.id, userNames],
  );

  const selectedParticipantId = useMemo(() => {
    if (!selectedConversation || !user) return null;
    if (isGroupConversation(selectedConversation)) return null;
    return (
      selectedConversation.participant_ids.find((id) => id !== user.id) ??
      selectedConversation.participant_ids[0] ??
      null
    );
  }, [selectedConversation, user]);

  const selectedParticipants = useMemo(() => {
    if (!selectedConversation || !user) return [];
    return getParticipantIds(
      selectedConversation,
      user.id,
      selectedConversation.id === groupConversationId ? routeGroupMembers : [],
    );
  }, [groupConversationId, routeGroupMembers, selectedConversation, user]);

  const loadConversationList = useCallback(async () => {
    if (!token) return [];

    const directConversations = await getConversations(token);
    let groupConversations: Conversation[] = [];

    try {
      groupConversations = (await getGroupConversations(token)).map(
        (conversation) => ({
          ...conversation,
          conversation_type: "GROUP",
          participant_ids: conversation.participant_ids ?? [],
          match_id: conversation.match_id ?? null,
          unread_count: conversation.unread_count ?? 0,
        }),
      );
    } catch {
      groupConversations = [];
    }

    const nextConversations = mergeConversations([
      ...directConversations,
      ...groupConversations,
    ]);
    applyNameCandidates(nextConversations);
    setConversations(nextConversations);
    return nextConversations;
  }, [applyNameCandidates, token]);

  const syncConversationMessages = useCallback(
    async (
      conversation: Conversation,
      options: {
        showLoading?: boolean;
        showErrors?: boolean;
        markRead?: boolean;
      } = {},
    ) => {
      if (!token || !user) return;

      if (options.showLoading) setLoadingMessages(true);
      if (options.showErrors) setMessagesError(null);

      try {
        const fetchedMessages = isGroupConversation(conversation)
          ? await getGroupMessages(
              conversation.id,
              { limit: 80, skip: 0 },
              token,
            )
          : await getMessages(conversation.id, { limit: 80, skip: 0 }, token);

        applyNameCandidates(fetchedMessages);
        await ensureNamesForIds(
          fetchedMessages.map((message) => message.sender_id),
        );
        setMessages((current) => mergeMessages(current, fetchedMessages));

        if (options.markRead && !isGroupConversation(conversation)) {
          await markConversationAsRead(conversation.id, token);
          setConversations((current) =>
            current.map((item) =>
              item.id === conversation.id ? { ...item, unread_count: 0 } : item,
            ),
          );
        }
      } catch (error) {
        if (options.showErrors) {
          setMessagesError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar mensajes.",
          );
        }
      } finally {
        if (options.showLoading) setLoadingMessages(false);
      }
    },
    [applyNameCandidates, ensureNamesForIds, token, user],
  );

  const loadConversationMessages = useCallback(
    async (conversation: Conversation) => {
      if (!token || !user) return;

      setSelectedConversation(conversation);
      setMessages([]);
      await syncConversationMessages(conversation, {
        showLoading: true,
        showErrors: true,
        markRead: true,
      });

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
            setOnlineStatus(presence.is_online ? "En linea" : "Offline");
          })
          .catch(() => {
            setOnlineStatus(null);
          });
      }
    },
    [syncConversationMessages, token, user],
  );

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      setErrorMessage(null);
      setLoadingConversations(true);
      try {
        await loadConversationList();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Error al cargar conversaciones.",
        );
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

  useEffect(() => {
    if (!user?.id || !user.nombre) return;
    setUserNames((current) => ({ ...current, [user.id]: user.nombre }));
  }, [user?.id, user?.nombre]);

  useEffect(() => {
    if (!token) return;

    const intervalId = setInterval(() => {
      loadConversationList().catch(() => undefined);
    }, 6000);

    return () => clearInterval(intervalId);
  }, [loadConversationList, token]);

  useEffect(() => {
    if (!selectedConversation || !token) return;

    const intervalId = setInterval(() => {
      syncConversationMessages(selectedConversation, { markRead: true }).catch(
        () => undefined,
      );
    }, 2500);

    return () => clearInterval(intervalId);
  }, [selectedConversation, syncConversationMessages, token]);

  useEffect(() => {
    const ids = new Set<string>();
    conversations.forEach((conversation) => {
      conversation.participant_ids.forEach((id) => ids.add(id));
    });
    selectedParticipants.forEach((id) => ids.add(id));
    messages.forEach((message) => ids.add(message.sender_id));

    if (user?.id) ids.delete(user.id);
    const missingIds = Array.from(ids).filter(
      (id) =>
        id &&
        !fetchedNameIdsRef.current.has(id) &&
        !fetchingNameIdsRef.current.has(id),
    );
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => {
      fetchingNameIdsRef.current.add(id);
      fetchUserDisplayName(id, token)
        .then((name) => {
          fetchedNameIdsRef.current.add(id);
          if (!name) return;
          setUserNames((current) => ({ ...current, [id]: name }));
        })
        .catch(() => {
          fetchedNameIdsRef.current.add(id);
        })
        .finally(() => {
          fetchingNameIdsRef.current.delete(id);
        });
    });
  }, [conversations, messages, selectedParticipants, token, user?.id]);

  useEffect(() => {
    if (
      !token ||
      !groupConversationId ||
      openedGroupConversationRef.current === groupConversationId
    ) {
      return;
    }

    openedGroupConversationRef.current = groupConversationId;

    const openGroupConversation = async () => {
      setLoadingConversations(true);
      try {
        const loadedConversations = await loadConversationList();
        const existingConversation = loadedConversations.find(
          (conversation) => conversation.id === groupConversationId,
        );
        const groupConversation = existingConversation ?? {
          id: groupConversationId,
          participant_ids: routeGroupMembers,
          match_id: null,
          conversation_type: "GROUP" as const,
          name: groupName ?? "Grupo",
          title: groupName ?? "Grupo",
          space_id: spaceId ?? null,
          last_message: null,
          last_message_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          unread_count: 0,
        };

        setConversations((current) =>
          mergeConversations([...current, groupConversation]),
        );
        await loadConversationMessages(groupConversation);
      } catch (error) {
        setMessagesError(
          error instanceof Error
            ? error.message
            : "No se pudo abrir el chat del grupo.",
        );
      } finally {
        setLoadingConversations(false);
      }
    };

    openGroupConversation();
  }, [
    loadConversationList,
    loadConversationMessages,
    token,
    groupConversationId,
    groupName,
    spaceId,
    routeGroupMembers,
  ]);

  useEffect(() => {
    if (
      selectedConversation ||
      conversations.length === 0 ||
      groupConversationId
    )
      return;
    loadConversationMessages(conversations[0]);
  }, [
    conversations,
    groupConversationId,
    loadConversationMessages,
    selectedConversation,
  ]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  const refreshConversationList = async () => {
    if (!token) return;
    try {
      await loadConversationList();
    } catch {
      // preserve existing list if refresh fails
    }
  };

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
      setMessages((current) => mergeMessages(current, [sentMessage]));
      setMessageText("");
      await refreshConversationList();
    } catch (error) {
      setMessagesError(
        error instanceof Error
          ? error.message
          : "No se pudo enviar el mensaje.",
      );
    } finally {
      setSendingMessage(false);
    }
  };

  if (!user || !token) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ALLORA</Text>
            <Text style={styles.title}>Chat</Text>
          </View>
          <View style={styles.headerBadge}>
            <View style={styles.headerBadgeDot} />
            <Text style={styles.headerBadgeText}>{conversations.length}</Text>
          </View>
        </View>

        <View style={styles.section}>
          {loadingConversations ? (
            <ActivityIndicator />
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Aun no hay chats</Text>
              <Text style={styles.emptyStateText}>
                Cuando tengas matches o entres a un grupo, tus conversaciones
                apareceran aqui.
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
                const conversationTitle = getConversationTitle(
                  item,
                  user.id,
                  nameForUser,
                );
                const group = isGroupConversation(item);
                const participantCount = getParticipantIds(
                  item,
                  user.id,
                  item.id === groupConversationId ? routeGroupMembers : [],
                ).length;

                return (
                  <Pressable
                    onPress={() => handleSelectConversation(item)}
                    style={[
                      styles.conversationItem,
                      isSelected && styles.conversationItemSelected,
                    ]}
                  >
                    <View style={[styles.avatar, group && styles.avatarGroup]}>
                      <Text style={styles.avatarText}>
                        {getConversationInitials(conversationTitle)}
                      </Text>
                    </View>
                    <View style={styles.conversationCardBody}>
                      <View style={styles.conversationTitleRow}>
                        <Text
                          numberOfLines={1}
                          style={styles.conversationTitle}
                        >
                          {conversationTitle}
                        </Text>
                        {item.unread_count > 0 ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {item.unread_count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.conversationType}>
                        {group
                          ? `${participantCount} participantes`
                          : "Chat directo"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.conversationSnippet}
                      >
                        {item.last_message ?? "Sin mensajes aun"}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={styles.chatArea}>
          {selectedConversation ? (
            <View style={styles.chatPane}>
              <View style={styles.conversationHeader}>
                <View style={styles.activeConversationTitle}>
                  <View
                    style={[
                      styles.avatarSmall,
                      isGroupConversation(selectedConversation) &&
                        styles.avatarGroup,
                    ]}
                  >
                    <Text style={styles.avatarSmallText}>
                      {getConversationInitials(
                        getConversationTitle(
                          selectedConversation,
                          user.id,
                          nameForUser,
                        ),
                      )}
                    </Text>
                  </View>
                  <View style={styles.conversationHeaderCopy}>
                    <Text
                      numberOfLines={1}
                      style={styles.conversationHeaderTitle}
                    >
                      {isGroupConversation(selectedConversation)
                        ? getConversationTitle(
                            selectedConversation,
                            user.id,
                            nameForUser,
                          )
                        : nameForUser(selectedParticipantId ?? "")}
                    </Text>
                    <Text style={styles.conversationHeaderMeta}>
                      {isGroupConversation(selectedConversation)
                        ? "Chat compartido del grupo"
                        : (onlineStatus ?? "Chat directo")}
                    </Text>
                  </View>
                </View>
              </View>

              {isGroupConversation(selectedConversation) &&
              selectedParticipants.length > 0 ? (
                <View style={styles.participantsPanel}>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.participantListContent}
                    data={selectedParticipants}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                      <View style={styles.participantChip}>
                        <Text style={styles.participantChipText}>
                          {formatParticipantLabel(item, user.id, nameForUser)}
                        </Text>
                      </View>
                    )}
                  />
                </View>
              ) : null}

              {loadingMessages ? (
                <View style={styles.loadingMessages}>
                  <ActivityIndicator />
                </View>
              ) : messagesError ? (
                <View style={styles.emptyState}>
                  <Text style={styles.errorText}>{messagesError}</Text>
                </View>
              ) : messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Sin mensajes en esta conversacion.
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={scrollRef}
                  style={styles.messageList}
                  contentContainerStyle={styles.messageListContent}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isSentByUser = item.sender_id === user.id;
                    return (
                      <View
                        style={[
                          styles.messageRow,
                          isSentByUser
                            ? styles.messageRowSent
                            : styles.messageRowReceived,
                        ]}
                      >
                        {isGroupConversation(selectedConversation) ? (
                          <Text style={styles.messageSender}>
                            {nameForUser(item.sender_id)}
                          </Text>
                        ) : null}
                        <View
                          style={[
                            styles.messageContainer,
                            isSentByUser
                              ? styles.messageContainerSent
                              : styles.messageContainerReceived,
                          ]}
                        >
                          <Text
                            style={[
                              styles.messageText,
                              isSentByUser && styles.messageTextSent,
                            ]}
                          >
                            {item.content}
                          </Text>
                          <Text
                            style={[
                              styles.messageMeta,
                              isSentByUser && styles.messageMetaSent,
                            ]}
                          >
                            {formatDate(item.created_at)}
                          </Text>
                        </View>
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
                    placeholder="Escribe un mensaje"
                    style={styles.messageInput}
                    editable={!sendingMessage}
                    placeholderTextColor="rgba(26,26,46,0.35)"
                  />
                  <Pressable
                    style={[
                      styles.sendButton,
                      (sendingMessage || messageText.trim().length === 0) &&
                        styles.buttonDisabled,
                    ]}
                    onPress={handleSendMessage}
                    disabled={sendingMessage || messageText.trim().length === 0}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.sendButtonText}>Enviar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Selecciona una conversacion para ver mensajes.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
