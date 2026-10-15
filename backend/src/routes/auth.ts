import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { AuthUser, LoginPayload, Department } from '../types';
import { signToken, hashPin, verifyPin, isHashed, requireAuth, getAuth, loginThrottled, loginFailed, loginSucceeded } from '../middleware/security';

const router = Router();

const VALID_DEPTS: Department[] = ['GREENHOUSE', 'WAREHOUSE', 'OFFICE', 'PACKING_WATER_BUCKET', 'LOGISTICS'];

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


interface ProfileInput {
  firstName?: string;
  lastName?: string;
  employeeNumber?: string;
  username?: string;
  email?: string;
  hireDate?: string;
  department?: string;
  immigrationStatus?: string;
  passportExpiry?: string;
  workPermitExpiry?: string;
}

// Shared validation: returns an error string, or null when valid.
function validateProfile(p: ProfileInput): string | null {
  if (!p.firstName?.trim() || !p.lastName?.trim()) return 'First name and last name are required.';
  if (!p.employeeNumber?.trim()) return 'Employee number is required.';
  if (!p.email?.trim() || !/\S+@\S+\.\S+/.test(p.email)) return 'A valid email address is required.';
  if (!p.hireDate || isNaN(new Date(p.hireDate).getTime())) return 'A valid hire date is required.';
  if (!p.department || !VALID_DEPTS.includes(p.department as Department)) return 'Please choose your department.';
  if (p.immigrationStatus !== 'TFW' && p.immigrationStatus !== 'NON_TFW') return 'Please choose your immigration status (TFW or Non-TFW).';
  if (p.immigrationStatus === 'TFW') {
    if (!p.workPermitExpiry || isNaN(new Date(p.workPermitExpiry).getTime())) return 'TFW employees must enter their work permit expiry date.';
    if (!p.passportExpiry || isNaN(new Date(p.passportExpiry).getTime())) return 'TFW employees must enter their passport expiry date.';
  }
  return null;
}

// POST /api/auth/register - employee creates their own profile
router.post('/register', (req: Request, res: Response) => {
  const p = req.body as ProfileInput & { pin?: string };
  const err = validateProfile(p);
  if (err) return res.status(400).json({ error: err });
  if (!p.pin || p.pin.trim().length < 4) return res.status(400).json({ error: 'Choose a PIN of at least 4 digits.' });

  const first = p.firstName!.trim();
  const last  = p.lastName!.trim();
  const fullName = `${first} ${last}`;
  const empNo = p.employeeNumber!.trim();
  const isTfw = p.immigrationStatus === 'TFW';

  const uname = (p.username || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Choose a username of 3-30 letters, numbers, dots, dashes or underscores.' });
  if (db.prepare(`SELECT id FROM employees WHERE LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?)`).get(uname, uname)) return res.status(409).json({ error: 'That username is already taken. Please choose another.' });

  const numberTaken = db.prepare(`SELECT id FROM employees WHERE employee_number = ?`).get(empNo) as { id: string } | undefined;
  if (numberTaken) return res.status(409).json({ error: 'A profile with this employee number already exists. Please sign in instead.' });

  // If HR already added this person to the roster (and no profile yet), claim that record.
  const existing = db.prepare(`SELECT * FROM employees WHERE LOWER(name) = LOWER(?) AND role != 'ADMIN'`).get(fullName) as Record<string, unknown> | undefined;
  if (existing && existing.employee_number) {
    return res.status(409).json({ error: 'A profile for this name already exists. Please sign in instead.' });
  }

  // Claiming an HR-created roster record exposes its leave history, so the email must match what HR has on file.
  if (existing && (!existing.email || String(existing.email).toLowerCase() !== p.email!.trim().toLowerCase())) {
    return res.status(409).json({ error: 'An HR roster record exists for this name. Please contact HR to link your profile.' });
  }

  const passport = isTfw ? p.passportExpiry! : null;
  const permit   = isTfw ? p.workPermitExpiry! : null;
  let id: string;

  if (existing) {
    id = existing.id as string;
    db.prepare(`
      UPDATE employees SET name = ?, first_name = ?, last_name = ?, employee_number = ?, email = ?,
        hire_date = ?, department = ?, immigration_status = ?, passport_expiry = ?, work_permit_expiry = ?,
        pin = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(fullName, first, last, empNo, p.email!.trim(), p.hireDate, p.department, p.immigrationStatus, passport, permit, hashPin(p.pin.trim()), id);
  } else {
    id = uuidv4();
    db.prepare(`
      INSERT INTO employees (id, name, first_name, last_name, employee_number, email, hire_date, department,
        immigration_status, passport_expiry, work_permit_expiry, loan_original, loan_remaining, pin, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'EMPLOYEE', datetime('now'), datetime('now'))
    `).run(id, fullName, first, last, empNo, p.email!.trim(), p.hireDate, p.department, p.immigrationStatus, passport, permit, hashPin(p.pin.trim()));
  }

  db.prepare(`UPDATE employees SET username = ? WHERE id = ?`).run(uname, id);
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown>;
  const user = mapAuthUser(row);
  res.status(201).json({ user, token: signToken(user) });
});

// PUT /api/auth/profile - logged-in employee updates their own profile
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  const decoded = { id: getAuth(req)!.id };

  const p = req.body as ProfileInput;
  const err = validateProfile(p);
  if (err) return res.status(400).json({ error: err });

  const empNo = p.employeeNumber!.trim();
  const clash = db.prepare(`SELECT id FROM employees WHERE employee_number = ? AND id != ?`).get(empNo, decoded.id);
  if (clash) return res.status(409).json({ error: 'Another employee already uses this employee number.' });

  const isTfw = p.immigrationStatus === 'TFW';
  const first = p.firstName!.trim();
  const last  = p.lastName!.trim();
  db.prepare(`
    UPDATE employees SET name = ?, first_name = ?, last_name = ?, employee_number = ?, email = ?,
      hire_date = ?, department = ?, immigration_status = ?, passport_expiry = ?, work_permit_expiry = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(`${first} ${last}`, first, last, empNo, p.email!.trim(), p.hireDate, p.department, p.immigrationStatus,
    isTfw ? p.passportExpiry : null, isTfw ? p.workPermitExpiry : null, decoded.id);

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(decoded.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'User not found' });
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
    return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
  }

  let row = db.prepare(`
    SELECT * FROM employees
    WHERE id = ? OR LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?) OR employee_number = ? OR LOWER(username) = LOWER(?)
  `).get(cleanIdent, cleanIdent, cleanIdent, cleanIdent, cleanIdent) as Record<string, unknown> | undefined;

  if (!row && cleanIdent.toLowerCase() === 'admin') {
    row = db.prepare(`SELECT * FROM employees WHERE role = 'ADMIN' LIMIT 1`).get() as Record<string, unknown> | undefined;
  }

  if (!row || !verifyPin(row.pin as string, cleanPin)) {
    loginFailed(throttleKey);
    return res.status(401).json({ error: 'Invalid username or PIN.' });
  }
  loginSucceeded(throttleKey);

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
  res.json({ message: 'PIN updated successfully' });
});

export default router;