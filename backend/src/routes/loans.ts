import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { calcLoan, estimateInterest, applyLoanToEmployee, getDefaultBiweekly, setDefaultBiweekly, readBiweekly, LOAN_AGREEMENTS, LOAN_MAX_AMOUNT } from '../services/loans';
import { getPayday, setPayday, isIsoDate, vancouverDate, loanBalance, loanPayments, buildSchedule, postPayment, removePayment } from '../services/loanPayments';
import { notifyAdminsPush } from '../services/push';
import { notifyHrEmail } from '../services/mailer';
import { notifyLoanDecision, notifyLoanChequeReady } from '../services/employeeNotify';

const router = Router();

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 300 * 1024;
const money = (n: number) => `$${n.toFixed(2)}`;

type Row = Record<string, unknown>;

function mapRow(r: Row) {
  // Interest is worked out from the amount and the bi-weekly amortization (5% per annum for the time to repay); payments follow from it.
  const interest = Number(r.biweekly) > 0 ? estimateInterest(Number(r.amount), Number(r.biweekly), Number(r.interest_rate ?? 0.05)) : Number(r.estimated_interest);
  const orig = Number(r.loan_original ?? 0), rem = Number(r.loan_remaining ?? 0);
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeNumber: r.employee_number ?? '',
    department: r.department,
    email: r.email ?? '',
    amount: r.amount,
    purpose: r.purpose,
    estimatedInterest: interest,
    payments: Number(r.biweekly) > 0 ? Math.ceil(Math.round((Number(r.amount) + interest) * 100) / 100 / Number(r.biweekly) - 1e-9) : r.payments,
    biweekly: r.biweekly,
    interestRate: r.interest_rate,
    status: r.status,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at ?? r.submitted_at,
    edited: !!r.updated_at && r.updated_at !== r.submitted_at,
    onBehalf: !!r.submitted_by && r.submitted_by !== r.employee_id,
    hasProof: !!r.has_proof,
    proofName: r.proof_name ?? null,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null,
    signatureType: r.signature_type ?? null,
    signature: r.signature ?? null,
    signatureName: r.signature_name ?? null,
    loanApplied: !!r.loan_applied,
    // What was asked for (amount is what management approved once approved)
    requestedAmount: r.requested_amount ?? r.amount,
    // HR/Accounting comment when the application is received (internal: removed for employees)
    reviewComment: r.review_comment ?? null,
    reviewBy: r.review_by ?? null,
    reviewAt: r.review_at ?? null,
    // The cheque Accounting prepares after approval (the note is internal)
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
    // The employee's loan record right now (it changes when a loan is approved)
    currentLoan: { original: orig, remaining: rem, repaidPercent: orig > 0 ? Math.round((1 - rem / orig) * 100) : 100 },
  };
}

const SELECT = `
  SELECT la.*, e.name AS employee_name, e.employee_number, e.department, e.email, e.loan_original, e.loan_remaining,
         (SELECT filename FROM loan_proofs WHERE loan_id = la.id) AS proof_name
  FROM loan_applications la JOIN employees e ON e.id = la.employee_id`;

function getOne(id: string): Row | undefined {
  return db.prepare(`${SELECT} WHERE la.id = ?`).get(id) as Row | undefined;
}

/** Reads a base64 upload (optionally a data: URL) and checks size and real file type from its first bytes. */
function readProof(p: unknown): { filename: string; mime: string; data: Buffer } | { error: string } | null {
  if (p === undefined || p === null) return null;
  const o = p as { name?: unknown; data?: unknown };
  if (typeof o.data !== 'string' || !o.data) return { error: 'The proof file could not be read. Please choose it again.' };
  const buf = Buffer.from(o.data.replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length) return { error: 'The proof file is empty.' };
  if (buf.length > MAX_PROOF_BYTES) return { error: 'The proof file is too large (5 MB maximum).' };
  let mime = '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) mime = 'image/jpeg';
  else if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) mime = 'image/png';
  else if (buf.subarray(0, 4).toString('latin1') === '%PDF') mime = 'application/pdf';
  else if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') mime = 'image/webp';
  if (!mime) return { error: 'The proof must be a photo (JPG, PNG, WebP) or a PDF.' };
  const filename = String(o.name || 'proof').replace(/[^\w.\- ]+/g, '_').slice(0, 100) || 'proof';
  return { filename, mime, data: buf };
}

