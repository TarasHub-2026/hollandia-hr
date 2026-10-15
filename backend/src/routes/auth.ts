import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import type { AuthUser, LoginPayload } from '../types';
import { normalizeDate } from './employees';
import { signToken, hashPin, verifyPin, isHashed, requireAuth, getAuth, loginThrottled, loginFailed, loginSucceeded } from '../middleware/security';
import { logAudit } from '../middleware/audit';

const router = Router();

function mapAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id:            row.id as string,
    name:          row.name as string,
    firstName:     (row.first_name as string) || (row.name as string).split(' ')[0] || '',
    lastName:      (row.last_name as string) || (row.name as string).split(' ').slice(1).join(' '),
    department:    row.department as any,
    hireDate:      row.hire_date as string,
    role:          (row.role as any) || 'EMPLOYEE',
    email:         (row.email as string) || undefined,
    employeeNumber:    (row.employee_number as string) || undefined,
    username:          (row.username as string) || undefined,
    immigrationStatus: (row.immigration_status as any) || undefined,
    passportExpiry:    (row.passport_expiry as string) || undefined,
    workPermitExpiry:  (row.work_permit_expiry as string) || undefined,
    loanOriginal:  (row.loan_original as number) || 0,
    loanRemaining: (row.loan_remaining as number) || 0,
  };
}


interface RegisterInput {
  employeeNumber?: string;
  email?: string;
  hireDate?: string;
  username?: string;
  pin?: string;
  immigrationStatus?: string;
  passportExpiry?: string;
  workPermitExpiry?: string;
}

const NO_MATCH = 'We could not match those details to an employee record. Check your employee number, email and hire date, or contact HR.';

// Validates the immigration section shared by sign-up and profile edits.
function validateImmigration(status?: string, passport?: string | null, permit?: string | null): string | null {
  if (status !== 'TFW' && status !== 'NON_TFW') return 'Please choose your immigration status (TFW or Non-TFW).';
  if (status === 'TFW') {
    if (!permit || isNaN(new Date(permit).getTime())) return 'TFW employees must enter their work permit expiry date.';
    if (!passport || isNaN(new Date(passport).getTime())) return 'TFW employees must enter their passport expiry date.';
  }
  return null;
}

