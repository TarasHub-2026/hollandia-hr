import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAdmin } from '../middleware/security';
import { logAudit } from '../middleware/audit';

const router = Router();
router.use(requireAdmin);

// GET /api/audit?limit=200&action=LOGIN_FAILED&q=maria
router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 2000);
  const action = req.query.action ? String(req.query.action) : '';
  const q = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : '';

  const where: string[] = [];
  const params: unknown[] = [];
  if (action) { where.push('action = ?'); params.push(action); }
  if (q) {
    where.push(`(LOWER(COALESCE(actor_name,'')) LIKE ? OR LOWER(COALESCE(target_name,'')) LIKE ? OR LOWER(COALESCE(details,'')) LIKE ?)`);
    params.push(q, q, q);
  }
  const rows = db.prepare(`
    SELECT id, ts, actor_id, actor_name, actor_role, action, target_type, target_id, target_name, details, ip
    FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ts DESC LIMIT ?
  `).all(...params, limit) as Record<string, unknown>[];

  logAudit(req, 'VIEW_AUDIT_LOG', { dedupeMinutes: 10 });

  res.json(rows.map(r => ({
    id: r.id, timestamp: r.ts, actorId: r.actor_id, actorName: r.actor_name, actorRole: r.actor_role,
    action: r.action, targetType: r.target_type, targetId: r.target_id, targetName: r.target_name,
    details: r.details, ip: r.ip,
  })));
});

export default router;
