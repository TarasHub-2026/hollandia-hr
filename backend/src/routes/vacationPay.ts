import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { notifyAdminsPush } from '../services/push';
import { notifyHrEmail } from '../services/mailer';
import { notifyVacationPayResponse, notifyVacationPayDecision, notifyVacationPayChequeReady } from '../services/employeeNotify';
import { PRIMARY_ADMIN_ID } from './adminAccess';

// Vacation pay requests. An employee asks Accounting and Payroll to retain their vacation pay, withdraw it, or end the
// retention, and signs the request. The procedure follows the loan application, without interest or repayments:
//   1. HR / Accounting add an internal comment and prepare the response (amount available before tax, pay out date, notes).
//   2. The main administrator account approves (with a signature of management) or denies. The employee is told.
//   3. For a withdrawal, Accounting enters the cheque; the employee is told it is ready for pick up.
//   4. The employee signs to confirm they received the cheque (HR can record it for an employee who does not use the app).

const router = Router();
const MAX_SIGNATURE_BYTES = 300 * 1024;
type Row = Record<string, unknown>;

const money = (n: number) => `$${n.toFixed(2)}`;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const todayBC = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
const dateBC = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
const adminName = (req: Request) => (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(getAuth(req)!.id) as { name?: string } | undefined)?.name || 'HR';
const isMain = (req: Request) => getAuth(req)?.id === PRIMARY_ADMIN_ID;

export const requestText = (r: { retain: unknown; withdraw: unknown; terminate: unknown }) => [
  r.retain ? 'Retain my vacation pay' : '',
  r.withdraw ? 'Withdraw my vacation pay' : '',
  r.terminate ? 'Terminate my retention of vacation pay' : '',
].filter(Boolean).join('; ');

const BASE_SQL = `SELECT v.*, e.employee_number, e.department FROM vacation_pay_requests v JOIN employees e ON e.id = v.employee_id`;
const getOne = (id: string) => db.prepare(`${BASE_SQL} WHERE v.id = ?`).get(id) as Row | undefined;

function mapRow(r: Row) {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeNumber: r.employee_number ?? '',
    department: r.department,
    email: r.email ?? '',
    requestDate: r.request_date,
    retain: !!r.retain, withdraw: !!r.withdraw, terminate: !!r.terminate,
    // What the employee asked to withdraw, and whether that amount is before or after CPP, EI and tax
    withdrawAmount: num(r.withdraw_amount),
    withdrawBasis: (r.withdraw_basis as 'BEFORE' | 'AFTER' | null) ?? null,
    signatureType: r.signature_type, signature: r.signature,
    status: r.status,
    submittedAt: r.submitted_at,
    // What HR / Accounting prepared
    amountAvailable: num(r.amount_available),
    accountingNotes: r.accounting_notes ?? '',
    payoutDate: r.payout_date ?? null,
    respondedAt: r.responded_at ?? null,
    respondedBy: r.responded_by_name ?? null,
    emailedAt: r.emailed_at ?? null,
    // HR / Accounting comment when the request is received (internal: removed for employees)
    reviewComment: r.review_comment ?? null, reviewBy: r.review_by ?? null, reviewAt: r.review_at ?? null,
    // The decision of management (the main administrator account)
    approvedAmount: num(r.approved_amount),
    decisionNote: r.decision_note ?? null,
    decidedAt: r.decided_at ?? null,
    decidedBy: r.decided_by_name ?? null,
    mgmtSignatureType: r.mgmt_signature_type ?? null,
    mgmtSignature: r.mgmt_signature ?? null,
    // The cheque Accounting prepares for a withdrawal (the note is internal)
    chequeNumber: r.cheque_number ?? null,
    chequeDate: r.cheque_date ?? null,
    chequeNote: r.cheque_note ?? null,
    chequeReadyAt: r.cheque_ready_at ?? null,
    chequeReadyBy: r.cheque_ready_by ?? null,
    // The employee's signature and receipt of the cheque
    employeeSignatureType: r.employee_signature_type ?? null,
    employeeSignature: r.employee_signature ?? null,
    employeeSignedAt: r.employee_signed_at ?? null,
    chequeReceivedOn: r.cheque_received_on ?? null,
    chequeReference: r.cheque_reference ?? null,
    receiptByHr: !!r.receipt_by_hr,
  };
}

