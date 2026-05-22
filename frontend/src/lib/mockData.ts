import type { User, EventItem, PersonAtEvent, MatchSummary, ChatMessage } from '../types';

export const MOCK_PHONE = '00000000000';
export const MOCK_OTP = '000000';
export const MOCK_TOKEN = 'dev_bypass_token';

export const mockUser: User = {
  id: 'mock-user-1',
  phone: '00000000000',
  nickname: 'Demo User',
  gender: 'man',
  seeking: [],
  bio: 'Testando o Beija 🎉',
  photoUrl: null,
  birthdate: '1995-06-15',
  currentEventId: 'mock-event-1',
  lastActive: Date.now(),
};

export const mockEvent: EventItem = {
  id: 'mock-event-1',
  name: 'Show do Seu Jorge — Lapa',
  venue: 'Circo Voador',
  address: 'Rua dos Arcos, s/n',
  city: 'Rio de Janeiro',
  lat: -22.9,
  lng: -43.18,
  startsAt: Date.now() - 3600000,
  endsAt: Date.now() + 3600000,
  imageUrl: null,
  category: 'show',
  checkinCount: 42,
};

export const mockPeople: PersonAtEvent[] = [
  {
    id: 'mock-user-2',
    phone: undefined,
    nickname: 'Ana',
    gender: 'woman',
    seeking: ['man'],
    bio: 'Amo MPB 🎵',
    photoUrl: null,
    birthdate: '1998-03-20',
    currentEventId: 'mock-event-1',
    lastActive: Date.now() - 60000,
    sentReaction: null,
    receivedReaction: null,
    matched: false,
  },
  {
    id: 'mock-user-3',
    phone: undefined,
    nickname: 'Carlos',
    gender: 'man',
    seeking: ['woman', 'non-binary'],
    bio: 'Curtindo a noite carioca',
    photoUrl: null,
    birthdate: '1993-11-08',
    currentEventId: 'mock-event-1',
    lastActive: Date.now() - 120000,
    sentReaction: null,
    receivedReaction: 'kiss',
    matched: true,
  },
];

const carlosUser: User = {
  id: 'mock-user-3',
  nickname: 'Carlos',
  gender: 'man',
  seeking: ['woman', 'non-binary'],
  bio: 'Curtindo a noite carioca',
  photoUrl: null,
  birthdate: '1993-11-08',
  currentEventId: 'mock-event-1',
  lastActive: Date.now() - 120000,
};

export const mockMatches: MatchSummary[] = [
  {
    id: 'mock-match-1',
    eventId: 'mock-event-1',
    eventName: 'Show do Seu Jorge — Lapa',
    eventVenue: 'Circo Voador',
    createdAt: Date.now() - 600000,
    lastMessage: {
      text: 'Oi! Vi que você curtiu o show também 😄',
      createdAt: Date.now() - 300000,
    },
    otherUser: carlosUser,
  },
];

export const mockMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    fromUserId: 'mock-user-3',
    text: 'Oi! Vi que você curtiu o show também 😄',
    createdAt: Date.now() - 300000,
  },
];
