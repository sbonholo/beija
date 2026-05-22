import type { User, EventItem, PersonAtEvent, MatchSummary, ChatMessage } from '../types';

export const MOCK_PHONE = '00000000000';
export const MOCK_OTP = '000000';
export const MOCK_TOKEN = 'dev_bypass_token';

export const mockUser: User = {
  id: 'mock-user-1',
  phone: '00000000000',
  nickname: null,
  gender: null,
  seeking: ['woman', 'non-binary'],
  bio: null,
  photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&q=80',
  birthdate: null,
  currentEventId: 'mock-event-1',
  lastActive: Date.now(),
};

export const mockEvent1: EventItem = {
  id: 'mock-event-1',
  name: 'Show do Seu Jorge — Lapa',
  venue: 'Circo Voador',
  address: 'Rua dos Arcos, s/n — Lapa',
  city: 'Rio de Janeiro',
  lat: -22.9031,
  lng: -43.1797,
  startsAt: Date.now() - 30 * 60 * 1000,
  endsAt: Date.now() + 90 * 60 * 1000,
  imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600&q=80',
  category: 'show',
  checkinCount: 47,
  distanceMeters: 1200,
};

export const mockEvent2: EventItem = {
  id: 'mock-event-2',
  name: 'Festa Tropical — Bar Aurora',
  venue: 'Bar Aurora',
  address: 'Rua da Relação, 36 — Lapa',
  city: 'Rio de Janeiro',
  lat: -22.9068,
  lng: -43.1805,
  startsAt: Date.now() + 2 * 60 * 60 * 1000,
  endsAt: Date.now() + 6 * 60 * 60 * 1000,
  imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
  category: 'festa',
  checkinCount: 23,
  distanceMeters: 850,
};

export const mockEvents: EventItem[] = [mockEvent1, mockEvent2];

// Backward-compatible alias.
export const mockEvent = mockEvent1;

const biaUser: User = {
  id: 'mock-user-2',
  nickname: 'Bia',
  gender: 'woman',
  seeking: ['man'],
  bio: 'Adoro MPB e samba 🎵 Sempre no rolê certo',
  photoUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&q=80',
  birthdate: '1999-03-20',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 2 * 60 * 1000,
};

export const carlosUser: User = {
  id: 'mock-user-3',
  nickname: 'Carlos',
  gender: 'man',
  seeking: ['woman', 'non-binary'],
  bio: 'Curtindo a noite carioca 🌙 Músico nas horas vagas',
  photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&q=80',
  birthdate: '1993-11-08',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 5 * 60 * 1000,
};

export const juUser: User = {
  id: 'mock-user-4',
  nickname: 'Ju',
  gender: 'non-binary',
  seeking: ['woman', 'man', 'non-binary', 'other'],
  bio: 'Arte, dança e muita energia ✨',
  photoUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&q=80',
  birthdate: '2000-07-14',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 1 * 60 * 1000,
};

const rafaUser: User = {
  id: 'mock-user-5',
  nickname: 'Rafa',
  gender: 'man',
  seeking: ['woman'],
  bio: 'Engenheiro de dia, DJ de noite 🎧',
  photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80',
  birthdate: '1996-09-02',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 10 * 60 * 1000,
};

const mariUser: User = {
  id: 'mock-user-6',
  nickname: 'Mari',
  gender: 'woman',
  seeking: ['woman'],
  bio: 'Fotógrafa 📷 Apaixonada por rock',
  photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80',
  birthdate: '1997-12-01',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 15 * 60 * 1000,
};

const leoUser: User = {
  id: 'mock-user-7',
  nickname: 'Leo',
  gender: 'man',
  seeking: ['man'],
  bio: 'Amo shows ao vivo e viagens 🌍',
  photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&q=80',
  birthdate: '2001-05-22',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 20 * 60 * 1000,
};

export const mockPeople: PersonAtEvent[] = [
  { ...biaUser, sentReaction: null, receivedReaction: null, matched: false },
  { ...carlosUser, sentReaction: 'kiss', receivedReaction: 'kiss', matched: true },
  { ...juUser, sentReaction: null, receivedReaction: 'heart', matched: false },
  { ...rafaUser, sentReaction: 'fire', receivedReaction: null, matched: false },
  { ...mariUser, sentReaction: null, receivedReaction: null, matched: false },
  { ...leoUser, sentReaction: null, receivedReaction: null, matched: false },
];

export const mockMatches: MatchSummary[] = [
  {
    id: 'mock-match-1',
    eventId: 'mock-event-1',
    eventName: mockEvent1.name,
    eventVenue: mockEvent1.venue,
    createdAt: Date.now() - 10 * 60 * 1000,
    lastMessage: {
      text: 'Oi! Você também curtiu o show? 😄',
      createdAt: Date.now() - 5 * 60 * 1000,
    },
    otherUser: carlosUser,
  },
  {
    id: 'mock-match-2',
    eventId: 'mock-event-1',
    eventName: mockEvent1.name,
    eventVenue: mockEvent1.venue,
    createdAt: Date.now() - 25 * 60 * 1000,
    lastMessage: {
      text: 'Tô perto do palco, aparece 👋',
      createdAt: Date.now() - 20 * 60 * 1000,
    },
    otherUser: juUser,
  },
];

export const mockMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    fromUserId: carlosUser.id,
    text: 'Oi! Você também curtiu o show? 😄',
    createdAt: Date.now() - 8 * 60 * 1000,
  },
  {
    id: 'msg-2',
    fromUserId: mockUser.id,
    text: 'Sim! Incrível né? Tô perto do bar',
    createdAt: Date.now() - 7 * 60 * 1000,
  },
  {
    id: 'msg-3',
    fromUserId: carlosUser.id,
    text: 'Haha que coincidência, eu também! Camisa azul',
    createdAt: Date.now() - 6 * 60 * 1000,
  },
  {
    id: 'msg-4',
    fromUserId: mockUser.id,
    text: 'Vou te achar 👀🔥',
    createdAt: Date.now() - 5 * 60 * 1000,
  },
];