/** Internal HR / Accounting fields are never sent to the employee, and the prepared response stays hidden until management decides. */
function viewFor(m: ReturnType<typeof mapRow>, admin: boolean) {
  if (admin) return m;
  const decided = m.status === 'APPROVED' || m.status === 'DENIED';
  return {
    ...m, reviewComment: null, reviewBy: null, reviewAt: null, chequeNote: null,
    ...(decided ? {} : { amountAvailable: null, accountingNotes: '', payoutDate: null }),
  };
}

/** A drawn (PNG) or typed signature. */
function readSignature(b: Row, whose: string): { type: 'DRAWN' | 'TYPED'; value: string } | { error: string } {
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
    if (t.length < 2) return { error: `Type the name of ${whose} as the signature.` };
    return { type: 'TYPED', value: t };
  }
  return { error: `The signature of ${whose} is required (draw it or type it).` };
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

  // Withdrawal section: required only when the employee asks to withdraw.
  let wAmount: number | null = null, wBasis: 'BEFORE' | 'AFTER' | null = null;
  if (withdraw) {
    wAmount = Math.round(Number(b.withdrawAmount) * 100) / 100;
    if (b.withdrawAmount === undefined || b.withdrawAmount === null || String(b.withdrawAmount).trim() === '' || !isFinite(wAmount) || wAmount <= 0)
      return res.status(400).json({ error: 'Enter how much you would like to withdraw. / Indique cuánto le gustaría retirar.' });
    if (wAmount > 1_000_000) return res.status(400).json({ error: 'That withdrawal amount is too large.' });
    if (b.withdrawBasis !== 'BEFORE' && b.withdrawBasis !== 'AFTER')
      return res.status(400).json({ error: 'Choose whether the amount is before or after CPP, EI and tax. / Elija si el monto es antes o después de CPP, EI e impuestos.' });
    wBasis = b.withdrawBasis;
  }

  // The answer goes to the email on the employee record. If there is none, the one typed on the form is used.
  const typed = str(b.email, 120).toLowerCase();
  const email = (emp.email || '').trim() || typed;
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address so Accounting can send you the answer.' });

  const sig = readSignature(b, 'the employee');
  if ('error' in sig) return res.status(400).json({ error: sig.error });

  if (db.prepare(`SELECT 1 FROM vacation_pay_requests WHERE employee_id = ? AND status = 'PENDING'`).get(a.id))
    return res.status(409).json({ error: 'You already have a vacation pay request waiting for an answer. Wait for the answer, or cancel it first.' });

  const id = uuidv4(), now = new Date().toISOString();
  db.prepare(`INSERT INTO vacation_pay_requests (id, employee_id, employee_name, email, request_date, retain, withdraw, terminate, signature_type, signature, status, submitted_at, withdraw_amount, withdraw_basis)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`)
    .run(id, a.id, emp.name, email, todayBC(), retain ? 1 : 0, withdraw ? 1 : 0, terminate ? 1 : 0, sig.type, sig.value, now, wAmount, wBasis);

  const what = requestText({ retain, withdraw, terminate }) + (wAmount !== null ? ` (${money(wAmount)} ${wBasis === 'BEFORE' ? 'before' : 'after'} CPP, EI and tax)` : '');
  logAudit(req, 'VACATION_PAY_REQUEST', { targetType: 'vacation_pay', targetId: id, targetName: emp.name, details: what });
  notifyAdminsPush('New vacation pay request', `${emp.name}: ${what}`);
  notifyHrEmail('New vacation pay request', 'New vacation pay request', `${emp.name} sent a vacation pay request. It needs the approval of the main administrator.`, [['Employee', emp.name], ['Request', what]]);
  res.status(201).json(viewFor(mapRow(getOne(id)!), false));
});

// GET /api/vacation-pay/mine  (an employee's own requests, newest first)
router.get('/mine', requireAuth, (req: Request, res: Response) => {
  const rows = db.prepare(`${BASE_SQL} WHERE v.employee_id = ? ORDER BY v.submitted_at DESC`).all(getAuth(req)!.id) as Row[];
  res.json(rows.map(r => viewFor(mapRow(r), false)));
});

