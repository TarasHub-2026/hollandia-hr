import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { DEPARTMENTS } from '../types/index';
import type { Department } from '../types/index';
import { requireAdmin, hashPin } from '../middleware/security';
import { hrResetPin } from './pinReset';
import { logAudit } from '../middleware/audit';
import { mailEnabled, sendProfileReminderEmail } from '../services/mailer';

const router = Router();
router.use(requireAdmin);

function mapRow(e: Record<string, unknown>) {
  return {
    id:                e.id,
    name:              e.name,
    firstName:         e.first_name ?? undefined,
    lastName:          e.last_name ?? undefined,
    employeeNumber:    e.employee_number ?? undefined,
    email:             e.email ?? undefined,
    department:        e.department,
    hireDate:          e.hire_date,
    immigrationStatus: e.immigration_status ?? undefined,
    passportExpiry:    e.passport_expiry ?? undefined,
    workPermitExpiry:  e.work_permit_expiry ?? undefined,
    deptPending:       !!e.dept_pending,
    nationality:       e.nationality ?? undefined,
    passportNumber:    e.passport_number ?? undefined,
    lmiaNumber:        e.lmia_number ?? undefined,
    cowanCertNumber:   e.cowan_cert_number ?? undefined,
    cowanCertExpiry:   e.cowan_cert_expiry ?? undefined,
  visaExpiry:        e.visa_expiry ?? undefined,
    loanOriginal:      e.loan_original,
    loanRemaining:     e.loan_remaining,
    role:              e.role,
    active:            e.active === null || e.active === undefined ? true : !!e.active,
    registered:        !!e.registered,
    photo:             e.photo ?? undefined,
    dateOfBirth:       e.date_of_birth ?? undefined,
    createdAt:         e.created_at,
    updatedAt:         e.updated_at,
  };
}

// ── Input normalisation (shared by add / edit / CSV import) ──────────────────
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function normalizeDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { m = +match[1]; d = +match[2]; y = +match[3]; }
  else if ((match = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2}|\d{4})$/.exec(s))) {
    // e.g. 12-Sep-31 or 12 September 2031 (two-digit years are read as 20xx)
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase());
    if (mi < 0) return null;
    d = +match[1]; m = mi + 1; y = match[3].length === 2 ? 2000 + +match[3] : +match[3];
  }
  else if ((match = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    // e.g. February 10, 2030 or Feb 10 2030
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].toLowerCase());
    if (mi < 0) return null;
    m = mi + 1; d = +match[2]; y = +match[3];
  }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const LABEL_TO_DEPT: Record<string, Department> = {
  GREENHOUSE: 'GREENHOUSE', WAREHOUSE: 'WAREHOUSE', OFFICE: 'OFFICE', SHIPPING: 'SHIPPING', MAINTENANCE: 'MAINTENANCE', MAINTENACE: 'MAINTENANCE', MAINTENENCE: 'MAINTENANCE',
  PACKING_WATER_BUCKET: 'PACKING_WATER_BUCKET', PACKING_WATER_BUCKET_STATION: 'PACKING_WATER_BUCKET',
  PACKING: 'PACKING_WATER_BUCKET', WATER_BUCKET: 'PACKING_WATER_BUCKET', WATER_BUCKET_STATION: 'PACKING_WATER_BUCKET',
};
export function normalizeDept(v: unknown): Department | null {
  const key = str(v).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const hit = LABEL_TO_DEPT[key];
  return hit && (DEPARTMENTS as string[]).includes(hit) ? hit : null;
}

function normalizeImmigration(v: unknown): 'TFW' | 'NON_TFW' | '' | null {
  const s = str(v).toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  if (s === 'TFW') return 'TFW';
  if (s === 'NONTFW' || s === 'NTFW') return 'NON_TFW';
  return null;
}

function normalizeActive(v: unknown): boolean | null {
  if (v === undefined || v === null || str(v) === '') return true;
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'active'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'inactive'].includes(s)) return false;
  return null;
}