/** Amount, purpose and the agreement: the same rules for a new application and for an edit. */
function readCore(b: Record<string, unknown>): { amount: number; purpose: string } | { error: string } {
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter the loan amount.' };
  if (amount > LOAN_MAX_AMOUNT) return { error: `The loan amount cannot be more than ${money(LOAN_MAX_AMOUNT)}.` };
  const purpose = typeof b.purpose === 'string' ? b.purpose.trim().slice(0, 2000) : '';
  if (purpose.length < 5) return { error: 'Describe the purpose of the loan (emergency or medical).' };
  const agreements = Array.isArray(b.agreements) ? b.agreements : [];
  if (agreements.length < LOAN_AGREEMENTS || !agreements.every(x => x === true))
    return { error: 'You must agree to the Employee Loan Agreement and Terms & Conditions.' };
  return { amount, purpose };
}

// POST /api/loans  (an employee applies for themselves; HR can apply on behalf of an employee)
/** Internal HR/Accounting fields are never sent to the employee. */
function viewFor<T extends Record<string, unknown>>(m: T, admin: boolean): T {
  if (admin) return m;
  return { ...m, reviewComment: null, reviewBy: null, reviewAt: null, chequeNote: null };
}

/** A drawn (PNG) or typed signature from a request, checked the same way for management and for the employee. */
function readSignature(b: Record<string, unknown>, whose: string): { type: 'DRAWN' | 'TYPED'; value: string } | { error: string } {
  if (b.signatureType === 'DRAWN') {
    const s = typeof b.signature === 'string' ? b.signature : '';
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
    const buf = m ? Buffer.from(m[1], 'base64') : null;
    if (!buf || !buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || buf.length > MAX_SIGNATURE_BYTES)
      return { error: 'The drawn signature could not be read. Please draw it again.' };
    return { type: 'DRAWN', value: s };
  }
  if (b.signatureType === 'TYPED') {
    const t = typeof b.signature === 'string' ? b.signature.trim().slice(0, 80) : '';
    if (t.length < 2) return { error: `Type your name as the signature of ${whose}.` };
    return { type: 'TYPED', value: t };
  }
  return { error: `The signature of ${whose} is required (draw or type it).` };
}
const adminName = (req: Request) => (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(getAuth(req)!.id) as { name?: string } | undefined)?.name || 'HR';

