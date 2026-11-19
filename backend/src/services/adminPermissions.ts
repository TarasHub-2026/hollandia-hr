import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { verifyToken } from '../middleware/security';

/**
 * Per-administrator access. Every administrator is "Full access" unless a restricted set of permissions is saved
 * for them. A restricted set gives each area of the app a level: none (hidden), view (read only) or edit.
 */
export const AREAS = ['leave', 'employees', 'loans', 'messages', 'audit', 'backups', 'adminAccess'] as const;
export type Area = typeof AREAS[number];
export type Level = 'none' | 'view' | 'edit';
export type Permissions = Record<Area, Level>;

export const AREA_LABELS: Record<Area, string> = {
  leave: 'Leave requests, summary and dashboard',
  employees: 'Employees roster',
  loans: 'Loan applications',
  messages: 'Announcements and messages',
  audit: 'Audit log',
  backups: 'Data and backups',
  adminAccess: 'Admin access',
};

const all = (level: Level): Permissions => Object.fromEntries(AREAS.map(a => [a, level])) as Permissions;
export const FULL_ACCESS: Permissions = all('edit');
export const VIEW_ONLY: Permissions = all('view');

const LEVELS: Level[] = ['none', 'view', 'edit'];

/** Reads a saved set of permissions. Anything missing or unreadable falls back to view only, never to edit. */
export function parsePermissions(raw: string | null | undefined): Permissions | null {
  if (!raw) return null; // no restriction saved: full access
  try {
    const o = JSON.parse(raw) as Partial<Record<Area, Level>>;
    return Object.fromEntries(AREAS.map(a => [a, LEVELS.includes(o[a] as Level) ? o[a] : 'view'])) as Permissions;
  } catch {
    return { ...VIEW_ONLY };
  }
}

/** The permissions in force for an administrator row (full access when none are saved). */
export function resolvePermissions(raw: string | null | undefined): Permissions {
  return parsePermissions(raw) ?? { ...FULL_ACCESS };
}

/** Checks a set of permissions sent by the client and returns a clean copy, or an error message. */
export function validatePermissions(input: unknown): Permissions | string {
  if (!input || typeof input !== 'object') return 'Permissions are required.';
  const o = input as Record<string, unknown>;
  const out = {} as Permissions;
  for (const a of AREAS) {
    const v = o[a];
    if (!LEVELS.includes(v as Level)) return `Choose none, view or edit for "${AREA_LABELS[a]}".`;
    out[a] = v as Level;
  }
  return out;
}

export const isFull = (p: Permissions) => AREAS.every(a => p[a] === 'edit');

/** Which area of the app a request belongs to (path as seen after /api). Null = open to every signed-in user. */
export function areaOf(path: string): Area | null {
  const p = path.split('?')[0].toLowerCase();
  if (p.startsWith('/leave-requests') || p.startsWith('/paid-sick')) return 'leave';
  if (p.startsWith('/employees')) return 'employees';
  if (p.startsWith('/loans')) return 'loans';
  if (p.startsWith('/comms')) return 'messages';
  if (p.startsWith('/audit')) return 'audit';
  if (p.startsWith('/export')) return 'backups';
  if (p.startsWith('/auth/admin-access')) return 'adminAccess';
  return null; // sign-in, own PIN and profile, push alerts
}

// Actions that change nothing about the company's data, so a view-only administrator may still use them.
const HARMLESS_WRITES: RegExp[] = [
  /^\/leave-requests\/preview$/i,                // a dry run of the policy check, nothing is saved
  /^\/leave-requests\/my-notices\/read$/i,       // marking your own notices as read
  /^\/comms\/announcements\/[^/]+\/ack$/i,       // acknowledging an announcement
];

const isRead = (method: string) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

/** What level a request needs: reading needs view, anything that changes data needs edit. */
export function levelNeeded(method: string, path: string): Level | null {
  const p = path.split('?')[0];
  // A full copy of the database includes everyone's stored PIN hashes, so it always needs edit on Data and backups.
  if (/^\/export\/database/i.test(p)) return 'edit';
  if (isRead(method)) return 'view';
  if (HARMLESS_WRITES.some(re => re.test(p))) return null;
  return 'edit';
}

/** The decision for one request, kept free of Express and the database so it can be tested on its own. */
export function decide(perms: Permissions | null, method: string, path: string): { ok: true } | { ok: false; area: Area; needed: Level } {
  if (!perms) return { ok: true };
  const area = areaOf(path);
  if (!area) return { ok: true };
  const needed = levelNeeded(method, path);
  if (!needed) return { ok: true };
  const have = perms[area];
  const rank: Record<Level, number> = { none: 0, view: 1, edit: 2 };
  return rank[have] >= rank[needed] ? { ok: true } : { ok: false, area, needed };
}

/**
 * Mounted once for all /api routes. If the signed-in user is an administrator with restricted access, the request is
 * checked against their permissions before any route runs. Everyone else passes straight through to the route's own checks.
 */
export function enforceAdminPermissions(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return next();
  const decoded = verifyToken(h.slice(7));
  if (!decoded) return next();
  const row = db.prepare(`SELECT role, admin_permissions FROM employees WHERE id = ?`).get(decoded.id) as { role: string; admin_permissions: string | null } | undefined;
  if (!row || row.role !== 'ADMIN') return next();
  const perms = parsePermissions(row.admin_permissions);
  const d = decide(perms, req.method, req.path);
  if (d.ok) return next();
  const what = d.needed === 'view' ? 'see' : 'change';
  return res.status(403).json({ error: `Your administrator access does not let you ${what} ${AREA_LABELS[d.area].toLowerCase()}. Ask the main administrator to update your access.` });
}