interface Clean {
  deptBlank: boolean;
  firstName: string; lastName: string; employeeNumber: string; email: string | null; hireDate: string;
  department: Department; immigrationStatus: '' | 'TFW' | 'NON_TFW'; passportExpiry: string | null;
  workPermitExpiry: string | null; loanOriginal: number; loanRemaining: number; active: boolean;
  nationality: string | null; passportNumber: string | null; lmiaNumber: string | null;
  cowanCertNumber: string | null; cowanCertExpiry: string | null; visaExpiry: string | null;
  /** undefined = not provided (keep what is stored); null = cleared. */
  dateOfBirth?: string | null;
}

// lenient (CSV import only): a blank email is allowed, and a blank department falls back to defaultDept (flagged for HR to confirm).
function cleanInput(b: Record<string, unknown>, opts: { lenient?: boolean; defaultDept?: Department | null } = {}): { ok: true; data: Clean } | { ok: false; error: string } {
  let first = str(b.firstName), last = str(b.lastName);
  if ((!first || !last) && str(b.name)) {
    const parts = str(b.name).split(/\s+/);
    first = first || parts[0] || '';
    last = last || parts.slice(1).join(' ');
  }
  if (!first || !last) return { ok: false, error: 'First name and last name are required' };
  const employeeNumber = str(b.employeeNumber);
  if (!employeeNumber) return { ok: false, error: 'Employee number is required' };
  let email: string | null = str(b.email).toLowerCase();
  if (opts.lenient && !email) email = null;
  else if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'A valid email is required' };
  const hireDate = normalizeDate(b.hireDate);
  if (!hireDate) return { ok: false, error: 'Hire date is required (YYYY-MM-DD)' };
  let department = normalizeDept(b.department);
  let deptBlank = false;
  if (opts.lenient && !str(b.department)) {
    if (!opts.defaultDept) return { ok: false, error: 'Department is blank. Choose a department for blank rows in the import window, or fill it in.' };
    department = opts.defaultDept; deptBlank = true;
  }
  if (!department) return { ok: false, error: `Department must be one of: ${DEPARTMENTS.join(', ')}` };
  const imm = normalizeImmigration(b.immigrationStatus);
  if (imm === null) return { ok: false, error: 'Immigration status must be TFW or Non-TFW' };
  // Passport / work permit / LMIA details only apply to TFW employees; for everyone else they are ignored (never required, never validated).
  const tfw = imm === 'TFW';
  const passport = tfw && str(b.passportExpiry) ? normalizeDate(b.passportExpiry) : null;
  const permit = tfw && str(b.workPermitExpiry) ? normalizeDate(b.workPermitExpiry) : null;
  if (tfw && str(b.passportExpiry) && !passport) return { ok: false, error: 'Invalid passport expiry date' };
  if (tfw && str(b.workPermitExpiry) && !permit) return { ok: false, error: 'Invalid work permit expiry date' };
  const lo = b.loanOriginal === undefined || str(b.loanOriginal) === '' ? 0 : Number(b.loanOriginal);
  const lr = b.loanRemaining === undefined || str(b.loanRemaining) === '' ? 0 : Number(b.loanRemaining);
  if (!isFinite(lo) || !isFinite(lr) || lo < 0 || lr < 0) return { ok: false, error: 'Loan amounts must be positive numbers' };
  if (lr > lo) return { ok: false, error: 'Loan remaining cannot exceed loan original' };
  const cowanExp = tfw && str(b.cowanCertExpiry) ? normalizeDate(b.cowanCertExpiry) : null;
  if (tfw && str(b.cowanCertExpiry) && !cowanExp) return { ok: false, error: 'Invalid Cowan certificate expiry date' };
  const visaExp = tfw && str(b.visaExpiry) ? normalizeDate(b.visaExpiry) : null;
  if (tfw && str(b.visaExpiry) && !visaExp) return { ok: false, error: 'Invalid visa expiry date' };
  const clip = (v: unknown, n = 100) => { const s = str(v).slice(0, n); return s || null; };
  const active = normalizeActive(b.active);
  if (active === null) return { ok: false, error: 'Active must be yes or no' };
  // Date of birth is optional. Left out of the request it is not touched; sent blank it is cleared.
  let dateOfBirth: string | null | undefined;
  if (b.dateOfBirth !== undefined) {
    if (!str(b.dateOfBirth)) dateOfBirth = null;
    else {
      dateOfBirth = normalizeDate(b.dateOfBirth);
      if (!dateOfBirth) return { ok: false, error: 'Date of birth is not a valid date' };
      const age = (Date.now() - Date.parse(dateOfBirth)) / (365.25 * 86400000);
      if (age < 14 || age > 100) return { ok: false, error: `Date of birth ${dateOfBirth} looks wrong (age ${Math.floor(age)}). Check the day, month and year.` };
    }
  }
  return {
    ok: true,
    data: {
      deptBlank, firstName: first, lastName: last, employeeNumber, email, hireDate, department,
      immigrationStatus: imm, passportExpiry: imm === 'TFW' ? passport : null, workPermitExpiry: imm === 'TFW' ? permit : null,
      loanOriginal: lo, loanRemaining: lr, active,
      nationality: clip(b.nationality), passportNumber: imm === 'TFW' ? clip(b.passportNumber) : null,
      lmiaNumber: imm === 'TFW' ? clip(b.lmiaNumber) : null,
      cowanCertNumber: tfw ? clip(b.cowanCertNumber) : null, cowanCertExpiry: cowanExp, visaExpiry: visaExp, dateOfBirth,
    },
  };
}

