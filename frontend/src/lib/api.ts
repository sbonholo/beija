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


export function errorMessage(err: unknown): { text: string; kind: 'auth' | 'offline' | 'server' } {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return { text: 'Sessão expirada. Faça login novamente.', kind: 'auth' };
    if (err.status >= 500) return { text: 'Erro no servidor. Tente de novo em instantes.', kind: 'server' };
    return { text: err.message || 'Algo deu errado.', kind: 'server' };
  }
  if (err instanceof TypeError && err.message.includes('fetch')) return { text: 'Sem conexão. Verifique sua internet.', kind: 'offline' };
  return { text: 'Algo deu errado.', kind: 'server' };
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
  getReceivedReactions: () => request<{ reactions: any[] }>('GET', '/reactions/received'),

  deleteMe: () => request<{ ok: true }>('DELETE', '/profile/me'),
  blockUser: (userId: string) => request<{ ok: true }>('POST', `/users/${userId}/block`),
  reportUser: (userId: string, reason: string) =>
    request<{ ok: true }>('POST', `/users/${userId}/report`, { reason }),

  listMatches: () => request<{ matches: any[] }>('GET', '/matches'),
  getMatch: (matchId: string) => request<{ match: any }>('GET', `/matches/${matchId}`),
  listMessages: (matchId: string) => request<{ messages: any[] }>('GET', `/matches/${matchId}/messages`),
  sendMessage: (matchId: string, text: string) =>
    request<{ message: any }>('POST', `/matches/${matchId}/messages`, { text }),
};

export const adminApi = {
  getStats: () => request<any>('GET', '/admin/stats'),
  getReports: (offset = 0) => request<any>('GET', `/admin/reports?offset=${offset}`),
  getUsers: (q = '', offset = 0) =>
    request<any>('GET', `/admin/users?q=${encodeURIComponent(q)}&offset=${offset}`),
  banUser: (id: string) => request<{ ok: true }>('POST', `/admin/users/${id}/ban`),
  unbanUser: (id: string) => request<{ ok: true }>('POST', `/admin/users/${id}/unban`),
  listEvents: () => request<any>('GET', '/admin/events'),
  createEvent: (data: any) => request<any>('POST', '/admin/events', data),
  deleteEvent: (id: string) => request<{ ok: true }>('DELETE', `/admin/events/${id}`),
};

import type { User } from '../types';
import { mockEvents, mockEvent1, mockPeople, mockMatches, mockMessages } from './mockData';

function findMockEvent(id: string) {
  return mockEvents.find((e) => e.id === id) ?? mockEvent1;
}

function currentUser(): User | null {
  try {
    const raw = localStorage.getItem('beija_profile');
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export const mockedApi = {
  ...api,
  requestOtp: async (phone: string) => ({ ok: true as const, phone }),
  verifyOtp: async (_phone: string, _code: string) => ({
    token: 'mock-token',
    user: { id: 'mock-u-' + Math.random().toString(36).slice(2, 8), phone: _phone, nickname: null, gender: null, seeking: null, bio: null, photoUrl: null, birthdate: null, currentEventId: null, lastActive: Date.now() },
    isNew: true,
    needsProfile: true,
  }),
  getMe: async () => ({ user: currentUser() }),
  updateMe: async (patch: Record<string, unknown>) => {
    const cur = currentUser();
    const updated = { ...(cur ?? {}), ...patch } as User;
    return { user: updated };
  },
  uploadPhoto: async (file: File) => {
    return new Promise<{ photoUrl: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ photoUrl: reader.result as string });
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });
  },
  listEvents: async (_lat?: number | null, _lng?: number | null) => ({ events: mockEvents }),
  getEvent: async (id: string) => ({ event: findMockEvent(id) }),
  checkIn: async (_id: string) => ({ ok: true as const }),
  checkOut: async (_id: string) => ({ ok: true as const }),
  listPeople: async (id: string) => {
    const me = currentUser();
    const mySeeking = me?.seeking ?? [];
    const myGender = me?.gender ?? null;
    const atEvent = mockPeople.filter((p) => p.currentEventId === id);
    const compatible = atEvent.filter((p) => {
      const iWantThem = mySeeking.length === 0 || (p.gender ? mySeeking.includes(p.gender) : true);
      const theyWantMe = !myGender || !p.seeking || p.seeking.length === 0 || p.seeking.includes(myGender);
      return iWantThem && theyWantMe;
    });
    return { people: compatible };
  },
  sendReaction: async (toUserId: string, eventId: string, type: string) => {
    const target = mockPeople.find((p) => p.id === toUserId);
    if (target) target.sentReaction = type as import('../types').ReactionType;
    // Match rule: any combination matches as long as the other person already reacted.
    if (target && target.receivedReaction) {
      const matchId = `mock-match-${toUserId}`;
      if (!mockMatches.some((m) => m.id === matchId)) {
        mockMatches.unshift({
          id: matchId,
          eventId,
          eventName: mockEvent1.name,
          eventVenue: mockEvent1.venue,
          createdAt: Date.now(),
          lastMessage: null,
          otherUser: target,
        });
      }
      return {
        ok: true as const,
        reaction: type,
        match: {
          id: matchId,
          eventId,
          otherUser: target,
          myReaction: type,
          theirReaction: target.receivedReaction,
        },
      };
    }
    return { ok: true as const, reaction: type, match: null };
  },
  removeReaction: async (toUserId: string, _eventId: string) => {
    const target = mockPeople.find((p) => p.id === toUserId);
    if (target) target.sentReaction = null;
    return { ok: true as const };
  },
  getReceivedReactions: async () => ({ reactions: [] as any[] }),
  deleteMe: async () => ({ ok: true as const }),
  blockUser: async (_userId: string) => ({ ok: true as const }),
  reportUser: async (_userId: string, _reason: string) => ({ ok: true as const }),

  listMatches: async (): Promise<{ matches: any[] }> => ({ matches: mockMatches }),
  getMatch: async (matchId: string) => ({ match: mockMatches.find((m) => m.id === matchId) ?? null }),
  listMessages: async (matchId: string): Promise<{ messages: any[] }> => ({
    messages: matchId === 'mock-match-1' ? mockMessages : [],
  }),
  sendMessage: async (matchId: string, text: string) => {
    const me = currentUser();
    return {
      message: {
        id: `msg-${Date.now()}`,
        matchId,
        fromUserId: me?.id ?? 'me',
        text,
        createdAt: Date.now(),
      },
    };
  },
};

export const isMockMode = !import.meta.env.VITE_API_URL?.trim();

export const activeApi: typeof api = isMockMode ? mockedApi : api;
