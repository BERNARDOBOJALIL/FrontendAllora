import { Link, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { getProfileMemory, saveProfileMemory } from '@/services/profile';
import type { ProfileSnapshot } from '@/services/profile-agent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'array';

interface FieldConfig {
  key: keyof ProfileSnapshot;
  label: string;
  type: FieldType;
  icon: string;
  hint: string;
  section: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FIELDS: FieldConfig[] = [
  // Sobre ti
  { key: 'vibeSummary',       label: 'Resumen de vibe',    type: 'string', icon: '✦', hint: 'Descríbete en pocas palabras',           section: 'Sobre ti' },
  { key: 'socialStyle',       label: 'Estilo social',      type: 'string', icon: '◎', hint: 'Ej: introvertida, selectiva, extrovertida', section: 'Sobre ti' },
  { key: 'emotionalStyle',    label: 'Estilo emocional',   type: 'string', icon: '♡', hint: 'Cómo expresas lo que sientes',            section: 'Sobre ti' },
  { key: 'depthPreference',   label: 'Profundidad',        type: 'string', icon: '◈', hint: 'Ej: conversaciones profundas, casual',    section: 'Sobre ti' },
  // Gustos
  { key: 'interests',         label: 'Intereses',          type: 'array',  icon: '★', hint: 'Separa con comas',                       section: 'Gustos' },
  { key: 'hobbies',           label: 'Hobbies',            type: 'array',  icon: '◆', hint: 'Separa con comas',                       section: 'Gustos' },
  { key: 'favoriteEnvironments', label: 'Ambientes',       type: 'array',  icon: '⬡', hint: 'Ej: cafés, parques, casa',               section: 'Gustos' },
  // Personalidad
  { key: 'traits',            label: 'Rasgos',             type: 'array',  icon: '◉', hint: 'Separa con comas',                       section: 'Personalidad' },
  { key: 'currentMoodTheme',  label: 'Mood actual',        type: 'string', icon: '◐', hint: 'Cómo te sientes en este momento de vida', section: 'Personalidad' },
];

const SECTIONS = ['Sobre ti', 'Gustos', 'Personalidad'];
const PROFILE_DRAFT_KEY_PREFIX = 'allora-profile-memory-draft';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayValue(raw: unknown, type: FieldType): string {
  if (Array.isArray(raw)) return raw.join(', ');
  return (raw as string) ?? '';
}

function isEmpty(raw: unknown): boolean {
  if (!raw) return true;
  if (Array.isArray(raw)) return raw.length === 0;
  return (raw as string).trim() === '';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return items.length > 0 ? items : [];
}

function normalizeProfileSnapshot(input: unknown): Partial<ProfileSnapshot> {
  const record =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const contextMemory =
    record.context_memory && typeof record.context_memory === 'object' && !Array.isArray(record.context_memory)
      ? (record.context_memory as Record<string, unknown>)
      : {};
  const preferenceMemory =
    record.preference_memory && typeof record.preference_memory === 'object' && !Array.isArray(record.preference_memory)
      ? (record.preference_memory as Record<string, unknown>)
      : {};

  return {
    vibeSummary: asString(record.vibeSummary ?? record.vibe_summary),
    socialStyle: asString(record.socialStyle ?? record.social_style),
    emotionalStyle: asString(record.emotionalStyle ?? record.emotional_style),
    depthPreference: asString(record.depthPreference ?? record.depth_preference ?? preferenceMemory.depth_preference),
    currentMoodTheme: asString(record.currentMoodTheme ?? record.current_mood_theme ?? contextMemory.current_mood_theme),
    interests: asStringArray(record.interests),
    hobbies: asStringArray(record.hobbies),
    favoriteEnvironments: asStringArray(record.favoriteEnvironments ?? record.favorite_environments),
    traits: asStringArray(record.traits),
  };
}

function pruneEmpty<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    }),
  ) as Partial<T>;
}

function buildProfileMemoryPayload(snapshot: Partial<ProfileSnapshot>) {
  return {
    profile_memory: pruneEmpty({
      interests: snapshot.interests,
      traits: snapshot.traits,
      favorite_environments: snapshot.favoriteEnvironments,
      hobbies: snapshot.hobbies,
      social_style: snapshot.socialStyle,
      vibe_summary: snapshot.vibeSummary,
      emotional_style: snapshot.emotionalStyle,
    }),
    context_memory: pruneEmpty({
      current_mood_theme: snapshot.currentMoodTheme,
    }),
    preference_memory: pruneEmpty({
      depth_preference: snapshot.depthPreference,
    }),
  };
}

