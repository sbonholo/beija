import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { newId } from '../lib/ids.js';

const router = Router();

const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'other'];

router.post('/:id/block', authRequired, (req: AuthedRequest, res) => {
  const blockerId = req.userId!;
  const blockedId = req.params.id;

  if (blockerId === blockedId) return res.status(400).json({ error: 'self_block' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(blockedId);
  if (!target) return res.status(404).json({ error: 'user_not_found' });

  db.prepare(
    `INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(blocker_id, blocked_id) DO NOTHING`
  ).run(blockerId, blockedId, Date.now());

  db.prepare(
    'DELETE FROM reactions WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)'
  ).run(blockerId, blockedId, blockedId, blockerId);

  res.json({ ok: true });
});

router.delete('/:id/block', authRequired, (req: AuthedRequest, res) => {
  const blockerId = req.userId!;
  const blockedId = req.params.id;
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);
  res.json({ ok: true });
});

router.post('/:id/report', authRequired, (req: AuthedRequest, res) => {
  const reporterId = req.userId!;
  const reportedId = req.params.id;
  const reason = String(req.body?.reason || '');

  if (reporterId === reportedId) return res.status(400).json({ error: 'self_report' });
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'invalid_reason' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(reportedId);
  if (!target) return res.status(404).json({ error: 'user_not_found' });

  db.prepare(
    'INSERT INTO reports (id, reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(newId('rpt_'), reporterId, reportedId, reason, Date.now());

  res.json({ ok: true });
});

export default router;