type Row = Record<string, unknown>;
const byNumber = (n: string, excludeId?: string) =>
  db.prepare(`SELECT * FROM employees WHERE LOWER(employee_number) = LOWER(?) AND id != ?`).get(n, excludeId ?? '') as Row | undefined;
const byEmail = (e: string, excludeId?: string) =>
  db.prepare(`SELECT * FROM employees WHERE LOWER(email) = LOWER(?) AND id != ?`).get(e, excludeId ?? '') as Row | undefined;

// Salaried employees have no payroll employee number, so the app gives them one: S-001, S-002, ...
const salariedFlag = (v: unknown) => ['1', 'true', 'yes', 'y', 'salaried'].includes(str(v).toLowerCase());
function maxSalariedNumber(): number {
  const rows = db.prepare(`SELECT employee_number FROM employees WHERE employee_number LIKE 'S-%'`).all() as { employee_number: string }[];
  return rows.reduce((m, r) => { const n = /^S-(\d+)$/i.exec(r.employee_number || ''); return n ? Math.max(m, parseInt(n[1], 10)) : m; }, 0);
}
const salariedNumber = (n: number) => `S-${String(n).padStart(3, '0')}`;

function insertEmployee(d: Clean): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  // Random PIN: the employee sets their own when they create their profile.
  db.prepare(`
    INSERT INTO employees (id, name, first_name, last_name, employee_number, email, department, hire_date,
      immigration_status, passport_expiry, work_permit_expiry, loan_original, loan_remaining,
      nationality, passport_number, lmia_number, cowan_cert_number, cowan_cert_expiry, visa_expiry,
      pin, role, active, registered, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMPLOYEE', ?, 0, ?, ?)
  `).run(id, `${d.firstName} ${d.lastName}`, d.firstName, d.lastName, d.employeeNumber, d.email, d.department, d.hireDate,
    d.immigrationStatus || null, d.passportExpiry, d.workPermitExpiry, d.loanOriginal, d.loanRemaining,
    d.nationality, d.passportNumber, d.lmiaNumber, d.cowanCertNumber, d.cowanCertExpiry, d.visaExpiry,
    hashPin(crypto.randomBytes(12).toString('hex')), d.active ? 1 : 0, now, now);
  if (d.deptBlank) db.prepare(`UPDATE employees SET dept_pending = 1 WHERE id = ?`).run(id);
  if (d.dateOfBirth) db.prepare(`UPDATE employees SET date_of_birth = ? WHERE id = ?`).run(d.dateOfBirth, id);
  return id;
}