router.post('/', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const b = (req.body || {}) as Record<string, unknown>;
  const isAdmin = a.role === 'ADMIN';

  const employeeId = isAdmin ? String(b.employeeId || '') : a.id;
  if (!employeeId) return res.status(400).json({ error: 'Choose the employee this application is for.' });
  const emp = db.prepare(`SELECT id, name, role, active FROM employees WHERE id = ?`).get(employeeId) as { id: string; name: string; role: string; active: number | null } | undefined;
  if (!emp || emp.role === 'ADMIN') return res.status(404).json({ error: 'Employee not found.' });
  if (emp.active === 0) return res.status(403).json({ error: 'This employee record is inactive.' });

  const core = readCore(b);
  if ('error' in core) return res.status(400).json({ error: core.error });
  const { amount, purpose } = core;

  const proof = readProof(b.proof);
  if (proof && 'error' in proof) return res.status(400).json({ error: proof.error });
  if (!proof && !isAdmin) return res.status(400).json({ error: 'Upload your proof of medical emergency.' });

  const open = db.prepare(`SELECT 1 FROM loan_applications WHERE employee_id = ? AND status = 'PENDING'`).get(employeeId);
  if (open) return res.status(409).json({ error: 'There is already a loan application waiting for HR review for this employee.' });

  const calc = calcLoan(amount);
  const id = uuidv4();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO loan_applications (id, employee_id, amount, purpose, estimated_interest, payments, biweekly, interest_rate, status, submitted_at, updated_at, submitted_by, has_proof)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`)
      .run(id, employeeId, amount, purpose, calc.interest, calc.payments, calc.biweekly, calc.rate, now, now, a.id, proof ? 1 : 0);
    if (proof) db.prepare(`INSERT INTO loan_proofs (loan_id, filename, mime, data) VALUES (?, ?, ?, ?)`).run(id, proof.filename, proof.mime, proof.data);
  })();

  logAudit(req, 'LOAN_APPLICATION', { targetType: 'loan_application', targetId: id, targetName: emp.name, details: `${money(amount)} loan application` });
  if (!isAdmin) {
    notifyAdminsPush('New loan application', `${emp.name}: ${money(amount)}`);
    notifyHrEmail('New loan application', 'New loan application', `${emp.name} applied for an employee loan.`, [
      ['Employee', emp.name], ['Amount', money(amount)],
      ['Purpose', purpose.slice(0, 300)],
    ]);
  }
  res.status(201).json(mapRow(getOne(id)!));
});

// GET /api/loans/settings  (HR: the default bi-weekly amortization, and a known payday that dates the repayment tables)
router.get('/settings', requireAdmin, (_req: Request, res: Response) => {
  res.json({ biweekly: getDefaultBiweekly(), payday: getPayday() });
});

// PUT /api/loans/settings  (HR changes either value; applications already made keep their own amortization amount)
router.put('/settings', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  if (b.biweekly === undefined && b.payday === undefined) return res.status(400).json({ error: 'Nothing to save.' });
  if (b.biweekly !== undefined) {
    const n = readBiweekly(b.biweekly);
    if (typeof n !== 'number') return res.status(400).json({ error: n.error });
    const before = getDefaultBiweekly();
    setDefaultBiweekly(n);
    logAudit(req, 'LOAN_SETTINGS', { details: `Default bi-weekly amortization changed from ${money(before)} to ${money(n)}` });
  }
  if (b.payday !== undefined) {
    if (!isIsoDate(b.payday)) return res.status(400).json({ error: 'Enter a payday date.' });
    const before = getPayday();
    setPayday(b.payday);
    logAudit(req, 'LOAN_SETTINGS', { details: `Payday for loan repayment tables set to ${b.payday} (paydays every 14 days)${before ? `, was ${before}` : ''}` });
  }
  res.json({ biweekly: getDefaultBiweekly(), payday: getPayday() });
});

// ---------- repayments (payroll runs in another app, so HR posts what was deducted) ----------

type PayRow = { id: string; employee_id: string; amount: number; biweekly: number; interest_rate: number; status: string; decided_at: string | null };
const approvedLoans = (employeeId: string) => db.prepare(
  `SELECT id, employee_id, amount, biweekly, interest_rate, status, decided_at FROM loan_applications WHERE employee_id = ? AND status = 'APPROVED' ORDER BY decided_at, submitted_at`).all(employeeId) as PayRow[];

/** A date from a payroll report: 2026-11-13, 11/13/2026 (month first), or Nov 13, 2026. Anything else is rejected. */
function parseDate(s: string): string | null {
  const t = s.trim();
  if (isIsoDate(t)) return t;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) { const d = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`; return isIsoDate(d) ? d : null; }
  const ms = Date.parse(`${t} 12:00 UTC`);
  if (/[A-Za-z]{3}/.test(t) && Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  return null;
}
const parseMoney = (s: string): number | null => {
  const n = Math.round(Number(String(s).replace(/[$,\s]/g, '')) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? n : null;
};
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface ImportRow { line: number; employeeNumber: string; employeeName: string | null; date: string; amount: number | null; status: 'OK' | 'DUPLICATE' | 'ERROR'; message: string }
class Rollback extends Error {}

// POST /api/loans/payments/import  { csv, commit }  (HR: post the loan deductions from the payroll app's report; commit:false only previews)
router.post('/payments/import', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const text = typeof b.csv === 'string' ? b.csv.replace(/^\uFEFF/, '') : '';
  const commit = b.commit === true;
  const lines = text.split(/\r?\n/).map((l, i) => ({ l, no: i + 1 })).filter(x => x.l.trim());
  if (!lines.length) return res.status(400).json({ error: 'The file is empty.' });
  if (lines.length > 2000) return res.status(400).json({ error: 'Too many rows (2,000 at most per import).' });
  const sep = lines[0].l.includes('\t') ? '\t' : lines[0].l.includes(';') && !lines[0].l.includes(',') ? ';' : ',';
  const cells = lines.map(x => splitCsvLine(x.l, sep));

  // Columns: found by their header names when there is a header row, otherwise employee number, date, amount.
  let ci = 0, di = 1, ai = 2, start = 0;
  if (!cells[0].some(c => parseDate(c))) {
    start = 1;
    const find = (re: RegExp) => cells[0].findIndex(h => re.test(h));
    const e = find(/emp|number|^no\.?$|^id$/i), d = find(/date/i), a = find(/amount|deduct|payment|\$/i);
    if (e >= 0 && d >= 0 && a >= 0 && new Set([e, d, a]).size === 3) { ci = e; di = d; ai = a; }
  }

  const rows: ImportRow[] = [];
  const by = getAuth(req)!.id;
  const run = db.transaction(() => {
    for (let i = start; i < cells.length; i++) {
      const c = cells[i];
      const r: ImportRow = { line: lines[i].no, employeeNumber: (c[ci] || '').trim(), employeeName: null, date: '', amount: null, status: 'ERROR', message: '' };
      rows.push(r);
      const date = parseDate(c[di] || ''); const amount = parseMoney(c[ai] || '');
      if (!r.employeeNumber) { r.message = 'Employee number is missing.'; continue; }
      if (!date) { r.message = `Date "${c[di] || ''}" is not valid (use YYYY-MM-DD or MM/DD/YYYY).`; continue; }
      r.date = date;
      if (amount === null) { r.message = `Amount "${c[ai] || ''}" is not valid.`; continue; }
      r.amount = amount;
      const emp = db.prepare(`SELECT id, name FROM employees WHERE employee_number = ?`).get(r.employeeNumber) as { id: string; name: string } | undefined;
      if (!emp) { r.message = 'No employee with this number.'; continue; }
      r.employeeName = emp.name;
      if (db.prepare(`SELECT 1 FROM loan_payments WHERE employee_id = ? AND paid_on = ? AND ABS(amount - ?) < 0.005`).get(emp.id, date, amount)) {
        r.status = 'DUPLICATE'; r.message = 'Already posted (same employee, date and amount). Skipped.'; continue;
      }
      const loans = approvedLoans(emp.id).map(l => ({ l, out: loanBalance(l, l.id).outstanding })).filter(x => x.out > 0.005);
      if (!loans.length) { r.message = 'No approved loan with a balance for this employee.'; continue; }
      const owing = Math.round(loans.reduce((s, x) => s + x.out, 0) * 100) / 100;
      if (amount > owing + 0.005) { r.message = `More than the ${money(owing)} still owing.`; continue; }
      let left = amount;
      for (const { l, out } of loans) {                           // the oldest loan is paid first
        if (left <= 0.005) break;
        const part = Math.min(left, out);
        postPayment(l, l.id, date, Math.round(part * 100) / 100, 'IMPORT', null, by);
        left = Math.round((left - part) * 100) / 100;
      }
      r.status = 'OK'; r.message = loans.length > 1 && amount > loans[0].out ? 'Posted (spread over more than one loan).' : 'Posted.';
    }
    if (!commit) throw new Rollback();                            // a preview applies everything, shows the result, then undoes it
  });
  try { run(); } catch (e) { if (!(e instanceof Rollback)) { console.error('[loans] payment import failed:', e); return res.status(500).json({ error: 'The import failed and nothing was posted.' }); } }

  const ok = rows.filter(r => r.status === 'OK');
  if (commit && ok.length) logAudit(req, 'LOAN_PAYMENT_IMPORT', { details: `Posted ${ok.length} loan payment(s) totalling ${money(ok.reduce((s, r) => s + (r.amount || 0), 0))} from the payroll report` });
  res.json({ committed: commit, rows, summary: { ok: ok.length, duplicate: rows.filter(r => r.status === 'DUPLICATE').length, error: rows.filter(r => r.status === 'ERROR').length, total: Math.round(ok.reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100 } });
});

// POST /api/loans/:id/payments  { paidOn, amount, note }  (HR: post one deduction by hand)
router.post('/:id/payments', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const la = db.prepare(`SELECT id, employee_id, amount, biweekly, interest_rate, status, decided_at FROM loan_applications WHERE id = ?`).get(id) as PayRow | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (la.status !== 'APPROVED') return res.status(409).json({ error: 'Payments can only be posted against an approved loan.' });
  const b = (req.body || {}) as Record<string, unknown>;
  if (!isIsoDate(b.paidOn)) return res.status(400).json({ error: 'Enter the payday this was deducted.' });
  const amount = parseMoney(String(b.amount ?? ''));
  if (amount === null) return res.status(400).json({ error: 'Enter the amount deducted.' });
  const out = loanBalance(la, id).outstanding;
  if (amount > out + 0.005) return res.status(400).json({ error: `That is more than the ${money(out)} still owing on this loan.` });
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 200) : null;
  const name = (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(la.employee_id) as { name: string }).name;
  db.transaction(() => { postPayment(la, id, b.paidOn as string, amount, 'MANUAL', note, getAuth(req)!.id); })();
  logAudit(req, 'LOAN_PAYMENT', { targetType: 'loan_application', targetId: id, targetName: name, details: `${money(amount)} deduction posted for ${b.paidOn}${note ? ` | ${note}` : ''}` });
  res.status(201).json(detail(id, true));
});

