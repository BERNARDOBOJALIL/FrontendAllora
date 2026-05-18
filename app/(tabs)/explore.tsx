// app/(tabs)/explore.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/providers/auth-context';
import {
  createMatch,
  getPotentialMatches,
  type PotentialMatch,
} from '@/services/match-service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateProfile {
  id: string;
  nombre: string;
  edad: number;
  fotos: string[];
  bio?: string;
  intereses: string[];
  ubicacion?: { ciudad?: string; lat?: number; lng?: number };
}

interface EnrichedMatch extends PotentialMatch {
  profile?: CandidateProfile;
  liked?: boolean;
  distance?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fetches the user profile from your auth-service.
// Adjust the URL to match your EXPO_PUBLIC_AUTH_SERVICE_URL env var.
const AUTH_SERVICE_URL =
  process.env.EXPO_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:8000';

async function fetchProfile(userId: string): Promise<CandidateProfile | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/users/${userId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({
  item,
  onLike,
}: {
  item: EnrichedMatch;
  onLike: (id: string) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { profile, score, reasons, liked } = item;

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }),
    ]).start();
    onLike(item.user_id);
  };

  const color = scoreColor(score);
  const label = scoreLabel(score);

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      {/* Avatar + info */}
      <View style={styles.cardTop}>
        <View style={styles.avatarContainer}>
          {profile?.fotos?.[0] ? (
            <Image source={{ uri: profile.fotos[0] }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <MaterialCommunityIcons name="account" size={36} color="#cccccc" />
            </View>
          )}
          {/* Score badge */}
          <View style={[styles.scoreBadge, { backgroundColor: color }]}>
            <Text style={styles.scoreBadgeText}>{Math.round(score)}</Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.nameText}>
            {profile?.nombre ?? 'Usuario'}{' '}
            {profile?.edad ? (
              <Text style={styles.ageText}>{profile.edad}</Text>
            ) : null}
          </Text>

          {profile?.ubicacion?.ciudad ? (
            <View style={styles.rowSmall}>
              <MaterialCommunityIcons name="map-marker" size={13} color="#999" />
              <Text style={styles.metaText}>{profile.ubicacion.ciudad}</Text>
            </View>
          ) : null}

          {/* Compatibility row */}
          <View style={styles.compatRow}>
            <View style={[styles.compatDot, { backgroundColor: color }]} />
            <Text style={[styles.compatLabel, { color }]}>
              Compatibilidad {label}
            </Text>
          </View>

          {/* Score bar */}
          <View style={styles.scoreBarBg}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${score}%` as any, backgroundColor: color },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Reasons */}
      {reasons.length > 0 && (
        <View style={styles.reasonsContainer}>
          {reasons.slice(0, 3).map((r, i) => (
            <View key={i} style={styles.reasonChip}>
              <MaterialCommunityIcons name="check-circle" size={12} color="#22c55e" />
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Interests */}
      {profile?.intereses && profile.intereses.length > 0 && (
        <View style={styles.interestsRow}>
          {profile.intereses.slice(0, 4).map((interes, i) => (
            <View key={i} style={styles.interesChip}>
              <Text style={styles.interesText}>{interes}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action */}
      <Pressable
        style={[styles.likeButton, liked && styles.likeButtonDone]}
        onPress={handleLike}
        disabled={liked}
      >
        <MaterialCommunityIcons
          name={liked ? 'heart' : 'heart-outline'}
          size={18}
          color={liked ? '#ffffff' : '#ff2d78'}
        />
        <Text style={[styles.likeButtonText, liked && styles.likeButtonTextDone]}>
          {liked ? 'Solicitud enviada' : 'Me interesa'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const { matches } = await getPotentialMatches(user.id, 20);

        // Enrich with profiles in parallel
        const enriched: EnrichedMatch[] = await Promise.all(
          matches.map(async (m) => {
            const profile = await fetchProfile(m.user_id);
            return { ...m, profile: profile ?? undefined };
          }),
        );

        setCandidates(enriched);
      } catch (e: any) {
        setError(e.message ?? 'Error al cargar candidatos');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleLike = useCallback(
    async (candidateId: string) => {
      if (!user?.id) return;

      // Optimistic update
      setCandidates((prev) =>
        prev.map((c) => (c.user_id === candidateId ? { ...c, liked: true } : c)),
      );

      try {
        await createMatch(user.id, candidateId);
      } catch {
        // Revert on error
        setCandidates((prev) =>
          prev.map((c) => (c.user_id === candidateId ? { ...c, liked: false } : c)),
        );
      }
    },
    [user?.id],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCandidates(true);
  }, [loadCandidates]);

  // ── States ──

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#ff2d78" />
        <Text style={styles.stateText}>Buscando personas compatibles…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons name="wifi-off" size={48} color="#cccccc" />
        <Text style={styles.stateTitle}>No se pudo conectar</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => loadCandidates()}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons name="account-search" size={56} color="#e5e5e5" />
        <Text style={styles.stateTitle}>Sin candidatos por ahora</Text>
        <Text style={styles.stateText}>
          Actualiza tus preferencias o amplía tu radio de búsqueda.
        </Text>
        <Pressable style={styles.retryButton} onPress={() => loadCandidates()}>
          <Text style={styles.retryText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Descubrir</Text>
          <Text style={styles.headerSub}>{candidates.length} personas compatibles</Text>
        </View>
        <Pressable onPress={() => loadCandidates()} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={22} color="#ff2d78" />
        </Pressable>
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item }) => (
          <MatchCard item={item} onLike={handleLike} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ff2d78"
          />
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9f9fb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: '#999999',
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },

  // ── Card ──
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    borderColor: '#ffffff',
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardInfo: {
    flex: 1,
    gap: 5,
  },
  nameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  ageText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#555555',
  },
  rowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: '#999999',
  },
  compatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  compatDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  compatLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  scoreBarBg: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  scoreBarFill: {
    height: 4,
    borderRadius: 2,
  },

  // ── Reasons ──
  reasonsContainer: {
    gap: 5,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonText: {
    fontSize: 12,
    color: '#555555',
  },

  // ── Interests ──
  interestsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  interesChip: {
    backgroundColor: '#fff0f5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  interesText: {
    fontSize: 11,
    color: '#ff2d78',
    fontWeight: '600',
  },

  // ── Like button ──
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ff2d78',
    backgroundColor: '#ffffff',
    marginTop: 2,
  },
  likeButtonDone: {
    backgroundColor: '#ff2d78',
    borderColor: '#ff2d78',
  },
  likeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff2d78',
  },
  likeButtonTextDone: {
    color: '#ffffff',
  },

  // ── States ──
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    backgroundColor: '#f9f9fb',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ff2d78',
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
