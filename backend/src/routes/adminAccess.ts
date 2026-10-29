import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { hashPin, verifyPin, getAuth, loginThrottled, loginFailed } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { notifyAdminsPush } from '../services/push';

export const PRIMARY_ADMIN_ID = 'admin-001';

interface AdminReq {
  id: string; name: string; email: string; username: string; pin: string; reason: string | null;
  status: string; created_at: string; decided_at: string | null; decision_note: string | null;
}

const publicReq = (r: AdminReq) => ({
  id: r.id, name: r.name, email: r.email, username: r.username, reason: r.reason ?? '',
  status: r.status, createdAt: r.created_at, decidedAt: r.decided_at ?? null, decisionNote: r.decision_note ?? null,
});

const usernameTaken = (uname: string, exceptEmployeeId = '') =>
  !!db.prepare(`SELECT id FROM employees WHERE id != ? AND (LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?))`).get(exceptEmployeeId, uname, uname, uname);

/** Used by the sign-in route: tells someone whose admin request is not approved yet why they cannot sign in. */
export function adminRequestStatusFor(identifier: string, pin: string): { status: string; note: string | null } | null {
  const r = db.prepare(`SELECT * FROM admin_requests WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) ORDER BY created_at DESC LIMIT 1`).get(identifier, identifier) as AdminReq | undefined;
  if (!r || r.status === 'APPROVED' || !verifyPin(r.pin, pin)) return null;
  return { status: r.status, note: r.decision_note ?? null };
}

// POST /api/auth/register-admin  { name, email, username, pin, reason }  (public; creates a request only)
export function registerAdmin(req: Request, res: Response) {
  const b = req.body as { name?: unknown; email?: unknown; username?: unknown; pin?: unknown; reason?: unknown };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), uname = str(b.username, 30), pin = typeof b.pin === 'string' ? b.pin.trim() : '', reason = str(b.reason, 300);

  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname) || uname.toLowerCase() === 'admin') return res.status(400).json({ error: 'Choose a username of 3-30 letters, numbers, dots, dashes or underscores (not "admin").' });
  if (pin.length < 6) return res.status(400).json({ error: 'An administrator PIN must be at least 6 characters.' });

  const key = `adminreq|${req.ip}`;
  if (loginThrottled(key)) return res.status(429).json({ error: 'Too many requests. Please wait 15 minutes and try again.' });
  loginFailed(key); // every submission counts toward the limit

  const open = (db.prepare(`SELECT COUNT(*) AS c FROM admin_requests WHERE status = 'PENDING'`).get() as { c: number }).c;
  if (open >= 25) return res.status(429).json({ error: 'There are too many requests waiting. Please contact the current administrator.' });
  if (usernameTaken(uname) || db.prepare(`SELECT id FROM admin_requests WHERE status = 'PENDING' AND (LOWER(username) = LOWER(?) OR LOWER(email) = ?)`).get(uname, email)) {
    return res.status(409).json({ error: 'That username or email is already in use or waiting for approval.' });
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO admin_requests (id, name, email, username, pin, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`)
    .run(id, name, email, uname, hashPin(pin), reason || null, new Date().toISOString());
  logAudit(req, 'ADMIN_ACCESS_REQUEST', { targetType: 'admin_request', targetId: id, targetName: name, details: `Requested administrator access (username ${uname})` });
  notifyAdminsPush('Administrator access request', `${name} is asking for HR admin access`);
  res.status(201).json({ message: 'Your request was sent. You can sign in once an administrator approves it.' });
}

// GET /api/auth/admin-access  (admin)
export function listAdminAccess(_req: Request, res: Response) {
  const requests = db.prepare(`SELECT * FROM admin_requests ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 100`).all() as AdminReq[];
  const admins = db.prepare(`SELECT id, name, username, email, created_at FROM employees WHERE role = 'ADMIN' ORDER BY (id = ?) DESC, created_at ASC`).all(PRIMARY_ADMIN_ID) as
    { id: string; name: string; username: string | null; email: string | null; created_at: string }[];
  res.json({
    requests: requests.map(publicReq),
    admins: admins.map(a => ({ id: a.id, name: a.name, username: a.username ?? '', email: a.email ?? '', createdAt: a.created_at, primary: a.id === PRIMARY_ADMIN_ID })),
  });
}

// PUT /api/auth/admin-access/:id  { status: 'APPROVED'|'DENIED', note }  (admin)
export function decideAdminRequest(req: Request, res: Response) {
  const { status, note } = req.body as { status?: string; note?: unknown };
  if (status !== 'APPROVED' && status !== 'DENIED') return res.status(400).json({ error: "status must be 'APPROVED' or 'DENIED'" });
  const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id as string) as AdminReq | undefined;
  if (!r) return res.status(404).json({ error: 'Request not found' });
  if (r.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been decided.' });
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  const me = getAuth(req)!;
  const now = new Date().toISOString();

  if (status === 'APPROVED') {
    if (usernameTaken(r.username)) return res.status(409).json({ error: 'That username has since been taken. Deny this request and ask them to apply again.' });
    db.transaction(() => {
      db.prepare(`INSERT INTO employees (id, name, department, hire_date, loan_original, loan_remaining, pin, role, email, username, active, registered, created_at, updated_at)
                  VALUES (?, ?, 'OFFICE', ?, 0, 0, ?, 'ADMIN', ?, ?, 1, 1, ?, ?)`)
        .run(uuidv4(), r.name, now.slice(0, 10), r.pin, r.email, r.username, now, now);
      db.prepare(`UPDATE admin_requests SET status = 'APPROVED', decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?`).run(now, me.id, cleanNote || null, r.id);
    })();
  } else {
    db.prepare(`UPDATE admin_requests SET status = 'DENIED', decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?`).run(now, me.id, cleanNote || null, r.id);
  }
  logAudit(req, status === 'APPROVED' ? 'ADMIN_ACCESS_APPROVE' : 'ADMIN_ACCESS_DENY', { targetType: 'admin_request', targetId: r.id, targetName: r.name, details: `Username ${r.username}${cleanNote ? ` | Note: ${cleanNote}` : ''}` });
  res.json(publicReq(db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(r.id) as AdminReq));
}

// DELETE /api/auth/admin-access/admins/:id  (admin; cannot remove the main account or yourself)
export function removeAdmin(req: Request, res: Response) {
  const id = req.params.id as string;
  const me = getAuth(req)!;
  if (id === PRIMARY_ADMIN_ID) return res.status(403).json({ error: 'The main administrator account cannot be removed.' });
  if (id === me.id) return res.status(403).json({ error: 'You cannot remove your own administrator access.' });
  const row = db.prepare(`SELECT id, name, username FROM employees WHERE id = ? AND role = 'ADMIN'`).get(id) as { id: string; name: string; username: string | null } | undefined;
  if (!row) return res.status(404).json({ error: 'Administrator not found' });
  db.prepare(`DELETE FROM employees WHERE id = ?`).run(id);
  logAudit(req, 'ADMIN_ACCESS_REMOVE', { targetType: 'employee', targetId: id, targetName: row.name, details: `Removed administrator ${row.username ?? ''}` });
  res.json({ message: 'Administrator removed' });
}