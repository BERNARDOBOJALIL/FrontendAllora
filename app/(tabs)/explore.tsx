// app/(tabs)/explore.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
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
  getUserMatches,
  getPotentialMatches,
  syncMatchPayload,
  updateMatchStatus,
  type MatchResponse,
  type PotentialMatch,
} from '@/services/match-service';
import { getMatchPayload, getProfileMemory } from '@/services/profile';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateProfile {
  id: string;
  nombre: string;
  edad: number;
  fotos: string[];
  bio?: string;
  intereses: string[];
  hobbies?: string[];
  personalityTraits?: string[];
  favoriteEnvironments?: string[];
  dislikes?: string[];
  socialStyle?: string;
  vibeSummary?: string;
  emotionalStyle?: string;
  ubicacion?: { ciudad?: string; lat?: number; lng?: number };
}

interface EnrichedMatch extends PotentialMatch {
  profile?: CandidateProfile;
  liked?: boolean;
  distance?: number;
}

interface EnrichedRequest extends MatchResponse {
  other_user_id: string;
  direction: 'incoming' | 'outgoing';
  profile?: CandidateProfile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fetches the user profile from your auth-service.
// Adjust the URL to match your EXPO_PUBLIC_AUTH_SERVICE_URL env var.
const AUTH_SERVICE_URL =
  process.env.EXPO_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:8000';

function bearer(token?: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}` };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeProfile(payload: unknown): CandidateProfile | null {
  const record = asRecord(payload);
  if (!record) return null;
  const id =
    asString(record.id) ??
    asString(record.user_id) ??
    asString(record.userId) ??
    asString(record._id);
  if (!id) return null;

  const ubicacion = asRecord(record.ubicacion ?? record.location);

  return {
    id,
    nombre: asString(record.nombre ?? record.name ?? record.full_name) ?? 'Usuario',
    edad: Number(record.edad ?? record.age) || 0,
    fotos: asStringArray(record.fotos ?? record.photos ?? record.photo_urls),
    bio: asString(record.bio ?? record.vibe_summary),
    intereses: asStringArray(record.intereses ?? record.interests),
    hobbies: asStringArray(record.hobbies),
    ubicacion: ubicacion
      ? {
          ciudad: asString(ubicacion.ciudad ?? ubicacion.city),
          lat: Number(ubicacion.lat ?? ubicacion.latitude) || undefined,
          lng: Number(ubicacion.lng ?? ubicacion.longitude) || undefined,
        }
      : undefined,
  };
}

function mergeAgentProfile(
  base: CandidateProfile | null,
  userId: string,
  agentProfile: Record<string, unknown> | null,
): CandidateProfile | null {
  if (!base && !agentProfile) return null;
  const location = asRecord(agentProfile?.location);
  const intereses = asStringArray(agentProfile?.interests);
  const hobbies = asStringArray(agentProfile?.hobbies);
  const vibeSummary = asString(agentProfile?.vibe_summary);

  return {
    id: base?.id ?? userId,
    nombre:
      asString(agentProfile?.nombre ?? agentProfile?.name ?? agentProfile?.full_name) ??
      base?.nombre ??
      'Usuario',
    edad: Number(agentProfile?.edad ?? agentProfile?.age ?? base?.edad) || 0,
    fotos: base?.fotos ?? [],
    bio: asString(agentProfile?.bio) ?? vibeSummary ?? base?.bio,
    intereses: intereses.length > 0 ? intereses : (base?.intereses ?? []),
    hobbies: hobbies.length > 0 ? hobbies : base?.hobbies,
    personalityTraits: asStringArray(agentProfile?.personality_traits ?? agentProfile?.traits),
    favoriteEnvironments: asStringArray(agentProfile?.favorite_environments),
    dislikes: asStringArray(agentProfile?.dislikes),
    socialStyle: asString(agentProfile?.social_style),
    vibeSummary,
    emotionalStyle: asString(agentProfile?.emotional_style),
    ubicacion: location
      ? {
          ciudad: base?.ubicacion?.ciudad,
          lat: Number(location.lat ?? location.latitude ?? base?.ubicacion?.lat) || undefined,
          lng: Number(location.lng ?? location.longitude ?? base?.ubicacion?.lng) || undefined,
        }
      : base?.ubicacion,
  };
}

function normalizeUsers(payload: unknown): CandidateProfile[] {
  const record = asRecord(payload);
  const source =
    Array.isArray(payload)
      ? payload
      : Array.isArray(record?.users)
        ? record.users
        : Array.isArray(record?.items)
          ? record.items
          : Array.isArray(record?.data)
            ? record.data
            : [];

  return source
    .map(normalizeProfile)
    .filter((profile): profile is CandidateProfile => Boolean(profile));
}

async function fetchProfile(userId: string, token?: string | null): Promise<CandidateProfile | null> {
  const agentResponse = await getProfileMemory(userId, token).catch(() => null);
  let authProfile: CandidateProfile | null = null;

  if (Platform.OS !== 'web') {
    try {
      const res = await fetch(`${AUTH_SERVICE_URL}/users/${encodeURIComponent(userId)}`, {
        headers: bearer(token),
      });
      if (res.ok) authProfile = normalizeProfile(await res.json());
    } catch {
      authProfile = null;
    }
  }

  return mergeAgentProfile(authProfile, userId, agentResponse?.profile_memory ?? null);
}

async function fetchUsers(token?: string | null): Promise<CandidateProfile[]> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/users`, {
      headers: bearer(token),
    });
    if (!res.ok) return [];
    return normalizeUsers(await res.json());
  } catch {
    return [];
  }
}