// POST /api/auth/register - only employees already on the HR roster can create a profile.
// Employee number + email + hire date must all match the roster record.
router.post('/register', (req: Request, res: Response) => {
  const p = req.body as RegisterInput;
  const empNo = (p.employeeNumber || '').trim();
  const email = (p.email || '').trim().toLowerCase();
  const hire = normalizeDate(p.hireDate);
  const uname = (p.username || '').trim();

  if (!empNo || !email || !hire) return res.status(400).json({ error: 'Employee number, email and hire date are required.' });
  if (!p.pin || p.pin.trim().length < 4) return res.status(400).json({ error: 'Choose a PIN of at least 4 digits.' });
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Choose a username of 3-30 letters, numbers, dots, dashes or underscores.' });

  const throttleKey = `register|${req.ip}`;
  if (loginThrottled(throttleKey)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
  }

  const row = db.prepare(`
    SELECT * FROM employees WHERE LOWER(employee_number) = LOWER(?) AND LOWER(email) = ? AND role != 'ADMIN'
  `).get(empNo, email) as Record<string, unknown> | undefined;

  if (!row || String(row.hire_date).slice(0, 10) !== hire) {
    loginFailed(throttleKey);
    logAudit(req, 'REGISTER_FAILED', { details: `No roster match for employee number: ${empNo.slice(0, 40)}` });
    return res.status(400).json({ error: NO_MATCH });
  }
  if (row.active === 0) return res.status(403).json({ error: 'This employee record is inactive. Please contact HR.' });
  if (row.registered) return res.status(409).json({ error: 'A profile already exists for this employee. Please sign in instead.' });

  if (db.prepare(`SELECT id FROM employees WHERE id != ? AND (LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?))`).get(row.id, uname, uname)) {
    return res.status(409).json({ error: 'That username is already taken. Please choose another.' });
  }

  // HR-provided immigration status wins; otherwise use what the employee entered.
  const status = (row.immigration_status as string) || p.immigrationStatus;
  const passport = status === 'TFW' ? (p.passportExpiry || (row.passport_expiry as string) || null) : null;
  const permit = status === 'TFW' ? (p.workPermitExpiry || (row.work_permit_expiry as string) || null) : null;
  const immErr = validateImmigration(status, passport, permit);
  if (immErr) return res.status(400).json({ error: immErr });

  const id = row.id as string;
  db.prepare(`
    UPDATE employees SET username = ?, pin = ?, registered = 1, immigration_status = ?, passport_expiry = ?,
      work_permit_expiry = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(uname, hashPin(p.pin.trim()), status, passport, permit, id);

  if (row.role !== 'ADMIN' && row.active === 0) {
    logAudit(req, 'LOGIN_FAILED', { targetName: row.name as string, details: 'Inactive account' });
    return res.status(403).json({ error: 'Your account is inactive. Please contact HR.' });
  }
  loginSucceeded(throttleKey);
  logAudit(req, 'REGISTER', { actor: { id, name: row.name as string, role: 'EMPLOYEE' }, targetType: 'employee', targetId: id, targetName: row.name as string, details: 'Profile created from roster record' });
  const user = mapAuthUser(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown>);
  res.status(201).json({ user, token: signToken(user) });
});

// PUT /api/auth/profile - employees may update only their immigration status and document dates.
// Name, employee number, email, hire date and department are controlled by HR.
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  const id = getAuth(req)!.id;
  const p = req.body as RegisterInput;
  const err = validateImmigration(p.immigrationStatus, p.passportExpiry, p.workPermitExpiry);
  if (err) return res.status(400).json({ error: err });

  const isTfw = p.immigrationStatus === 'TFW';
  db.prepare(`
    UPDATE employees SET immigration_status = ?, passport_expiry = ?, work_permit_expiry = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(p.immigrationStatus, isTfw ? p.passportExpiry : null, isTfw ? p.workPermitExpiry : null, id);

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'User not found' });
  logAudit(req, 'PROFILE_UPDATE', { targetType: 'employee', targetId: id, targetName: row.name as string });
  res.json({ user: mapAuthUser(row) });
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { identifier, pin } = req.body as LoginPayload;
  if (!identifier || !pin) return res.status(400).json({ error: 'Please enter your username and PIN' });

  const cleanIdent = String(identifier).trim();
  const cleanPin = String(pin).trim();
  const throttleKey = `${req.ip}|${cleanIdent.toLowerCase()}`;
  if (loginThrottled(throttleKey)) {
    logAudit(req, 'LOGIN_LOCKED', { details: `Too many attempts for: ${cleanIdent.slice(0, 60)}` });
    return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
  }

  let row = db.prepare(`
    SELECT * FROM employees
    WHERE id = ? OR LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?) OR employee_number = ? OR LOWER(username) = LOWER(?)
  `).get(cleanIdent, cleanIdent, cleanIdent, cleanIdent, cleanIdent) as Record<string, unknown> | undefined;

  if (!row && cleanIdent.toLowerCase() === 'admin') {
    row = db.prepare(`SELECT * FROM employees WHERE role = 'ADMIN' LIMIT 1`).get() as Record<string, unknown> | undefined;
  }

  // Roster employees who have not created a profile yet cannot sign in (only the admin account is exempt).
  const notRegistered = !!row && row.role !== 'ADMIN' && !row.registered;
  if (!row || notRegistered || !verifyPin(row.pin as string, cleanPin)) {
    loginFailed(throttleKey);
    logAudit(req, 'LOGIN_FAILED', { targetName: row ? (row.name as string) : undefined, details: `Tried: ${cleanIdent.slice(0, 60)}` });
    return res.status(401).json({ error: 'Invalid username or PIN.' });
  }
  if (row.role !== 'ADMIN' && row.active === 0) {
    logAudit(req, 'LOGIN_FAILED', { targetName: row.name as string, details: 'Inactive account' });
    return res.status(403).json({ error: 'Your account is inactive. Please contact HR.' });
  }
  loginSucceeded(throttleKey);
  logAudit(req, 'LOGIN_SUCCESS', { actor: { id: row.id as string, name: row.name as string, role: (row.role as string) || 'EMPLOYEE' } });

  if (!isHashed(row.pin as string)) {
    db.prepare(`UPDATE employees SET pin = ? WHERE id = ?`).run(hashPin(cleanPin), row.id);
  }

  const user = mapAuthUser(row);
  res.json({ user, token: signToken(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(getAuth(req)!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'User no longer exists' });
  res.json({ user: mapAuthUser(row) });
});

// PUT /api/auth/change-pin  (always changes the signed-in user's own PIN)
router.put('/change-pin', requireAuth, (req: Request, res: Response) => {
  const { oldPin, newPin } = req.body as { oldPin?: string; newPin?: string };
  if (!oldPin || !newPin) return res.status(400).json({ error: 'oldPin and newPin are required' });
  if (newPin.trim().length < 4) return res.status(400).json({ error: 'New PIN must be at least 4 digits' });

  const id = getAuth(req)!.id;
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  if (!verifyPin(row.pin as string, oldPin.trim())) return res.status(401).json({ error: 'Current PIN is incorrect' });

  db.prepare(`UPDATE employees SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(hashPin(newPin.trim()), id);
  logAudit(req, 'PIN_CHANGE', { targetType: 'employee', targetId: id, targetName: row.name as string });
  res.json({ message: 'PIN updated successfully' });
});

export default router;