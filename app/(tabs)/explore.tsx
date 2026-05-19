import { useAuth } from '@/providers/auth-context';
import { createMatch, getPotentialMatches } from '@/services/match-service';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface CandidateProfile {
  id: string;
  nombre: string;
  edad: number;
  fotos: string[];
  bio?: string;
  intereses: string[];
  ubicacion?: { ciudad?: string };
}

interface Candidate {
  user_id: string;
  score: number;
  reasons: string[];
  profile?: CandidateProfile;
  liked?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Alta';
  if (score >= 50) return 'Media';
  return 'Baja';
}

// Helper para obtener perfil del auth-service
const AUTH_SERVICE_URL = process.env.EXPO_PUBLIC_AUTH_SERVICE_URL ?? 'http://192.168.1.80:8000';

async function fetchProfile(userId: string): Promise<CandidateProfile | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/users/${userId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function ExploreScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCandidates = useCallback(async () => {
    if (!user?.id || !accessToken) return;
    setLoading(true);
    try {
      const { matches } = await getPotentialMatches(user.id, 20, accessToken);
      const enriched = await Promise.all(
        matches.map(async (m) => {
          const profile = await fetchProfile(m.user_id);
          return { ...m, profile: profile || undefined };
        })
      );
      setCandidates(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, accessToken]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleLike = async (candidateId: string) => {
    if (!user?.id || !accessToken) return;
    // Optimistic update
    setCandidates(prev =>
      prev.map(c => c.user_id === candidateId ? { ...c, liked: true } : c)
    );
    try {
      await createMatch(user.id, candidateId, accessToken);
    } catch {
      // revert on error
      setCandidates(prev =>
        prev.map(c => c.user_id === candidateId ? { ...c, liked: false } : c)
      );
    }
  };

  const handleViewProfile = (userId: string, matchId?: string) => {
    // Si tienes el matchId, pásalo; si no, intenta obtenerlo después (simplificado)
    router.push(`/profile/${userId}?matchId=${matchId || ''}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCandidates();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff2d78" />
        <Text style={styles.stateText}>Buscando personas compatibles…</Text>
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="account-search" size={56} color="#ccc" />
        <Text style={styles.stateTitle}>Sin candidatos por ahora</Text>
        <Text style={styles.stateText}>Actualiza tus preferencias más tarde</Text>
        <Pressable style={styles.retryButton} onPress={loadCandidates}>
          <Text style={styles.retryText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Descubrir</Text>
          <Text style={styles.headerSub}>{candidates.length} personas compatibles</Text>
        </View>
        <Pressable onPress={loadCandidates} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={22} color="#ff2d78" />
        </Pressable>
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => handleViewProfile(item.user_id)} style={{ gap: 12 }}>
              <View style={styles.cardTop}>
                <View style={styles.avatarContainer}>
                  <Image
                    source={{ uri: item.profile?.fotos?.[0] || 'https://randomuser.me/api/portraits/women/68.jpg' }}
                    style={styles.avatar}
                  />
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor(item.score) }]}>
                    <Text style={styles.scoreBadgeText}>{Math.round(item.score)}</Text>
                  </View>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.nameText}>
                    {item.profile?.nombre ?? 'Usuario'} {item.profile?.edad ? <Text style={styles.ageText}>{item.profile.edad}</Text> : null}
                  </Text>
                  {item.profile?.ubicacion?.ciudad && (
                    <View style={styles.rowSmall}>
                      <MaterialCommunityIcons name="map-marker" size={13} color="#999" />
                      <Text style={styles.metaText}>{item.profile.ubicacion.ciudad}</Text>
                    </View>
                  )}
                  <View style={styles.compatRow}>
                    <View style={[styles.compatDot, { backgroundColor: scoreColor(item.score) }]} />
                    <Text style={[styles.compatLabel, { color: scoreColor(item.score) }]}>
                      Compatibilidad {scoreLabel(item.score)}
                    </Text>
                  </View>
                  <View style={styles.scoreBarBg}>
                    <View style={[styles.scoreBarFill, { width: `${item.score}%`, backgroundColor: scoreColor(item.score) }]} />
                  </View>
                </View>
              </View>
              <View style={styles.reasonsContainer}>
                {item.reasons.slice(0, 3).map((r, i) => (
                  <View key={i} style={styles.reasonChip}>
                    <MaterialCommunityIcons name="check-circle" size={12} color="#22c55e" />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}
              </View>
              {item.profile?.intereses && item.profile.intereses.length > 0 && (
                <View style={styles.interestsRow}>
                  {item.profile.intereses.slice(0, 4).map((interes, i) => (
                    <View key={i} style={styles.interesChip}>
                      <Text style={styles.interesText}>{interes}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
            <Pressable
              style={[styles.likeButton, item.liked && styles.likeButtonDone]}
              onPress={() => handleLike(item.user_id)}
              disabled={item.liked}
            >
              <MaterialCommunityIcons
                name={item.liked ? 'heart' : 'heart-outline'}
                size={18}
                color={item.liked ? '#fff' : '#ff2d78'}
              />
              <Text style={[styles.likeButtonText, item.liked && styles.likeButtonTextDone]}>
                {item.liked ? 'Solicitud enviada' : 'Me interesa'}
              </Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff2d78" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9f9fb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111' },
  headerSub: { fontSize: 13, color: '#999', marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  avatarContainer: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 18 },
  scoreBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  scoreBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  cardInfo: { flex: 1, gap: 5 },
  nameText: { fontSize: 18, fontWeight: '700', color: '#111' },
  ageText: { fontSize: 16, fontWeight: '400', color: '#555' },
  rowSmall: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: '#999' },
  compatRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  compatDot: { width: 7, height: 7, borderRadius: 4 },
  compatLabel: { fontSize: 12, fontWeight: '600' },
  scoreBarBg: { height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  scoreBarFill: { height: 4, borderRadius: 2 },
  reasonsContainer: { gap: 5 },
  reasonChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonText: { fontSize: 12, color: '#555' },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  interesChip: { backgroundColor: '#fff0f5', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  interesText: { fontSize: 11, color: '#ff2d78', fontWeight: '600' },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ff2d78',
    backgroundColor: '#fff',
    marginTop: 2,
  },
  likeButtonDone: { backgroundColor: '#ff2d78', borderColor: '#ff2d78' },
  likeButtonText: { fontSize: 14, fontWeight: '700', color: '#ff2d78' },
  likeButtonTextDone: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  stateTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  stateText: { fontSize: 14, color: '#999', textAlign: 'center' },
  retryButton: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: '#ff2d78' },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});