// POST /api/employees/:id/reset-pin
router.post('/:id/reset-pin', hrResetPin);

// POST /api/employees/remind-profile  { ids?: string[] }
// Emails a "create your profile" reminder to active roster employees who have not registered yet.
// Without ids, every such employee with an email address is reminded. Sent one at a time (mail rate limit).
router.post('/remind-profile', async (req: Request, res: Response) => {
  if (!mailEnabled()) return res.status(503).json({ error: 'Email is not set up on the server (RESEND_API_KEY is missing), so reminders cannot be sent.' });
  const ids = (req.body as { ids?: unknown }).ids;
  if (ids !== undefined && (!Array.isArray(ids) || ids.some(i => typeof i !== 'string'))) return res.status(400).json({ error: 'ids must be a list of employee ids' });
  if (Array.isArray(ids) && ids.length > 500) return res.status(400).json({ error: 'Too many employees selected' });

  const rows = (db.prepare(`SELECT * FROM employees WHERE role != 'ADMIN' AND COALESCE(registered, 0) = 0 AND COALESCE(active, 1) = 1 ORDER BY name ASC`).all() as Row[])
    .filter(r => !Array.isArray(ids) || (ids as string[]).includes(r.id as string));
  const targets = rows.filter(r => /^\S+@\S+\.\S+$/.test(str(r.email)));
  const noEmail = rows.length - targets.length;
  if (!targets.length) return res.status(400).json({ error: rows.length ? 'None of these employees has an email address on file.' : 'No active employees without a profile to remind.' });

  let sent = 0; const failed: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    if (await sendProfileReminderEmail(str(r.email), str(r.name))) sent++; else failed.push(str(r.name));
    if (i < targets.length - 1) await new Promise(ok => setTimeout(ok, 600)); // stay under Resend's request-rate limit
  }
  logAudit(req, 'PROFILE_REMINDER', { details: `Profile reminder emailed to ${sent} employee${sent === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}${noEmail ? `, ${noEmail} skipped (no email)` : ''}` });
  res.json({ sent, failed, noEmail });
});

// GET /api/employees
router.get('/', (req: Request, res: Response) => {
  logAudit(req, 'VIEW_ROSTER', { dedupeMinutes: 10 });
  const rows = db.prepare(`SELECT * FROM employees ORDER BY name ASC`).all() as Row[];
  res.json(rows.map(mapRow));
});

