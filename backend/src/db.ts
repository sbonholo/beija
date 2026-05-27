import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  nickname TEXT,
  gender TEXT,
  seeking TEXT,
  bio TEXT,
  photo_url TEXT,
  birthdate TEXT,
  current_event_id TEXT,
  last_active INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT,
  city TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  image_url TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  checked_in_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kiss','heart','fire')),
  created_at INTEGER NOT NULL,
  UNIQUE (from_user_id, to_user_id, event_id),
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user1_id, user2_id, event_id),
  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_reactions_to ON reactions(to_user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_reactions_from ON reactions(from_user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_event ON matches(event_id);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL
);
`);

export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// Incremental migrations — safe on fresh and existing DBs
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0'); } catch {}

// Bootstrap admins from ADMIN_PHONES env var (CSV of E.164 phones)
const _adminPhones = (process.env.ADMIN_PHONES || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
if (_adminPhones.length > 0) {
  const stmt = db.prepare('UPDATE users SET is_admin = 1 WHERE phone = ?');
  let _marked = 0;
  for (const phone of _adminPhones) {
    const result = stmt.run(phone);
    if (result.changes > 0) _marked++;
  }
  console.log(`[admin-bootstrap] marked ${_marked} admin(s)`);
}
