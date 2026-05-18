import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/providers/auth-context';
import {
  type AgentMessage,
  type ProfileSnapshot,
  sendProfileMessage,
} from '@/services/profile-agent';
import { getProfileMemory } from '@/services/profile';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTERS = [
  'Me gusta la música tranquila y creativa',
  'Busco conocer gente con buena vibra',
  'Me gustan los cafés y los parques',
  'Quiero un perfil honesto y auténtico',
];

const PROGRESS_STEPS = 6;

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentAvatar({ size = 36 }: { size?: number }) {
  return (
    <View
      style={[
        styles.agentAv,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.agentAvLetter, { fontSize: size * 0.45 }]}>A</Text>
    </View>
  );
}

function TagStrip({ snapshot }: { snapshot: Partial<ProfileSnapshot> | null }) {
  const tags: string[] = [
    ...(snapshot?.interests ?? []),
    ...(snapshot?.hobbies ?? []),
    ...(snapshot?.traits ?? []),
  ].slice(0, 6);

  if (tags.length === 0) return null;

  return (
    <View style={styles.tagStrip}>
      <Text style={styles.tagStripLabel}>Ya sé de ti:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll}>
        {tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressBg}>
        <LinearGradient
          colors={['#f4547a', '#f87a5a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${pct}%` as any }]}
        />
      </View>
      <Text style={styles.progressPct}>{pct}%</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
      {!isUser && <AgentAvatar size={30} />}
      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {isUser ? (
          <LinearGradient
            colors={['#f4547a', '#f87a5a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.bubble, styles.bubbleUser]}
          >
            <Text style={styles.bubbleUserText}>{message.text}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.bubbleAi]}>
            <Text style={styles.bubbleAiText}>{message.text}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.msgRow}>
      <AgentAvatar size={30} />
      <View style={[styles.bubble, styles.bubbleAi, styles.typingBubble]}>
        <ActivityIndicator size="small" color="#f4547a" />
      </View>
    </View>
  );
}

function StarterChip({
  label,
  onPress,
}: {
  label: string;
  onPress: (label: string) => void;
}) {
  return (
    <Pressable style={styles.chip} onPress={() => onPress(label)}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function OnboardingGuide({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.guideCard}>
      <View style={styles.guideTopRow}>
        <View style={styles.guideBadge}>
          <Text style={styles.guideBadgeText}>1</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.guideTitle}>Tu perfil empieza aquí</Text>
          <Text style={styles.guideSubtitle}>
            Allora te hará preguntas cortas para entender tu vibra, gustos y forma de conectar.
          </Text>
        </View>
      </View>

      <View style={styles.guideSteps}>
        <View style={styles.guideStep}>
          <Text style={styles.guideStepNumber}>01</Text>
          <Text style={styles.guideStepText}>Responde con frases naturales, como si hablaras con alguien nuevo.</Text>
        </View>
        <View style={styles.guideStep}>
          <Text style={styles.guideStepNumber}>02</Text>
          <Text style={styles.guideStepText}>El agente irá llenando tu perfil y mostrando etiquetas de lo que aprende.</Text>
        </View>
        <View style={styles.guideStep}>
          <Text style={styles.guideStepNumber}>03</Text>
          <Text style={styles.guideStepText}>Puedes salir o llenar datos manualmente cuando quieras.</Text>
        </View>
      </View>

      <Pressable style={styles.guideButton} onPress={onDone}>
        <LinearGradient
          colors={['#f4547a', '#f87a5a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.guideButtonGradient}
        >
          <Text style={styles.guideButtonText}>Empezar conversación</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ProfileBuilderScreen() {
  const { user, isAuthenticated, accessToken } = useAuth();
  const params = useLocalSearchParams<{ firstRun?: string | string[] }>();
  const scrollRef = useRef<ScrollView>(null);
  const firstRun = Array.isArray(params.firstRun) ? params.firstRun[0] : params.firstRun;

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: createId('assistant'),
      role: 'assistant',
      text: '¡Hola! Soy Allora. Cuéntame sobre ti y voy construyendo tu perfil contigo.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileSnapshot, setProfileSnapshot] = useState<Partial<ProfileSnapshot> | null>(null);
  const [showGuide, setShowGuide] = useState(firstRun === '1');

  // Derived progress: count non-empty snapshot fields
  const filledFields = useMemo(() => {
    if (!profileSnapshot) return 0;
    return Object.values(profileSnapshot).filter((v) =>
      Array.isArray(v) ? v.length > 0 : Boolean(v?.trim?.())
    ).length;
  }, [profileSnapshot]);

  const canSend = input.trim().length > 0 && !isSending;

  // Load existing profile memory on mount
  useEffect(() => {
    if (!user?.id || !accessToken) return;
    let active = true;
    (async () => {
      try {
        const response = await getProfileMemory(user.id, accessToken);
        if (!active) return;
        if (response.profile_memory) {
          setProfileSnapshot(response.profile_memory as Partial<ProfileSnapshot>);
        }
      } catch {
        // best-effort
      }
    })();
    return () => { active = false; };
  }, [user?.id, accessToken]);

  if (!isAuthenticated) return <Redirect href="/auth" />;

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || isSending) return;

    setErrorMessage(null);
    setIsSending(true);

    const userMsg: AgentMessage = { id: createId('user'), role: 'user', text: clean };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const result = await sendProfileMessage({
        text: clean,
        history: [...messages, userMsg],
        userId: user?.id,
        name: user?.nombre,
        email: user?.email,
        token: accessToken ?? undefined,
      });

      if (result.profileSnapshot) {
        setProfileSnapshot((prev) => ({ ...prev, ...result.profileSnapshot }));
      }

      setMessages((prev) => [
        ...prev,
        {
          id: createId('assistant'),
          role: 'assistant',
          text:
            result.assistantText ??
            'Recibido. Sígueme contando un poco más para completar tu perfil.',
        },
      ]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'No se pudo hablar con el agente.'
      );
    } finally {
      setIsSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            <AgentAvatar size={42} />
            <View style={styles.topBarInfo}>
              <Text style={styles.topBarName}>Allora</Text>
              <Text style={styles.topBarSub}>Construyendo tu perfil</Text>
            </View>
          </View>
          <ProgressBar filled={filledFields} total={PROGRESS_STEPS} />
          <View style={styles.primaryActions}>
            <Link href="/(tabs)/my-profile" asChild>
              <Pressable style={styles.manualAction}>
                <Text style={styles.manualActionText}>Llenar manualmente</Text>
              </Pressable>
            </Link>
            <Link href="/(tabs)" asChild>
              <Pressable style={styles.exitAction}>
                <Text style={styles.exitActionText}>Salir</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {/* ── Tags strip ── */}
        <TagStrip snapshot={profileSnapshot} />

        {showGuide && <OnboardingGuide onDone={() => setShowGuide(false)} />}

        {/* ── Chat ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatList}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isSending && <TypingIndicator />}
        </ScrollView>

        {/* ── Error ── */}
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {/* ── Starter chips ── */}
        <View style={styles.chipsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {STARTERS.map((s) => (
              <StarterChip key={s} label={s} onPress={(t) => setInput(t)} />
            ))}
          </ScrollView>
        </View>

        {/* ── Composer ── */}
        <View style={styles.composer}>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Escribe como eres, qué buscas..."
              placeholderTextColor="#b08090"
              value={input}
              onChangeText={setInput}
              multiline
            />
          </View>
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => sendMessage(input)}
          >
            <LinearGradient
              colors={canSend ? ['#f4547a', '#f87a5a'] : ['#f4c4cc', '#f7c4b4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendBtnGradient}
            >
              <Text style={styles.sendBtnIcon}>↑</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* ── Skip ── */}
        <Link href="/(tabs)" style={styles.skipBtn}>
          <Text style={styles.skipText}>Terminar después</Text>
        </Link>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fdf0f0',
  },

  // Top bar
  topBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0d8de',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarInfo: {
    flex: 1,
  },
  topBarName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  topBarSub: {
    fontSize: 11,
    color: '#b08090',
    marginTop: 1,
  },
  editLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#f0d8de',
  },
  editLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f4547a',
  },
  primaryActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  manualAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#f4547a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    overflow: 'hidden',
  },
  manualActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  exitAction: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#fff5f7',
    borderWidth: 1.5,
    borderColor: '#f5c8d4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  exitActionText: {
    color: '#f4547a',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  // Guide
  guideCard: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0d8de',
    shadowColor: '#f4547a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  guideTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  guideBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f4547a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBadgeText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  guideTitle: {
    color: '#1a1a1a',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  guideSubtitle: {
    color: '#b08090',
    fontSize: 13,
    lineHeight: 19,
  },
  guideSteps: {
    gap: 9,
    marginBottom: 14,
  },
  guideStep: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#fff5f7',
  },
  guideStepNumber: {
    color: '#f4547a',
    fontSize: 11,
    fontWeight: '900',
  },
  guideStepText: {
    flex: 1,
    color: '#5b3c45',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  guideButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  guideButtonGradient: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },

  // Agent avatar
  agentAv: {
    backgroundColor: '#fce8ec',
    borderWidth: 1.5,
    borderColor: '#f5c8d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentAvLetter: {
    fontWeight: '800',
    color: '#f4547a',
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  progressBg: {
    flex: 1,
    height: 5,
    backgroundColor: '#fce8ec',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f4547a',
    minWidth: 32,
    textAlign: 'right',
  },

  // Tags
  tagStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0d8de',
    gap: 8,
  },
  tagStripLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b08090',
  },
  tagScroll: {
    flex: 1,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: '#fce8ec',
    borderWidth: 1,
    borderColor: '#f5c8d4',
    marginRight: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f4547a',
  },

  // Chat
  chatList: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    flexDirection: 'row-reverse',
  },
  bubbleWrap: {
    maxWidth: '78%',
  },
  bubbleWrapUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleAi: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0d8de',
    borderBottomLeftRadius: 5,
  },
  bubbleAiText: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#1a1a1a',
  },
  bubbleUser: {
    borderBottomRightRadius: 5,
  },
  bubbleUserText: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#ffffff',
    fontWeight: '600',
  },
  typingBubble: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },

  // Error
  errorText: {
    fontSize: 12,
    color: '#e02020',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Chips
  chipsWrapper: {
    height: 48,
    flexShrink: 0,
  },
  chipsContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: '#f0d8de',
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f4547a',
  },

  // Composer
  composer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0d8de',
    backgroundColor: '#ffffff',
  },
  inputBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#f0d8de',
    borderRadius: 16,
    backgroundColor: '#fdf0f0',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  input: {
    fontSize: 13.5,
    color: '#1a1a1a',
    maxHeight: 90,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIcon: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '700',
  },

  // Skip
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 13,
    color: '#b08090',
    textAlign: 'center',
  },
});