// DELETE /api/loans/:id/payments/:pid  (HR: undo a payment that was posted by mistake)
router.delete('/:id/payments/:pid', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const p = db.prepare(`SELECT loan_id FROM loan_payments WHERE id = ?`).get(req.params.pid as string) as { loan_id: string } | undefined;
  if (!p || p.loan_id !== id) return res.status(404).json({ error: 'Payment not found' });
  const name = (getOne(id)?.employee_name as string) || '';
  const gone = db.transaction(() => removePayment(req.params.pid as string))();
  logAudit(req, 'LOAN_PAYMENT_DELETE', { targetType: 'loan_application', targetId: id, targetName: name, details: gone ? `Removed ${money(gone.amount)} deduction dated ${gone.paidOn}` : undefined });
  res.json(detail(id, true));
});

/** One application with its repayment table, the payments posted so far and what is still owing. */
function detail(id: string, admin: boolean) {
  const row = getOne(id)!;
  const m = viewFor(mapRow(row), admin);
  const la = { amount: Number(row.amount), biweekly: Number(row.biweekly), interest_rate: Number(row.interest_rate), status: String(row.status), decided_at: (row.decided_at as string) ?? null };
  const bal = loanBalance(la, id);
  return { ...m, schedule: buildSchedule(la, id), paymentLog: loanPayments(id), balance: { total: bal.total, paid: bal.paid, outstanding: row.status === 'APPROVED' ? bal.outstanding : bal.total }, payday: getPayday() };
}
// PUT /api/loans/:id  (the employee changes their application while it is still waiting for HR)
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  const la = db.prepare(`SELECT * FROM loan_applications WHERE id = ?`).get(id) as Row | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (la.employee_id !== a.id) return res.status(403).json({ error: 'Only the employee can change their application.' });
  if (la.status !== 'PENDING') return res.status(409).json({ error: `This application was already ${String(la.status).toLowerCase()}, so it can no longer be changed.` });

  const b = (req.body || {}) as Record<string, unknown>;
  const core = readCore(b);
  if ('error' in core) return res.status(400).json({ error: core.error });
  const proof = readProof(b.proof);               // a new file replaces the old one; none keeps the old one
  if (proof && 'error' in proof) return res.status(400).json({ error: proof.error });

  const { amount, purpose } = core;
  const calc = calcLoan(amount, Number(la.biweekly) > 0 ? Number(la.biweekly) : undefined);
  const before = `${money(Number(la.amount))}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE loan_applications SET amount = ?, purpose = ?, estimated_interest = ?, payments = ?, biweekly = ?, interest_rate = ?, updated_at = ?, has_proof = ? WHERE id = ?`)
      .run(amount, purpose, calc.interest, calc.payments, calc.biweekly, calc.rate, now, proof ? 1 : la.has_proof, id);
    if (proof) db.prepare(`INSERT OR REPLACE INTO loan_proofs (loan_id, filename, mime, data) VALUES (?, ?, ?, ?)`).run(id, proof.filename, proof.mime, proof.data);
  })();

  const name = (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(a.id) as { name: string }).name;
  logAudit(req, 'LOAN_EDIT', { targetType: 'loan_application', targetId: id, targetName: name, details: `Changed application (${before} to ${money(amount)})${proof ? ' | new proof file' : ''}` });
  notifyAdminsPush('Loan application changed', `${name} changed their application to ${money(amount)}`);
  notifyHrEmail('Loan application changed', 'Loan application changed', `${name} changed a loan application that is waiting for review.`, [
    ['Employee', name], ['Previous amount', before], ['New amount', money(amount)], ['Purpose', purpose.slice(0, 300)],
  ]);
  res.json(mapRow(getOne(id)!));
});

