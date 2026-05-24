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

import { MOCK_TOKEN, MOCK_OTP, mockUser, mockEvents, mockEvent1, mockPeople, mockMatches, mockMessages, biaUser } from './mockData';

function isMock() { return getToken() === MOCK_TOKEN; }

function findMockEvent(id: string) {
  return mockEvents.find((e) => e.id === id) ?? mockEvent1;
}

const _api = api;
export const mockedApi = {
  ...api,
  requestOtp: async (phone: string) => {
    if (phone === '00000000000') {
      return { ok: true as const, phone, devCode: MOCK_OTP };
    }
    return _api.requestOtp(phone);
  },
  verifyOtp: async (phone: string, code: string) => {
    if (phone === '00000000000' && code === MOCK_OTP) {
      setToken(MOCK_TOKEN);
      return { token: MOCK_TOKEN, user: mockUser, isNew: false, needsProfile: false };
    }
    return _api.verifyOtp(phone, code);
  },
  getMe: async () => (isMock() ? { user: mockUser } : _api.getMe()),
  updateMe: async (patch: Record<string, unknown>) =>
    isMock() ? { user: { ...mockUser, ...patch } } : _api.updateMe(patch),
  uploadPhoto: async (file: File) =>
    isMock() ? { photoUrl: URL.createObjectURL(file) } : _api.uploadPhoto(file),
  listEvents: async (lat?: number | null, lng?: number | null) =>
    isMock() ? { events: mockEvents } : _api.listEvents(lat, lng),
  getEvent: async (id: string) => (isMock() ? { event: findMockEvent(id) } : _api.getEvent(id)),
  checkIn: async (id: string) => (isMock() ? { ok: true as const } : _api.checkIn(id)),
  checkOut: async (id: string) => (isMock() ? { ok: true as const } : _api.checkOut(id)),
  listPeople: async (id: string) =>
    isMock()
      ? { people: mockPeople.filter((p) => p.currentEventId === id) }
      : _api.listPeople(id),
  sendReaction: async (toUserId: string, eventId: string, type: string) => {
    if (!isMock()) return _api.sendReaction(toUserId, eventId, type);
    // Demo affordance: a 💋 sent to Bia (mock-user-2) triggers a fake match.
    if (toUserId === biaUser.id && type === 'kiss') {
      return {
        ok: true as const,
        reaction: type,
        match: { id: 'mock-match-fake', eventId, otherUser: biaUser } as { id: string; eventId: string; otherUser: typeof biaUser },
      };
    }
    return { ok: true as const, reaction: type, match: null };
  },
  removeReaction: async (toUserId: string, eventId: string) =>
    isMock() ? { ok: true as const } : _api.removeReaction(toUserId, eventId),
  listMatches: async (): Promise<{ matches: any[] }> =>
    isMock() ? { matches: mockMatches } : _api.listMatches(),
  listMessages: async (matchId: string): Promise<{ messages: any[] }> =>
    isMock()
      ? { messages: matchId === 'mock-match-1' ? mockMessages : [] }
      : _api.listMessages(matchId),
  sendMessage: async (matchId: string, text: string) =>
    isMock()
      ? { message: { id: `msg-${Date.now()}`, fromUserId: 'mock-user-1', text, createdAt: Date.now() } }
      : _api.sendMessage(matchId, text),
};
