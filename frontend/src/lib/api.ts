const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

let authToken: string | null = localStorage.getItem('beija_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('beija_token', token);
  else localStorage.removeItem('beija_token');
}

export function getToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'request_failed', data?.message);
  return data as T;
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ ok: true; phone: string; devCode?: string }>('POST', '/auth/request-otp', { phone }),
  verifyOtp: (phone: string, code: string) =>
    request<{ token: string; user: any; isNew: boolean; needsProfile: boolean }>('POST', '/auth/verify-otp', { phone, code }),

  getMe: () => request<{ user: any }>('GET', '/profile/me'),
  updateMe: (patch: Record<string, unknown>) => request<{ user: any }>('PUT', '/profile/me', patch),
  uploadPhoto: (file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request<{ photoUrl: string }>('POST', '/profile/me/photo', fd, true);
  },

  listEvents: (lat?: number | null, lng?: number | null) => {
    const qs = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
    return request<{ events: any[] }>('GET', `/events${qs}`);
  },
  getEvent: (id: string) => request<{ event: any }>('GET', `/events/${id}`),
  checkIn: (id: string) => request<{ ok: true }>('POST', `/events/${id}/checkin`),
  checkOut: (id: string) => request<{ ok: true }>('POST', `/events/${id}/checkout`),
  listPeople: (id: string) => request<{ people: any[] }>('GET', `/events/${id}/people`),

  sendReaction: (toUserId: string, eventId: string, type: string) =>
    request<{ ok: true; reaction: any; match: any | null }>('POST', '/reactions', { toUserId, eventId, type }),
  removeReaction: (toUserId: string, eventId: string) =>
    request<{ ok: true }>('DELETE', '/reactions', { toUserId, eventId }),

  listMatches: () => request<{ matches: any[] }>('GET', '/matches'),
  listMessages: (matchId: string) => request<{ messages: any[] }>('GET', `/matches/${matchId}/messages`),
  sendMessage: (matchId: string, text: string) =>
    request<{ message: any }>('POST', `/matches/${matchId}/messages`, { text }),
};
