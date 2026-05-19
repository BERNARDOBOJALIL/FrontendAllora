import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";


import { useAuth } from "@/providers/auth-context";
import {
  LocationWebSocketService,
  SocketStatus,
} from "@/services/location-websocket";
import { getNearbySpaces, createSpace, joinSpace, leaveSpace, type Space } from "@/services/groups";

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionState = "pending" | "granted" | "denied";
type BubbleKind = "place" | "user" | "self";

type NearbyUser = {
  id: string;
  name: string;
  avatarUri?: string;
  online?: boolean;
  subtitle?: string;
  distance?: string;
  compatibility?: number;
};

type NearbyPlace = {
  id: string;
  name: string;
  activeUsers: number;
  photoUri?: string;
  subtitle?: string;
  isGroup?: boolean;
  spaceId?: string;
};

type BubbleDescriptor = {
  id: string;
  kind: BubbleKind;
  title: string;
  subtitle: string;
  avatarUri?: string;
  photoUri?: string;
  size: number;
  x: number;
  y: number;
  accent: string;
  tint: string;
  border: string;
  online?: boolean;
  isActive: boolean;
  distance?: string;
  compatibility?: number;
};

type BubbleModel = BubbleDescriptor & {
  opacity: Animated.Value;
  scale: Animated.Value;
  motion: Animated.Value;
  leaving?: boolean;
};