// POST /api/employees/import  { rows: [...], dryRun?: boolean }
router.post('/import', (req: Request, res: Response) => {
  const { rows, dryRun, defaultDepartment } = req.body as { rows?: Row[]; dryRun?: boolean; defaultDepartment?: string };
  const defaultDept = defaultDepartment ? normalizeDept(defaultDepartment) : null;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Import is limited to 2000 rows at a time' });

  type Plan = { index: number; action: 'create' | 'update'; id?: string; data: Clean; keepImmigration: boolean; hadEmail: boolean };
  const plans: Plan[] = [];
  const errors: { row: number; message: string }[] = [];
  const seenNumbers = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  // Salaried rows with a blank employee number get S-### numbers (an existing employee with the same email keeps theirs).
  const autoNumbers: string[] = [];
  let sNext = maxSalariedNumber() + 1;

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    let rowIn: Row = raw || {};
    if (salariedFlag(rowIn.salaried) && !str(rowIn.employeeNumber)) {
      const em = str(rowIn.email).toLowerCase();
      if (!em) { errors.push({ row: rowNo, message: 'A salaried employee without an employee number needs an email, so they can be matched if you import the file again' }); return; }
      const ex = byEmail(em);
      let num: string;
      if (ex && ex.employee_number) num = String(ex.employee_number);
      else { num = salariedNumber(sNext++); autoNumbers.push(num); }
      rowIn = { ...rowIn, employeeNumber: num };
    }
    const c = cleanInput(rowIn, { lenient: true, defaultDept });
    if (!c.ok) { errors.push({ row: rowNo, message: c.error }); return; }
    const d = c.data;
    const nk = d.employeeNumber.toLowerCase(), ek = d.email || '';
    if (seenNumbers.has(nk)) { errors.push({ row: rowNo, message: `Employee number ${d.employeeNumber} is repeated (also on row ${seenNumbers.get(nk)})` }); return; }
    if (ek && seenEmails.has(ek)) { errors.push({ row: rowNo, message: `Email ${d.email} is repeated (also on row ${seenEmails.get(ek)})` }); return; }
    seenNumbers.set(nk, rowNo); if (ek) seenEmails.set(ek, rowNo);

    const existing = byNumber(d.employeeNumber);
    if (existing && existing.role === 'ADMIN') { errors.push({ row: rowNo, message: 'This employee number belongs to the administrator account' }); return; }
    const clash = d.email ? byEmail(d.email, existing?.id as string | undefined) : undefined;
    if (clash) { errors.push({ row: rowNo, message: `Email ${d.email} is already used by ${clash.name}` }); return; }
    // A blank immigration column must not wipe what an employee entered in their own profile.
    plans.push({ index: rowNo, action: existing ? 'update' : 'create', id: existing?.id as string | undefined, data: d, keepImmigration: !!existing && !raw['immigrationStatus'], hadEmail: !!existing?.email });
  });

  const summary = {
    toCreate: plans.filter(p => p.action === 'create').length,
    toUpdate: plans.filter(p => p.action === 'update').length,
    missingEmail: plans.filter(p => !p.data.email && !p.hadEmail).length,
    missingDepartment: plans.filter(p => p.data.deptBlank && p.action === 'create').length,
    autoNumbers,
    errors,
  };
  if (dryRun) return res.json({ dryRun: true, ...summary });
  if (errors.length) return res.status(400).json({ error: 'Fix the errors in the file and try again. Nothing was imported.', ...summary });

  const apply = db.transaction(() => {
    for (const p of plans) {
      const d = p.data;
      if (p.action === 'create') { insertEmployee(d); continue; }
      // Blank email keeps the stored one; a blank department keeps the stored one (only new rows use the default).
      const sets = `name=?, first_name=?, last_name=?, email=COALESCE(?, email), department=${d.deptBlank ? 'department' : '?'}, dept_pending=${d.deptBlank ? 'dept_pending' : '0'}, hire_date=?, loan_original=?, loan_remaining=?, active=?, updated_at=?,
        nationality=COALESCE(?, nationality), cowan_cert_number=COALESCE(?, cowan_cert_number), cowan_cert_expiry=COALESCE(?, cowan_cert_expiry), visa_expiry=COALESCE(?, visa_expiry)`;
      const vals: unknown[] = [`${d.firstName} ${d.lastName}`, d.firstName, d.lastName, d.email, ...(d.deptBlank ? [] : [d.department]), d.hireDate,
        d.loanOriginal, d.loanRemaining, d.active ? 1 : 0, new Date().toISOString(),
        d.nationality, d.cowanCertNumber, d.cowanCertExpiry, d.visaExpiry];
      if (p.keepImmigration) {
        db.prepare(`UPDATE employees SET ${sets} WHERE id=?`).run(...vals, p.id);
      } else {
        db.prepare(`UPDATE employees SET ${sets}, immigration_status=?, passport_expiry=?, work_permit_expiry=?,
          passport_number=COALESCE(?, passport_number), lmia_number=COALESCE(?, lmia_number) WHERE id=?`)
          .run(...vals, d.immigrationStatus || null, d.passportExpiry, d.workPermitExpiry, d.passportNumber, d.lmiaNumber, p.id);
      }
    }
  });
  apply();
  logAudit(req, 'EMPLOYEE_IMPORT', { details: `Imported CSV: ${summary.toCreate} added, ${summary.toUpdate} updated` });
  res.json({ dryRun: false, ...summary });
});