// GET /api/loans  (HR sees every application; an employee sees their own)
router.get('/', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const rows = (a.role === 'ADMIN'
    ? db.prepare(`${SELECT} ORDER BY CASE la.status WHEN 'PENDING' THEN 0 ELSE 1 END, la.submitted_at DESC`).all()
    : db.prepare(`${SELECT} WHERE la.employee_id = ? ORDER BY la.submitted_at DESC`).all(a.id)) as Row[];
  if (a.role === 'ADMIN') logAudit(req, 'VIEW_LOANS', { dedupeMinutes: 10 });
  res.json(rows.map(r => {
    const m = mapRow(r);
    // Employees do not need the signature image in the list; HR does.
    return a.role === 'ADMIN' ? m : viewFor({ ...m, signature: m.signatureType === 'TYPED' ? m.signature : null }, false);
  }));
});

// PUT /api/loans/:id/amortization  (HR sets the bi-weekly amortization for one application; payments and estimated interest are recalculated)
router.put('/:id/amortization', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const la = db.prepare(`SELECT * FROM loan_applications WHERE id = ?`).get(id) as Row | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  const n = readBiweekly((req.body || {}).biweekly);
  if (typeof n !== 'number') return res.status(400).json({ error: n.error });
  const calc = calcLoan(Number(la.amount), n);
  db.prepare(`UPDATE loan_applications SET biweekly = ?, payments = ?, estimated_interest = ? WHERE id = ?`).run(calc.biweekly, calc.payments, calc.interest, id);
  const row = getOne(id)!;
  logAudit(req, 'LOAN_AMORTIZATION', { targetType: 'loan_application', targetId: id, targetName: row.employee_name as string,
    details: `Bi-weekly amortization changed from ${money(Number(la.biweekly))} to ${money(n)} (${calc.payments} payments)` });
  res.json(mapRow(row));
});

