import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db } from '../db/database';
import { requireAdmin } from '../middleware/security';
import { logAudit } from '../middleware/audit';

const router = Router();
router.use(requireAdmin);

// CSV with UTF-8 BOM so Excel opens accents correctly. Guards against spreadsheet formula injection.
function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [columns.map(esc).join(',')];
  for (const r of rows) lines.push(columns.map(c => esc(r[c])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

const stamp = () => new Date().toISOString().slice(0, 10);

function sendCsv(res: Response, name: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp()}.csv"`);
  res.send(csv);
}

// GET /api/export/employees.csv  (PIN hashes are never exported)
router.get('/employees.csv', (req: Request, res: Response) => {
  const cols = ['id', 'name', 'first_name', 'last_name', 'employee_number', 'username', 'email', 'department', 'hire_date',
    'immigration_status', 'passport_expiry', 'work_permit_expiry', 'loan_original', 'loan_remaining', 'role', 'created_at', 'updated_at'];
  const rows = db.prepare(`SELECT ${cols.join(', ')} FROM employees ORDER BY name`).all() as Record<string, unknown>[];
  logAudit(req, 'EXPORT_DATA', { details: `Employees CSV (${rows.length} rows)` });
  sendCsv(res, 'employees', toCsv(rows, cols));
});

// GET /api/export/leave-requests.csv
router.get('/leave-requests.csv', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.employee_number, e.department
    FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id
    ORDER BY lr.submitted_at DESC
  `).all() as Record<string, unknown>[];
  const cols = ['id', 'employee_name', 'employee_number', 'department', 'start_date', 'end_date', 'adjusted_end_date', 'status',
    'is_flagged', 'purpose', 'denial_reasons', 'warnings', 'passport_expiry', 'work_permit_expiry', 'contract_expiry', 'submitted_at'];
  logAudit(req, 'EXPORT_DATA', { details: `Leave requests CSV (${rows.length} rows)` });
  sendCsv(res, 'leave-requests', toCsv(rows, cols));
});

// GET /api/export/audit-log.csv
router.get('/audit-log.csv', (req: Request, res: Response) => {
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY ts DESC`).all() as Record<string, unknown>[];
  const cols = ['ts', 'actor_name', 'actor_role', 'action', 'target_type', 'target_name', 'details', 'ip', 'id', 'actor_id', 'target_id'];
  logAudit(req, 'EXPORT_DATA', { details: `Audit log CSV (${rows.length} rows)` });
  sendCsv(res, 'audit-log', toCsv(rows, cols));
});

// GET /api/export/database  - consistent snapshot of the whole SQLite database
router.get('/database', async (req: Request, res: Response) => {
  const tmp = path.join(os.tmpdir(), `hollandia-backup-${Date.now()}.db`);
  try {
    await db.backup(tmp);
    // Note: a full snapshot includes hashed PINs so the app can be restored exactly; store it securely.
    logAudit(req, 'EXPORT_DATA', { details: 'Full database snapshot' });
    res.download(tmp, `hollandia-hr-backup-${stamp()}.db`, () => fs.unlink(tmp, () => undefined));
  } catch (e) {
    fs.unlink(tmp, () => undefined);
    console.error('[export] backup failed', e);
    res.status(500).json({ error: 'Backup failed' });
  }
});

export default router;