// POST /api/employees/import-birthdates  { rows: [{ employeeNumber, dateOfBirth }], dryRun?: boolean }
// Sets the date of birth of existing roster employees, matched by employee number. Nothing else is changed.
router.post('/import-birthdates', (req: Request, res: Response) => {
  const { rows, dryRun } = req.body as { rows?: Row[]; dryRun?: boolean };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Import is limited to 2000 rows at a time' });

  const errors: { row: number; message: string }[] = [];
  const plans: { id: string; dob: string; had: boolean; changed: boolean }[] = [];
  const seen = new Map<string, number>();
  const now = new Date();
  rows.forEach((raw, i) => {
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    const num = str(raw?.employeeNumber), dobRaw = str(raw?.dateOfBirth);
    if (!num) { errors.push({ row: rowNo, message: 'Employee number is missing' }); return; }
    if (!dobRaw) { errors.push({ row: rowNo, message: `Date of birth is missing for employee ${num}` }); return; }
    const dob = normalizeDate(dobRaw);
    if (!dob) { errors.push({ row: rowNo, message: `Date of birth "${dobRaw.slice(0, 30)}" is not a valid date (use YYYY-MM-DD, or MM/DD/YYYY)` }); return; }
    const age = (now.getTime() - Date.parse(dob)) / (365.25 * 86400000);
    if (age < 14 || age > 100) { errors.push({ row: rowNo, message: `Date of birth ${dob} for employee ${num} looks wrong (age ${Math.floor(age)}). Check the day, month and year.` }); return; }
    const key = num.toLowerCase();
    if (seen.has(key)) { errors.push({ row: rowNo, message: `Employee number ${num} is repeated (also on row ${seen.get(key)})` }); return; }
    seen.set(key, rowNo);
    const emp = byNumber(num);
    if (!emp || emp.role === 'ADMIN') { errors.push({ row: rowNo, message: `No employee with employee number ${num} is on the roster` }); return; }
    plans.push({ id: emp.id as string, dob, had: !!emp.date_of_birth, changed: emp.date_of_birth !== dob });
  });

  const summary = {
    total: rows.length,
    toSet: plans.filter(p => !p.had).length,
    toChange: plans.filter(p => p.had && p.changed).length,
    unchanged: plans.filter(p => p.had && !p.changed).length,
    errors,
  };
  if (dryRun) return res.json({ dryRun: true, ...summary });
  if (errors.length) return res.status(400).json({ error: 'Fix the errors in the file and try again. Nothing was imported.', ...summary });

  const stamp = now.toISOString();
  db.transaction(() => {
    const upd = db.prepare(`UPDATE employees SET date_of_birth = ?, updated_at = ? WHERE id = ?`);
    plans.filter(p => p.changed).forEach(p => upd.run(p.dob, stamp, p.id));
  })();
  // The dates themselves are never written to the audit log.
  logAudit(req, 'EMPLOYEE_BIRTHDATES_IMPORT', { details: `Date of birth added for ${summary.toSet} employee(s), changed for ${summary.toChange}, ${summary.unchanged} unchanged` });
  res.json({ dryRun: false, ...summary });
});

// GET /api/employees/:id
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  res.json(mapRow(row));
});