// GET /api/loans/:id  (the owner or HR: one application in full, including the management signature, for the printable form)
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const row = getOne(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Loan application not found' });
  if (a.role !== 'ADMIN' && row.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  if (a.role === 'ADMIN') logAudit(req, 'VIEW_LOAN_FORM', { targetType: 'loan_application', targetId: req.params.id as string, targetName: row.employee_name as string, dedupeMinutes: 10 });
  res.json(detail(req.params.id as string, a.role === 'ADMIN'));
});

// GET /api/loans/:id/proof  (the owner or HR)
router.get('/:id/proof', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  const la = db.prepare(`SELECT employee_id FROM loan_applications WHERE id = ?`).get(id) as { employee_id: string } | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (a.role !== 'ADMIN' && la.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  const p = db.prepare(`SELECT filename, mime, data FROM loan_proofs WHERE loan_id = ?`).get(id) as { filename: string; mime: string; data: Buffer } | undefined;
  if (!p) return res.status(404).json({ error: 'No proof was uploaded for this application.' });
  if (a.role === 'ADMIN') logAudit(req, 'VIEW_LOAN_PROOF', { targetType: 'loan_application', targetId: id, dedupeMinutes: 10 });
  res.setHeader('Content-Type', p.mime);
  res.setHeader('Content-Disposition', `inline; filename="${p.filename.replace(/"/g, '')}"`);
  res.send(Buffer.from(p.data));
});

// PUT /api/loans/:id/review  { comment }  (HR/Accounting: an internal comment when the application is received; never shown to the employee)
router.put('/:id/review', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const row = getOne(id);
  if (!row) return res.status(404).json({ error: 'Loan application not found' });
  const comment = typeof (req.body || {}).comment === 'string' ? String((req.body || {}).comment).trim().slice(0, 2000) : '';
  const name = adminName(req);
  db.prepare(`UPDATE loan_applications SET review_comment = ?, review_by = ?, review_at = ? WHERE id = ?`).run(comment || null, comment ? name : null, comment ? new Date().toISOString() : null, id);
  logAudit(req, 'LOAN_REVIEW_COMMENT', { targetType: 'loan_application', targetId: id, targetName: row.employee_name as string, details: comment ? comment.slice(0, 200) : 'Comment cleared' });
  res.json(viewFor(mapRow(getOne(id)!), true));
});

