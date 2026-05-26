export type Gender = 'man' | 'woman' | 'non-binary' | 'other';
export type ReactionType = 'kiss' | 'heart' | 'fire';

export interface User {
  id: string;
  phone?: string;
  nickname: string | null;
  gender: Gender | null;
  seeking: Gender[] | null;
  bio: string | null;
  photoUrl: string | null;
  // Only present on own-profile responses; stripped from public/other-user payloads.
  birthdate?: string | null;
  currentEventId?: string | null;
  lastActive?: number | null;
}

export interface EventItem {
  id: string;
  name: string;
  venue: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  startsAt: number;
  endsAt: number;
  imageUrl: string | null;
  category: string | null;
  checkinCount?: number;
  distanceMeters?: number | null;
}

export interface PersonAtEvent extends User {
  sentReaction: ReactionType | null;
  receivedReaction: ReactionType | null;
  matched: boolean;
}

export interface MatchSummary {
  id: string;
  eventId: string;
  eventName: string | null;
  eventVenue: string | null;
  createdAt: number;
  lastMessage: { text: string; createdAt: number } | null;
  otherUser: User;
}

export interface ChatMessage {
  id: string;
  fromUserId: string;
  text: string;
  createdAt: number;
}