type BroadcastEntry = {
  users?: NearbyUser[];
  places?: NearbyPlace[];
  raw: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_WS_URL =
  "wss://allora-location-service.agreeabledune-f41f7671.centralus.azurecontainerapps.io/ws";
const SEND_INTERVAL_MS = 4000;
const MAX_VISIBLE_USERS = 8;
const MAX_VISIBLE_PLACES = 5;

const C = {
  white: "#ffffff",
  bg: "#FDFCFB",
  ink: "#1A1A2E",
  inkMid: "rgba(26,26,46,0.6)",
  inkLight: "rgba(26,26,46,0.25)",
  inkFaint: "rgba(26,26,46,0.08)",
  // accents
  rose: "#FF4E7A",
  roseTint: "#FFE8EE",
  roseBorder: "#FFBDD0",
  roseDim: "rgba(255,78,122,0.12)",
  gold: "#FF9B50",
  goldTint: "#FFF3EB",
  goldBorder: "#FFCFA0",
  lav: "#8B5CF6",
  lavTint: "#F3EEFF",
  lavBorder: "#CFC0F8",
  teal: "#14B8A6",
  tealTint: "#E6FAFA",
  tealBorder: "#9DE8E4",
  green: "#22C55E",
  muted: "#9CA3AF",
};

const USER_THEMES = [
  { accent: C.rose, tint: C.roseTint, border: C.roseBorder },
  { accent: C.lav, tint: C.lavTint, border: C.lavBorder },
  { accent: C.gold, tint: C.goldTint, border: C.goldBorder },
  { accent: C.teal, tint: C.tealTint, border: C.tealBorder },
];

const PLACE_THEMES = [
  { accent: C.gold, tint: C.goldTint, border: C.goldBorder },
  { accent: C.lav, tint: C.lavTint, border: C.lavBorder },
  { accent: C.teal, tint: C.tealTint, border: C.tealBorder },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeIdentityText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function createSelfIdentityTokens(...values: unknown[]): Set<string> {
  return new Set(
    values
      .flatMap((value) => [normalizeId(value), normalizeIdentityText(value)])
      .filter(Boolean),
  );
}

function isSelfNearbyUser(nearbyUser: NearbyUser, selfTokens: Set<string>): boolean {
  if (selfTokens.size === 0) return false;

  const nearbyTokens = [
    normalizeId(nearbyUser.id),
    normalizeIdentityText(nearbyUser.id),
    normalizeId(nearbyUser.name),
    normalizeIdentityText(nearbyUser.name),
  ].filter((token) => token && token !== "persona");

  return nearbyTokens.some((token) => selfTokens.has(token));
}

function hashText(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++)
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function seededOffset(seed: number, spread: number): number {
  const v = Math.sin(seed) * 10000;
  return ((v - Math.floor(v)) * 2 - 1) * spread;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatConnectionLabel(status: SocketStatus): string {
  switch (status) {
    case "connected":    return "En vivo";
    case "connecting":   return "Conectando…";
    case "reconnecting": return "Reconectando…";
    case "error":        return "Error de conexión";
    case "disconnected": return "Sin señal";
    default:             return "Iniciando…";
  }
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function findDisplayName(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return "";

  const record = value as Record<string, unknown>;
  const wsPrimaryNameKeys = [
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
  ];

  for (const key of wsPrimaryNameKeys) {
    const direct = readStringField(record, key);
    if (direct) return direct;
  }

  const nameKeys = [
    "username",
    "nickname",
    "alias",
    "handle",
    "nombre_completo",
    "nombreCompleto",
  ];

  for (const key of nameKeys) {
    const direct = readStringField(record, key);
    if (direct) return direct;
  }

  const firstName = readStringField(record, "first_name") || readStringField(record, "firstName") || readStringField(record, "firstname");
  const lastName = readStringField(record, "last_name") || readStringField(record, "lastName") || readStringField(record, "lastname");
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  const nestedKeys = ["profile", "user", "account", "person", "identity", "data", "payload", "result"];
  for (const key of nestedKeys) {
    const nested = findDisplayName(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findDisplayName(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return "";
}

function extractUserName(record: Record<string, unknown>): string {
  const displayName = findDisplayName(record);
  if (displayName) return displayName;

  return "Persona";
}

function extractUserNameMap(record: Record<string, unknown>): Record<string, string> {
  const map: Record<string, string> = {};
  const candidateKeys = [
    "user_names",
    "userNames",
    "nearby_user_names",
    "nearbyUserNames",
    "names_by_user_id",
    "namesByUserId",
    "user_name_by_id",
    "userNameById",
    "users_by_id",
    "usersById",
  ];

  for (const key of candidateKeys) {
    const candidate = record[key];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;

    const entries = Object.entries(candidate as Record<string, unknown>);
    for (const [id, value] of entries) {
      if (typeof value === "string" && value.trim()) {
        map[id] = value.trim();
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nestedName = extractUserName(value as Record<string, unknown>);
        if (nestedName && nestedName !== "Persona" && nestedName !== id) {
          map[id] = nestedName;
        }
      }
    }
  }

  return map;
}

function normalizeUsers(input: unknown): NearbyUser[] {
  return normalizeUsersWithNameMap(input, {});
}

function normalizeUsersWithNameMap(input: unknown, userNameMap: Record<string, string>): NearbyUser[] {
  if (!Array.isArray(input)) return [];
  const result: NearbyUser[] = [];
  input.forEach((item) => {
    if (typeof item === "string") {
      const mappedName = userNameMap[item]?.trim();
      result.push({ id: item, name: mappedName || item, online: true, subtitle: "cerca" });
      return;
    }
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const id = String(
      r.id ??
      r.user_id ??
      r.userId ??
      r.client_id ??
      r.clientId ??
      r.uuid ??
      r.key ??
      "",
    ).trim() || extractUserName(r);
    const extractedName = extractUserName(r);
    const mappedName = userNameMap[id]?.trim();
    const name = mappedName || extractedName;
    result.push({
      id,
      name,
      avatarUri:
        typeof r.avatar_uri === "string" ? r.avatar_uri
        : typeof r.avatar === "string" ? r.avatar
        : undefined,
      online: typeof r.online === "boolean" ? r.online : true,
      subtitle:
        typeof r.subtitle === "string" ? r.subtitle
        : typeof r.distance === "string" ? r.distance
        : "cerca",
      distance: typeof r.distance === "string" ? r.distance : undefined,
      compatibility:
        typeof r.compatibility === "number" ? r.compatibility : undefined,
    });
  });
  return result.slice(0, MAX_VISIBLE_USERS);
}

function isUserLikeRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    "id" in record ||
    "user_id" in record ||
    "userId" in record ||
    "client_id" in record ||
    "clientId" in record ||
    "name" in record ||
    "user_name" in record ||
    "userName" in record ||
    "nombre" in record ||
    "username" in record ||
    "display_name" in record ||
    "full_name" in record ||
    "avatar" in record ||
    "avatar_uri" in record ||
    "distance" in record ||
    "compatibility" in record ||
    "online" in record
  );
}

function normalizeUsersFromPayload(
  input: unknown,
  inheritedNameMap: Record<string, string> = {},
): NearbyUser[] {
  if (!input) return [];
  if (Array.isArray(input)) return normalizeUsersWithNameMap(input, inheritedNameMap);
  if (typeof input !== "object") return [];

  const r = input as Record<string, unknown>;
  const mergedNameMap = { ...inheritedNameMap, ...extractUserNameMap(r) };
  const candidates = [
    r.nearby_users,
    r.nearbyUsers,
    r.users,
    r.connected_users,
    r.connectedUsers,
    r.room_users,
    r.roomUsers,
    r.people,
    r.nearby_people,
    r.nearbyPeople,
    r.data,
    r.payload,
    r.result,
    r.items,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUsersFromPayload(candidate, mergedNameMap);
    if (normalized.length > 0) return normalized;
  }

  if (isUserLikeRecord(r)) {
    return normalizeUsersWithNameMap([r], mergedNameMap);
  }

  const values = Object.values(r).filter((value) => value && typeof value === "object" && !Array.isArray(value));
  if (values.length > 0) {
    return normalizeUsersWithNameMap(values, mergedNameMap);
  }

  const nestedList = Object.values(r).find((value) => Array.isArray(value));
  if (nestedList) return normalizeUsersWithNameMap(nestedList, mergedNameMap);

  return [];
}

function normalizePlaces(input: unknown): NearbyPlace[] {
  if (!Array.isArray(input)) return [];
  const result: NearbyPlace[] = [];
  input.forEach((item, i) => {
    if (typeof item === "string") {
      result.push({ id: item, name: item, activeUsers: 0, subtitle: "lugar cercano" });
      return;
    }
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const name =
      String(r.name ?? r.title ?? r.label ?? "").trim() || `Place ${i + 1}`;
    const id = String(r.id ?? r.place_id ?? name);
    result.push({
      id,
      name,
      activeUsers: Number(r.active_users ?? r.users_count ?? r.count ?? 0) || 0,
      photoUri:
        typeof r.photo_uri === "string" ? r.photo_uri
        : typeof r.image === "string" ? r.image
        : undefined,
      subtitle: typeof r.subtitle === "string" ? r.subtitle : "lugar cercano",
    });
  });
  return result.slice(0, MAX_VISIBLE_PLACES);
}

function normalizePlacesFromPayload(input: unknown): NearbyPlace[] {
  if (!input) return [];
  if (Array.isArray(input)) return normalizePlaces(input);
  if (typeof input !== "object") return [];

  const r = input as Record<string, unknown>;
  const candidates = [
    r.nearby_places,
    r.nearbyPlaces,
    r.places,
    r.spots,
    r.locations,
    r.groups,
    r.data,
    r.payload,
    r.result,
    r.items,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlacesFromPayload(candidate);
    if (normalized.length > 0) return normalized;
  }

  const values = Object.values(r).filter((value) => value && typeof value === "object" && !Array.isArray(value));
  if (values.length > 0) {
    return normalizePlaces(values);
  }

  const nestedList = Object.values(r).find((value) => Array.isArray(value));
  if (nestedList) return normalizePlaces(nestedList);

  return [];
}

// ─── Bubble descriptors ───────────────────────────────────────────────────────

function buildBubbleDescriptors(
  users: NearbyUser[],
  places: NearbyPlace[],
  width: number,
  height: number,
  selectedId: string | null,
  currentCoords: { lat: number; lng: number } | null,
  positionCache: Map<string, { x: number; y: number }>,
): BubbleDescriptor[] {
  const sw = Math.max(width, 320);
  const sh = Math.max(height * 0.62, 440);
  const cx = sw / 2;
  const cy = sh / 2.06;

  const placeDescriptors = places.map((place, i) => {
    const angle = -1.38 + i * 0.92;
    const rx = sw * 0.25 + i * 10;
    const ry = sh * 0.18 + i * 6;
    const seed = hashText(place.id);
    const theme = PLACE_THEMES[i % PLACE_THEMES.length];
    const cachedPosition = positionCache.get(`place-${place.id}`);
    const descriptor = {
      id: `place-${place.id}`,
      kind: "place" as const,
      title: place.name,
      subtitle: `${place.activeUsers} aquí`,
      photoUri: place.photoUri,
      size: clamp(128 - i * 6, 100, 136),
      x: cachedPosition?.x ?? clamp(
        cx + Math.cos(angle) * rx + seededOffset(seed, 20) - 60,
        12, sw - 148,
      ),
      y: cachedPosition?.y ?? clamp(
        cy + Math.sin(angle) * ry + seededOffset(seed + 1, 18) - 60,
        64, sh - 180,
      ),
      accent: theme.accent,
      tint: theme.tint,
      border: theme.border,
      isActive: true,
    } satisfies BubbleDescriptor;
    positionCache.set(descriptor.id, { x: descriptor.x, y: descriptor.y });
    return descriptor;
  });

  const userDescriptors = users.map((user, i) => {
    const angle = 0.38 + i * 0.7;
    const rx = sw * 0.32 + (i % 2) * 28;
    const ry = sh * 0.26 + (i % 3) * 18;
    const seed = hashText(user.id);
    const theme = USER_THEMES[i % USER_THEMES.length];
    const isSelected = selectedId === `user-${user.id}`;
    const cachedPosition = positionCache.get(`user-${user.id}`);
    const descriptor = {
      id: `user-${user.id}`,
      kind: "user" as const,
      title: user.name,
      subtitle: user.subtitle ?? (user.online ? "en línea" : "ausente"),
      avatarUri: user.avatarUri,
      size: isSelected ? 100 : clamp(82 - i * 2, 60, 84),
      x: cachedPosition?.x ?? clamp(
        cx + Math.cos(angle) * rx + seededOffset(seed, 26) - 41,
        10, sw - 110,
      ),
      y: cachedPosition?.y ?? clamp(
        cy + Math.sin(angle) * ry + seededOffset(seed + 2, 22) - 41,
        52, sh - 130,
      ),
      accent: theme.accent,
      tint: theme.tint,
      border: theme.border,
      online: user.online,
      isActive: true,
      distance: user.distance,
      compatibility: user.compatibility,
    } satisfies BubbleDescriptor;
    positionCache.set(descriptor.id, { x: descriptor.x, y: descriptor.y });
    return descriptor;
  });

  const selfDescriptor: BubbleDescriptor = {
    id: "self-location",
    kind: "self",
    title: "Tú",
    subtitle: currentCoords
      ? `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`
      : "Buscando GPS…",
    size: selectedId === "self-location" ? 104 : 92,
    x: cx - 46,
    y: cy - 46,
    accent: C.rose,
    tint: C.roseTint,
    border: C.roseBorder,
    isActive: true,
  };

  positionCache.set(selfDescriptor.id, { x: selfDescriptor.x, y: selfDescriptor.y });
  return [...placeDescriptors, selfDescriptor, ...userDescriptors];
}

// ─── Bubble model ─────────────────────────────────────────────────────────────

function createBubbleModel(d: BubbleDescriptor): BubbleModel {
  const opacity = new Animated.Value(0);
  const scale = new Animated.Value(0.65);
  const motion = new Animated.Value(0);

  Animated.parallel([
    Animated.spring(opacity, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
    Animated.spring(scale,   { toValue: 1, tension: 70, friction: 8,  useNativeDriver: true }),
  ]).start();

  motion.setValue(0);
  return { ...d, opacity, scale, motion };
}

function useFloatingBubbleModels(descriptors: BubbleDescriptor[]): BubbleModel[] {
  const ref = useRef(new Map<string, BubbleModel>());
  const [models, setModels] = useState<BubbleModel[]>([]);

  useEffect(() => {
    const nextIds = new Set(descriptors.map((d) => d.id));
    descriptors.forEach((d) => {
      const ex = ref.current.get(d.id);
      if (ex) {
        Object.assign(ex, {
          title: d.title, subtitle: d.subtitle,
          avatarUri: d.avatarUri, photoUri: d.photoUri,
          size: d.size, accent: d.accent, tint: d.tint, border: d.border,
          online: d.online, kind: d.kind, isActive: d.isActive,
          x: d.x, y: d.y, leaving: false,
          distance: d.distance, compatibility: d.compatibility,
        });
        Animated.parallel([
          Animated.spring(ex.scale,   { toValue: 1, tension: 85, friction: 8, useNativeDriver: true }),
          Animated.spring(ex.opacity, { toValue: 1, tension: 85, friction: 8, useNativeDriver: true }),
        ]).start();
        return;
      }
      ref.current.set(d.id, createBubbleModel(d));
    });
    Array.from(ref.current.keys()).forEach((id) => {
      if (nextIds.has(id)) return;
      const m = ref.current.get(id);
      if (!m || m.leaving) return;
      m.leaving = true;
      Animated.parallel([
        Animated.timing(m.opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(m.scale,   { toValue: 0.5, duration: 280, useNativeDriver: true }),
      ]).start(() => {
        ref.current.delete(id);
        setModels(Array.from(ref.current.values()));
      });
    });
    setModels(Array.from(ref.current.values()));
  }, [descriptors]);

  return models;
}

// ─── Sonar ring ───────────────────────────────────────────────────────────────

function SonarRing({ color, size, delay = 0 }: { color: string; size: number; delay?: number }) {
  const sc = useRef(new Animated.Value(0.9)).current;
  const op = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(sc, {
          toValue: 2.4, duration: 2600, delay,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 0, duration: 2600, delay,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [sc, op, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: 1.5, borderColor: color,
        opacity: op, transform: [{ scale: sc }],
      }}
    />
  );
}

// ─── Radar rings (background decoration) ─────────────────────────────────────

function RadarRings({ cx, cy }: { cx: number; cy: number }) {
  const rings = [110, 220, 330];
  return (
    <>
      {rings.map((r, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: r, height: r,
            borderRadius: r / 2,
            borderWidth: 0.5,
            borderColor: "rgba(26,26,46,0.06)",
            borderStyle: i === 2 ? "dashed" : "solid",
            left: cx - r / 2,
            top: cy - r / 2,
          }}
        />
      ))}
    </>
  );
}

// ─── Heart animation ──────────────────────────────────────────────────────────

function HeartBurst({ onDone }: { onDone: () => void }) {
  const y   = useRef(new Animated.Value(0)).current;
  const op  = useRef(new Animated.Value(1)).current;
  const sc  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sc,   { toValue: 1.4, tension: 120, friction: 5, useNativeDriver: true }),
      Animated.timing(y,    { toValue: -44, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", alignSelf: "center",
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: C.rose,
        opacity: op, transform: [{ translateY: y }, { scale: sc }],
      }}
    />
  );
}

// ─── Bubble item ──────────────────────────────────────────────────────────────

function BubbleItem({
  bubble,
  isExpanded,
  onPress,
}: {
  bubble: BubbleModel;
  isExpanded: boolean;
  onPress: (id: string) => void;
}) {
  const expanded = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const [showHeart, setShowHeart] = useState(false);

  useEffect(() => {
    Animated.spring(expanded, {
      toValue: isExpanded ? 1 : 0,
      tension: 90, friction: 9, useNativeDriver: true,
    }).start();
  }, [expanded, isExpanded]);

  const breathe = bubble.motion.interpolate({
    inputRange: [0, 0.5, 1], outputRange: [1, 1.032, 1],
  });
  const tapScale = expanded.interpolate({
    inputRange: [0, 1], outputRange: [1, 1.14],
  });
  const tagOpacity = expanded;
  const tagTranslate = expanded.interpolate({
    inputRange: [0, 1], outputRange: [6, 0],
  });

  const handlePress = () => {
    if (isExpanded && bubble.kind === "user") setShowHeart(true);
    onPress(bubble.id);
  };

  return (
    <Animated.View
      style={[
        styles.bubbleLayer,
        {
          left: bubble.x, top: bubble.y,
          opacity: bubble.opacity,
          transform: [
            { scale: Animated.multiply(bubble.scale, breathe) },
          ],
        },
      ]}
    >
      {showHeart && <HeartBurst onDone={() => setShowHeart(false)} />}

      <Pressable onPress={handlePress} style={styles.bubblePressable}>
        <Animated.View
          style={[
            styles.bubbleShell,
            bubble.kind === "user" && styles.userBubbleShell,
            {
              width: bubble.size, height: bubble.size,
              borderRadius: bubble.size / 2,
              backgroundColor: bubble.tint,
              borderColor: bubble.border,
              transform: [{ scale: tapScale }],
            },
          ]}
        >
          {bubble.kind === "user"  ? <UserBubble  bubble={bubble} /> :
           bubble.kind === "place" ? <PlaceBubble bubble={bubble} /> :
           <SelfBubble bubble={bubble} />}
        </Animated.View>
      </Pressable>

      {/* Tag flotante al expandir */}
      {isExpanded && (
        <Animated.View
          style={[
            styles.tag,
            {
              opacity: tagOpacity,
              transform: [{ translateY: tagTranslate }],
            },
          ]}
        >
          <View style={[styles.tagDot, { backgroundColor: bubble.accent }]} />
          <Text style={styles.tagText} numberOfLines={1}>
            {bubble.subtitle}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── User bubble ──────────────────────────────────────────────────────────────

function UserBubble({ bubble }: { bubble: BubbleModel }) {
  const shortName = bubble.title.trim().split(/\s+/)[0] || bubble.title;
  return (
    <View style={styles.userInner}>
      <View style={[styles.userOuterHalo, { borderColor: `${bubble.accent}30` }]} />
      <View style={styles.userAvatarClip}>
        <View style={[styles.userGlowRing, { borderColor: `${bubble.accent}44` }]} />
        {bubble.avatarUri ? (
          <Image
            source={{ uri: bubble.avatarUri }}
            style={styles.userAvatarFill}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={[`${bubble.accent}2E`, `${bubble.accent}12`, C.white]}
            start={{ x: 0.14, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.userFallbackFill}
          >
            <Text style={[styles.avatarInitials, { color: bubble.accent }]}>
              {initials(bubble.title)}
            </Text>
          </LinearGradient>
        )}

        <LinearGradient
          colors={["rgba(255,255,255,0.24)", "rgba(26,26,46,0.00)", "rgba(26,26,46,0.18)"]}
          locations={[0, 0.55, 1]}
          style={styles.userShadeMask}
        />
        <View style={styles.userHighlight} />
      </View>

      {bubble.distance && (
        <View style={[styles.userMiniTag, { backgroundColor: `${bubble.accent}E6` }]}>
          <Text style={styles.userMiniTagText}>{bubble.distance}</Text>
        </View>
      )}

      <View
        style={[
          styles.pip,
          styles.pipElevated,
          { backgroundColor: bubble.online ? C.green : C.muted },
        ]}
      />
      <View style={styles.userNameChip}>
        <Text numberOfLines={1} style={styles.userNameOverlay}>
          {shortName}
        </Text>
      </View>
    </View>
  );
}

// ─── Place bubble ─────────────────────────────────────────────────────────────

function PlaceBubble({ bubble }: { bubble: BubbleModel }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {bubble.photoUri && (
        <Image
          source={{ uri: bubble.photoUri }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: bubble.size / 2, opacity: 0.18 }]}
          contentFit="cover"
        />
      )}
      <View style={styles.placeInner}>
        <Text numberOfLines={1} style={styles.placeName}>
          {bubble.title}
        </Text>
        <Text numberOfLines={1} style={[styles.placeCount, { color: bubble.accent }]}>
          {bubble.subtitle}
        </Text>
      </View>
    </View>
  );
}

// ─── Self bubble ──────────────────────────────────────────────────────────────

function SelfBubble({ bubble }: { bubble: BubbleModel }) {
  const s = bubble.size;
  return (
    <View style={styles.selfWrap}>
      <SonarRing color={C.rose} size={s * 0.68} />
      <SonarRing color={C.rose} size={s * 0.68} delay={900} />
      <SonarRing color={C.rose} size={s * 0.68} delay={1800} />
      <View style={styles.selfCore}>
        <Text style={styles.selfYo}>YO</Text>
        <Text style={styles.selfLive}>LIVE</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LocationScreen() {
  const { width, height } = useWindowDimensions();
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [permissionState, setPermissionState] = useState<PermissionState>("pending");
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<SocketStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [nearbySpaces, setNearbySpaces] = useState<Space[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>("self-location");
  const [connectivityNote, setConnectivityNote] = useState("Solicitando permiso…");
  const [matchCount, setMatchCount] = useState(0);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [userSpaces, setUserSpaces] = useState<string[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

  // ─── Pan / drag del stage ──────────────────────────────────────────────────
  const panOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panLast   = useRef({ x: 0, y: 0 });
  const panVel    = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        isDragging.current = true;
        panOffset.stopAnimation((val) => {
          panLast.current = val;
          panOffset.setOffset(val);
          panOffset.setValue({ x: 0, y: 0 });
        });
      },
      onPanResponderMove: (_, g) => {
        panVel.current = { x: g.vx, y: g.vy };
        panOffset.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        isDragging.current = false;
        panOffset.flattenOffset();
        // Inercia suave al soltar
        Animated.decay(panOffset, {
          velocity: { x: g.vx, y: g.vy },
          deceleration: 0.96,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        panOffset.flattenOffset();
      },
    }),
  ).current;

  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const wsServiceRef = useRef<LocationWebSocketService | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const clientIdRef = useRef(user?.id ?? `mobile-${Math.floor(Math.random() * 9000) + 1000}`);
  const userNameRef = useRef(user?.nombre?.trim() ?? "");
  const lastNearbySpacesFetchRef = useRef(0);
  const nearbyUserCacheRef = useRef(new Map<string, { user: NearbyUser; lastSeen: number }>());
  const bubblePositionCacheRef = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => { if (user?.id) clientIdRef.current = user.id; }, [user?.id]);
  useEffect(() => { userNameRef.current = user?.nombre?.trim() ?? ""; }, [user?.nombre]);

  const fetchNearbySpaces = useCallback(async (options: { force?: boolean } = {}) => {
    const coords = coordsRef.current;
    if (!coords) return;

    const now = Date.now();
    if (!options.force && now - lastNearbySpacesFetchRef.current < 15000) {
      return;
    }

    lastNearbySpacesFetchRef.current = now;
    setIsLoadingSpaces(true);
    try {
      const result = await getNearbySpaces(
        coords.lat,
        coords.lng,
        5,
        accessToken ?? undefined,
        user?.id,
      );
      setNearbySpaces(result.spaces || []);
    } catch (err) {
      console.warn('Error fetching nearby spaces:', err);
    } finally {
      setIsLoadingSpaces(false);
    }
  }, [accessToken, user?.id]);

  const handleCreateSpace = useCallback(
    async (name: string, description: string, photoBase64: string, radiusKm: number) => {
      const coords = coordsRef.current;
      if (!coords || !user?.id || !accessToken) return;
      try {
        const newSpace = await createSpace(
          {
            user_id: user.id,
            name,
            description,
            photo_base64: photoBase64,
            lat: coords.lat,
            lng: coords.lng,
            radius_km: radiusKm,
          },
          accessToken,
          user.id,
        );
        setNearbySpaces((prev) => [...prev, newSpace]);
        setUserSpaces((prev) => [...prev, newSpace.space_id]);
        setShowCreateGroupModal(false);
      } catch (err) {
        console.error('Error creating space:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Error creando grupo');
      }
    },
    [accessToken, user?.id],
  );

  const handleJoinSpace = useCallback(
    async (spaceId: string) => {
      const coords = coordsRef.current;
      if (!coords || !user?.id || !accessToken) return;
      try {
        const updatedSpace = await joinSpace(
          spaceId,
          { user_id: user.id, lat: coords.lat, lng: coords.lng },
          accessToken,
          user.id,
        );
        setUserSpaces((prev) => (prev.includes(spaceId) ? prev : [...prev, spaceId]));
        setNearbySpaces((prev) =>
          prev.map((space) => (space.space_id === spaceId ? updatedSpace : space)),
        );
        setSelectedSpace((current) =>
          current?.space_id === spaceId ? updatedSpace : current,
        );
        await fetchNearbySpaces({ force: true });
      } catch (err) {
        console.error('Error joining space:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Error uniéndose al grupo');
      }
    },
    [accessToken, fetchNearbySpaces, user?.id],
  );

  const handleLeaveSpace = useCallback(
    async (spaceId: string) => {
      if (!user?.id || !accessToken) return;
      try {
        await leaveSpace(spaceId, user.id, accessToken);
        setUserSpaces((prev) => prev.filter((id) => id !== spaceId));
        setNearbySpaces((prev) =>
          prev.map((space) =>
            space.space_id === spaceId
              ? {
                  ...space,
                  members: space.members?.filter((memberId) => memberId !== user.id) ?? [],
                }
              : space,
          ),
        );
        setSelectedSpace((current) =>
          current?.space_id === spaceId
            ? {
                ...current,
                members: current.members?.filter((memberId) => memberId !== user.id) ?? [],
              }
            : current,
        );
        await fetchNearbySpaces({ force: true });
      } catch (err) {
        console.error('Error leaving space:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Error saliendo del grupo');
      }
    },
    [accessToken, fetchNearbySpaces, user?.id],
  );

  const handleOpenGroupChat = useCallback(
    (space: Space) => {
      if (!space.chat_conversation_id) {
        setErrorMessage("Este grupo todavía no tiene un chat disponible.");
        return;
      }

      setSelectedSpace(null);
      router.push({
        pathname: "/(tabs)/chat",
        params: {
          groupConversationId: space.chat_conversation_id,
          groupName: space.name,
          spaceId: space.space_id,
          groupMembers: JSON.stringify(space.members ?? []),
        },
      });
    },
    [router],
  );

  const stopLocationWatcher = useCallback(() => {
    locationWatcherRef.current?.remove();
    locationWatcherRef.current = null;
  }, []);

  const stopSendLoop = useCallback(() => {
    if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null; }
  }, []);

  const processBroadcast = useCallback((data: unknown, raw: string) => {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const r = data as Record<string, unknown>;
      let users = normalizeUsersFromPayload(r);

      if (users.length === 0 && typeof r.user_id === "string") {
        const directName = typeof r.user_name === "string" ? r.user_name.trim() : "";
        users = [{
          id: r.user_id,
          name: directName || "Persona",
          online: true,
          subtitle: "cerca",
        }];
      }

      const selfTokens = createSelfIdentityTokens(
        user?.id,
        user?.nombre,
        user?.email,
        clientIdRef.current,
        userNameRef.current,
      );

      users = users.filter((u) => !isSelfNearbyUser(u, selfTokens));
      nearbyUserCacheRef.current.forEach((entry, cacheId) => {
        const cachedAsNearbyUser = {
          ...entry.user,
          id: entry.user.id || cacheId,
        };
        if (isSelfNearbyUser(cachedAsNearbyUser, selfTokens)) {
          nearbyUserCacheRef.current.delete(cacheId);
        }
      });

      const now = Date.now();
      for (const userItem of users) {
        const current = nearbyUserCacheRef.current.get(userItem.id);
        const incomingName = (userItem.name ?? "").trim();
        const hasMeaningfulIncomingName = incomingName.length > 0 && incomingName !== userItem.id && incomingName !== "Persona";
        const existingName = (current?.user.name ?? "").trim();
        const resolvedName = hasMeaningfulIncomingName
          ? incomingName
          : existingName || incomingName || "Persona";

        nearbyUserCacheRef.current.set(userItem.id, {
          user: {
            ...current?.user,
            ...userItem,
            name: resolvedName,
          },
          lastSeen: now,
        });
      }

      const freshUsers = Array.from(nearbyUserCacheRef.current.values())
        .filter((entry) => now - entry.lastSeen <= 25000)
        .filter((entry) => !isSelfNearbyUser(entry.user, selfTokens))
        .map((entry) => entry.user);

      nearbyUserCacheRef.current.forEach((entry, id) => {
        if (now - entry.lastSeen > 25000) {
          nearbyUserCacheRef.current.delete(id);
        }
      });

      setNearbyUsers(freshUsers);
    }
  }, [user?.email, user?.id, user?.nombre]);

  const ensureSocketService = useCallback(() => {
    if (wsServiceRef.current) return wsServiceRef.current;
    wsServiceRef.current = new LocationWebSocketService({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        setConnectivityNote(formatConnectionLabel(status));
      },
      onClose: (event) => { setConnectivityNote(`Desconectado (${event.code})`); },
      onError: (event) => { setErrorMessage(event.message); setConnectivityNote(event.message); },
      onMessage: (data, raw) => { processBroadcast(data, raw); },
    });
    return wsServiceRef.current;
  }, [processBroadcast]);

  const sendCurrentLocation = useCallback(() => {
    const service = wsServiceRef.current;
    const coords = coordsRef.current;
    if (!service || !coords) return;
    const currentUserName = userNameRef.current;
    service.sendLocation({
      lat: coords.lat, lng: coords.lng,
      timestamp: new Date().toISOString(),
      clientId: clientIdRef.current,
      user_id: clientIdRef.current,
      userId: clientIdRef.current,
      user_name: currentUserName || undefined,
      userName: currentUserName || undefined,
    });
  }, []);

  const requestPermissionAndTrack = useCallback(async () => {
    setIsRequestingPermission(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const granted = permission.status === "granted";
      setPermissionState(granted ? "granted" : "denied");
      if (!granted) {
        setLocationError("Se necesita acceso a la ubicación para mostrar personas cercanas.");
        setConnectivityNote("Permiso denegado");
        return;
      }
      setConnectivityNote("Buscando personas y grupos…");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const fc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coordsRef.current = fc;
      setCurrentCoords(fc);
      stopLocationWatcher();
      locationWatcherRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 1 },
        (p) => {
          const nc = { lat: p.coords.latitude, lng: p.coords.longitude };
          coordsRef.current = nc;
          setCurrentCoords(nc);
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al iniciar ubicación.";
      setLocationError(msg);
      setConnectivityNote(msg);
    } finally {
      setIsRequestingPermission(false);
    }
  }, [stopLocationWatcher]);

  useEffect(() => {
    requestPermissionAndTrack();
    return () => { stopSendLoop(); stopLocationWatcher(); wsServiceRef.current?.disconnect(); };
  }, [requestPermissionAndTrack, stopLocationWatcher, stopSendLoop]);

  useEffect(() => {
    if (currentCoords && user?.id) {
      fetchNearbySpaces();
    }
  }, [currentCoords, user?.id, fetchNearbySpaces]);

  useEffect(() => {
    if (permissionState !== "granted") { wsServiceRef.current?.disconnect(); stopSendLoop(); return; }
    const s = ensureSocketService();
    s.connect(AUTO_WS_URL, user?.id ?? clientIdRef.current);
    return () => { s.disconnect(); };
  }, [ensureSocketService, permissionState, stopSendLoop, user?.id]);

  useEffect(() => {
    if (connectionStatus !== "connected") { stopSendLoop(); return; }
    sendCurrentLocation();
    stopSendLoop();
    sendIntervalRef.current = setInterval(sendCurrentLocation, SEND_INTERVAL_MS);
    return () => { stopSendLoop(); };
  }, [connectionStatus, sendCurrentLocation, stopSendLoop]);

  const visibleNearbyUsers = useMemo(() => {
    const selfTokens = createSelfIdentityTokens(
      user?.id,
      user?.nombre,
      user?.email,
      clientIdRef.current,
      userNameRef.current,
    );

    return nearbyUsers.filter((nearbyUser) => !isSelfNearbyUser(nearbyUser, selfTokens));
  }, [nearbyUsers, user?.email, user?.id, user?.nombre]);

  const bubbleDescriptors = useMemo(
    () => {
      // Convertir espacios en places para mostrarlos en el radar
      const groupPlaces: NearbyPlace[] = nearbySpaces.map((space) => ({
        id: space.space_id,
        name: space.name,
        activeUsers: space.members?.length ?? 0,
        photoUri: space.photo_base64 ? space.photo_base64 : undefined,
        subtitle: `${space.members?.length ?? 0} miembros`,
        isGroup: true,
        spaceId: space.space_id,
      }));
      return buildBubbleDescriptors(
        visibleNearbyUsers,
        groupPlaces,
        width,
        height,
        selectedBubbleId,
        currentCoords,
        bubblePositionCacheRef.current,
      );
    },
    [currentCoords, height, visibleNearbyUsers, selectedBubbleId, width, nearbySpaces],
  );

  const floatingBubbles = useFloatingBubbleModels(bubbleDescriptors);

  const statusColor = useMemo(() => {
    switch (connectionStatus) {
      case "connected":    return C.green;
      case "connecting":
      case "reconnecting": return C.lav;
      case "error":        return C.rose;
      case "disconnected": return C.muted;
      default:             return C.teal;
    }
  }, [connectionStatus]);

  // Centro aproximado para los anillos de radar
  const radarCx = width / 2;
  const radarCy = height * 0.5;

  return (
    <View style={styles.screen}>
      {/* Fondos decorativos */}
      <View style={[styles.aura, styles.aura1]} pointerEvents="none" />
      <View style={[styles.aura, styles.aura2]} pointerEvents="none" />
      <View style={[styles.aura, styles.aura3]} pointerEvents="none" />

      {/* ── Canvas arrastrable (anillos + burbujas) — FONDO ── */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setSelectedBubbleId(null)}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: panOffset.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <RadarRings cx={radarCx} cy={radarCy} />
        </View>
        <View style={styles.stage} pointerEvents="box-none">
          {floatingBubbles.map((bubble) => (
            <BubbleItem
              key={bubble.id}
              bubble={bubble}
              isExpanded={selectedBubbleId === bubble.id}
              onPress={(id) => {
                if (isDragging.current) return;
                if (selectedBubbleId === id && bubble.kind === "user") {
                  setMatchCount((n) => n + 1);
                }
                // Si es un grupo, abrir modal
                if (bubble.kind === "place" && id.startsWith("place-")) {
                  const groupId = id.replace("place-", "");
                  const group = nearbySpaces.find((s) => s.space_id === groupId);
                  if (group) {
                    setSelectedSpace(group);
                    setSelectedBubbleId(null);
                    return;
                  }
                }
                setSelectedBubbleId((prev) => (prev === id ? null : id));
              }}
            />
          ))}
        </View>
      </Animated.View>

      {/* Botón de recentrar — encima del canvas, debajo del footer */}
      <View style={styles.recenterWrap} pointerEvents="box-none">
        <Pressable
          style={styles.recenterBtn}
          onPress={() =>
            Animated.spring(panOffset, {
              toValue: { x: 0, y: 0 },
              tension: 80, friction: 10,
              useNativeDriver: true,
            }).start()
          }
        >
          <View style={styles.recenterDot} />
          <Text style={styles.recenterText}>Centrar</Text>
        </Pressable>
      </View>

      {/* ── UI fija: HUD + stats + footer — ENCIMA del canvas ── */}
      <View style={styles.uiLayer} pointerEvents="box-none">
        {/* HUD superior */}
        <View style={styles.hud} pointerEvents="box-none">
          <View>
            <Text style={styles.kicker}>· RADAR</Text>
            <Text style={styles.title}>
              Cerca{"\n"}de <Text style={styles.titleAccent}>ti</Text>
            </Text>
          </View>
          <View style={[styles.statusPill, { borderColor: `${statusColor}40` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {connectivityNote}
            </Text>
          </View>
        </View>

        {/* Stats chips */}
        <View style={styles.statsRow} pointerEvents="none">
          <View style={styles.statChip}>
            <View style={[styles.statIcon, { backgroundColor: C.roseTint }]}>
              <View style={[styles.statIconDot, { backgroundColor: C.rose }]} />
            </View>
            <View>
              <Text style={styles.statN}>{visibleNearbyUsers.length}</Text>
              <Text style={styles.statL}>Personas</Text>
            </View>
          </View>
          <View style={styles.statChip}>
            <View style={[styles.statIcon, { backgroundColor: C.goldTint }]}>
              <View style={[styles.statIconDot, { backgroundColor: C.gold }]} />
            </View>
            <View>
              <Text style={styles.statN}>{nearbySpaces.length}</Text>
              <Text style={styles.statL}>Grupos</Text>
            </View>
          </View>
          <View style={styles.statChip}>
            <View style={[styles.statIcon, { backgroundColor: C.lavTint }]}>
              <View style={[styles.statIconDot, { backgroundColor: C.lav }]} />
            </View>
            <View>
              <Text style={[styles.statN, matchCount > 0 && { color: C.rose }]}>
                {matchCount}
              </Text>
              <Text style={styles.statL}>Matches</Text>
            </View>
          </View>
        </View>

        {/* Espaciador flexible — el canvas se ve aquí */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* Footer */}
        <View style={styles.footer} pointerEvents="box-none">
          <View style={styles.footerCard}>
            <View style={styles.coordRow}>
              <Text style={styles.coordLabel}>Coordenadas</Text>
              <Text style={styles.coordValue}>
                {currentCoords
                  ? `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`
                  : "esperando GPS…"}
              </Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.groupsRow} pointerEvents="auto">
              <View style={{ flex: 1 }}>
                <Text style={styles.coordLabel}>Grupos cercanos</Text>
                <Text style={styles.coordValue}>
                  {isLoadingSpaces ? "Actualizando..." : nearbySpaces.length}
                </Text>
              </View>
              <Pressable
                style={styles.createGroupBtn}
                onPress={() => setShowCreateGroupModal(true)}
              >
                <Text style={styles.createGroupBtnText}>Crear grupo</Text>
              </Pressable>
            </View>
            {(locationError || errorMessage) && (
              <Text style={styles.errorText}>{locationError ?? errorMessage}</Text>
            )}
            {isRequestingPermission && (
              <Text style={styles.helperText}>Solicitando permiso GPS…</Text>
            )}
          </View>
        </View>
      </View>

      {/* Modal para crear grupo */}
      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
          onCreate={handleCreateSpace}
        />
      )}

      {/* Modal para unirse/salir de grupo */}
      {selectedSpace && (
        <SpaceDetailModal
          space={selectedSpace}
          isMember={userSpaces.includes(selectedSpace.space_id)}
          onClose={() => setSelectedSpace(null)}
          onJoin={() => handleJoinSpace(selectedSpace.space_id)}
          onLeave={() => handleLeaveSpace(selectedSpace.space_id)}
          onOpenChat={() => handleOpenGroupChat(selectedSpace)}
        />
      )}
    </View>
  );
}

// ─── Create Group Modal ────────────────────────────────────────────────────────

function CreateGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string, photo: string, radius: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [radiusKm, setRadiusKm] = useState("2");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert("El nombre del grupo es requerido");
      return;
    }
    setIsCreating(true);
    try {
      // Foto placeholder en base64 (1x1 pixel rojo)
      const placeholderPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHoAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      await onCreate(name, description, placeholderPhoto, parseFloat(radiusKm) || 2);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onClose}
      pointerEvents="box-none"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.5)" },
        ]}
        pointerEvents="none"
      />
      <Pressable
        style={styles.modalContent}
        onPress={(e) => e.stopPropagation()}
        pointerEvents="auto"
      >
        <Text style={styles.modalTitle}>Crear Grupo</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Nombre del grupo"
          value={name}
          onChangeText={setName}
          placeholderTextColor={C.inkLight}
        />
        <TextInput
          style={[styles.modalInput, { height: 80 }]}
          placeholder="Descripción"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholderTextColor={C.inkLight}
        />
        <TextInput
          style={styles.modalInput}
          placeholder="Radio (km)"
          value={radiusKm}
          onChangeText={setRadiusKm}
          keyboardType="decimal-pad"
          placeholderTextColor={C.inkLight}
        />
        <View style={styles.modalButtonRow}>
          <Pressable
            style={[styles.modalButton, { backgroundColor: C.inkFaint }]}
            onPress={onClose}
            disabled={isCreating}
          >
            <Text style={[styles.modalButtonText, { color: C.ink }]}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.modalButton, { backgroundColor: C.rose }]}
            onPress={handleCreate}
            disabled={isCreating}
          >
            <Text style={[styles.modalButtonText, { color: C.white }]}>
              {isCreating ? "Creando..." : "Crear"}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