// PUT /api/loans/:id/cheque  { chequeNumber, chequeDate, note, notify }  (Accounting enters the cheque; the first save tells the employee it is ready for pick up)
router.put('/:id/cheque', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const la = getOne(id);
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (la.status !== 'APPROVED') return res.status(409).json({ error: 'A cheque can only be entered for an approved loan.' });
  const b = (req.body || {}) as Record<string, unknown>;
  const number = typeof b.chequeNumber === 'string' ? b.chequeNumber.trim().slice(0, 40) : '';
  if (!number) return res.status(400).json({ error: 'Enter the cheque number.' });
  let chequeDate: string | null = null;
  if (b.chequeDate !== undefined && b.chequeDate !== null && b.chequeDate !== '') {
    if (!isIsoDate(b.chequeDate)) return res.status(400).json({ error: 'The cheque date is not valid.' });
    chequeDate = b.chequeDate;
  }
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  const first = !la.cheque_ready_at;
  const name = adminName(req);
  const now = new Date().toISOString();
  db.prepare(`UPDATE loan_applications SET cheque_number = ?, cheque_date = ?, cheque_note = ?, cheque_ready_at = COALESCE(cheque_ready_at, ?), cheque_ready_by = COALESCE(cheque_ready_by, ?) WHERE id = ?`)
    .run(number, chequeDate, note, now, name, id);
  logAudit(req, 'LOAN_CHEQUE', { targetType: 'loan_application', targetId: id, targetName: la.employee_name as string, details: `Cheque no. ${number} for ${money(Number(la.amount))}${first ? ' ready for pick up' : ' updated'}` });
  if (first || b.notify === true) notifyLoanChequeReady(la.employee_id as string, Number(la.amount), number, !first);
  res.json(viewFor(mapRow(getOne(id)!), true));
});

// PUT /api/loans/:id/receipt  { signatureType, signature, receivedOn, reference }
//   The employee signs and records the date they received the cheque and its reference number.
//   HR can record the date and reference for an employee who does not use the app (no signature is taken; it is marked as entered by HR).
router.put('/:id/receipt', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  const la = getOne(id);
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  const admin = a.role === 'ADMIN';
  if (!admin && la.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  if (la.status !== 'APPROVED') return res.status(409).json({ error: 'The loan has not been approved.' });
  if (!la.cheque_ready_at) return res.status(409).json({ error: 'Accounting has not entered the cheque yet.' });
  if (!admin && la.employee_signed_at) return res.status(409).json({ error: 'You already confirmed receiving this cheque.' });

  const b = (req.body || {}) as Record<string, unknown>;
  if (!isIsoDate(b.receivedOn)) return res.status(400).json({ error: 'Enter the date you received the cheque.' });
  const today = vancouverDate(new Date());
  const approvedOn = la.decided_at ? vancouverDate(la.decided_at as string) : '';
  if (b.receivedOn > today) return res.status(400).json({ error: 'The date received cannot be in the future.' });
  if (approvedOn && b.receivedOn < approvedOn) return res.status(400).json({ error: 'The date received cannot be before the loan was approved.' });
  const reference = typeof b.reference === 'string' ? b.reference.trim().slice(0, 60) : '';
  if (!reference) return res.status(400).json({ error: 'Enter the cheque reference number.' });

  const now = new Date().toISOString();
  if (admin) {
    db.prepare(`UPDATE loan_applications SET cheque_received_on = ?, cheque_reference = ?, receipt_by_hr = 1, receipt_recorded_by = ? WHERE id = ?`).run(b.receivedOn, reference, adminName(req), id);
    logAudit(req, 'LOAN_RECEIPT_BY_HR', { targetType: 'loan_application', targetId: id, targetName: la.employee_name as string, details: `Cheque received ${b.receivedOn}, reference ${reference}` });
  } else {
    const sig = readSignature(b, 'the employee');
    if ('error' in sig) return res.status(400).json({ error: sig.error });
    db.prepare(`UPDATE loan_applications SET employee_signature_type = ?, employee_signature = ?, employee_signed_at = ?, cheque_received_on = ?, cheque_reference = ?, receipt_by_hr = 0, receipt_recorded_by = NULL WHERE id = ?`)
      .run(sig.type, sig.value, now, b.receivedOn, reference, id);
    logAudit(req, 'LOAN_RECEIPT', { targetType: 'loan_application', targetId: id, targetName: la.employee_name as string, details: `Employee signed; cheque received ${b.receivedOn}, reference ${reference}` });
    const nm = la.employee_name as string;
    notifyAdminsPush('Loan cheque received', `${nm} signed for the loan cheque (${reference})`);
    notifyHrEmail('Loan cheque received', 'Loan cheque received', `${nm} signed and confirmed receiving the loan cheque.`, [
      ['Employee', nm], ['Amount', money(Number(la.amount))], ['Date received', String(b.receivedOn)], ['Reference number', reference], ['Cheque number (Accounting)', String(la.cheque_number ?? '')],
    ]);
  }
  res.json(viewFor(mapRow(getOne(id)!), admin));
});