// POST /api/employees  (add a single employee to the roster)
router.post('/', (req: Request, res: Response) => {
  const body = { ...(req.body as Row) };
  // "Salaried" with no employee number: the app assigns the next S-### number.
  let assigned = '';
  if (salariedFlag(body.salaried) && !str(body.employeeNumber)) { assigned = salariedNumber(maxSalariedNumber() + 1); body.employeeNumber = assigned; }
  const c = cleanInput(body);
  if (!c.ok) return res.status(400).json({ error: c.error });
  const d = c.data;
  if (byNumber(d.employeeNumber)) return res.status(409).json({ error: 'An employee with this employee number already exists' });
  const clash = byEmail(d.email as string);
  if (clash) return res.status(409).json({ error: `This email is already used by ${clash.name}` });

  const id = insertEmployee(d);
  logAudit(req, 'EMPLOYEE_CREATE', { targetType: 'employee', targetId: id, targetName: `${d.firstName} ${d.lastName}` });
  res.status(201).json(mapRow(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Row));
});

// PUT /api/employees/:id
router.put('/:id', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Row | undefined;
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (existing.role === 'ADMIN') return res.status(403).json({ error: 'The administrator account cannot be edited here' });

  const c = cleanInput(req.body as Row);
  if (!c.ok) return res.status(400).json({ error: c.error });
  const d = c.data;
  const id = existing.id as string;
  if (byNumber(d.employeeNumber, id)) return res.status(409).json({ error: 'Another employee already uses this employee number' });
  const clash = byEmail(d.email as string, id);
  if (clash) return res.status(409).json({ error: `This email is already used by ${clash.name}` });

  db.prepare(`
    UPDATE employees SET name=?, first_name=?, last_name=?, employee_number=?, email=?, department=?, hire_date=?,
      immigration_status=?, passport_expiry=?, work_permit_expiry=?, loan_original=?, loan_remaining=?, active=?, updated_at=?,
      nationality=?, passport_number=?, lmia_number=?, cowan_cert_number=?, cowan_cert_expiry=?, visa_expiry=?, date_of_birth=?, dept_pending=0
    WHERE id=?
  `).run(`${d.firstName} ${d.lastName}`, d.firstName, d.lastName, d.employeeNumber, d.email, d.department, d.hireDate,
    d.immigrationStatus || null, d.passportExpiry, d.workPermitExpiry, d.loanOriginal, d.loanRemaining,
    d.active ? 1 : 0, new Date().toISOString(),
    d.nationality, d.passportNumber, d.lmiaNumber, d.cowanCertNumber, d.cowanCertExpiry, d.visaExpiry, d.dateOfBirth === undefined ? (existing.date_of_birth ?? null) : d.dateOfBirth, id);

  logAudit(req, 'EMPLOYEE_UPDATE', { targetType: 'employee', targetId: id, targetName: `${d.firstName} ${d.lastName}` });
  res.json(mapRow(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Row));
});

// PATCH /api/employees/:id/active  { active: boolean }  (deactivate / reactivate)
router.patch('/:id/active', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Row | undefined;
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (existing.role === 'ADMIN') return res.status(403).json({ error: 'The administrator account cannot be deactivated' });
  const active = !!(req.body as { active?: boolean }).active;
  db.prepare(`UPDATE employees SET active = ?, updated_at = ? WHERE id = ?`).run(active ? 1 : 0, new Date().toISOString(), existing.id);
  logAudit(req, active ? 'EMPLOYEE_ACTIVATE' : 'EMPLOYEE_DEACTIVATE', { targetType: 'employee', targetId: existing.id as string, targetName: existing.name as string });
  res.json(mapRow(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(existing.id) as Row));
});

// DELETE /api/employees/:id  (permanent; prefer deactivating)
router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT id, name, role FROM employees WHERE id = ?`).get(req.params.id) as { id: string; name: string; role: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (existing.role === 'ADMIN') return res.status(403).json({ error: 'The administrator account cannot be deleted' });
  logAudit(req, 'EMPLOYEE_DELETE', { targetType: 'employee', targetId: existing.id, targetName: existing.name });
  db.prepare(`DELETE FROM employees WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Employee deleted successfully' });
});

export default router;
