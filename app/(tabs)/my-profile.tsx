import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import { getProfileMemory, saveProfileMemory } from '@/services/profile';
import type { ProfileSnapshot } from '@/services/profile-agent';

export default function MyProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, accessToken } = useAuth();
  const [profile, setProfile] = useState<Partial<ProfileSnapshot> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id || !accessToken) {
      setMessage('No estás autenticado.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await getProfileMemory(user.id, accessToken);
      if (response?.profile_memory) {
        setProfile(response.profile_memory);
      } else {
        setMessage('Aún no has construido tu perfil.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al cargar el perfil.';
      setMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveProfile = async () => {
    if (!user?.id || !accessToken || !profile) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await saveProfileMemory(user.id, accessToken, { profile_memory: profile });
      setMessage('Perfil actualizado correctamente.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al guardar el perfil.';
      setMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text>Por favor, inicia sesión.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Mi Perfil</Text>
            <Text style={styles.subtitle}>
              {user?.nombre || 'Usuario'}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#ff2d78" />
              <Text style={{ marginTop: 12 }}>Cargando perfil...</Text>
            </View>
          ) : profile ? (
            <View>
              <View style={styles.profileBox}>
                {([
                  { key: 'interests', label: 'Intereses', type: 'array' },
                  { key: 'traits', label: 'Rasgos', type: 'array' },
                  { key: 'socialStyle', label: 'Estilo social', type: 'string' },
                  { key: 'vibeSummary', label: 'Resumen', type: 'string' },
                  { key: 'favoriteEnvironments', label: 'Ambientes', type: 'array' },
                  { key: 'hobbies', label: 'Hobbies', type: 'array' },
                  { key: 'emotionalStyle', label: 'Estilo emocional', type: 'string' },
                  { key: 'currentMoodTheme', label: 'Tema actual', type: 'string' },
                  { key: 'depthPreference', label: 'Profundidad', type: 'string' },
                ] as any[]).map(({ key, label, type }) => {
                  const raw = (profile as any)[key];
                  const value = Array.isArray(raw) ? raw.join(', ') : raw ?? '';
                  return (
                    <View key={key} style={styles.profileRow}>
                      <Text style={styles.profileLabel}>{label}</Text>
                      <TextInput
                        style={styles.input}
                        value={value}
                        onChangeText={(v) => {
                          setProfile((curr) => {
                            const next = { ...(curr ?? {}) } as any;
                            if (type === 'array') {
                              next[key] = v.split(',').map((s) => s.trim()).filter(Boolean);
                            } else {
                              next[key] = v;
                            }
                            return next;
                          });
                        }}
                        placeholder={`Ingresa ${label.toLowerCase()}`}
                      />
                    </View>
                  );
                })}

                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.button, styles.saveButton]}
                    onPress={handleSaveProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Guardar cambios</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.reloadButton]}
                    onPress={loadProfile}
                    disabled={isLoading}
                  >
                    <Text style={styles.buttonText}>Recargar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{message || 'Aún no hay datos de perfil.'}</Text>
              <Pressable
                style={[styles.button, styles.primaryButton, { marginTop: 16 }]}
                onPress={() => router.push('/profile-builder')}
              >
                <Text style={styles.buttonText}>Construir mi perfil</Text>
              </Pressable>
            </View>
          )}

          {message && profile && (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  profileBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  profileRow: {
    marginBottom: 16,
  },
  profileLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#ff2d78',
  },
  reloadButton: {
    backgroundColor: '#6b7280',
  },
  primaryButton: {
    backgroundColor: '#ff2d78',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  messageContainer: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  messageText: {
    fontSize: 14,
    color: '#1e40af',
  },
});
