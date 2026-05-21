// app/(tabs)/explore.tsx
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";

import { useAuth } from "@/providers/auth-context";
import { ApiError } from "@/services/api";
import { createConversation, getConversations } from "@/services/chat";
import {
  createMatch,
  getPotentialMatches,
  getUserMatches,
  MatchServiceError,
  syncMatchPayload,
  updateMatchStatus,
  type MatchResponse,
  type PotentialMatch,
} from "@/services/match-service";
import { getMatchPayload, getProfileMemory } from "@/services/profile";
import {
  fetchPublicUserDisplayName,
  getUserDisplayName,
  setUserDisplayName,
} from "@/services/user-display-names";

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
  direction: "incoming" | "outgoing";
  profile?: CandidateProfile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MATCH_PAYLOAD_ENDPOINT_ENABLED =
  process.env.EXPO_PUBLIC_MATCH_PAYLOAD_ENDPOINT_ENABLED === "true";
const AUTO_SHARE_POTENTIAL_MATCHES = false;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function findDisplayName(value: unknown, depth = 0): string {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    depth > 3
  ) {
    return "";
  }

  const record = value as Record<string, unknown>;
  const primaryKeys = [
    "name",
    "user_name",
    "userName",
    "nombre",
    "nombre_usuario",
    "nombreUsuario",
    "display_name",
    "displayName",
    "full_name",
    "fullName",
    "real_name",
    "realName",
    "username",
    "nickname",
    "alias",
    "handle",
    "nombre_completo",
    "nombreCompleto",
  ];

  for (const key of primaryKeys) {
    const direct = readStringField(record, key);
    if (direct) return direct;
  }

  const firstName =
    readStringField(record, "first_name") ||
    readStringField(record, "firstName") ||
    readStringField(record, "firstname");
  const lastName =
    readStringField(record, "last_name") ||
    readStringField(record, "lastName") ||
    readStringField(record, "lastname");
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  for (const key of [
    "profile",
    "user",
    "account",
    "person",
    "identity",
    "data",
    "payload",
    "result",
  ]) {
    const nested = findDisplayName(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findDisplayName(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return "";
}

function isGenericDisplayName(value?: string | null): boolean {
  if (!value) return true;
  return ["usuario", "persona"].includes(
    value
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
}

function chooseDisplayName(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    if (value && !isGenericDisplayName(value)) return value;
  }
  return "";
}

function mergeAgentProfile(
  base: CandidateProfile | null,
  userId: string,
  agentProfile: Record<string, unknown> | null,
  fallbackDisplayName?: string | null,
): CandidateProfile | null {
  if (!base && !agentProfile && !asString(fallbackDisplayName)) return null;
  const location = asRecord(agentProfile?.location);
  const intereses = asStringArray(agentProfile?.interests);
  const hobbies = asStringArray(agentProfile?.hobbies);
  const vibeSummary = asString(agentProfile?.vibe_summary);
  const agentDisplayName = agentProfile ? findDisplayName(agentProfile) : "";
  const baseName = isGenericDisplayName(base?.nombre) ? "" : base?.nombre;

  return {
    id: base?.id ?? userId,
    nombre: chooseDisplayName(
      agentDisplayName,
      baseName,
      asString(fallbackDisplayName),
    ),
    edad: Number(agentProfile?.edad ?? agentProfile?.age ?? base?.edad) || 0,
    fotos: base?.fotos ?? [],
    bio: asString(agentProfile?.bio) ?? vibeSummary ?? base?.bio,
    intereses: intereses.length > 0 ? intereses : (base?.intereses ?? []),
    hobbies: hobbies.length > 0 ? hobbies : base?.hobbies,
    personalityTraits: asStringArray(
      agentProfile?.personality_traits ?? agentProfile?.traits,
    ),
    favoriteEnvironments: asStringArray(agentProfile?.favorite_environments),
    dislikes: asStringArray(agentProfile?.dislikes),
    socialStyle: asString(agentProfile?.social_style),
    vibeSummary,
    emotionalStyle: asString(agentProfile?.emotional_style),
    ubicacion: location
      ? {
          ciudad: base?.ubicacion?.ciudad,
          lat:
            Number(location.lat ?? location.latitude ?? base?.ubicacion?.lat) ||
            undefined,
          lng:
            Number(
              location.lng ?? location.longitude ?? base?.ubicacion?.lng,
            ) || undefined,
        }
      : base?.ubicacion,
  };
}

function getPotentialMatchDisplayName(match: PotentialMatch): string {
  return chooseDisplayName(
    getUserDisplayName(match.user_id),
    asString(match.display_name),
    findDisplayName(match),
  );
}

function getMatchDisplayName(match: MatchResponse, userId?: string): string {
  const cachedName = getUserDisplayName(userId);
  if (chooseDisplayName(cachedName)) return cachedName;

  if (userId) {
    if (
      match.user_a_id === userId &&
      chooseDisplayName(match.user_a_display_name)
    ) {
      return match.user_a_display_name as string;
    }
    if (
      match.user_b_id === userId &&
      chooseDisplayName(match.user_b_display_name)
    ) {
      return match.user_b_display_name as string;
    }
  }

  return chooseDisplayName(
    asString(match.user_a_display_name),
    asString(match.user_b_display_name),
    findDisplayName(match),
    findDisplayName(match.metadata),
  );
}

function getProfileDisplayName(
  profile: CandidateProfile | undefined,
  fallback?: string,
): string {
  return chooseDisplayName(profile?.nombre, fallback);
}

async function fetchProfile(
  userId: string,
  token?: string | null,
  fallbackDisplayName?: string | null,
): Promise<CandidateProfile | null> {
  const radarDisplayName = getUserDisplayName(userId);
  const agentResponse = await getProfileMemory(userId, token).catch(() => null);
  const rawDisplayName = findDisplayName(agentResponse?.raw);
  const publicDisplayName = await fetchPublicUserDisplayName(userId, token);
  let profile = mergeAgentProfile(
    null,
    userId,
    agentResponse?.profile_memory ?? null,
    chooseDisplayName(
      radarDisplayName,
      rawDisplayName,
      fallbackDisplayName,
      publicDisplayName,
    ),
  );
  if (profile?.nombre && !isGenericDisplayName(profile.nombre)) {
    setUserDisplayName(userId, profile.nombre);
    return profile;
  }

  profile = mergeAgentProfile(
    profile,
    userId,
    agentResponse?.profile_memory ?? null,
    chooseDisplayName(
      radarDisplayName,
      fallbackDisplayName,
      rawDisplayName,
      publicDisplayName,
    ),
  );
  setUserDisplayName(userId, profile?.nombre);

  return profile;
}

async function buildLocalMatches(
  userId: string,
  token: string,
  excludedUserIds = new Set<string>(),
): Promise<EnrichedMatch[]> {
  return [];
  /*
  const [currentSignals, users] = await Promise.all([
    fetchProfileSignals(userId, token),
    fetchUsers(token),
  ]);
  const currentSet = new Set(currentSignals);
  if (currentSet.size === 0 || users.length === 0) return [];

  const candidates = users.filter(
    (candidate) => candidate.id !== userId && !excludedUserIds.has(candidate.id),
  );
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
  */
}

void buildLocalMatches;

async function syncCurrentUserMatchPayload(
  userId: string,
  token?: string | null,
): Promise<boolean> {
  if (!token || !MATCH_PAYLOAD_ENDPOINT_ENABLED) return false;
  try {
    const payload = await getMatchPayload(userId, token);
    await syncMatchPayload(payload, token);
    return true;
  } catch {
    return false;
  }
}

function getOtherMatchUserId(
  match: MatchResponse,
  currentUserId: string,
): string {
  return match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id;
}

async function ensureConversationForAcceptedMatch(
  currentUserId: string,
  match: MatchResponse,
  token?: string | null,
): Promise<void> {
  if (!token || match.status !== "ACCEPTED") return;

  const otherUserId = getOtherMatchUserId(match, currentUserId);
  const conversations = await getConversations(token).catch(() => []);
  const alreadyExists = conversations.some((conversation) => {
    if (conversation.match_id && conversation.match_id === match.id)
      return true;
    return (
      conversation.conversation_type !== "GROUP" &&
      conversation.participant_ids.includes(otherUserId)
    );
  });

  if (alreadyExists) return;

  try {
    await createConversation(otherUserId, match.id, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return;
    throw error;
  }
}

async function ensurePendingMatchesForCandidates(
  currentUserId: string,
  candidates: PotentialMatch[],
  existingOtherUserIds: Set<string>,
  token?: string | null,
): Promise<void> {
  if (!token || !AUTO_SHARE_POTENTIAL_MATCHES || candidates.length === 0)
    return;

  await Promise.all(
    candidates.map(async (candidate) => {
      if (existingOtherUserIds.has(candidate.user_id)) return;

      try {
        await createMatch(currentUserId, candidate.user_id, token);
      } catch (error) {
        if (error instanceof MatchServiceError && error.status === 409) return;
        throw error;
      }
    }),
  );
}

function isActiveMatch(match: MatchResponse): boolean {
  return match.status === "PENDING" || match.status === "ACCEPTED";
}

function isVisibleRequest(
  match: MatchResponse,
  currentUserId: string,
): boolean {
  if (match.status === "ACCEPTED") return true;
  return match.status === "PENDING" && match.user_b_id === currentUserId;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 75) return "Alta";
  if (score >= 50) return "Media";
  return "Baja";
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
  const displayName = getProfileDisplayName(
    profile,
    getPotentialMatchDisplayName(item),
  );

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        speed: 50,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
      }),
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
              <MaterialCommunityIcons
                name="account"
                size={36}
                color="#cccccc"
              />
            </View>
          )}
          {/* Score badge */}
          <View style={[styles.scoreBadge, { backgroundColor: color }]}>
            <Text style={styles.scoreBadgeText}>{Math.round(score)}</Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.nameText}>
            {displayName}{" "}
            {profile?.edad ? (
              <Text style={styles.ageText}>{profile.edad}</Text>
            ) : null}
          </Text>

          {profile?.ubicacion?.ciudad ? (
            <View style={styles.rowSmall}>
              <MaterialCommunityIcons
                name="map-marker"
                size={13}
                color="#999"
              />
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
              <MaterialCommunityIcons
                name="check-circle"
                size={12}
                color="#22c55e"
              />
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
          {profile.favoriteEnvironments &&
          profile.favoriteEnvironments.length > 0 ? (
            <Text style={styles.detailText} numberOfLines={1}>
              Prefiere: {profile.favoriteEnvironments.slice(0, 3).join(", ")}
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
          name={liked ? "heart" : "heart-outline"}
          size={18}
          color={liked ? "#ffffff" : "#ff2d78"}
        />
        <Text
          style={[styles.likeButtonText, liked && styles.likeButtonTextDone]}
        >
          {liked ? "Solicitud enviada" : "Me interesa"}
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
  const { profile, compatibility_score, reasons, direction, status } = item;
  const incoming = direction === "incoming";
  const pending = status === "PENDING";
  const score = Math.round(compatibility_score ?? 0);
  const displayName = getProfileDisplayName(
    profile,
    getMatchDisplayName(item, item.other_user_id),
  );

  return (
    <View style={[styles.card, styles.requestCard]}>
      <View style={styles.cardTop}>
        <View style={styles.avatarContainer}>
          {profile?.fotos?.[0] ? (
            <Image source={{ uri: profile.fotos[0] }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <MaterialCommunityIcons
                name="account-heart"
                size={36}
                color="#ff2d78"
              />
            </View>
          )}
          <View
            style={[
              styles.scoreBadge,
              { backgroundColor: incoming ? "#ff2d78" : "#9ca3af" },
            ]}
          >
            <Text style={styles.scoreBadgeText}>{score}</Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.nameText}>
            {displayName}{" "}
            {profile?.edad ? (
              <Text style={styles.ageText}>{profile.edad}</Text>
            ) : null}
          </Text>
          <Text style={styles.requestMeta}>
            {status === "ACCEPTED"
              ? "Match aceptado"
              : incoming
                ? "Quiere hacer match contigo"
                : "Solicitud enviada"}
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

      {incoming && pending ? (
        <View style={styles.requestActions}>
          <Pressable
            style={[styles.requestButton, styles.rejectButton]}
            onPress={() => onReject(item.id)}
          >
            <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
            <Text style={styles.rejectButtonText}>Rechazar</Text>
          </Pressable>
          <Pressable
            style={[styles.requestButton, styles.acceptButton]}
            onPress={() => onAccept(item.id)}
          >
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
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadExistingMatches = useCallback(async (): Promise<
    MatchResponse[]
  > => {
    if (!user?.id) return [];
    try {
      const response = await getUserMatches(
        user.id,
        undefined,
        50,
        0,
        accessToken,
      );
      return response.matches.filter(isActiveMatch);
    } catch {
      return [];
    }
  }, [accessToken, user?.id]);

  const loadRequests = useCallback(async (): Promise<EnrichedRequest[]> => {
    if (!user?.id) return [];
    try {
      const visibleMatches = (await loadExistingMatches()).filter((match) =>
        isVisibleRequest(match, user.id),
      );
      const enriched = await Promise.all(
        visibleMatches.map(async (match) => {
          const otherUserId =
            match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
          const profile = await fetchProfile(
            otherUserId,
            accessToken,
            getMatchDisplayName(match, otherUserId),
          );
          return {
            ...match,
            other_user_id: otherUserId,
            direction: match.user_b_id === user.id ? "incoming" : "outgoing",
            profile: profile ?? undefined,
          } satisfies EnrichedRequest;
        }),
      );
      setRequests(enriched);
      return enriched;
    } catch {
      setRequests([]);
      return [];
    }
  }, [accessToken, loadExistingMatches, user?.id]);

  const loadCandidates = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setLoading(true);
      setError(null);
      setActionMessage(null);

      try {
        if (accessToken) {
          await syncCurrentUserMatchPayload(user.id, accessToken);
        }
        const existingMatches = await loadExistingMatches();
        const requestedUserIds = new Set(
          existingMatches.map((match) => getOtherMatchUserId(match, user.id)),
        );
        await loadRequests();

        let matches: PotentialMatch[] = [];
        try {
          const response = await getPotentialMatches(user.id, 10, 0, accessToken);
          matches = response.matches
            .filter((match) => match.user_id !== user.id)
            .filter((match) => !requestedUserIds.has(match.user_id));
          await ensurePendingMatchesForCandidates(
            user.id,
            matches,
            requestedUserIds,
            accessToken,
          );
        } catch (matchError) {
          if (!accessToken) throw matchError;
        }
        const enriched: EnrichedMatch[] = await Promise.all(
          matches.map(async (m) => {
            const profile = await fetchProfile(
              m.user_id,
              accessToken,
              getPotentialMatchDisplayName(m),
            );
            return { ...m, profile: profile ?? undefined };
          }),
        );

        if (enriched.length > 0 || !accessToken) {
          setCandidates(enriched);
          return;
        }

        setCandidates([]);
      } catch (e: any) {
        setError(e.message ?? "Error al cargar candidatos");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, loadExistingMatches, loadRequests, user?.id],
  );

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleLike = useCallback(
    async (candidateId: string) => {
      if (!user?.id) return;
      setActionMessage(null);
      const selectedCandidate = candidates.find(
        (candidate) => candidate.user_id === candidateId,
      );

      // Optimistic update
      setCandidates((prev) =>
        prev.map((c) =>
          c.user_id === candidateId ? { ...c, liked: true } : c,
        ),
      );

      try {
        if (accessToken) {
          await syncCurrentUserMatchPayload(user.id, accessToken);
        }
        let createdMatch: MatchResponse | null = null;
        const findExistingMatch = async () => {
          const currentMatches = await getUserMatches(
            user.id,
            undefined,
            50,
            0,
            accessToken,
          ).catch(() => ({ matches: [] }));
          return currentMatches.matches.find(
            (match) =>
              (match.user_a_id === user.id &&
                match.user_b_id === candidateId) ||
              (match.user_a_id === candidateId && match.user_b_id === user.id),
          );
        };

        const existingBeforeCreate = await findExistingMatch();
        if (existingBeforeCreate) {
          if (
            existingBeforeCreate.status === "PENDING" &&
            existingBeforeCreate.user_b_id === user.id
          ) {
            createdMatch = await updateMatchStatus(
              existingBeforeCreate.id,
              "ACCEPTED",
              accessToken,
            );
          } else if (existingBeforeCreate.status === "ACCEPTED") {
            createdMatch = existingBeforeCreate;
          } else {
            setCandidates((prev) =>
              prev.filter((candidate) => candidate.user_id !== candidateId),
            );
            setActionMessage(
              "Ya habias enviado esta solicitud. Esperando respuesta.",
            );
            return;
          }
        }

        try {
          if (!createdMatch) {
            createdMatch = await createMatch(user.id, candidateId, accessToken);
          }
        } catch (createError) {
          if (
            !(createError instanceof MatchServiceError) ||
            createError.status !== 409
          ) {
            throw createError;
          }

          const existingMatch = await findExistingMatch();

          if (existingMatch) {
            if (
              existingMatch.status === "PENDING" &&
              existingMatch.user_b_id === user.id
            ) {
              createdMatch = await updateMatchStatus(
                existingMatch.id,
                "ACCEPTED",
                accessToken,
              );
            } else if (existingMatch.status === "ACCEPTED") {
              createdMatch = existingMatch;
            } else {
              setCandidates((prev) =>
                prev.filter((candidate) => candidate.user_id !== candidateId),
              );
              setActionMessage(
                "Ya habias enviado esta solicitud. Esperando respuesta.",
              );
              return;
            }
          } else {
            setCandidates((prev) =>
              prev.filter((candidate) => candidate.user_id !== candidateId),
            );
            setActionMessage("La solicitud ya existia en el match-service.");
            return;
          }
        }
        await ensureConversationForAcceptedMatch(
          user.id,
          createdMatch,
          accessToken,
        );
        const profile =
          selectedCandidate?.profile ??
          (await fetchProfile(
            candidateId,
            accessToken,
            selectedCandidate
              ? getPotentialMatchDisplayName(selectedCandidate)
              : undefined,
          ));
        setCandidates((prev) =>
          prev.filter((candidate) => candidate.user_id !== candidateId),
        );
        if (createdMatch.status === "ACCEPTED") {
          setRequests((prev) => {
            const otherUserId = getOtherMatchUserId(createdMatch, user.id);
            const withoutDuplicate = prev.filter(
              (request) => request.id !== createdMatch.id,
            );
            return [
              {
                ...createdMatch,
                other_user_id: otherUserId,
                direction:
                  createdMatch.user_b_id === user.id ? "incoming" : "outgoing",
                profile: profile ?? undefined,
              },
              ...withoutDuplicate,
            ];
          });
        } else {
          setActionMessage(
            "Solicitud enviada. Aparecera como match cuando la otra persona acepte.",
          );
        }
      } catch (likeError) {
        // Revert on error
        setCandidates((prev) =>
          prev.map((c) =>
            c.user_id === candidateId ? { ...c, liked: false } : c,
          ),
        );
        setActionMessage(
          likeError instanceof Error
            ? likeError.message
            : "No se pudo enviar la solicitud de match.",
        );
      }
    },
    [accessToken, candidates, user?.id],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCandidates(true);
  }, [loadCandidates]);

  const handleRequestStatus = useCallback(
    async (matchId: string, status: "ACCEPTED" | "REJECTED") => {
      const request = requests.find((item) => item.id === matchId);
      setRequests((prev) => prev.filter((request) => request.id !== matchId));
      try {
        const updatedMatch = await updateMatchStatus(
          matchId,
          status,
          accessToken,
        );
        if (status === "ACCEPTED") {
          await ensureConversationForAcceptedMatch(
            user?.id ?? "",
            updatedMatch,
            accessToken,
          );
        }
        await loadCandidates(true);
      } catch (error) {
        if (status === "ACCEPTED" && request) {
          setRequests((prev) => [request, ...prev]);
          setActionMessage(
            error instanceof Error
              ? error.message
              : "El match se acepto, pero no se pudo crear el chat.",
          );
          return;
        }
        await loadRequests();
      }
    },
    [accessToken, loadCandidates, loadRequests, requests, user?.id],
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
        <MaterialCommunityIcons
          name="account-search"
          size={56}
          color="#e5e5e5"
        />
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
            {candidates.length} personas compatibles ·{" "}
            {
              requests.filter((request) => request.direction === "incoming")
                .length
            }{" "}
            solicitudes
          </Text>
        </View>
        <Pressable onPress={() => loadCandidates()} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={22} color="#ff2d78" />
        </Pressable>
      </View>
      {actionMessage ? (
        <View style={styles.actionBanner}>
          <Text style={styles.actionBannerText}>{actionMessage}</Text>
        </View>
      ) : null}

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
                  onAccept={(matchId) =>
                    handleRequestStatus(matchId, "ACCEPTED")
                  }
                  onReject={(matchId) =>
                    handleRequestStatus(matchId, "REJECTED")
                  }
                />
              ))}
              {candidates.length > 0 ? (
                <Text style={[styles.sectionTitle, styles.discoverTitle]}>
                  Personas compatibles
                </Text>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => <MatchCard item={item} onLike={handleLike} />}
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
    backgroundColor: "#f9f9fb",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: "#999999",
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff0f5",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff0f5",
    borderBottomWidth: 1,
    borderBottomColor: "#ffe0ea",
  },
  actionBannerText: {
    color: "#b42355",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
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
    fontWeight: "800",
    color: "#777777",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  discoverTitle: {
    marginTop: 8,
  },

  // ── Card ──
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  requestCard: {
    borderWidth: 1,
    borderColor: "#ffe0ea",
  },
  cardTop: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBadge: {
    position: "absolute",
    bottom: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
  },
  cardInfo: {
    flex: 1,
    gap: 5,
  },
  nameText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
    letterSpacing: -0.3,
  },
  ageText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#555555",
  },
  rowSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: "#999999",
  },
  compatRow: {
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "600",
  },
  scoreBarBg: {
    height: 4,
    backgroundColor: "#f0f0f0",
    borderRadius: 2,
    overflow: "hidden",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reasonText: {
    fontSize: 12,
    color: "#555555",
  },

  // ── Interests ──
  requestMeta: { fontSize: 12, color: "#ff2d78", fontWeight: "700" },
  requestReason: { fontSize: 12, color: "#666666", lineHeight: 17 },
  requestActions: { flexDirection: "row", gap: 10 },
  requestButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  rejectButton: { backgroundColor: "#f3f4f6" },
  acceptButton: { backgroundColor: "#ff2d78" },
  rejectButtonText: { color: "#6b7280", fontSize: 13, fontWeight: "800" },
  acceptButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },

  interestsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interesChip: {
    backgroundColor: "#fff0f5",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  interesText: {
    fontSize: 11,
    color: "#ff2d78",
    fontWeight: "600",
  },
  profileDetails: {
    gap: 4,
    paddingTop: 2,
  },
  bioText: {
    fontSize: 13,
    color: "#444444",
    lineHeight: 18,
  },
  detailText: {
    fontSize: 12,
    color: "#777777",
  },

  // ── Like button ──
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#ff2d78",
    backgroundColor: "#ffffff",
    marginTop: 2,
  },
  likeButtonDone: {
    backgroundColor: "#ff2d78",
    borderColor: "#ff2d78",
  },
  likeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ff2d78",
  },
  likeButtonTextDone: {
    color: "#ffffff",
  },

  // ── States ──
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
    backgroundColor: "#f9f9fb",
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
    textAlign: "center",
  },
  stateText: {
    fontSize: 14,
    color: "#999999",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#ff2d78",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
});
