import { Router } from 'express';
import { db } from '../db.js';
import { signToken } from '../auth.js';
import { newId, newOtp, normalizePhone } from '../lib/ids.js';
import { sendSms } from '../lib/sms.js';
import { config } from '../config.js';
import { serializeUser } from './profile.js';


function checkOtpLimit(phone: string): boolean {
  const now = Date.now();
  const key = `otp:${phone}`;
  const row = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key) as any;
  if (!row || row.reset_at < now) {
    db.prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
    ).run(key, now + 60_000);
    return true;
  }
  if (row.count >= 5) return false;
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return true;
}

const router = Router();

router.post('/request-otp', async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone || ''));
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });
  if (!checkOtpLimit(phone)) return res.status(429).json({ error: 'rate_limited' });

  const code = newOtp();
  const expiresAt = Date.now() + config.otpTtlSeconds * 1000;

  db.prepare(
    `INSERT INTO otp_codes (phone, code, expires_at, attempts)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0`
  ).run(phone, code, expiresAt);

  await sendSms(phone, `Beija: seu código é ${code}`);

  const body: Record<string, unknown> = { ok: true, phone };
  if (config.devReturnOtp) body.devCode = code;
  res.json(body);
});

router.post('/verify-otp', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone || ''));
  const code = String(req.body?.code || '');
  if (!phone || !code) return res.status(400).json({ error: 'invalid_request' });

  const row = db
    .prepare('SELECT code, expires_at, attempts FROM otp_codes WHERE phone = ?')
    .get(phone) as { code: string; expires_at: number; attempts: number } | undefined;

  const bypass = !config.isProd && config.devReturnOtp && code === '000000';
  if (!bypass) {
    if (!row) return res.status(400).json({ error: 'no_otp' });
    if (row.attempts >= 5) return res.status(429).json({ error: 'too_many_attempts' });
    if (row.expires_at < Date.now()) return res.status(400).json({ error: 'expired' });
    if (row.code !== code) {
      db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone);
      return res.status(400).json({ error: 'wrong_code' });
    }
  }

  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;
  let isNew = false;
  if (!user) {
    const id = newId('u_');
    db.prepare('INSERT INTO users (id, phone, created_at, last_active) VALUES (?, ?, ?, ?)').run(
      id,
      phone,
      Date.now(),
      Date.now()
    );
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    isNew = true;
  }

  const token = signToken(user.id);
  const needsProfile = !user.nickname || !user.gender;
  res.json({ token, user: serializeUser(user), isNew, needsProfile });
});

export default router;
