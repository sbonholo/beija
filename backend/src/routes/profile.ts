import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { newId } from '../lib/ids.js';
import { safeJsonArray } from '../lib/utils.js';

function safeUnlink(filename: string) {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(filename)) return;
  fs.unlink(path.join(config.uploadDir, filename), (err) => {
    if (err && err.code !== 'ENOENT') console.error('[profile] unlink failed:', err.code);
  });
}

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, newId('img_') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(file.mimetype)) {
      return cb(new Error('invalid_image_type'));
    }
    cb(null, true);
  },
});

const ALLOWED_GENDERS = ['man', 'woman', 'non-binary', 'other'];

router.get('/me', authRequired, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user: serializeUser(user) });
});

router.put('/me', authRequired, (req: AuthedRequest, res) => {
  const { nickname, gender, seeking, bio, birthdate } = req.body || {};
  const updates: string[] = [];
  const values: any[] = [];

  if (nickname !== undefined) {
    const n = String(nickname).trim().slice(0, 30);
    if (!n) return res.status(400).json({ error: 'invalid_nickname' });
    updates.push('nickname = ?');
    values.push(n);
  }
  if (gender !== undefined) {
    if (!ALLOWED_GENDERS.includes(gender)) return res.status(400).json({ error: 'invalid_gender' });
    updates.push('gender = ?');
    values.push(gender);
  }
  if (seeking !== undefined) {
    if (!Array.isArray(seeking) || seeking.some((s) => !ALLOWED_GENDERS.includes(s))) {
      return res.status(400).json({ error: 'invalid_seeking' });
    }
    updates.push('seeking = ?');
    values.push(JSON.stringify(seeking));
  }
  if (bio !== undefined) {
    updates.push('bio = ?');
    values.push(String(bio).slice(0, 200));
  }
  if (birthdate !== undefined) {
    updates.push('birthdate = ?');
    values.push(String(birthdate));
  }

  if (updates.length === 0) return res.json({ ok: true });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as any;
  res.json({ user: serializeUser(user) });
});

router.delete('/me', authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const user = db.prepare('SELECT photo_url FROM users WHERE id = ?').get(userId) as any;
  if (user?.photo_url) {
    const filename = user.photo_url.split('/uploads/').pop();
    if (filename) safeUnlink(filename);
  }
  db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE from_user_id = ?').run(userId);
    db.prepare('DELETE FROM matches WHERE user1_id = ? OR user2_id = ?').run(userId, userId);
    db.prepare('DELETE FROM reactions WHERE from_user_id = ? OR to_user_id = ?').run(userId, userId);
    db.prepare('DELETE FROM checkins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
    db.prepare('DELETE FROM reports WHERE reporter_id = ? OR reported_id = ?').run(userId, userId);
    const phoneRow = db.prepare('SELECT phone FROM users WHERE id = ?').get(userId) as any;
    db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phoneRow?.phone);
    db.prepare('DELETE FROM rate_limits WHERE key = ?').run(`otp:${phoneRow?.phone}`);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  res.json({ ok: true });
});

router.post('/me/photo', authRequired, upload.single('photo'), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const buf = Buffer.alloc(12);
  const fd = fs.openSync(req.file.path, 'r');
  const read = fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp = read >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    safeUnlink(req.file.filename);
    return res.status(400).json({ error: 'invalid_image_type' });
  }

  const existing = db.prepare('SELECT photo_url FROM users WHERE id = ?').get(req.userId!) as any;
  const url = `${config.publicUrl}/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET photo_url = ? WHERE id = ?').run(url, req.userId);
  if (existing?.photo_url) {
    const oldFile = existing.photo_url.split('/uploads/').pop();
    if (oldFile) safeUnlink(oldFile);
  }
  res.json({ photoUrl: url });
});

export function serializeUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    nickname: row.nickname,
    gender: row.gender,
    seeking: safeJsonArray(row.seeking),
    bio: row.bio,
    photoUrl: row.photo_url,
    birthdate: row.birthdate,
    currentEventId: row.current_event_id,
    lastActive: row.last_active,
  };
}

// Use for any response that goes to a different user — strips PII not meant for strangers.
export function serializePublicUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    gender: row.gender,
    seeking: safeJsonArray(row.seeking),
    bio: row.bio,
    photoUrl: row.photo_url,
  };
}

export default router;