// POST /api/vacation-pay/:id/cancel  (an employee withdraws a request that has not been decided)
router.post('/:id/cancel', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const row = db.prepare(`SELECT id, employee_id, employee_name, status FROM vacation_pay_requests WHERE id = ?`).get(req.params.id as string) as Row | undefined;
  if (!row || row.employee_id !== a.id) return res.status(404).json({ error: 'Request not found.' });
  if (row.status !== 'PENDING') return res.status(400).json({ error: 'Only a request that has not been decided can be cancelled.' });
  db.prepare(`UPDATE vacation_pay_requests SET status = 'CANCELLED' WHERE id = ?`).run(row.id);
  logAudit(req, 'VACATION_PAY_CANCEL', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string });
  res.json({ ok: true });
});

// GET /api/vacation-pay  (HR / Accounting: every request; the ones waiting come first)
router.get('/', requireAdmin, (req: Request, res: Response) => {
  logAudit(req, 'VIEW_VACATION_PAY', { dedupeMinutes: 10 });
  const rows = db.prepare(`${BASE_SQL} ORDER BY CASE v.status WHEN 'PENDING' THEN 0 ELSE 1 END, v.submitted_at DESC`).all() as Row[];
  res.json(rows.map(r => mapRow(r)));
});

// PUT /api/vacation-pay/:id/review  { comment }  (HR / Accounting: an internal comment, never shown to the employee)
router.put('/:id/review', requireAdmin, (req: Request, res: Response) => {
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  const comment = str((req.body || {}).comment, 2000);
  const name = adminName(req);
  db.prepare(`UPDATE vacation_pay_requests SET review_comment = ?, review_by = ?, review_at = ? WHERE id = ?`)
    .run(comment || null, comment ? name : null, comment ? new Date().toISOString() : null, row.id);
  logAudit(req, 'VACATION_PAY_REVIEW_COMMENT', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string, details: comment ? comment.slice(0, 200) : 'Comment cleared' });
  res.json(mapRow(getOne(row.id as string)!));
});

