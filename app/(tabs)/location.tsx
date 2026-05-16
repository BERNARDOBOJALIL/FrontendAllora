import { Image } from "expo-image";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import {
    LocationWebSocketService,
    SocketStatus,
} from "@/services/location-websocket";
import { useAuth } from "@/providers/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionState = "pending" | "granted" | "denied";
type BubbleKind = "place" | "user" | "self";

type NearbyUser = {
  id: string;
  name: string;
  avatarUri?: string;
  online?: boolean;
  subtitle?: string;
};

type NearbyPlace = {
  id: string;
  name: string;
  activeUsers: number;
  photoUri?: string;
  subtitle?: string;
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
  bg: "#ffffff",
  ink: "#0d0d0d",
  muted: "#999999",
  border: "#f0f0f0",
  surf: "#fafafa",
  // accents
  pink: "#ff2d78",
  pinkTint: "#fff5f8",
  pinkBorder: "#ffd0e0",
  blue: "#0099ff",
  blueTint: "#f5faff",
  blueBorder: "#d0eaff",
  violet: "#7c3aed",
  violetTint: "#f8f6ff",
  violetBorder: "#ede8ff",
  green: "#10b981",
  greenTint: "#f2fcf8",
  greenBorder: "#d0f0e8",
  amber: "#d97706",
  amberTint: "#fffbf0",
  amberBorder: "#fde68a",
};

const PLACE_THEMES = [
  { accent: C.pink, tint: C.pinkTint, border: C.pinkBorder },
  { accent: C.blue, tint: C.blueTint, border: C.blueBorder },
  { accent: C.violet, tint: C.violetTint, border: C.violetBorder },
  { accent: C.amber, tint: C.amberTint, border: C.amberBorder },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
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
    case "connected":
      return "En vivo";
    case "connecting":
      return "Conectando…";
    case "reconnecting":
      return "Reconectando…";
    case "error":
      return "Error de conexión";
    case "disconnected":
      return "Sin señal";
    default:
      return "Iniciando…";
  }
}

function normalizeUsers(input: unknown): NearbyUser[] {
  if (!Array.isArray(input)) return [];
  const result: NearbyUser[] = [];
  input.forEach((item, i) => {
    if (typeof item === "string") {
      result.push({ id: item, name: item, online: true, subtitle: "cerca" });
      return;
    }
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const name =
      String(
        r.name ?? r.username ?? r.display_name ?? r.full_name ?? "",
      ).trim() || `User ${i + 1}`;
    const id = String(r.id ?? r.user_id ?? name);
    result.push({
      id,
      name,
      avatarUri:
        typeof r.avatar_uri === "string"
          ? r.avatar_uri
          : typeof r.avatar === "string"
            ? r.avatar
            : undefined,
      online: typeof r.online === "boolean" ? r.online : true,
      subtitle:
        typeof r.subtitle === "string"
          ? r.subtitle
          : typeof r.distance === "string"
            ? r.distance
            : "cerca",
    });
  });
  return result.slice(0, MAX_VISIBLE_USERS);
}

function normalizePlaces(input: unknown): NearbyPlace[] {
  if (!Array.isArray(input)) return [];
  const result: NearbyPlace[] = [];
  input.forEach((item, i) => {
    if (typeof item === "string") {
      result.push({
        id: item,
        name: item,
        activeUsers: 0,
        subtitle: "lugar cercano",
      });
      return;
    }
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const name =
      String(r.name ?? r.title ?? r.label ?? "").trim() || `Place ${i + 1}`;
    const id = String(r.id ?? r.place_id ?? name);
    const activeUsers =
      Number(r.active_users ?? r.users_count ?? r.count ?? 0) || 0;
    result.push({
      id,
      name,
      activeUsers,
      photoUri:
        typeof r.photo_uri === "string"
          ? r.photo_uri
          : typeof r.image === "string"
            ? r.image
            : undefined,
      subtitle: typeof r.subtitle === "string" ? r.subtitle : "lugar cercano",
    });
  });
  return result.slice(0, MAX_VISIBLE_PLACES);
}

