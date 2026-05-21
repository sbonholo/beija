import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { newId } from '../lib/ids.js';

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
    if (!/^image\/(jpe?g|png|webp|heic|heif)$/.test(file.mimetype)) {
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

router.post('/me/photo', authRequired, upload.single('photo'), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const url = `${config.publicUrl}/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET photo_url = ? WHERE id = ?').run(url, req.userId);
  res.json({ photoUrl: url });
});

export function serializeUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    nickname: row.nickname,
    gender: row.gender,
    seeking: row.seeking ? JSON.parse(row.seeking) : [],
    bio: row.bio,
    photoUrl: row.photo_url,
    birthdate: row.birthdate,
    currentEventId: row.current_event_id,
    lastActive: row.last_active,
  };
}

export default router;