function normalizeTerm(term: string): string {
  return term
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function fetchProfileSignals(userId: string, token: string): Promise<string[]> {
  try {
    const response = await getProfileMemory(userId, token);
    const memory = response.profile_memory ?? {};
    return [
      ...asStringArray(memory.interests),
      ...asStringArray(memory.hobbies),
    ].map(normalizeTerm).filter(Boolean);
  } catch {
    return [];
  }
}

async function buildLocalMatches(
  userId: string,
  token: string,
): Promise<EnrichedMatch[]> {
  const [currentSignals, users] = await Promise.all([
    fetchProfileSignals(userId, token),
    fetchUsers(token),
  ]);
  const currentSet = new Set(currentSignals);
  if (currentSet.size === 0 || users.length === 0) return [];

  const candidates = users.filter((candidate) => candidate.id !== userId);
  const maybeMatches = await Promise.all(
    candidates.map(async (candidate) => {
      const agentSignals = await fetchProfileSignals(candidate.id, token);
      const profileSignals = [
        ...(candidate.intereses ?? []),
        ...(candidate.hobbies ?? []),
      ].map(normalizeTerm);
      const uniqueSignals = new Set([...agentSignals, ...profileSignals]);
      const shared = [...uniqueSignals].filter((signal) => currentSet.has(signal));
      if (shared.length === 0) return null;
      const enrichedProfile = await fetchProfile(candidate.id, token);

      return {
        user_id: candidate.id,
        score: Math.min(95, 55 + shared.length * 12),
        reasons: [`Hobbies o intereses en común: ${shared.slice(0, 3).join(', ')}`],
        profile: enrichedProfile ?? candidate,
      } satisfies EnrichedMatch;
    }),
  );

  const enriched: EnrichedMatch[] = [];
  for (const match of maybeMatches) {
    if (match) enriched.push(match);
  }

  return enriched
    .sort((a, b) => b.score - a.score);
}

async function syncCurrentUserMatchPayload(
  userId: string,
  token?: string | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    const payload = await getMatchPayload(userId, token);
    await syncMatchPayload(payload, token);
    return true;
  } catch {
    return false;
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

      {profile ? (
        <View style={styles.profileDetails}>
          {profile.bio ? (
            <Text style={styles.bioText} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
          {profile.socialStyle ? (
            <Text style={styles.detailText} numberOfLines={1}>
              Estilo: {profile.socialStyle}
            </Text>
          ) : null}
          {profile.favoriteEnvironments && profile.favoriteEnvironments.length > 0 ? (
            <Text style={styles.detailText} numberOfLines={1}>
              Prefiere: {profile.favoriteEnvironments.slice(0, 3).join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}

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

function RequestCard({
  item,
  onAccept,
  onReject,
}: {
  item: EnrichedRequest;
  onAccept: (matchId: string) => void;
  onReject: (matchId: string) => void;
}) {
  const { profile, compatibility_score, reasons, direction } = item;
  const incoming = direction === 'incoming';
  const score = Math.round(compatibility_score ?? 0);

  return (
    <View style={[styles.card, styles.requestCard]}>
      <View style={styles.cardTop}>
        <View style={styles.avatarContainer}>
          {profile?.fotos?.[0] ? (
            <Image source={{ uri: profile.fotos[0] }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <MaterialCommunityIcons name="account-heart" size={36} color="#ff2d78" />
            </View>
          )}
          <View style={[styles.scoreBadge, { backgroundColor: incoming ? '#ff2d78' : '#9ca3af' }]}>
            <Text style={styles.scoreBadgeText}>{score}</Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.nameText}>
            {profile?.nombre ?? 'Usuario'}{' '}
            {profile?.edad ? <Text style={styles.ageText}>{profile.edad}</Text> : null}
          </Text>
          <Text style={styles.requestMeta}>
            {incoming ? 'Quiere hacer match contigo' : 'Solicitud enviada'}
          </Text>
          {profile?.bio ? (
            <Text style={styles.requestReason} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
          {reasons.length > 0 ? (
            <Text style={styles.requestReason} numberOfLines={2}>
              {reasons[0]}
            </Text>
          ) : null}
        </View>
      </View>

      {incoming ? (
        <View style={styles.requestActions}>
          <Pressable style={[styles.requestButton, styles.rejectButton]} onPress={() => onReject(item.id)}>
            <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
            <Text style={styles.rejectButtonText}>Rechazar</Text>
          </Pressable>
          <Pressable style={[styles.requestButton, styles.acceptButton]} onPress={() => onAccept(item.id)}>
            <MaterialCommunityIcons name="heart" size={18} color="#ffffff" />
            <Text style={styles.acceptButtonText}>Aceptar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { user, accessToken } = useAuth();
  const [candidates, setCandidates] = useState<EnrichedMatch[]>([]);
  const [requests, setRequests] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await getUserMatches(user.id, 'PENDING', 30, 0, accessToken);
      const enriched = await Promise.all(
        response.matches.map(async (match) => {
          const otherUserId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
          const profile = await fetchProfile(otherUserId, accessToken);
          return {
            ...match,
            other_user_id: otherUserId,
            direction: match.user_b_id === user.id ? 'incoming' : 'outgoing',
            profile: profile ?? undefined,
          } satisfies EnrichedRequest;
        }),
      );
      setRequests(enriched);
    } catch {
      setRequests([]);
    }
  }, [accessToken, user?.id]);

  const loadCandidates = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setLoading(true);
      setError(null);

      try {
        if (accessToken) {
          await syncCurrentUserMatchPayload(user.id, accessToken);
        }
        await loadRequests();

        let matches: PotentialMatch[] = [];
        try {
          const response = await getPotentialMatches(user.id, 20, 0, accessToken);
          matches = response.matches;
        } catch (matchError) {
          if (!accessToken) throw matchError;
        }

        // Enrich with profiles in parallel
        const enriched: EnrichedMatch[] = await Promise.all(
          matches.map(async (m) => {
            const profile = await fetchProfile(m.user_id, accessToken);
            return { ...m, profile: profile ?? undefined };
          }),
        );

        if (enriched.length > 0 || !accessToken) {
          setCandidates(enriched);
          return;
        }

        const localMatches = accessToken && Platform.OS !== 'web'
          ? await buildLocalMatches(user.id, accessToken)
          : [];
        setCandidates(localMatches);
      } catch (e: any) {
        setError(e.message ?? 'Error al cargar candidatos');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, loadRequests, user?.id],
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
        if (accessToken) {
          await syncCurrentUserMatchPayload(user.id, accessToken);
        }
        await createMatch(user.id, candidateId, accessToken);
      } catch {
        // Revert on error
        setCandidates((prev) =>
          prev.map((c) => (c.user_id === candidateId ? { ...c, liked: false } : c)),
        );
      }
    },
    [accessToken, user?.id],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCandidates(true);
  }, [loadCandidates]);

  const handleRequestStatus = useCallback(
    async (matchId: string, status: 'ACCEPTED' | 'REJECTED') => {
      setRequests((prev) => prev.filter((request) => request.id !== matchId));
      try {
        await updateMatchStatus(matchId, status, accessToken);
      } catch {
        await loadRequests();
      }
    },
    [accessToken, loadRequests],
  );

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

  if (candidates.length === 0 && requests.length === 0) {
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
          <Text style={styles.headerSub}>
            {candidates.length} personas compatibles · {requests.filter((request) => request.direction === 'incoming').length} solicitudes
          </Text>
        </View>
        <Pressable onPress={() => loadCandidates()} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={22} color="#ff2d78" />
        </Pressable>
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(item) => item.user_id}
        ListHeaderComponent={
          requests.length > 0 ? (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionTitle}>Solicitudes</Text>
              {requests.map((request) => (
                <RequestCard
                  key={request.id}
                  item={request}
                  onAccept={(matchId) => handleRequestStatus(matchId, 'ACCEPTED')}
                  onReject={(matchId) => handleRequestStatus(matchId, 'REJECTED')}
                />
              ))}
              {candidates.length > 0 ? (
                <Text style={[styles.sectionTitle, styles.discoverTitle]}>Personas compatibles</Text>
              ) : null}
            </View>
          ) : null
        }
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
  requestsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  discoverTitle: {
    marginTop: 8,
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
  requestCard: {
    borderWidth: 1,
    borderColor: '#ffe0ea',
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
  requestMeta: { fontSize: 12, color: '#ff2d78', fontWeight: '700' },
  requestReason: { fontSize: 12, color: '#666666', lineHeight: 17 },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  rejectButton: { backgroundColor: '#f3f4f6' },
  acceptButton: { backgroundColor: '#ff2d78' },
  rejectButtonText: { color: '#6b7280', fontSize: 13, fontWeight: '800' },
  acceptButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },

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
  profileDetails: {
    gap: 4,
    paddingTop: 2,
  },
  bioText: {
    fontSize: 13,
    color: '#444444',
    lineHeight: 18,
  },
  detailText: {
    fontSize: 12,
    color: '#777777',
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
