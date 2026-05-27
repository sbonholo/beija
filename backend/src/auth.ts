import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { db } from './db.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const user = db.prepare('SELECT id, is_banned FROM users WHERE id = ?').get(userId) as { id: string; is_banned: number } | undefined;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (user.is_banned) return res.status(403).json({ error: 'banned' });
  req.userId = userId;
  next();
}

export function adminRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const user = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(userId) as { id: string; is_admin: number } | undefined;
  if (!user || !user.is_admin) return res.status(403).json({ error: 'forbidden' });
  req.userId = userId;
  next();
}