// PUT /api/vacation-pay/:id/details  { amountAvailable?, payoutDate?, notes?, notify?, email? }
//   HR / Accounting prepare (or later update) the response: the amount available for withdrawal before tax, the pay out date
//   and notes. While the request is waiting this stays internal. After approval, "notify" tells the employee about the update
//   (in the app) and "email" also emails it.
router.put('/:id/details', requireAdmin, async (req: Request, res: Response) => {
  const b = (req.body || {}) as Row;
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  if (row.status !== 'PENDING' && row.status !== 'APPROVED') return res.status(409).json({ error: `This request was ${String(row.status).toLowerCase()}, so it can no longer be changed.` });

  let amount: number | null = null;
  if (b.amountAvailable !== undefined && b.amountAvailable !== null && String(b.amountAvailable).trim() !== '') {
    amount = Number(b.amountAvailable);
    if (!isFinite(amount) || amount < 0 || amount > 10_000_000) return res.status(400).json({ error: 'Enter the amount available as a number, 0 or more.' });
    amount = Math.round(amount * 100) / 100;
  }
  const notes = str(b.notes, 1000);
  const payout = str(b.payoutDate, 10);
  if (payout && !isIso(payout)) return res.status(400).json({ error: 'The pay out date is not valid.' });

  const who = adminName(req);
  db.prepare(`UPDATE vacation_pay_requests SET amount_available = ?, accounting_notes = ?, payout_date = ?, responded_at = ?, responded_by = ?, responded_by_name = ? WHERE id = ?`)
    .run(amount, notes || null, payout || null, new Date().toISOString(), getAuth(req)!.id, who, row.id);

  let emailStatus: string = 'skipped';
  if (row.status === 'APPROVED' && (b.notify === true || b.email === true)) {
    if (amount === null && !notes && !payout) return res.status(400).json({ error: 'Enter the amount available, a pay out date or a note for the employee.' });
    const shown = row.approved_amount !== null && row.approved_amount !== undefined ? Number(row.approved_amount) : amount;
    emailStatus = await notifyVacationPayResponse(row.employee_id as string, requestText({ retain: row.retain, withdraw: row.withdraw, terminate: row.terminate }),
      shown, payout || null, notes, (row.email as string) || null, b.email === true);
    if (emailStatus === 'sent') db.prepare(`UPDATE vacation_pay_requests SET emailed_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  }
  logAudit(req, 'VACATION_PAY_DETAILS', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string,
    details: `${amount !== null ? `${money(amount)} available before tax` : 'No amount'}${payout ? ` | pay out ${payout}` : ''}${b.notify === true || b.email === true ? ` | employee told${b.email === true ? `, email ${emailStatus}` : ''}` : ''}` });
  res.json({ request: mapRow(getOne(row.id as string)!), emailStatus });
});

// PUT /api/vacation-pay/:id/decision  { status: 'APPROVED' | 'DENIED', note?, approvedAmount?, signatureType, signature }
//   Only the main administrator account decides. Approving needs a signature of management.
router.put('/:id/decision', requireAdmin, (req: Request, res: Response) => {
  if (!isMain(req)) return res.status(403).json({ error: 'Only the main administrator account (HR Administrator) can approve or deny vacation pay requests.' });
  const b = (req.body || {}) as Row;
  const status = String(b.status || '');
  if (status !== 'APPROVED' && status !== 'DENIED') return res.status(400).json({ error: 'Choose Approve or Deny.' });
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  if (row.status !== 'PENDING') return res.status(409).json({ error: `This request was already ${String(row.status).toLowerCase()}.` });
  const note = str(b.note, 500);

  let sig: { type: 'DRAWN' | 'TYPED'; value: string } | null = null;
  let approved: number | null = null;
  if (status === 'APPROVED') {
    const s = readSignature(b, 'management');
    if ('error' in s) return res.status(400).json({ error: s.error });
    sig = s;
    const available = row.amount_available === null || row.amount_available === undefined ? null : Number(row.amount_available);
    if (b.approvedAmount !== undefined && b.approvedAmount !== null && String(b.approvedAmount).trim() !== '') {
      const n = Math.round(Number(b.approvedAmount) * 100) / 100;
      if (!isFinite(n) || n <= 0) return res.status(400).json({ error: 'Enter the amount to approve.' });
      if (available !== null && n > available + 0.004) return res.status(400).json({ error: `The approved amount cannot be more than the ${money(available)} available before tax.` });
      approved = n;
    } else if (available !== null) approved = available;
    if (row.withdraw && (approved === null || approved <= 0)) return res.status(400).json({ error: 'Enter the amount to approve for the withdrawal (the amount available before tax).' });
  }

  const now = new Date().toISOString();
  const name = adminName(req);
  db.prepare(`UPDATE vacation_pay_requests SET status = ?, decision_note = ?, decided_at = ?, decided_by = ?, decided_by_name = ?, mgmt_signature_type = ?, mgmt_signature = ?, approved_amount = ? WHERE id = ?`)
    .run(status, note || null, now, getAuth(req)!.id, name, sig?.type ?? null, sig?.value ?? null, approved, row.id);

  const what = requestText({ retain: row.retain, withdraw: row.withdraw, terminate: row.terminate });
  logAudit(req, 'VACATION_PAY_DECISION', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string,
    details: `${what} ${status.toLowerCase()}${approved !== null ? ` | ${money(approved)}` : ''}${note ? ` | Note: ${note}` : ''}` });
  const after = getOne(row.id as string)!;
  notifyVacationPayDecision(row.employee_id as string, status === 'APPROVED', what, approved, after.payout_date as string | null, note, !!row.withdraw);
  if (status === 'APPROVED' && row.withdraw) {
    // Accounting needs to know a cheque is to be prepared.
    notifyAdminsPush('Vacation pay approved: cheque needed', `${row.employee_name}: ${approved !== null ? money(approved) : ''}`);
    notifyHrEmail('Vacation pay approved: cheque needed', 'Vacation pay approved: prepare the cheque', `${row.employee_name}'s vacation pay withdrawal was approved. Accounting can now enter the cheque number so the employee is told it is ready.`,
      [['Employee', String(row.employee_name)], ['Amount approved', approved !== null ? money(approved) : '']], 'Open Vacation Pay Requests');
  }
  res.json(mapRow(after));
});

