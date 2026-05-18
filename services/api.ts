const DEFAULT_API_BASE_URL = 'http://192.168.56.1:8000';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  process.env.VITE_API_BASE_URL?.trim() ||
  DEFAULT_API_BASE_URL;

export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
  baseUrl?: string;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const requestUrl = options.baseUrl
    ? `${options.baseUrl.replace(/\/$/, '')}${cleanPath}`
    : buildApiUrl(path);

  const response = await fetch(requestUrl, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const isJson = response.headers
    .get('content-type')
    ?.toLowerCase()
    .includes('application/json');

  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    const details = payload;

    if (payload && typeof payload === 'object' && 'detail' in payload) {
      const detail = (payload as Record<string, unknown>).detail;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        message = detail;
      }
    }

    if (typeof payload === 'string' && payload.trim().length > 0) {
      message = payload;
    }

    throw new ApiError(response.status, message, details);
  }

  return payload as T;
}
