import { apiRequest } from './api';

const MATCH_SERVICE_BASE = 'http://192.168.1.80:8002'; // IP

export async function getMatch(matchId: string, token?: string) {
  return apiRequest(`/matches/${matchId}`, {
    token,
    baseUrl: MATCH_SERVICE_BASE,
  });
}

// Obtener todos los matches de un usuario (incluye PENDING, ACCEPTED, etc.)
export async function getUserMatches(userId: string, token: string, status?: string) {
  const url = status ? `/users/${userId}/all-matches?status=${status}` : `/users/${userId}/all-matches`;
  return apiRequest(url, { token, baseUrl: MATCH_SERVICE_BASE });
}