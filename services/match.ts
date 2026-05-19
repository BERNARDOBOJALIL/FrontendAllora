import { apiRequest } from './api';

const MATCH_SERVICE_BASE = 'http://192.168.1.80:8002';

export async function getMatch(matchId: string) {
  return apiRequest(`/matches/${matchId}`, {
    baseUrl: MATCH_SERVICE_BASE,
  });
}