// PUT /api/loans/:id/decision  (management approves with a signature, for the full amount or an amount they enter, or denies)
router.put('/:id/decision', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const status = String(b.status || '');
  if (status !== 'APPROVED' && status !== 'DENIED') return res.status(400).json({ error: "Choose Approve or Deny." });
  const id = req.params.id as string;
  const la = db.prepare(`SELECT * FROM loan_applications WHERE id = ?`).get(id) as Row | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (la.status !== 'PENDING') return res.status(409).json({ error: `This application was already ${String(la.status).toLowerCase()}.` });
  // HR approves what they saw: if the employee changed the application since the page loaded, ask HR to look again.
  if (typeof b.updatedAt === 'string' && b.updatedAt !== (la.updated_at ?? la.submitted_at))
    return res.status(409).json({ error: 'The employee changed this application after you opened it. Refresh the page and review the new version.' });

  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
  // Approve the full amount, or a different (smaller) amount entered by management.
  const requested = Number(la.amount);
  let approvedAmount = requested;
  if (status === 'APPROVED' && b.approvedAmount !== undefined && b.approvedAmount !== null && b.approvedAmount !== '') {
    const n = Math.round(Number(b.approvedAmount) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Enter the amount to approve.' });
    if (n > requested + 0.004) return res.status(400).json({ error: `The approved amount cannot be more than the ${money(requested)} requested.` });
    approvedAmount = n;
  }
  let sigType: string | null = null, sig: string | null = null, sigName: string | null = null;
  if (status === 'APPROVED') {
    if (b.signatureType === 'DRAWN') {
      const s = typeof b.signature === 'string' ? b.signature : '';
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || !buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || buf.length > MAX_SIGNATURE_BYTES)
        return res.status(400).json({ error: 'The drawn signature could not be read. Please draw it again.' });
      sigType = 'DRAWN'; sig = s;
    } else if (b.signatureType === 'TYPED') {
      const t = typeof b.signature === 'string' ? b.signature.trim().slice(0, 80) : '';
      if (t.length < 2) return res.status(400).json({ error: 'Type your name as the signature of management.' });
      sigType = 'TYPED'; sig = t;
    } else {
      return res.status(400).json({ error: 'Management must sign (draw or type) to approve a loan.' });
    }
    sigName = (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(getAuth(req)!.id) as { name?: string } | undefined)?.name || null;
  }

  const admin = getAuth(req)!;
  const now = new Date().toISOString();
  const amount = approvedAmount;
  let loan: { original: number; remaining: number } | null = null;
  db.transaction(() => {
    db.prepare(`UPDATE loan_applications SET status = ?, decision_note = ?, decided_at = ?, decided_by = ?, signature_type = ?, signature = ?, signature_name = ?, loan_applied = ? WHERE id = ?`)
      .run(status, note || null, now, admin.id, sigType, sig, sigName, status === 'APPROVED' ? 1 : 0, id);
    if (status === 'APPROVED' && Math.abs(approvedAmount - requested) > 0.004) {
      const calc = calcLoan(approvedAmount, Number(la.biweekly) > 0 ? Number(la.biweekly) : undefined);
      db.prepare(`UPDATE loan_applications SET requested_amount = COALESCE(requested_amount, amount), amount = ?, estimated_interest = ?, payments = ? WHERE id = ?`).run(approvedAmount, calc.interest, calc.payments, id);
    }
    if (status === 'APPROVED') loan = applyLoanToEmployee(la.employee_id as string, amount);
  })();

  const row = getOne(id)!;
  logAudit(req, 'LOAN_DECISION', {
    targetType: 'loan_application', targetId: id, targetName: row.employee_name as string,
    details: `${Math.abs(requested - amount) > 0.004 ? `${money(amount)} approved of ${money(requested)} requested` : money(amount)} loan ${status.toLowerCase()}${loan ? ` | loan record now ${money((loan as any).remaining)} remaining of ${money((loan as any).original)}` : ''}${note ? ` | Note: ${note}` : ''}`,
  });
  notifyLoanDecision(la.employee_id as string, status === 'APPROVED', amount, note, requested);
  if (status === 'APPROVED') {
    // Accounting needs to know a cheque is to be prepared.
    const who = row.employee_name as string;
    notifyAdminsPush('Loan approved: cheque needed', `${who}: ${money(amount)}`);
    notifyHrEmail('Loan approved: cheque needed', 'Loan approved: prepare the cheque', `${who}'s loan was approved. Accounting can now enter the cheque number so the employee is told it is ready.`, [
      ['Employee', who], ['Amount approved', money(amount)], ['Amount requested', money(requested)],
    ], 'Open Loan Applications');
  }
  res.json(mapRow(row));
});

export default router;
