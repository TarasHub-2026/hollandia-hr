import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { calcLoan, applyLoanToEmployee, LOAN_AGREEMENTS, LOAN_MAX_AMOUNT } from '../services/loans';
import { notifyAdminsPush } from '../services/push';
import { notifyHrEmail } from '../services/mailer';
import { notifyLoanDecision } from '../services/employeeNotify';

const router = Router();

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 300 * 1024;
const money = (n: number) => `$${n.toFixed(2)}`;

type Row = Record<string, unknown>;

function mapRow(r: Row) {
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
    estimatedInterest: r.estimated_interest,
    payments: r.payments,
    biweekly: r.biweekly,
    interestRate: r.interest_rate,
    status: r.status,
    submittedAt: r.submitted_at,
    onBehalf: !!r.submitted_by && r.submitted_by !== r.employee_id,
    hasProof: !!r.has_proof,
    proofName: r.proof_name ?? null,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null,
    signatureType: r.signature_type ?? null,
    signature: r.signature ?? null,
    signatureName: r.signature_name ?? null,
    loanApplied: !!r.loan_applied,
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

// POST /api/loans  (an employee applies for themselves; HR can apply on behalf of an employee)
router.post('/', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const b = (req.body || {}) as Record<string, unknown>;
  const isAdmin = a.role === 'ADMIN';

  const employeeId = isAdmin ? String(b.employeeId || '') : a.id;
  if (!employeeId) return res.status(400).json({ error: 'Choose the employee this application is for.' });
  const emp = db.prepare(`SELECT id, name, role, active FROM employees WHERE id = ?`).get(employeeId) as { id: string; name: string; role: string; active: number | null } | undefined;
  if (!emp || emp.role === 'ADMIN') return res.status(404).json({ error: 'Employee not found.' });
  if (emp.active === 0) return res.status(403).json({ error: 'This employee record is inactive.' });

  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter the loan amount.' });
  if (amount > LOAN_MAX_AMOUNT) return res.status(400).json({ error: `The loan amount cannot be more than ${money(LOAN_MAX_AMOUNT)}.` });

  const purpose = typeof b.purpose === 'string' ? b.purpose.trim().slice(0, 2000) : '';
  if (purpose.length < 5) return res.status(400).json({ error: 'Describe the purpose of the loan (emergency or medical).' });

  const agreements = Array.isArray(b.agreements) ? b.agreements : [];
  if (agreements.length !== LOAN_AGREEMENTS || !agreements.every(x => x === true))
    return res.status(400).json({ error: 'You must agree to all of the loan terms and conditions.' });

  const proof = readProof(b.proof);
  if (proof && 'error' in proof) return res.status(400).json({ error: proof.error });
  if (!proof && !isAdmin) return res.status(400).json({ error: 'Upload your proof of medical emergency.' });

  const open = db.prepare(`SELECT 1 FROM loan_applications WHERE employee_id = ? AND status = 'PENDING'`).get(employeeId);
  if (open) return res.status(409).json({ error: 'There is already a loan application waiting for HR review for this employee.' });

  const calc = calcLoan(amount);
  const id = uuidv4();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO loan_applications (id, employee_id, amount, purpose, estimated_interest, payments, biweekly, interest_rate, status, submitted_at, submitted_by, has_proof)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`)
      .run(id, employeeId, amount, purpose, calc.interest, calc.payments, calc.biweekly, calc.rate, now, a.id, proof ? 1 : 0);
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
    return a.role === 'ADMIN' ? m : { ...m, signature: m.signatureType === 'TYPED' ? m.signature : null };
  }));
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

// PUT /api/loans/:id/decision  (HR approves with a signature, or denies)
router.put('/:id/decision', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const status = String(b.status || '');
  if (status !== 'APPROVED' && status !== 'DENIED') return res.status(400).json({ error: "Choose Approve or Deny." });
  const id = req.params.id as string;
  const la = db.prepare(`SELECT * FROM loan_applications WHERE id = ?`).get(id) as Row | undefined;
  if (!la) return res.status(404).json({ error: 'Loan application not found' });
  if (la.status !== 'PENDING') return res.status(409).json({ error: `This application was already ${String(la.status).toLowerCase()}.` });

  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
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
  const amount = Number(la.amount);
  let loan: { original: number; remaining: number } | null = null;
  db.transaction(() => {
    db.prepare(`UPDATE loan_applications SET status = ?, decision_note = ?, decided_at = ?, decided_by = ?, signature_type = ?, signature = ?, signature_name = ?, loan_applied = ? WHERE id = ?`)
      .run(status, note || null, now, admin.id, sigType, sig, sigName, status === 'APPROVED' ? 1 : 0, id);
    if (status === 'APPROVED') loan = applyLoanToEmployee(la.employee_id as string, amount);
  })();

  const row = getOne(id)!;
  logAudit(req, 'LOAN_DECISION', {
    targetType: 'loan_application', targetId: id, targetName: row.employee_name as string,
    details: `${money(amount)} loan ${status.toLowerCase()}${loan ? ` | loan record now ${money((loan as any).remaining)} remaining of ${money((loan as any).original)}` : ''}${note ? ` | Note: ${note}` : ''}`,
  });
  notifyLoanDecision(la.employee_id as string, status === 'APPROVED', amount, note);
  res.json(mapRow(row));
});

export default router;
