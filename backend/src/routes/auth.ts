import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import type { AuthUser, LoginPayload } from '../types';

const router = Router();

function mapAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id:            row.id as string,
    name:          row.name as string,
    department:    row.department as any,
    hireDate:      row.hire_date as string,
    role:          (row.role as any) || 'EMPLOYEE',
    email:         (row.email as string) || undefined,
    loanOriginal:  (row.loan_original as number) || 0,
    loanRemaining: (row.loan_remaining as number) || 0,
  };
}

function createToken(user: AuthUser): string {
  const payload = {
    id: user.id,
    role: user.role,
    name: user.name,
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function decodeToken(token: string): { id: string; role: string } | null {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { identifier, pin } = req.body as LoginPayload;

  if (!identifier || !pin) {
    return res.status(400).json({ error: 'Please enter your Employee ID / Name and PIN' });
  }

  const cleanIdent = identifier.trim();
  const cleanPin = pin.trim();

  // Find employee by ID, exact name, or role
  let row = db.prepare(`
    SELECT * FROM employees 
    WHERE id = ? OR LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?)
  `).get(cleanIdent, cleanIdent, cleanIdent) as Record<string, unknown> | undefined;

  // Handle "admin" alias
  if (!row && cleanIdent.toLowerCase() === 'admin') {
    row = db.prepare(`SELECT * FROM employees WHERE role = 'ADMIN' LIMIT 1`).get() as Record<string, unknown> | undefined;
  }

  if (!row) {
    return res.status(401).json({ error: 'Account not found. Check your name or Employee ID.' });
  }

  const expectedPin = (row.pin as string) || (row.role === 'ADMIN' ? '8888' : '1234');
  if (cleanPin !== expectedPin) {
    return res.status(401).json({ error: 'Incorrect PIN. Default employee PIN is 1234.' });
  }

  const user = mapAuthUser(row);
  const token = createToken(user);

  res.json({ user, token });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = authHeader.slice(7);
  const decoded = decodeToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(decoded.id) as Record<string, unknown> | undefined;
  if (!row) {
    return res.status(404).json({ error: 'User no longer exists' });
  }

  res.json({ user: mapAuthUser(row) });
});

// PUT /api/auth/change-pin
router.put('/change-pin', (req: Request, res: Response) => {
  const { employeeId, oldPin, newPin } = req.body as { employeeId: string; oldPin: string; newPin: string };

  if (!employeeId || !oldPin || !newPin) {
    return res.status(400).json({ error: 'employeeId, oldPin, and newPin are required' });
  }

  if (newPin.trim().length < 4) {
    return res.status(400).json({ error: 'New PIN must be at least 4 digits' });
  }

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Employee not found' });

  const currentPin = (row.pin as string) || (row.role === 'ADMIN' ? '8888' : '1234');
  if (oldPin.trim() !== currentPin) {
    return res.status(401).json({ error: 'Current PIN is incorrect' });
  }

  db.prepare(`UPDATE employees SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(newPin.trim(), employeeId);

  res.json({ message: 'PIN updated successfully' });
});

export default router;