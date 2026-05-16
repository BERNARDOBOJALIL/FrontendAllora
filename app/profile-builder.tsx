import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/providers/auth-context';
import {
  type AgentMessage,
  type ProfileSnapshot,
  sendProfileMessage,
} from '@/services/profile-agent';
import { getProfileMemory } from '@/services/profile';

const STARTERS = [
  'Me gusta la musica tranquila y creativa',
  'Busco conocer gente con buena vibra',
  'Me gustan los cafes y los parques',
  'Quiero un perfil honesto y autentico',
];

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function SummaryLine({ label, value }: { label: string; value?: string[] }) {
  const text = value && value.length > 0 ? value.join(' · ') : 'Sin datos aún';

  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

function SummaryText({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryText}>{value?.trim() ? value : 'Sin datos aún'}</Text>
    </View>
  );
}

export default function ProfileBuilderScreen() {
  const router = useRouter();
  const { user, isAuthenticated, accessToken } = useAuth();

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: createId('assistant'),
      role: 'assistant',
      text: 'Hola, soy Allora. Cuentame sobre ti y voy construyendo tu perfil contigo.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileSnapshot, setProfileSnapshot] = useState<Partial<ProfileSnapshot> | null>(null);
  const [lastAssistantText, setLastAssistantText] = useState<string | null>(null);

  const canContinue = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    let active = true;

    const loadProfile = async () => {
      try {
        const response = await getProfileMemory(user.id, accessToken);
        if (!active) return;

        if (response.profile_memory) {
          setProfileSnapshot(response.profile_memory as Partial<ProfileSnapshot>);
        }
      } catch {
        // Best effort: if the backend has no stored memory yet, keep the chat empty-state.
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [user?.id, accessToken]);

  if (!isAuthenticated) {
    return <Redirect href='/auth' />;
  }

  const sendMessage = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || isSending) return;

    setErrorMessage(null);
    setIsSending(true);

    const userMessage: AgentMessage = {
      id: createId('user'),
      role: 'user',
      text: cleanText,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    try {
      const result = await sendProfileMessage({
        text: cleanText,
        history: [...messages, userMessage],
        userId: user?.id,
        name: user?.nombre,
        email: user?.email,
        token: accessToken ?? undefined,
      });

      if (result.assistantText) setLastAssistantText(result.assistantText);

      if (result.profileSnapshot) {
        setProfileSnapshot((current) => ({
          ...current,
          ...result.profileSnapshot,
        }));
      }

      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text:
            result.assistantText ??
            'Recibido. Sigueme contando un poco mas para completar tu perfil.',
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo hablar con el agente.';
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Construir perfil</Text>
            <Text style={styles.subtitle}>
              Chatea con el agente para completar tu perfil.
            </Text>
          </View>

          <View style={styles.profileBox}>
            <Text style={styles.sectionTitle}>Lo que ya entendí</Text>
            {lastAssistantText ? (
              <View style={styles.assistantCard}>
                <Text style={styles.assistantCardLabel}>Última respuesta del agente</Text>
                <Text style={styles.assistantCardText}>{lastAssistantText}</Text>
              </View>
            ) : null}

            {profileSnapshot ? (
              <View style={styles.summaryGrid}>
                <SummaryLine label="Intereses" value={profileSnapshot.interests} />
                <SummaryLine label="Rasgos" value={profileSnapshot.traits} />
                <SummaryLine label="Hobbies" value={profileSnapshot.hobbies} />
                <SummaryLine label="Ambientes" value={profileSnapshot.favoriteEnvironments} />
                <SummaryText label="Estilo social" value={profileSnapshot.socialStyle} />
                <SummaryText label="Resumen" value={profileSnapshot.vibeSummary} />
                <SummaryText label="Emoción" value={profileSnapshot.emotionalStyle} />
                <SummaryText label="Tema actual" value={profileSnapshot.currentMoodTheme} />
                <SummaryText label="Profundidad" value={profileSnapshot.depthPreference} />
                <Pressable
                  style={styles.profileShortcut}
                  onPress={() => router.push('/(tabs)/my-profile')}
                >
                  <Text style={styles.profileShortcutText}>Editar en Mi perfil</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>
                Aun no hay datos suficientes. Empieza con una frase sobre ti y el agente irá
                construyendo tu perfil.
              </Text>
            )}
          </View>

          <ScrollView style={styles.chatList} contentContainerStyle={styles.chatContent}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    message.role === 'user' ? styles.userText : styles.assistantText,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            ))}
            {isSending && (
              <View style={[styles.messageBubble, styles.assistantBubble]}>
                <ActivityIndicator color='#111111' />
              </View>
            )}
          </ScrollView>

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          <View style={styles.startersRow}>
            {STARTERS.map((starter) => (
              <Pressable key={starter} onPress={() => setInput(starter)} style={styles.starterChip}>
                <Text style={styles.starterText}>{starter}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.composer}>
            <TextInput
              placeholder='Escribe como eres, que buscas, tus gustos...'
              value={input}
              onChangeText={setInput}
              style={styles.input}
              multiline
            />
            <Pressable
              onPress={() => sendMessage(input)}
              style={[styles.sendButton, !canContinue && styles.sendButtonDisabled]}
              disabled={!canContinue}
            >
              <Text style={styles.sendButtonText}>Enviar</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipButton}>
            <Text style={styles.skipText}>Terminar despues</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  profileBox: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  assistantCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 12,
  },
  assistantCardLabel: {
    color: '#f1f1f1',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  assistantCardText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryGrid: {
    gap: 10,
  },
  summaryBlock: {
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 14,
    color: '#111111',
    lineHeight: 20,
  },
  profileShortcut: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  profileShortcutText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  profileRow: {
    gap: 2,
  },
  profileLabel: {
    fontSize: 11,
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileValue: {
    fontSize: 13,
    color: '#111111',
  },
  helperText: {
    fontSize: 13,
    color: '#666666',
  },
  chatList: {
    flex: 1,
  },
  chatContent: {
    gap: 10,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#111111',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f4f4f4',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#111111',
  },
  errorText: {
    color: '#c1121f',
    fontSize: 12,
  },
  startersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  starterChip: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  starterText: {
    fontSize: 12,
    color: '#111111',
  },
  composer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  sendButton: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  skipText: {
    color: '#666666',
    fontSize: 13,
  },
});