// ─── Bubble descriptors ───────────────────────────────────────────────────────

function buildBubbleDescriptors(
  users: NearbyUser[],
  places: NearbyPlace[],
  width: number,
  height: number,
  selectedId: string | null,
  currentCoords: { lat: number; lng: number } | null,
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
    return {
      id: `place-${place.id}`,
      kind: "place" as const,
      title: place.name,
      subtitle: `${place.activeUsers} aquí · ${place.subtitle ?? "ambiente tranquilo"}`,
      photoUri: place.photoUri,
      size: clamp(128 - i * 4, 108, 140),
      x: clamp(
        cx + Math.cos(angle) * rx + seededOffset(seed, 20) - 60,
        12,
        sw - 152,
      ),
      y: clamp(
        cy + Math.sin(angle) * ry + seededOffset(seed + 1, 18) - 60,
        64,
        sh - 192,
      ),
      accent: theme.accent,
      tint: theme.tint,
      border: theme.border,
      online: undefined,
      isActive: true,
    } satisfies BubbleDescriptor;
  });

  const userDescriptors = users.map((user, i) => {
    const angle = 0.38 + i * 0.7;
    const rx = sw * 0.32 + (i % 2) * 28;
    const ry = sh * 0.26 + (i % 3) * 18;
    const seed = hashText(user.id);
    const theme = user.online
      ? { accent: C.green, tint: C.greenTint, border: C.greenBorder }
      : { accent: C.violet, tint: C.violetTint, border: C.violetBorder };
    return {
      id: `user-${user.id}`,
      kind: "user" as const,
      title: user.name,
      subtitle: user.subtitle ?? (user.online ? "en línea" : "ausente"),
      avatarUri: user.avatarUri,
      size: selectedId === `user-${user.id}` ? 106 : 82,
      x: clamp(
        cx + Math.cos(angle) * rx + seededOffset(seed, 26) - 41,
        10,
        sw - 114,
      ),
      y: clamp(
        cy + Math.sin(angle) * ry + seededOffset(seed + 2, 22) - 41,
        52,
        sh - 136,
      ),
      accent: theme.accent,
      tint: theme.tint,
      border: theme.border,
      online: user.online,
      isActive: true,
    } satisfies BubbleDescriptor;
  });

  const selfDescriptor: BubbleDescriptor = {
    id: "self-location",
    kind: "self",
    title: "Tú",
    subtitle: currentCoords
      ? `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`
      : "Buscando GPS…",
    size: selectedId === "self-location" ? 108 : 96,
    x: cx - 48,
    y: cy - 48,
    accent: C.pink,
    tint: C.pinkTint,
    border: C.pinkBorder,
    isActive: true,
  };

  return [...placeDescriptors, selfDescriptor, ...userDescriptors];
}

// ─── Bubble model ─────────────────────────────────────────────────────────────

