import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { notifyAdminsPush } from '../services/push';
import { notifyHrEmail } from '../services/mailer';
import { notifyVacationPayResponse } from '../services/employeeNotify';

// Vacation pay requests. An employee asks Accounting and Payroll to retain their vacation pay, withdraw it, or end
// the retention, and signs the request. HR / Accounting answer with the amount available before tax, a pay out date
// and notes, and can email the answer to the employee.

const router = Router();
const MAX_SIGNATURE_BYTES = 300 * 1024;
type Row = Record<string, unknown>;

const money = (n: number) => `$${n.toFixed(2)}`;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const todayBC = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });

export const requestText = (r: { retain: unknown; withdraw: unknown; terminate: unknown }) => [
  r.retain ? 'Retain my vacation pay' : '',
  r.withdraw ? 'Withdraw my vacation pay' : '',
  r.terminate ? 'Terminate my retention of vacation pay' : '',
].filter(Boolean).join('; ');

const BASE_SQL = `SELECT v.*, e.employee_number, e.department FROM vacation_pay_requests v JOIN employees e ON e.id = v.employee_id`;

function mapRow(r: Row) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeNumber: r.employee_number ?? '',
    department: r.department,
    email: r.email ?? '',
    requestDate: r.request_date,
    retain: !!r.retain, withdraw: !!r.withdraw, terminate: !!r.terminate,
    signatureType: r.signature_type, signature: r.signature,
    status: r.status,
    submittedAt: r.submitted_at,
    amountAvailable: r.amount_available === null || r.amount_available === undefined ? null : Number(r.amount_available),
    accountingNotes: r.accounting_notes ?? '',
    payoutDate: r.payout_date ?? null,
    respondedAt: r.responded_at ?? null,
    respondedBy: r.responded_by_name ?? null,
    emailedAt: r.emailed_at ?? null,
  };
}

/** A drawn (PNG) or typed signature. */
function readSignature(b: Row): { type: 'DRAWN' | 'TYPED'; value: string } | { error: string } {
  if (b.signatureType === 'DRAWN') {
    const s = typeof b.signature === 'string' ? b.signature : '';
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
    const buf = m ? Buffer.from(m[1], 'base64') : null;
    if (!buf || !buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || buf.length > MAX_SIGNATURE_BYTES)
      return { error: 'The drawn signature could not be read. Please draw it again.' };
    return { type: 'DRAWN', value: s };
  }
  if (b.signatureType === 'TYPED') {
    const t = str(b.signature, 80);
    if (t.length < 2) return { error: 'Type your full name as your signature.' };
    return { type: 'TYPED', value: t };
  }
  return { error: 'Your signature is required (draw it or type it).' };
}

// POST /api/vacation-pay  (an employee submits a request for themselves)
router.post('/', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role === 'ADMIN') return res.status(403).json({ error: 'Vacation pay requests are made by employees.' });
  const b = (req.body || {}) as Row;
  const emp = db.prepare(`SELECT id, name, email, active FROM employees WHERE id = ?`).get(a.id) as { id: string; name: string; email: string | null; active: number | null } | undefined;
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });
  if (emp.active === 0) return res.status(403).json({ error: 'This employee record is inactive.' });

  const retain = b.retain === true, withdraw = b.withdraw === true, terminate = b.terminate === true;
  if (!retain && !withdraw && !terminate) return res.status(400).json({ error: 'Select what you are asking for: retain, withdraw, or terminate the retention of your vacation pay.' });
  if (retain && terminate) return res.status(400).json({ error: 'You cannot retain your vacation pay and terminate the retention at the same time. Choose one.' });

  // The answer goes to the email on the employee record. If there is none, the one typed on the form is used.
  const typed = str(b.email, 120).toLowerCase();
  const email = (emp.email || '').trim() || typed;
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address so Accounting can send you the answer.' });

  const sig = readSignature(b);
  if ('error' in sig) return res.status(400).json({ error: sig.error });

  if (db.prepare(`SELECT 1 FROM vacation_pay_requests WHERE employee_id = ? AND status = 'PENDING'`).get(a.id))
    return res.status(409).json({ error: 'You already have a vacation pay request waiting for an answer. Wait for the answer, or cancel it first.' });

  const id = uuidv4(), now = new Date().toISOString();
  db.prepare(`INSERT INTO vacation_pay_requests (id, employee_id, employee_name, email, request_date, retain, withdraw, terminate, signature_type, signature, status, submitted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`)
    .run(id, a.id, emp.name, email, todayBC(), retain ? 1 : 0, withdraw ? 1 : 0, terminate ? 1 : 0, sig.type, sig.value, now);

  const what = requestText({ retain, withdraw, terminate });
  logAudit(req, 'VACATION_PAY_REQUEST', { targetType: 'vacation_pay', targetId: id, targetName: emp.name, details: what });
  notifyAdminsPush('New vacation pay request', `${emp.name}: ${what}`);
  notifyHrEmail('New vacation pay request', 'New vacation pay request', `${emp.name} sent a vacation pay request.`, [['Employee', emp.name], ['Request', what]]);
  res.status(201).json(mapRow(db.prepare(`${BASE_SQL} WHERE v.id = ?`).get(id) as Row));
});

