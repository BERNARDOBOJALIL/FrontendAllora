import { API_BASE_URL, ApiError, apiRequest } from '@/services/api';

/**
 * Representa un grupo/espacio de proximidad
 * Basado en el README: frontend-groups-guide.md
 */
export type Space = {
  space_id: string;
  name: string;
  description: string;
  photo_base64: string;
  owner_user_id: string;
  lat: number;
  lng: number;
  radius_km: number;
  members: string[];
  chat_conversation_id?: string | null;
  created_at: string;
  expires_at?: string | null;
  distance_km?: number;
};

export type NearbySpacesResponse = {
  count: number;
  spaces: Space[];
};

export type CreateSpacePayload = {
  user_id: string;
  name: string;
  description: string;
  photo_base64: string;
  lat: number;
  lng: number;
  radius_km: number;
};

export type JoinSpacePayload = {
  user_id: string;
  lat?: number;
  lng?: number;
};

type RequestOptions = {
  method: 'GET' | 'POST';
  token?: string;
  userId?: string;
  body?: unknown;
};

const ROUTE_PREFIXES = ['/location', '/api/v1', '/location/api/v1'] as const;

function getCandidateBaseUrls(): Array<string | undefined> {
  const envLocationBase =
    process.env.EXPO_PUBLIC_LOCATION_BASE_URL?.trim() ||
    process.env.VITE_LOCATION_BASE_URL?.trim();

  const derivedLocationBase = API_BASE_URL.includes(':8000')
    ? API_BASE_URL.replace(':8000', ':8003')
    : undefined;

  const baseCandidates = [undefined, envLocationBase, derivedLocationBase];
  const unique = new Set<string | undefined>();
  for (const item of baseCandidates) {
    if (!unique.has(item)) unique.add(item);
  }

  return Array.from(unique);
}

function withPrefix(prefix: string, route: string): string {
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  return `${prefix}${cleanRoute}`;
}

async function requestWithFallback<T>(route: string, options: RequestOptions): Promise<T> {
  let lastError: unknown;
  const baseUrls = getCandidateBaseUrls();

  for (const baseUrl of baseUrls) {
    for (const prefix of ROUTE_PREFIXES) {
      try {
        const headers: Record<string, string> = {};
        if (options.userId) {
          headers['X-User-Id'] = options.userId;
        }

        return await apiRequest<T>(withPrefix(prefix, route), {
          ...options,
          headers,
          baseUrl,
        });
      } catch (error) {
        lastError = error;
        // Si no es 404, no tiene sentido seguir probando otras rutas.
        if (!(error instanceof ApiError) || error.status !== 404) {
          throw error;
        }
      }
    }
  }

  throw lastError;
}

/**
 * Obtener grupos/espacios cercanos
 * GET /location/spaces/nearby?lat={lat}&lng={lng}&radius_km={radius}
 */
export async function getNearbySpaces(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  token?: string,
  userId?: string,
): Promise<NearbySpacesResponse> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    radius_km: radiusKm.toString(),
  });

  return requestWithFallback<NearbySpacesResponse>(`/spaces/nearby?${params}`, {
    method: 'GET',
    token,
    userId,
  });
}

/**
 * Crear un nuevo grupo/espacio
 * POST /location/spaces
 */
export async function createSpace(
  payload: CreateSpacePayload,
  token?: string,
  userId?: string,
): Promise<Space> {
  return requestWithFallback<Space>('/spaces', {
    method: 'POST',
    token,
    userId,
    body: payload,
  });
}

/**
 * Unirse a un grupo/espacio
 * POST /location/spaces/{space_id}/join
 */
export async function joinSpace(
  spaceId: string,
  payload: JoinSpacePayload,
  token?: string,
  userId?: string,
): Promise<Space> {
  return requestWithFallback<Space>(
    `/spaces/${encodeURIComponent(spaceId)}/join`,
    {
      method: 'POST',
      token,
      userId,
      body: payload,
    },
  );
}

/**
 * Salir de un grupo/espacio
 * POST /location/spaces/{space_id}/leave
 */
export async function leaveSpace(
  spaceId: string,
  userId: string,
  token?: string,
): Promise<{ success: boolean }> {
  return requestWithFallback<{ success: boolean }>(
    `/spaces/${encodeURIComponent(spaceId)}/leave`,
    {
      method: 'POST',
      token,
      userId,
      body: { user_id: userId },
    },
  );
}