function createBubbleModel(d: BubbleDescriptor): BubbleModel {
  const opacity = new Animated.Value(0);
  const scale = new Animated.Value(0.65);
  const motion = new Animated.Value(0);

  Animated.parallel([
    Animated.spring(opacity, {
      toValue: 1,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }),
    Animated.spring(scale, {
      toValue: 1,
      tension: 70,
      friction: 8,
      useNativeDriver: true,
    }),
  ]).start();

  Animated.loop(
    Animated.sequence([
      Animated.timing(motion, {
        toValue: 1,
        duration: 3400 + (hashText(d.id) % 1200),
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(motion, {
        toValue: 0,
        duration: 3400 + (hashText(d.id) % 1200),
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]),
  ).start();

  motion.setValue(d.kind === "place" ? 0.12 : 0.22);
  return { ...d, opacity, scale, motion };
}

function useFloatingBubbleModels(
  descriptors: BubbleDescriptor[],
): BubbleModel[] {
  const ref = useRef(new Map<string, BubbleModel>());
  const [models, setModels] = useState<BubbleModel[]>([]);

  useEffect(() => {
    const nextIds = new Set(descriptors.map((d) => d.id));
    descriptors.forEach((d) => {
      const ex = ref.current.get(d.id);
      if (ex) {
        Object.assign(ex, {
          title: d.title,
          subtitle: d.subtitle,
          avatarUri: d.avatarUri,
          photoUri: d.photoUri,
          size: d.size,
          accent: d.accent,
          tint: d.tint,
          border: d.border,
          online: d.online,
          kind: d.kind,
          isActive: d.isActive,
          x: d.x,
          y: d.y,
          leaving: false,
        });
        Animated.parallel([
          Animated.spring(ex.scale, {
            toValue: 1,
            tension: 85,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.spring(ex.opacity, {
            toValue: 1,
            tension: 85,
            friction: 8,
            useNativeDriver: true,
          }),
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
        Animated.timing(m.opacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(m.scale, {
          toValue: 0.5,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        ref.current.delete(id);
        setModels(Array.from(ref.current.values()));
      });
    });
    setModels(Array.from(ref.current.values()));
  }, [descriptors]);

  return models;
}

// ─── Pulse ring (sonar for self) ──────────────────────────────────────────────

function PulseRing({
  color,
  size,
  delay = 0,
}: {
  color: string;
  size: number;
  delay?: number;
}) {
  const sc = useRef(new Animated.Value(0.85)).current;
  const op = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(sc, {
          toValue: 2.1,
          duration: 2200,
          delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 0,
          duration: 2200,
          delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
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
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: op,
        transform: [{ scale: sc }],
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

  useEffect(() => {
    Animated.spring(expanded, {
      toValue: isExpanded ? 1 : 0,
      tension: 90,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [expanded, isExpanded]);

  const breathe = bubble.motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.035, 1],
  });
  const driftX = bubble.motion.interpolate({
    inputRange: [0, 1],
    outputRange: [
      bubble.kind === "place" ? -7 : -9,
      bubble.kind === "place" ? 7 : 9,
    ],
  });
  const driftY = bubble.motion.interpolate({
    inputRange: [0, 1],
    outputRange: [
      bubble.kind === "place" ? -9 : -11,
      bubble.kind === "place" ? 9 : 11,
    ],
  });
  const tapScale = expanded.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16],
  });

  return (
    <Animated.View
      style={[
        styles.bubbleLayer,
        {
          left: bubble.x,
          top: bubble.y,
          opacity: bubble.opacity,
          transform: [
            { scale: Animated.multiply(bubble.scale, breathe) },
            { translateX: driftX },
            { translateY: driftY },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => onPress(bubble.id)}
        style={styles.bubblePressable}
      >
        <Animated.View
          style={[
            styles.bubbleShell,
            {
              width: bubble.size,
              height: bubble.size,
              borderRadius: bubble.size / 2,
              backgroundColor: bubble.tint,
              borderColor: bubble.border,
              transform: [{ scale: tapScale }],
            },
          ]}
        >
          {bubble.kind === "user" ? (
            <UserBubble bubble={bubble} />
          ) : bubble.kind === "place" ? (
            <PlaceBubble bubble={bubble} />
          ) : (
            <SelfBubble bubble={bubble} />
          )}
        </Animated.View>
      </Pressable>

      {isExpanded && (
        <Animated.View
          style={[
            styles.tag,
            {
              opacity: expanded,
              transform: [
                {
                  translateY: expanded.interpolate({
                    inputRange: [0, 1],
                    outputRange: [6, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.tagDot, { backgroundColor: bubble.accent }]} />
          <Text style={[styles.tagText]} numberOfLines={1}>
            {bubble.subtitle}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function UserBubble({ bubble }: { bubble: BubbleModel }) {
  return (
    <View style={styles.userInner}>
      <View
        style={[
          styles.avatarRing,
          { borderColor: bubble.border, backgroundColor: `${bubble.accent}18` },
        ]}
      >
        {bubble.avatarUri ? (
          <Image
            source={{ uri: bubble.avatarUri }}
            style={styles.avatarImg}
            contentFit="cover"
          />
        ) : (
          <Text style={[styles.avatarInitials, { color: bubble.accent }]}>
            {initials(bubble.title)}
          </Text>
        )}
        <View
          style={[
            styles.pip,
            { backgroundColor: bubble.online ? C.green : C.violet },
          ]}
        />
      </View>
      <Text numberOfLines={1} style={styles.userName}>
        {bubble.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.userStatus,
          { color: bubble.online ? C.green : C.muted },
        ]}
      >
        {bubble.online ? "● en línea" : "○ ausente"}
      </Text>
    </View>
  );
}

function PlaceBubble({ bubble }: { bubble: BubbleModel }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {bubble.photoUri && (
        <Image
          source={{ uri: bubble.photoUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      )}
      <View style={styles.placeInner}>
        <Text numberOfLines={1} style={styles.placeName}>
          {bubble.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.placeCount, { color: bubble.accent }]}
        >
          {bubble.subtitle.split("·")[0].trim()}
        </Text>
      </View>
    </View>
  );
}

function SelfBubble({ bubble }: { bubble: BubbleModel }) {
  const s = bubble.size;
  return (
    <View style={styles.selfWrap}>
      <PulseRing color={C.pink} size={s * 0.65} />
      <PulseRing color={C.pink} size={s * 0.65} delay={900} />
      <View style={styles.selfCore}>
        <Text style={styles.selfYou}>YO</Text>
        <Text style={styles.selfLive}>LIVE</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LocationScreen() {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();

  const [permissionState, setPermissionState] =
    useState<PermissionState>("pending");
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<SocketStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [latestBroadcast, setLatestBroadcast] = useState(
    "Esperando señales cercanas…",
  );
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(
    "self-location",
  );
  const [connectivityNote, setConnectivityNote] = useState(
    "Solicitando permiso…",
  );

  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const wsServiceRef = useRef<LocationWebSocketService | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const clientIdRef = useRef(
    user?.id ?? `mobile-${Math.floor(Math.random() * 9000) + 1000}`,
  );

  useEffect(() => {
    if (user?.id) {
      clientIdRef.current = user.id;
    }
  }, [user?.id]);

  const stopLocationWatcher = useCallback(() => {
    locationWatcherRef.current?.remove();
    locationWatcherRef.current = null;
  }, []);
  const stopSendLoop = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  }, []);

  const processBroadcast = useCallback((data: unknown, raw: string) => {
    const entry: BroadcastEntry = { raw };
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const r = data as Record<string, unknown>;
      const us = r.nearby_users ?? r.users ?? r.connected_users ?? r.room_users;
      const ps = r.nearby_places ?? r.places ?? r.spots ?? r.locations;
      entry.users = normalizeUsers(us);
      entry.places = normalizePlaces(ps);
      if (typeof r.message === "string") entry.raw = r.message;
      else if (typeof r.text === "string") entry.raw = r.text;
    }
    if (entry.users) setNearbyUsers(entry.users);
    if (entry.places) setNearbyPlaces(entry.places);
    setLatestBroadcast(entry.raw);
  }, []);

  const ensureSocketService = useCallback(() => {
    if (wsServiceRef.current) return wsServiceRef.current;
    wsServiceRef.current = new LocationWebSocketService({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        setConnectivityNote(formatConnectionLabel(status));
      },
      onOpen: () => {
        setErrorMessage(null);
        setConnectivityNote("Señales en vivo");
      },
      onClose: (event) => {
        setConnectivityNote(`Desconectado (${event.code})`);
      },
      onError: (event) => {
        setErrorMessage(event.message);
        setConnectivityNote(event.message);
      },
      onMessage: (data, raw) => {
        processBroadcast(data, raw);
      },
    });
    return wsServiceRef.current;
  }, [processBroadcast]);

  const sendCurrentLocation = useCallback(() => {
    const service = wsServiceRef.current;
    const coords = coordsRef.current;
    if (!service || !coords) return;
    service.sendLocation({
      lat: coords.lat,
      lng: coords.lng,
      timestamp: new Date().toISOString(),
      clientId: clientIdRef.current,
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
        setLocationError(
          "Se necesita acceso a la ubicación para mostrar personas cercanas.",
        );
        setConnectivityNote("Permiso denegado");
        return;
      }
      setConnectivityNote("Buscando personas y lugares…");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const fc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coordsRef.current = fc;
      setCurrentCoords(fc);
      stopLocationWatcher();
      locationWatcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 1,
        },
        (p) => {
          const nc = { lat: p.coords.latitude, lng: p.coords.longitude };
          coordsRef.current = nc;
          setCurrentCoords(nc);
        },
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al iniciar ubicación.";
      setLocationError(msg);
      setConnectivityNote(msg);
    } finally {
      setIsRequestingPermission(false);
    }
  }, [stopLocationWatcher]);

  useEffect(() => {
    requestPermissionAndTrack();
    return () => {
      stopSendLoop();
      stopLocationWatcher();
      wsServiceRef.current?.disconnect();
    };
  }, [requestPermissionAndTrack, stopLocationWatcher, stopSendLoop]);

  useEffect(() => {
    if (permissionState !== "granted") {
      wsServiceRef.current?.disconnect();
      stopSendLoop();
      return;
    }
    const s = ensureSocketService();
    s.connect(AUTO_WS_URL, user?.id ?? clientIdRef.current);
    return () => {
      s.disconnect();
    };
  }, [ensureSocketService, permissionState, stopSendLoop, user?.id]);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      stopSendLoop();
      return;
    }
    sendCurrentLocation();
    stopSendLoop();
    sendIntervalRef.current = setInterval(
      sendCurrentLocation,
      SEND_INTERVAL_MS,
    );
    return () => {
      stopSendLoop();
    };
  }, [connectionStatus, sendCurrentLocation, stopSendLoop]);

  const bubbleDescriptors = useMemo(
    () =>
      buildBubbleDescriptors(
        nearbyUsers,
        nearbyPlaces,
        width,
        height,
        selectedBubbleId,
        currentCoords,
      ),
    [currentCoords, height, nearbyPlaces, nearbyUsers, selectedBubbleId, width],
  );

  const floatingBubbles = useFloatingBubbleModels(bubbleDescriptors);

  const statusColor = useMemo(() => {
    switch (connectionStatus) {
      case "connected":
        return C.green;
      case "connecting":
      case "reconnecting":
        return C.violet;
      case "error":
        return C.pink;
      case "disconnected":
        return C.muted;
      default:
        return C.blue;
    }
  }, [connectionStatus]);

  return (
    <View style={styles.screen}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setSelectedBubbleId(null)}
      />

      {/* ── Top HUD ── */}
      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.kicker}>· RADAR</Text>
        <Text style={styles.title}>Cerca{"\n"}de ti</Text>

        <View style={styles.hudRow}>
          {/* Status pill */}
          <View style={[styles.pill, { borderColor: `${statusColor}40` }]}>
            <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.pillText, { color: statusColor }]}>
              {connectivityNote}
            </Text>
          </View>

          {/* Counters */}
          <View style={styles.countsRow}>
            <View style={styles.countItem}>
              <Text style={styles.countN}>{nearbyUsers.length}</Text>
              <Text style={styles.countL}>Personas</Text>
            </View>
            <View style={styles.countDivider} />
            <View style={styles.countItem}>
              <Text style={styles.countN}>{nearbyPlaces.length}</Text>
              <Text style={styles.countL}>Lugares</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Bubble stage ── */}
      <View style={styles.stage} pointerEvents="box-none">
        {floatingBubbles.map((bubble) => (
          <BubbleItem
            key={bubble.id}
            bubble={bubble}
            isExpanded={selectedBubbleId === bubble.id}
            onPress={(id) => setSelectedBubbleId(id)}
          />
        ))}
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer} pointerEvents="box-none">
        <View style={styles.footerCard}>
          <View style={styles.broadcastRow}>
            <View
              style={[styles.broadcastBar, { backgroundColor: statusColor }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.broadcastLabel}>Transmisión en vivo</Text>
              <Text numberOfLines={2} style={styles.broadcastMsg}>
                {latestBroadcast}
              </Text>
            </View>
          </View>

          <View style={styles.sep} />

          <View style={styles.coordRow}>
            <Text style={styles.coordLabel}>Coordenadas</Text>
            <Text style={styles.coordValue}>
              {currentCoords
                ? `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`
                : "esperando GPS…"}
            </Text>
          </View>

          {(locationError || errorMessage) && (
            <Text style={styles.errorText}>
              {locationError ?? errorMessage}
            </Text>
          )}
          {isRequestingPermission && (
            <Text style={styles.helperText}>Solicitando permiso GPS…</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.white },

  // HUD
  hud: { paddingTop: 58, paddingHorizontal: 24, gap: 14 },
  kicker: { fontSize: 10, letterSpacing: 3, color: C.pink, fontWeight: "700" },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: C.ink,
    letterSpacing: -1,
    lineHeight: 38,
  },
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: C.surf,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "600" },
  countsRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  countItem: { alignItems: "center", gap: 2 },
  countN: {
    fontSize: 22,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: -0.5,
  },
  countL: {
    fontSize: 9,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  countDivider: { width: 1, height: 28, backgroundColor: C.border },

  // Stage
  stage: { flex: 1, marginTop: 8 },

  // Bubbles
  bubbleLayer: { position: "absolute", alignItems: "center" },
  bubblePressable: { alignSelf: "flex-start" },
  bubbleShell: {
    overflow: "hidden",
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  // User
  userInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitials: { fontSize: 14, fontWeight: "800" },
  pip: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: C.white,
  },
  userName: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },
  userStatus: { fontSize: 9, fontWeight: "600", textAlign: "center" },

  // Place
  placeInner: {
    position: "absolute",
    bottom: 12,
    left: 10,
    right: 10,
    alignItems: "center",
    gap: 2,
  },
  placeName: {
    fontSize: 12,
    fontWeight: "800",
    color: C.ink,
    textAlign: "center",
  },
  placeCount: { fontSize: 10, fontWeight: "700", textAlign: "center" },

  // Self
  selfWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  selfCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.pink,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    shadowColor: C.pink,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  selfYou: {
    fontSize: 13,
    fontWeight: "900",
    color: C.white,
    letterSpacing: 1.5,
  },
  selfLive: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.2,
  },

  // Tag
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: { fontSize: 9, fontWeight: "700", color: "#444", flexShrink: 1 },

  // Footer
  footer: { paddingHorizontal: 16, paddingBottom: 28 },
  footerCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  broadcastRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  broadcastBar: {
    width: 2,
    borderRadius: 2,
    alignSelf: "stretch",
    marginTop: 2,
  },
  broadcastLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  broadcastMsg: {
    fontSize: 13,
    color: "#555",
    fontWeight: "400",
    lineHeight: 19,
  },
  sep: { height: 1, backgroundColor: C.border },
  coordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coordLabel: { fontSize: 11, color: C.muted, fontWeight: "500" },
  coordValue: {
    fontSize: 12,
    fontWeight: "700",
    color: C.pink,
    letterSpacing: 0.3,
  },
  errorText: { fontSize: 12, color: C.pink, fontWeight: "600" },
  helperText: { fontSize: 11, color: C.muted, fontWeight: "500" },
});
