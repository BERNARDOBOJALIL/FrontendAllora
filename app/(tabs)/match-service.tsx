import ExploreScreen from './explore';

export default function MatchServiceScreen() {
  return <ExploreScreen />;
}

// services/match-service.ts

const MATCH_SERVICE_URL =
  process.env.EXPO_PUBLIC_MATCH_SERVICE_URL ??
  "http://192.168.1.81:8002";

export type MatchStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface MatchResponse {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: MatchStatus;
  compatibility_score: number;
  reasons: string[];
  created_at: string;
  updated_at: string;
  expires_at?: string;
  metadata: Record<string, unknown>;
}

/**
 * Send a match request from userId to targetUserId.
 * Called from the location radar when tapping "Enviar match".
 */
export async function createMatch(
  userId: string,
  targetUserId: string,
  accessToken?: string | null,
): Promise<MatchResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${MATCH_SERVICE_URL}/matches`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_a_id: userId,
      user_b_id: targetUserId,
    }),
  });

  if (!response.ok) {
    let detail = `match-service ${response.status}`;
    try {
      const body = await response.json();
      detail = `match-service ${response.status}: ${JSON.stringify(body)}`;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return response.json() as Promise<MatchResponse>;
}

/**
 * Get all matches for a user.
 */
export async function getUserMatches(
  userId: string,
  accessToken?: string | null,
  statusFilter?: MatchStatus,
): Promise<MatchResponse[]> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = new URL(`${MATCH_SERVICE_URL}/users/${userId}/all-matches`);
  if (statusFilter) url.searchParams.set("status", statusFilter);

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`match-service ${response.status}`);
  }

  const data = await response.json();
  return data.matches as MatchResponse[];
}

/**
 * Update a match status (accept / reject).
 */
export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
  accessToken?: string | null,
): Promise<MatchResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${MATCH_SERVICE_URL}/matches/${matchId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(`match-service ${response.status}`);
  }

  return response.json() as Promise<MatchResponse>;
}