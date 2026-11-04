import crypto from 'crypto';
import { Request, Response } from 'express';
import { db } from '../db/database';
import { hashPin, getAuth, loginThrottled, loginFailed, loginSucceeded } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { mailEnabled, sendPinResetEmail } from '../services/mailer';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const TEMP_PIN_HOURS = 72;
const LINK_MINUTES = 60;

// POST /api/employees/:id/reset-pin  (admin) -> a one-time temporary PIN the employee must change at next sign-in
export function hrResetPin(req: Request, res: Response) {
  const row = db.prepare(`SELECT id, name, role, registered, active FROM employees WHERE id = ?`).get(req.params.id as string) as
    { id: string; name: string; role: string; registered: number; active: number } | undefined;
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  if (row.role === 'ADMIN') return res.status(403).json({ error: 'Administrator PINs are not reset here.' });
  if (!row.registered) return res.status(400).json({ error: 'This employee has not created a profile yet, so there is no PIN to reset. They can use Create Profile.' });
  if (row.active === 0) return res.status(400).json({ error: 'This employee record is inactive.' });

  const pin = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + TEMP_PIN_HOURS * 3600000).toISOString();
  db.prepare(`UPDATE employees SET pin = ?, must_change_pin = 1, temp_pin_expires = ?, updated_at = datetime('now') WHERE id = ?`).run(hashPin(pin), expiresAt, row.id);
  db.prepare(`DELETE FROM pin_resets WHERE employee_id = ?`).run(row.id);
  logAudit(req, 'PIN_RESET_BY_HR', { targetType: 'employee', targetId: row.id, targetName: row.name, details: `Temporary PIN issued (valid ${TEMP_PIN_HOURS} hours)` });
  res.set('Cache-Control', 'no-store');
  res.json({ pin, expiresAt });
}

// PUT /api/auth/set-new-pin  { newPin }  (signed in with a temporary PIN; no old PIN needed)
export function setNewPin(req: Request, res: Response) {
  const a = getAuth(req)!;
  const newPin = str(req.body?.newPin, 64);
  if (newPin.length < 4) return res.status(400).json({ error: 'Choose a PIN of at least 4 characters.' });
  const row = db.prepare(`SELECT id, name, must_change_pin FROM employees WHERE id = ?`).get(a.id) as { id: string; name: string; must_change_pin: number } | undefined;
  if (!row) return res.status(404).json({ error: 'User not found' });
  if (!row.must_change_pin) return res.status(400).json({ error: 'Your PIN does not need to be reset. Use Change PIN instead.' });
  db.prepare(`UPDATE employees SET pin = ?, must_change_pin = 0, temp_pin_expires = NULL, updated_at = datetime('now') WHERE id = ?`).run(hashPin(newPin), row.id);
  logAudit(req, 'PIN_CHANGE', { targetType: 'employee', targetId: row.id, targetName: row.name, details: 'Replaced a temporary PIN' });
  res.json({ message: 'PIN updated successfully' });
}

// POST /api/auth/forgot-pin  { employeeNumber, email }  (public) -> emails a reset link if the details match
export function forgotPin(req: Request, res: Response) {
  const empNo = str(req.body?.employeeNumber, 40);
  const email = str(req.body?.email, 120).toLowerCase();
  if (!empNo || !email) return res.status(400).json({ error: 'Enter your employee number and email.' });
  const key = `forgot|${req.ip}`;
  if (loginThrottled(key)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
  loginFailed(key); // every request counts toward the limit

  const row = db.prepare(`SELECT id, name, email, registered, active FROM employees WHERE LOWER(employee_number) = LOWER(?) AND LOWER(email) = ? AND role != 'ADMIN'`).get(empNo, email) as
    { id: string; name: string; email: string; registered: number; active: number } | undefined;
  let sent = false;
  if (row && row.registered && row.active !== 0 && mailEnabled()) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(`DELETE FROM pin_resets WHERE employee_id = ? OR expires_at < ?`).run(row.id, new Date().toISOString());
    db.prepare(`INSERT INTO pin_resets (token_hash, employee_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .run(sha(token), row.id, new Date(Date.now() + LINK_MINUTES * 60000).toISOString(), new Date().toISOString());
    const base = (process.env.APP_URL || 'https://tarashub-2026.github.io/hollandia-hr/').trim();
    const link = `${base}${base.includes('?') ? '&' : '?'}reset=${token}`;
    sendPinResetEmail(row.email, row.name, link, LINK_MINUTES);
    sent = true;
  }
  logAudit(req, 'PIN_RESET_REQUEST', { details: `Forgot-PIN request for employee number ${empNo.slice(0, 40)}${row ? (sent ? ' (link sent)' : ' (matched, no link sent)') : ' (no match)'}` });
  // Same answer whether or not the details matched, so nobody can use this to find out who works here.
  res.json({ message: 'If those details match an account with an email on file, we sent a reset link. It works for 60 minutes. If nothing arrives, ask HR to reset your PIN.' });
}

// POST /api/auth/reset-pin  { token, newPin }  (public; the token comes from the emailed link)
export function resetPinWithToken(req: Request, res: Response) {
  const token = str(req.body?.token, 200);
  const newPin = str(req.body?.newPin, 64);
  if (newPin.length < 4) return res.status(400).json({ error: 'Choose a PIN of at least 4 characters.' });
  const key = `resetpin|${req.ip}`;
  if (loginThrottled(key)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });

  const rec = token ? db.prepare(`SELECT employee_id, expires_at FROM pin_resets WHERE token_hash = ?`).get(sha(token)) as { employee_id: string; expires_at: string } | undefined : undefined;
  if (!rec || rec.expires_at < new Date().toISOString()) {
    loginFailed(key);
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }
  const emp = db.prepare(`SELECT id, name FROM employees WHERE id = ?`).get(rec.employee_id) as { id: string; name: string } | undefined;
  if (!emp) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  db.prepare(`UPDATE employees SET pin = ?, must_change_pin = 0, temp_pin_expires = NULL, updated_at = datetime('now') WHERE id = ?`).run(hashPin(newPin), emp.id);
  db.prepare(`DELETE FROM pin_resets WHERE employee_id = ?`).run(emp.id);
  loginSucceeded(key);
  logAudit(req, 'PIN_RESET_EMAIL', { actor: { id: emp.id, name: emp.name, role: 'EMPLOYEE' }, targetType: 'employee', targetId: emp.id, targetName: emp.name, details: 'PIN reset with an emailed link' });
  res.json({ message: 'Your PIN was changed. You can sign in now.' });
}
