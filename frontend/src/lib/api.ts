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

// In this build there is no backend. mockedApi always serves mock data.
// Hook up a real api by gating each method behind a feature flag when the backend exists.
export const mockedApi = {
  ...api,
  getMe: async () => ({ user: currentUser() }),
  updateMe: async (patch: Record<string, unknown>) => {
    const cur = currentUser();
    const updated = { ...(cur ?? {}), ...patch } as User;
    return { user: updated };
  },
  uploadPhoto: async (file: File) => ({ photoUrl: URL.createObjectURL(file) }),
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
  removeReaction: async (_toUserId: string, _eventId: string) => ({ ok: true as const }),
  listMatches: async (): Promise<{ matches: any[] }> => ({ matches: mockMatches }),
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