// GET /api/vacation-pay/mine  (an employee's own requests, newest first)
router.get('/mine', requireAuth, (req: Request, res: Response) => {
  const rows = db.prepare(`${BASE_SQL} WHERE v.employee_id = ? ORDER BY v.submitted_at DESC`).all(getAuth(req)!.id) as Row[];
  res.json(rows.map(mapRow));
});

// POST /api/vacation-pay/:id/cancel  (an employee withdraws a request that has not been answered)
router.post('/:id/cancel', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const row = db.prepare(`SELECT id, employee_id, employee_name, status FROM vacation_pay_requests WHERE id = ?`).get(req.params.id as string) as Row | undefined;
  if (!row || row.employee_id !== a.id) return res.status(404).json({ error: 'Request not found.' });
  if (row.status !== 'PENDING') return res.status(400).json({ error: 'Only a request that has not been answered can be cancelled.' });
  db.prepare(`UPDATE vacation_pay_requests SET status = 'CANCELLED' WHERE id = ?`).run(row.id);
  logAudit(req, 'VACATION_PAY_CANCEL', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string });
  res.json({ ok: true });
});

// GET /api/vacation-pay  (HR / Accounting: every request, newest first)
router.get('/', requireAdmin, (req: Request, res: Response) => {
  logAudit(req, 'VIEW_VACATION_PAY', { dedupeMinutes: 10 });
  const rows = db.prepare(`${BASE_SQL} ORDER BY CASE v.status WHEN 'PENDING' THEN 0 ELSE 1 END, v.submitted_at DESC`).all() as Row[];
  res.json(rows.map(mapRow));
});

// PUT /api/vacation-pay/:id/respond  { amountAvailable?, notes?, payoutDate?, email?: boolean }
router.put('/:id/respond', requireAdmin, async (req: Request, res: Response) => {
  const b = (req.body || {}) as Row;
  const row = db.prepare(`SELECT * FROM vacation_pay_requests WHERE id = ?`).get(req.params.id as string) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  if (row.status === 'CANCELLED') return res.status(400).json({ error: 'The employee cancelled this request.' });

  let amount: number | null = null;
  if (b.amountAvailable !== undefined && b.amountAvailable !== null && String(b.amountAvailable).trim() !== '') {
    amount = Number(b.amountAvailable);
    if (!isFinite(amount) || amount < 0 || amount > 10_000_000) return res.status(400).json({ error: 'Enter the amount available as a number, 0 or more.' });
    amount = Math.round(amount * 100) / 100;
  }
  const notes = str(b.notes, 1000);
  const payout = str(b.payoutDate, 10);
  if (payout && !isIso(payout)) return res.status(400).json({ error: 'The pay out date is not valid.' });
  if (amount === null && !notes && !payout) return res.status(400).json({ error: 'Enter the amount available, a pay out date or a note for the employee.' });

  const who = (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(getAuth(req)!.id) as { name?: string } | undefined)?.name || 'HR';
  const now = new Date().toISOString();
  db.prepare(`UPDATE vacation_pay_requests SET status = 'RESPONDED', amount_available = ?, accounting_notes = ?, payout_date = ?, responded_at = ?, responded_by = ?, responded_by_name = ? WHERE id = ?`)
    .run(amount, notes || null, payout || null, now, getAuth(req)!.id, who, row.id);

  const sendEmail = b.email === true;
  const emailStatus = await notifyVacationPayResponse(row.employee_id as string, requestText({ retain: row.retain, withdraw: row.withdraw, terminate: row.terminate }),
    amount, payout || null, notes, (row.email as string) || null, sendEmail);
  if (emailStatus === 'sent') db.prepare(`UPDATE vacation_pay_requests SET emailed_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);

  logAudit(req, 'VACATION_PAY_RESPONSE', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string,
    details: `${amount !== null ? `${money(amount)} available before tax` : 'No amount'}${payout ? ` | pay out ${payout}` : ''}${sendEmail ? ` | email ${emailStatus}` : ''}` });
  res.json({ request: mapRow(db.prepare(`${BASE_SQL} WHERE v.id = ?`).get(row.id) as Row), emailStatus });
});

export default router;