function profileDraftKey(userId: string) {
  const safeUserId = userId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${PROFILE_DRAFT_KEY_PREFIX}.${safeUserId}`;
}

async function loadLocalProfileDraft(userId: string): Promise<Partial<ProfileSnapshot> | null> {
  const key = profileDraftKey(userId);
  const raw =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(key) ?? null
      : await SecureStore.getItemAsync(key);
  if (!raw) return null;

  try {
    return normalizeProfileSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveLocalProfileDraft(userId: string, snapshot: Partial<ProfileSnapshot>) {
  const key = profileDraftKey(userId);
  const value = JSON.stringify(snapshot);

  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

function EditModal({
  field,
  value,
  visible,
  onClose,
  onSave,
}: {
  field: FieldConfig | null;
  value: string;
  visible: boolean;
  onClose: () => void;
  onSave: (val: string) => void;
}) {
  const [text, setText] = useState(value);

  // Sync when field changes
  React.useEffect(() => { setText(value); }, [value, visible]);

  if (!field) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalIcon}>{field.icon}</Text>
          <Text style={styles.modalTitle}>{field.label}</Text>
          <Text style={styles.modalHint}>{field.hint}</Text>

          <TextInput
            style={styles.modalInput}
            value={text}
            onChangeText={setText}
            placeholder={field.hint}
            placeholderTextColor="#c0a8b0"
            multiline={field.type === 'string'}
            autoFocus
          />

          {field.type === 'array' && text.trim() !== '' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
              <View style={styles.previewRow}>
                {text.split(',').map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <View key={i} style={styles.previewTag}>
                    <Text style={styles.previewTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.saveModalBtn} onPress={() => { onSave(text); onClose(); }}>
              <LinearGradient colors={['#f4547a', '#f87a5a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveModalGradient}>
                <Text style={styles.saveModalText}>Guardar</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Row item
// ---------------------------------------------------------------------------

function ProfileRow({
  field,
  raw,
  onPress,
}: {
  field: FieldConfig;
  raw: unknown;
  onPress: () => void;
}) {
  const empty = isEmpty(raw);
  const display = displayValue(raw, field.type);
  const isArray = field.type === 'array';
  const tags = isArray && !empty ? (raw as string[]) : [];

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>{field.icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{field.label}</Text>
        {empty ? (
          <Text style={styles.rowEmpty}>Toca para agregar</Text>
        ) : isArray ? (
          <View style={styles.tagsWrap}>
            {tags.slice(0, 4).map((t, i) => (
              <View key={i} style={styles.rowTag}>
                <Text style={styles.rowTagText}>{t}</Text>
              </View>
            ))}
            {tags.length > 4 && (
              <View style={styles.rowTag}>
                <Text style={styles.rowTagText}>+{tags.length - 4}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.rowValue} numberOfLines={1}>{display}</Text>
        )}
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function ProfileSection({
  title,
  fields,
  profile,
  onPressField,
}: {
  title: string;
  fields: FieldConfig[];
  profile: Partial<ProfileSnapshot>;
  onPressField: (field: FieldConfig) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        {fields.map((field, i) => (
          <React.Fragment key={field.key}>
            <ProfileRow
              field={field}
              raw={(profile as any)[field.key]}
              onPress={() => onPressField(field)}
            />
            {i < fields.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MyProfileScreen() {
  const { user, isAuthenticated, accessToken } = useAuth();
  const [profile, setProfile] = useState<Partial<ProfileSnapshot> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Modal state
  const [activeField, setActiveField] = useState<FieldConfig | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id || !accessToken) return;
    setIsLoading(true);
    try {
      const [response, localDraft] = await Promise.all([
        getProfileMemory(user.id, accessToken),
        loadLocalProfileDraft(user.id),
      ]);
      const remoteProfile = normalizeProfileSnapshot({
          ...(response?.profile_memory ?? {}),
          context_memory: response?.context_memory ?? undefined,
          preference_memory: response?.preference_memory ?? undefined,
      });
      setProfile({ ...remoteProfile, ...(localDraft ?? {}) });
    } catch {
      const localDraft = await loadLocalProfileDraft(user.id);
      if (localDraft) {
        setProfile(localDraft);
      } else {
        Alert.alert('Error', 'No se pudo cargar el perfil.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, accessToken]);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const persistProfile = useCallback(async (nextProfile: Partial<ProfileSnapshot>) => {
    if (!user?.id || !accessToken) return;
    await saveLocalProfileDraft(user.id, nextProfile);
    await saveProfileMemory(user.id, accessToken, buildProfileMemoryPayload(nextProfile));
  }, [accessToken, user?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await persistProfile(profile);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const openField = (field: FieldConfig) => {
    setActiveField(field);
    setModalVisible(true);
  };

  const handleFieldSave = async (val: string) => {
    if (!activeField) return;
    const next = { ...(profile ?? {}) } as Partial<ProfileSnapshot>;
    if (activeField.type === 'array') {
      (next as any)[activeField.key] = val.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      (next as any)[activeField.key] = val.trim();
    }

    setProfile(next);
    if (user?.id) {
      await saveLocalProfileDraft(user.id, next);
    }
    setIsSaving(true);
    try {
      await persistProfile(next);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1800);
    } catch {
      Alert.alert('Error', 'No se pudo guardar este cambio.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeRaw = activeField && profile ? (profile as any)[activeField.key] : '';
  const activeValue = displayValue(activeRaw, activeField?.type ?? 'string');

  // Completion count
  const filled = FIELDS.filter((f) => !isEmpty((profile as any)?.[f.key])).length;
  const pct = Math.round((filled / FIELDS.length) * 100);

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Por favor inicia sesión.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <LinearGradient colors={['#f4547a', '#f87a5a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarGradient}>
              <Text style={styles.avatarLetter}>
                {(user?.nombre ?? 'U')[0].toUpperCase()}
              </Text>
            </LinearGradient>
          </View>
          <Text style={styles.headerName}>{user?.nombre ?? 'Mi perfil'}</Text>
          <Text style={styles.headerEmail}>{user?.email ?? ''}</Text>

          {/* Progress pill */}
          <View style={styles.progressPill}>
            <View style={styles.progressBg}>
              <LinearGradient colors={['#f4547a', '#f87a5a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>{pct}% completado</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#f4547a" />
            <Text style={styles.loadingText}>Cargando perfil...</Text>
          </View>
        ) : profile ? (
          <>
            {SECTIONS.map((section) => (
              <ProfileSection
                key={section}
                title={section}
                fields={FIELDS.filter((f) => f.section === section)}
                profile={profile}
                onPressField={openField}
              />
            ))}

            {/* Save button */}
            <View style={styles.saveRow}>
              <Pressable style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
                <LinearGradient colors={['#f4547a', '#f87a5a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGradient}>
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>{savedOk ? '✓ Guardado' : 'Guardar cambios'}</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            {/* Link to chat builder */}
            <Link href="/profile-builder" style={styles.builderLink}>
              <Text style={styles.builderLinkText}>Seguir construyendo con Allora →</Text>
            </Link>
          </>
        ) : (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aún no has construido tu perfil.</Text>
            <Link href="/profile-builder" style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Construir mi perfil</Text>
            </Link>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit modal */}
      <EditModal
        field={activeField}
        value={activeValue}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleFieldSave}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fdf0f0' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0d8de',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 30, fontWeight: '800', color: '#fff' },
  headerName: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  headerEmail: { fontSize: 13, color: '#b08090', marginBottom: 16 },
  progressPill: { width: '100%', gap: 6 },
  progressBg: {
    height: 5,
    backgroundColor: '#fce8ec',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabel: { fontSize: 11, fontWeight: '700', color: '#f4547a', textAlign: 'right' },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b08090',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0d8de',
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: { backgroundColor: '#fdf0f0' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fce8ec',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowIconText: { fontSize: 15, color: '#f4547a' },
  rowContent: { flex: 1, gap: 4 },
  rowLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  rowValue: { fontSize: 13, color: '#b08090' },
  rowEmpty: { fontSize: 13, color: '#d0b0b8', fontStyle: 'italic' },
  rowChevron: { fontSize: 22, color: '#d0b0b8', fontWeight: '300' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  rowTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: '#fce8ec',
    borderWidth: 1,
    borderColor: '#f5c8d4',
  },
  rowTagText: { fontSize: 11, fontWeight: '700', color: '#f4547a' },
  separator: { height: 1, backgroundColor: '#f0d8de', marginLeft: 62 },

  // Save
  saveRow: { paddingHorizontal: 16, marginBottom: 12 },
  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveBtnGradient: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Builder link
  builderLink: { alignItems: 'center', paddingVertical: 8 },
  builderLinkText: { fontSize: 13, fontWeight: '700', color: '#f4547a', textAlign: 'center' },

  // Empty / loading
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, minHeight: 300 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#b08090' },
  emptyText: { fontSize: 15, color: '#b08090', textAlign: 'center', marginBottom: 20 },
  primaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 99,
    backgroundColor: '#f4547a',
  },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#f0d8de',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalIcon: { fontSize: 28, textAlign: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center', marginBottom: 4 },
  modalHint: { fontSize: 13, color: '#b08090', textAlign: 'center', marginBottom: 20 },
  modalInput: {
    backgroundColor: '#fdf0f0',
    borderWidth: 1.5,
    borderColor: '#f0d8de',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 48,
    maxHeight: 120,
  },
  previewScroll: { marginTop: 12 },
  previewRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  previewTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: '#fce8ec',
    borderWidth: 1,
    borderColor: '#f5c8d4',
  },
  previewTagText: { fontSize: 12, fontWeight: '700', color: '#f4547a' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f0d8de',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#b08090' },
  saveModalBtn: { flex: 2, borderRadius: 14, overflow: 'hidden' },
  saveModalGradient: { paddingVertical: 14, alignItems: 'center' },
  saveModalText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