// ─── Space Detail Modal ────────────────────────────────────────────────────────

function SpaceDetailModal({
  space,
  isMember,
  onClose,
  onJoin,
  onLeave,
  onOpenChat,
}: {
  space: Space;
  isMember: boolean;
  onClose: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onOpenChat: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    setIsLoading(true);
    try {
      await onJoin();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeave = async () => {
    setIsLoading(true);
    try {
      await onLeave();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onClose}
      pointerEvents="box-none"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.5)" },
        ]}
        pointerEvents="none"
      />
      <Pressable
        style={styles.modalContent}
        onPress={(e) => e.stopPropagation()}
        pointerEvents="auto"
      >
        <Text style={styles.modalTitle}>{space.name}</Text>
        {space.photo_base64 && (
          <Image
            source={{ uri: space.photo_base64 }}
            style={{ height: 120, borderRadius: 12, marginVertical: 8 }}
            contentFit="cover"
          />
        )}
        <Text style={styles.modalDescription}>{space.description}</Text>
        <View style={styles.spaceInfoRow}>
          <Text style={styles.spaceInfoLabel}>Miembros:</Text>
          <Text style={styles.spaceInfoValue}>{space.members?.length ?? 0}</Text>
        </View>
        <View style={styles.spaceInfoRow}>
          <Text style={styles.spaceInfoLabel}>Radio:</Text>
          <Text style={styles.spaceInfoValue}>{space.radius_km} km</Text>
        </View>
        <Pressable
          style={[
            styles.modalButton,
            styles.modalButtonFull,
            {
              backgroundColor:
                isMember && space.chat_conversation_id ? C.lav : C.inkFaint,
            },
          ]}
          onPress={onOpenChat}
          disabled={isLoading || !isMember || !space.chat_conversation_id}
        >
          <Text
            style={[
              styles.modalButtonText,
              { color: isMember && space.chat_conversation_id ? C.white : C.inkMid },
            ]}
          >
            {isMember ? "Abrir chat del grupo" : "Únete para abrir el chat"}
          </Text>
        </Pressable>
        <View style={styles.modalButtonRow}>
          <Pressable
            style={[styles.modalButton, { backgroundColor: C.inkFaint }]}
            onPress={onClose}
            disabled={isLoading}
          >
            <Text style={[styles.modalButtonText, { color: C.ink }]}>Cerrar</Text>
          </Pressable>
          <Pressable
            style={[
              styles.modalButton,
              { backgroundColor: isMember ? C.gold : C.rose },
            ]}
            onPress={isMember ? handleLeave : handleJoin}
            disabled={isLoading}
          >
            <Text style={[styles.modalButtonText, { color: C.white }]}>
              {isLoading ? "Procesando..." : isMember ? "Salir del grupo" : "Unirse"}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Capa de UI fija encima del canvas
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    justifyContent: "space-between",
  },

  // Fondos decorativos
  aura: { position: "absolute", borderRadius: 999 },
  aura1: {
    width: 340, height: 340,
    backgroundColor: "rgba(255,78,122,0.07)",
    top: -100, left: -80,
    // RN no tiene filter:blur nativo, usar opacity para el efecto
  },
  aura2: {
    width: 260, height: 260,
    backgroundColor: "rgba(139,92,246,0.05)",
    top: 80, right: -100,
  },
  aura3: {
    width: 220, height: 220,
    backgroundColor: "rgba(255,155,80,0.06)",
    bottom: 80, left: -60,
  },

  // HUD
  hud: {
    paddingTop: 58, paddingHorizontal: 24,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    gap: 12,
  },
  kicker: {
    fontSize: 10, letterSpacing: 3,
    color: C.rose, fontWeight: "700", textTransform: "uppercase",
  },
  title: {
    fontSize: 34, fontWeight: "900",
    color: C.ink, letterSpacing: -1, lineHeight: 38,
    marginTop: 2,
  },
  titleAccent: { color: C.rose },

  // Status pill
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: C.white,
    marginTop: 32,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" },

  // Stats
  statsRow: {
    flexDirection: "row", gap: 10,
    marginHorizontal: 24, marginTop: 16,
  },
  statChip: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 14,
    backgroundColor: C.white, borderWidth: 0.5, borderColor: C.inkFaint,
  },
  statIcon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  statN: { fontSize: 17, fontWeight: "800", color: C.ink, lineHeight: 20 },
  statL: {
    fontSize: 9, fontWeight: "700", color: C.inkMid,
    letterSpacing: 0.8, textTransform: "uppercase",
  },

  // Stage
  stage: { flex: 1, marginTop: 8 },

  // Bubbles
  bubbleLayer: { position: "absolute", alignItems: "center" },
  bubblePressable: { alignSelf: "flex-start" },
  bubbleShell: {
    overflow: "hidden", borderWidth: 1.5,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  userBubbleShell: {
    overflow: "visible",
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowColor: "#111827",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },

  // User bubble
  userInner: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  userOuterHalo: {
    position: "absolute",
    inset: -3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  userAvatarClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.96)",
  },
  userGlowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 6,
    opacity: 0.62,
  },
  distBadge: {
    position: "absolute", top: -7, right: -4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999,
  },
  distBadgeText: { fontSize: 9, fontWeight: "700", color: C.white, letterSpacing: 0.2 },
  compatBadge: {
    position: "absolute", top: -7, left: -4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, borderWidth: 0.5,
  },
  compatBadgeText: { fontSize: 9, fontWeight: "700" },
  userAvatarFill: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  userFallbackFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  userShadeMask: {
    ...StyleSheet.absoluteFillObject,
  },
  userHighlight: {
    position: "absolute",
    top: 8,
    left: 11,
    width: 24,
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.30)",
    transform: [{ rotate: "-18deg" }],
  },
  avatarInitials: { fontSize: 18, fontWeight: "900" },
  userNameChip: {
    position: "absolute",
    bottom: -14,
    maxWidth: 82,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(26,26,46,0.08)",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  userNameOverlay: {
    fontSize: 10,
    fontWeight: "900",
    color: C.ink,
    textAlign: "center",
  },
  pip: {
    position: "absolute", bottom: 1, right: 1,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 3, borderColor: C.white,
  },
  pipElevated: {
    right: -1,
    top: -1,
    bottom: undefined,
    shadowColor: C.green,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  userMiniTag: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  userMiniTagText: { color: C.white, fontSize: 9, fontWeight: "800" },
  statIconDot: { width: 8, height: 8, borderRadius: 4 },

  // Place bubble
  placeInner: {
    position: "absolute", bottom: 14, left: 8, right: 8, alignItems: "center", gap: 2,
  },
  placeName: { fontSize: 11, fontWeight: "800", color: C.ink, textAlign: "center" },
  placeCount: { fontSize: 10, fontWeight: "700", textAlign: "center" },

  // Self bubble
  selfWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  selfCore: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.rose,
    alignItems: "center", justifyContent: "center", gap: 1,
    shadowColor: C.rose, shadowOpacity: 0.4,
    shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  selfYo: { fontSize: 13, fontWeight: "900", color: C.white, letterSpacing: 1.5 },
  selfLive: { fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 1.2 },

  // Tag
  tag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: C.white,
    borderWidth: 0.5, borderColor: C.inkFaint, maxWidth: 180,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: { fontSize: 9, fontWeight: "700", color: C.inkMid, flexShrink: 1 },

  // Footer
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  footerCard: {
    backgroundColor: C.white, borderRadius: 24,
    borderWidth: 0.5, borderColor: C.inkFaint,
    padding: 18, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.06,
    shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
  },
  broadcastRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  broadcastBar: { width: 2.5, borderRadius: 2, alignSelf: "stretch" },
  broadcastLabel: {
    fontSize: 9, fontWeight: "700", color: C.inkMid,
    letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 3,
  },
  broadcastMsg: { fontSize: 13, color: "#555", lineHeight: 19 },
  sep: { height: 0.5, backgroundColor: C.inkFaint },
  coordRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  coordLabel: { fontSize: 11, color: C.inkMid, fontWeight: "500" },
  coordValue: { fontSize: 12, fontWeight: "700", color: C.rose, letterSpacing: 0.3 },
  errorText: { fontSize: 12, color: C.rose, fontWeight: "600" },
  helperText: { fontSize: 11, color: C.inkMid, fontWeight: "500" },

  // Recentrar
  recenterWrap: {
    position: "absolute", bottom: 180, right: 20,
    zIndex: 30,
  },
  recenterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 0.5, borderColor: C.inkFaint,
    shadowColor: "#000", shadowOpacity: 0.08,
    shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  recenterDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.rose,
  },
  recenterText: {
    fontSize: 12, fontWeight: "700", color: C.ink,
  },

  // Groups section
  groupsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  createGroupBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.rose,
  },
  createGroupBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.white,
  },

  // Modal styles
  modalContent: {
    position: "absolute",
    left: 20,
    right: 20,
    top: "50%",
    marginTop: -150,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.ink,
    marginBottom: 8,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.inkFaint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.ink,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonFull: {
    flex: 0,
    marginTop: 8,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },

  // Space detail styles
  modalDescription: {
    fontSize: 14,
    color: C.inkMid,
    marginVertical: 8,
    lineHeight: 20,
  },
  spaceInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.inkFaint,
  },
  spaceInfoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.inkMid,
  },
  spaceInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: C.ink,
  },
});
