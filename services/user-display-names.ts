const userDisplayNames = new Map<string, string>();
const knownUserIds = new Set<string>();

const AUTH_SERVICE_URL =
  process.env.EXPO_PUBLIC_AUTH_SERVICE_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "http://192.168.0.253:8000";

function normalizeName(name?: string | null): string {
  return typeof name === "string" ? name.trim() : "";
}

function isMeaningfulName(
  userId: string,
  name?: string | null,
): name is string {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  const normalizedLower = normalized
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    normalized !== userId &&
    normalizedLower !== "usuario" &&
    normalizedLower !== "persona"
  );
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function extractDisplayName(value: unknown, depth = 0): string {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    depth > 3
  ) {
    return "";
  }

  const record = value as Record<string, unknown>;
  const directKeys = [
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
  ];

  for (const key of directKeys) {
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
    "user",
    "profile",
    "account",
    "person",
    "data",
    "payload",
    "result",
  ]) {
    const nested = extractDisplayName(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = extractDisplayName(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return "";
}

export function setUserDisplayName(userId: string, name?: string | null): void {
  const normalizedId = normalizeName(userId);
  const normalizedName = normalizeName(name);
  if (!normalizedId) return;
  knownUserIds.add(normalizedId);
  if (isMeaningfulName(normalizedId, normalizedName)) {
    userDisplayNames.set(normalizedId, normalizedName);
  }
}

export function getUserDisplayName(userId?: string | null): string {
  const normalizedId = normalizeName(userId);
  if (!normalizedId) return "";
  return userDisplayNames.get(normalizedId) ?? "";
}

export function rememberUserDisplayNames(
  users: Array<{ id: string; name?: string | null }>,
): void {
  users.forEach((user) => setUserDisplayName(user.id, user.name));
}

export function rememberUserIds(userIds: string[]): void {
  userIds
    .map(normalizeName)
    .filter(Boolean)
    .forEach((id) => knownUserIds.add(id));
}

export function getKnownUserIds(): string[] {
  return Array.from(knownUserIds);
}

export async function fetchPublicUserDisplayName(
  userId: string,
  _token?: string | null,
): Promise<string> {
  const normalizedId = normalizeName(userId);
  if (!normalizedId) return "";

  try {
    const baseUrl = AUTH_SERVICE_URL.replace(/\/$/, "");
    const encodedId = encodeURIComponent(normalizedId);
    const response = await fetch(`${baseUrl}/public/users/${encodedId}/name`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return "";

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    let payload: unknown;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    const name =
      typeof payload === "string"
        ? payload.trim()
        : extractDisplayName(payload);
    return isMeaningfulName(normalizedId, name) ? name : "";
  } catch {
    return "";
  }
}
