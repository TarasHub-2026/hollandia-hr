import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';

// ── Signing secret ───────────────────────────────────────────────────────────
// Prefer AUTH_SECRET from the environment. Otherwise generate one and persist it
// next to the database (the Railway volume) so sessions survive redeploys.
function loadSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) return process.env.AUTH_SECRET;
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'hr.db');
  const file = path.join(path.dirname(dbPath), '.auth_secret');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const s = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  } catch {
    console.warn('[security] Could not persist auth secret; using an ephemeral one. Set AUTH_SECRET.');
    return crypto.randomBytes(48).toString('hex');
  }
}
const SECRET = loadSecret();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (data: string) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function signToken(user: { id: string; role: string }): string {
  const body = b64u(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + TOKEN_TTL_MS }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): { id: string; role: string } | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = sign(body);
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { id: payload.id, role: payload.role };
  } catch {
    return null;
  }
}

// ── PIN hashing (scrypt, no extra dependencies) ──────────────────────────────
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function isHashed(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith('scrypt$');
}

export function verifyPin(stored: string | null | undefined, pin: string): boolean {
  if (!stored) return false;
  if (!isHashed(stored)) return stored === pin; // legacy plain-text (upgraded on startup/login)
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/** Hash any plain-text PINs and apply ADMIN_PIN from the environment, if set. */
export function secureStoredPins(): void {
  const rows = db.prepare(`SELECT id, role, pin FROM employees`).all() as { id: string; role: string; pin: string | null }[];
  const upd = db.prepare(`UPDATE employees SET pin = ? WHERE id = ?`);
  for (const r of rows) {
    if (!isHashed(r.pin)) upd.run(hashPin(r.pin || (r.role === 'ADMIN' ? '8888' : '1234')), r.id);
  }
  const adminPin = process.env.ADMIN_PIN;
  if (adminPin && adminPin.length >= 6) {
    db.prepare(`UPDATE employees SET pin = ? WHERE role = 'ADMIN'`).run(hashPin(adminPin));
  } else if (adminPin) {
    console.warn('[security] ADMIN_PIN ignored: use at least 6 characters.');
  }
}

// ── Express middleware ───────────────────────────────────────────────────────
export interface AuthInfo { id: string; role: 'ADMIN' | 'EMPLOYEE' }

export function getAuth(req: Request): AuthInfo | null {
  return (req as any).auth ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const decoded = verifyToken(h.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  // Role comes from the database, never from the token alone.
  const row = db.prepare(`SELECT id, role FROM employees WHERE id = ?`).get(decoded.id) as { id: string; role: string } | undefined;
  if (!row) return res.status(401).json({ error: 'Account no longer exists' });
  (req as any).auth = { id: row.id, role: row.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE' } as AuthInfo;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (getAuth(req)?.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required' });
    next();
  });
}

// ── Simple login rate limiter ────────────────────────────────────────────────
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginThrottled(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) return false;
  return a.count >= MAX_ATTEMPTS;
}
export function loginFailed(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else a.count++;
}
export function loginSucceeded(key: string) { attempts.delete(key); }
