import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { getAuth } from './security';

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    ts          TEXT NOT NULL,
    actor_id    TEXT,
    actor_name  TEXT,
    actor_role  TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    target_name TEXT,
    details     TEXT,
    ip          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);
`);

export interface AuditOptions {
  actor?: { id: string; name?: string; role?: string } | null;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  /** Skip if the same actor already logged this action within N minutes (for noisy "view" events). */
  dedupeMinutes?: number;
}

/**
 * Append an entry to the audit log. Never throws: auditing must not break a request.
 * Sensitive values (PINs, tokens) must never be passed in `details`.
 */
export function logAudit(req: Request | null, action: string, opts: AuditOptions = {}): void {
  try {
    let actor = opts.actor ?? null;
    if (!actor && req) {
      const a = getAuth(req);
      if (a) actor = { id: a.id, role: a.role };
    }
    let actorName = actor?.name;
    if (actor?.id && !actorName) {
      const row = db.prepare(`SELECT name FROM employees WHERE id = ?`).get(actor.id) as { name: string } | undefined;
      actorName = row?.name;
    }
    if (opts.dedupeMinutes && actor?.id) {
      const since = new Date(Date.now() - opts.dedupeMinutes * 60000).toISOString();
      const dup = db.prepare(`SELECT 1 FROM audit_log WHERE actor_id = ? AND action = ? AND ts > ? LIMIT 1`).get(actor.id, action, since);
      if (dup) return;
    }
    db.prepare(`
      INSERT INTO audit_log (id, ts, actor_id, actor_name, actor_role, action, target_type, target_id, target_name, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), new Date().toISOString(),
      actor?.id ?? null, actorName ?? null, actor?.role ?? null,
      action, opts.targetType ?? null, opts.targetId ?? null, opts.targetName ?? null,
      opts.details ? opts.details.slice(0, 500) : null,
      req?.ip ?? null,
    );
  } catch (e) {
    console.error('[audit] failed to write entry', e);
  }
}
