import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { normalizeDate } from './employees';
import { notifyAdminsPush } from '../services/push';

interface Row {
  id: string; leave_request_id: string; employee_id: string; old_start: string; old_end: string;
  new_start: string; new_end: string; reason: string | null; status: string; created_at: string;
  decided_at: string | null; decision_note: string | null; employee_name?: string;
}

function map(r: Row) {
  return {
    id: r.id, leaveRequestId: r.leave_request_id, employeeId: r.employee_id, employeeName: r.employee_name,
    oldStart: r.old_start, oldEnd: r.old_end, newStart: r.new_start, newEnd: r.new_end,
    reason: r.reason ?? '', status: r.status, createdAt: r.created_at,
    decidedAt: r.decided_at ?? null, decisionNote: r.decision_note ?? null,
  };
}

const SELECT = `SELECT c.*, e.name AS employee_name FROM leave_date_changes c JOIN employees e ON e.id = c.employee_id`;

// GET /api/leave-requests/change-requests  (admin: everyone's; employee: their own)
export function listDateChanges(req: Request, res: Response) {
  const a = getAuth(req)!;
  const rows = (a.role === 'ADMIN'
    ? db.prepare(`${SELECT} ORDER BY c.created_at DESC`).all()
    : db.prepare(`${SELECT} WHERE c.employee_id = ? ORDER BY c.created_at DESC`).all(a.id)) as Row[];
  res.json(rows.map(map));
}

// POST /api/leave-requests/:id/change-request  { startDate, endDate, reason }  (employee, own leave only)
export function requestDateChange(req: Request, res: Response) {
  const a = getAuth(req)!;
  if (a.role === 'ADMIN') return res.status(400).json({ error: 'Administrators can change the dates directly.' });
  const { startDate, endDate, reason } = req.body as { startDate?: unknown; endDate?: unknown; reason?: unknown };
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return res.status(400).json({ error: 'Enter a valid start date and end date.' });
  if (end < start) return res.status(400).json({ error: 'The end date cannot be before the start date.' });
  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (!cleanReason) return res.status(400).json({ error: 'Please give a reason for the change.' });

  const lid = req.params.id as string;
  const lr = db.prepare(`SELECT id, employee_id, start_date, end_date, status FROM leave_requests WHERE id = ?`).get(lid) as
    { id: string; employee_id: string; start_date: string; end_date: string; status: string } | undefined;
  if (!lr || lr.employee_id !== a.id) return res.status(404).json({ error: 'Leave request not found' });
  if (lr.status !== 'APPROVED' && lr.status !== 'PENDING') return res.status(400).json({ error: 'Only pending or approved leave can be changed.' });
  const today = new Date().toISOString().slice(0, 10);
  if (lr.end_date.slice(0, 10) < today) return res.status(400).json({ error: 'This leave has already ended.' });
  if (start === lr.start_date.slice(0, 10) && end === lr.end_date.slice(0, 10)) return res.status(400).json({ error: 'Those are the same dates as now.' });
  const open = db.prepare(`SELECT id FROM leave_date_changes WHERE leave_request_id = ? AND status = 'PENDING'`).get(lid);
  if (open) return res.status(409).json({ error: 'You already have a change request waiting for HR. Withdraw it first to send a new one.' });

  const id = uuidv4();
  db.prepare(`INSERT INTO leave_date_changes (id, leave_request_id, employee_id, old_start, old_end, new_start, new_end, reason, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`)
    .run(id, lid, a.id, lr.start_date.slice(0, 10), lr.end_date.slice(0, 10), start, end, cleanReason, new Date().toISOString());
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row;
  logAudit(req, 'DATE_CHANGE_REQUEST', { targetType: 'leave_request', targetId: lid, targetName: row.employee_name,
    details: `${lr.start_date.slice(0, 10)} to ${lr.end_date.slice(0, 10)} -> ${start} to ${end}` });
  notifyAdminsPush('Leave date change request', `${row.employee_name || 'An employee'}: ${start} to ${end}`);
  res.status(201).json(map(row));
}

// POST /api/leave-requests/change-requests/:cid/withdraw  (employee, own pending request)
export function withdrawDateChange(req: Request, res: Response) {
  const a = getAuth(req)!;
  const cid = req.params.cid as string;
  const row = db.prepare(`SELECT * FROM leave_date_changes WHERE id = ?`).get(cid) as Row | undefined;
  if (!row || row.employee_id !== a.id) return res.status(404).json({ error: 'Change request not found' });
  if (row.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been decided.' });
  db.prepare(`UPDATE leave_date_changes SET status = 'WITHDRAWN', decided_at = ? WHERE id = ?`).run(new Date().toISOString(), cid);
  logAudit(req, 'DATE_CHANGE_WITHDRAW', { targetType: 'leave_request', targetId: row.leave_request_id });
  res.json(map(db.prepare(`${SELECT} WHERE c.id = ?`).get(cid) as Row));
}

// PUT /api/leave-requests/change-requests/:cid  { status: 'APPROVED'|'DENIED', note }  (admin)
export function decideDateChange(req: Request, res: Response) {
  const { status, note } = req.body as { status?: string; note?: unknown };
  if (status !== 'APPROVED' && status !== 'DENIED') return res.status(400).json({ error: "status must be 'APPROVED' or 'DENIED'" });
  const cid = req.params.cid as string;
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(cid) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Change request not found' });
  if (row.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been decided.' });
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const admin = getAuth(req)!;
  const now = new Date().toISOString();

  if (status === 'APPROVED') {
    const lr = db.prepare(`SELECT status FROM leave_requests WHERE id = ?`).get(row.leave_request_id) as { status: string } | undefined;
    if (!lr) return res.status(404).json({ error: 'The leave request no longer exists.' });
    if (lr.status === 'DENIED' || lr.status === 'CANCELLED') return res.status(400).json({ error: `That leave is ${lr.status.toLowerCase()}, so its dates cannot be changed. Deny this request instead.` });
  }
  db.transaction(() => {
    db.prepare(`UPDATE leave_date_changes SET status = ?, decision_note = ?, decided_at = ?, decided_by = ? WHERE id = ?`)
      .run(status, cleanNote || null, now, admin.id, cid);
    if (status === 'APPROVED') {
      db.prepare(`UPDATE leave_requests SET start_date = ?, end_date = ?, adjusted_end_date = NULL WHERE id = ?`).run(row.new_start, row.new_end, row.leave_request_id);
    }
  })();
  logAudit(req, status === 'APPROVED' ? 'DATE_CHANGE_APPROVE' : 'DATE_CHANGE_DENY', { targetType: 'leave_request', targetId: row.leave_request_id, targetName: row.employee_name,
    details: `${row.old_start} to ${row.old_end} -> ${row.new_start} to ${row.new_end}${cleanNote ? ` | Note: ${cleanNote}` : ''}` });
  res.json(map(db.prepare(`${SELECT} WHERE c.id = ?`).get(cid) as Row));
}