// PUT /api/vacation-pay/:id/cheque  { chequeNumber, chequeDate, note, notify }
//   Accounting enters the cheque for an approved withdrawal; the first save tells the employee it is ready for pick up.
router.put('/:id/cheque', requireAdmin, (req: Request, res: Response) => {
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  if (row.status !== 'APPROVED') return res.status(409).json({ error: 'A cheque can only be entered for an approved request.' });
  if (!row.withdraw) return res.status(409).json({ error: 'This request is not a withdrawal, so there is no cheque.' });
  const b = (req.body || {}) as Row;
  const number = str(b.chequeNumber, 40);
  if (!number) return res.status(400).json({ error: 'Enter the cheque number.' });
  let chequeDate: string | null = null;
  if (b.chequeDate !== undefined && b.chequeDate !== null && b.chequeDate !== '') {
    if (!isIso(b.chequeDate)) return res.status(400).json({ error: 'The cheque date is not valid.' });
    chequeDate = b.chequeDate;
  }
  const note = str(b.note, 500) || null;
  const first = !row.cheque_ready_at;
  const now = new Date().toISOString();
  db.prepare(`UPDATE vacation_pay_requests SET cheque_number = ?, cheque_date = ?, cheque_note = ?, cheque_ready_at = COALESCE(cheque_ready_at, ?), cheque_ready_by = COALESCE(cheque_ready_by, ?) WHERE id = ?`)
    .run(number, chequeDate, note, now, adminName(req), row.id);
  const amount = Number(row.approved_amount ?? row.amount_available ?? 0);
  logAudit(req, 'VACATION_PAY_CHEQUE', { targetType: 'vacation_pay', targetId: row.id as string, targetName: row.employee_name as string, details: `Cheque no. ${number} for ${money(amount)}${first ? ' ready for pick up' : ' updated'}` });
  if (first || b.notify === true) notifyVacationPayChequeReady(row.employee_id as string, amount, number, !first);
  res.json(mapRow(getOne(row.id as string)!));
});

// PUT /api/vacation-pay/:id/receipt  { signatureType, signature, receivedOn, reference }
//   The employee signs and records the date they received the cheque and its reference number.
//   HR can record the date and reference for an employee who does not use the app (no signature is taken).
router.put('/:id/receipt', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  const admin = a.role === 'ADMIN';
  if (!admin && row.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  if (row.status !== 'APPROVED' || !row.withdraw) return res.status(409).json({ error: 'There is no cheque to confirm for this request.' });
  if (!row.cheque_ready_at) return res.status(409).json({ error: 'Accounting has not entered the cheque yet.' });
  if (!admin && row.employee_signed_at) return res.status(409).json({ error: 'You already confirmed receiving this cheque.' });

  const b = (req.body || {}) as Row;
  if (!isIso(b.receivedOn)) return res.status(400).json({ error: 'Enter the date you received the cheque.' });
  const today = todayBC();
  const approvedOn = row.decided_at ? dateBC(row.decided_at as string) : '';
  if (b.receivedOn > today) return res.status(400).json({ error: 'The date received cannot be in the future.' });
  if (approvedOn && b.receivedOn < approvedOn) return res.status(400).json({ error: 'The date received cannot be before the request was approved.' });
  const reference = str(b.reference, 60);
  if (!reference) return res.status(400).json({ error: 'Enter the cheque reference number.' });

  const nm = row.employee_name as string;
  if (admin) {
    db.prepare(`UPDATE vacation_pay_requests SET cheque_received_on = ?, cheque_reference = ?, receipt_by_hr = 1, receipt_recorded_by = ? WHERE id = ?`).run(b.receivedOn, reference, adminName(req), row.id);
    logAudit(req, 'VACATION_PAY_RECEIPT_BY_HR', { targetType: 'vacation_pay', targetId: row.id as string, targetName: nm, details: `Cheque received ${b.receivedOn}, reference ${reference}` });
  } else {
    const sig = readSignature(b, 'the employee');
    if ('error' in sig) return res.status(400).json({ error: sig.error });
    db.prepare(`UPDATE vacation_pay_requests SET employee_signature_type = ?, employee_signature = ?, employee_signed_at = ?, cheque_received_on = ?, cheque_reference = ?, receipt_by_hr = 0, receipt_recorded_by = NULL WHERE id = ?`)
      .run(sig.type, sig.value, new Date().toISOString(), b.receivedOn, reference, row.id);
    logAudit(req, 'VACATION_PAY_RECEIPT', { targetType: 'vacation_pay', targetId: row.id as string, targetName: nm, details: `Employee signed; cheque received ${b.receivedOn}, reference ${reference}` });
    notifyAdminsPush('Vacation pay cheque received', `${nm} signed for the vacation pay cheque (${reference})`);
    notifyHrEmail('Vacation pay cheque received', 'Vacation pay cheque received', `${nm} signed and confirmed receiving the vacation pay cheque.`, [
      ['Employee', nm], ['Date received', String(b.receivedOn)], ['Reference number', reference], ['Cheque number (Accounting)', String(row.cheque_number ?? '')],
    ]);
  }
  res.json(viewFor(mapRow(getOne(row.id as string)!), admin));
});

export default router;
