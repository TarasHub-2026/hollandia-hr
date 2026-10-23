import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { normalizeDate, normalizeDept } from './employees';

type Row = Record<string, string>;
type Status = 'APPROVED' | 'PENDING' | 'DENIED';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Parses a date; if the cell has no year (e.g. "Jun 3" or "6/3") the Year column is used. */
function parseDate(raw: string, year: string): string | null {
  const v = s(raw);
  if (!v) return null;
  const direct = normalizeDate(v);
  if (direct) return direct;
  if (!/^\d{4}$/.test(year)) return null;
  let m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})$/.exec(v);
  if (m) return normalizeDate(`${m[1]} ${m[2]}, ${year}`);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*$/.exec(v);
  if (m && MONTHS.includes(m[2].toLowerCase())) return normalizeDate(`${m[1]} ${m[2]} ${year}`);
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(v);
  if (m) return normalizeDate(`${m[1]}/${m[2]}/${year}`);
  return null;
}

function parseStatus(v: string): Status | null | '' {
  const k = s(v).toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  if (['approved', 'approve', 'granted', 'accepted', 'yes', 'ok'].includes(k)) return 'APPROVED';
  if (['pending', 'pendingapproval', 'awaitingapproval', 'waiting', 'submitted', 'review', 'inreview', 'new'].includes(k)) return 'PENDING';
  if (['denied', 'deny', 'declined', 'rejected', 'refused', 'no', 'cancelled', 'canceled', 'cancel', 'withdrawn'].includes(k)) return 'DENIED';
  return null;
}

const nameKey = (v: string) => s(v).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const numKey = (v: string) => s(v).replace(/^0+(?=\d)/, '').toLowerCase();

interface Emp { id: string; name: string; employee_number: string | null; first_name: string | null; last_name: string | null; department: string }

// POST /api/leave-requests/import  { rows, dryRun?, defaultStatus? }
export function importLeave(req: Request, res: Response) {
  const { rows, dryRun, defaultStatus } = req.body as { rows?: Row[]; dryRun?: boolean; defaultStatus?: string };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
  if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (limit 5000).' });
  const fallback: Status = (parseStatus(defaultStatus || 'APPROVED') as Status) || 'APPROVED';

  const emps = db.prepare(`SELECT id, name, employee_number, first_name, last_name, department FROM employees WHERE role != 'ADMIN'`).all() as unknown as Emp[];
  const byNum = new Map<string, Emp>();
  const byName = new Map<string, Emp[]>();
  for (const e of emps) {
    if (e.employee_number) byNum.set(numKey(e.employee_number), e);
    for (const k of new Set([nameKey(e.name), nameKey(`${e.first_name || ''} ${e.last_name || ''}`)])) {
      if (!k) continue;
      byName.set(k, [...(byName.get(k) || []), e]);
    }
  }

  const existingEntries = new Set((db.prepare(`SELECT cognito_entry_number n FROM leave_requests WHERE cognito_entry_number IS NOT NULL`).all() as { n: number }[]).map(r => r.n));
  const existingKeys = new Set((db.prepare(`SELECT employee_id, start_date, end_date FROM leave_requests`).all() as { employee_id: string; start_date: string; end_date: string }[]).map(r => `${r.employee_id}|${r.start_date}|${r.end_date}`));

  const errors: { row: number; message: string }[] = [];
  const skipped: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  const toInsert: { emp: Emp; start: string; end: string; status: Status; purpose: string; entry: number | null; cancelled: boolean }[] = [];
  const seenEntries = new Set<number>();
  const seenKeys = new Set<string>();

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const err = (message: string) => { errors.push({ row: rowNo, message }); };
    const num = s(r.employeeNumber);
    const nm = s(r.employeeName);
    if (!num && !nm && !s(r.startDate) && !s(r.endDate)) return; // empty line

    let emp: Emp | undefined = num ? byNum.get(numKey(num)) : undefined;
    if (!emp && nm) {
      const hits = byName.get(nameKey(nm)) || [];
      if (hits.length === 1) emp = hits[0];
      else if (hits.length > 1) return err(`"${nm}" matches more than one employee. Add the employee number.`);
    }
    if (!emp) return err(`Employee not found${num ? ` (number ${num})` : ''}${nm ? ` (${nm})` : ''}. Add them to the roster first.`);

    const year = s(r.year);
    const start = parseDate(r.startDate, year);
    const end = parseDate(r.endDate || r.startDate, year);
    if (!start) return err(`Start date "${s(r.startDate)}" isn't a valid date.`);
    if (!end) return err(`End date "${s(r.endDate)}" isn't a valid date.`);
    if (start > end) return err('Start date is after the end date.');

    const st = parseStatus(r.status);
    if (st === null) return err(`Status "${s(r.status)}" isn't recognised. Use Approved, Pending or Denied.`);
    const status: Status = st || fallback;

    const entryRaw = s(r.entryNumber);
    const entry = /^\d+$/.test(entryRaw) ? parseInt(entryRaw, 10) : null;

    const key = `${emp.id}|${start}|${end}`;
    if (entry !== null && (existingEntries.has(entry) || seenEntries.has(entry))) { skipped.push({ row: rowNo, message: `Entry #${entry} is already in the app.` }); return; }
    if (existingKeys.has(key) || seenKeys.has(key)) { skipped.push({ row: rowNo, message: `${emp.name} already has leave on ${start} to ${end}.` }); return; }

    const fileDept = s(r.department) ? normalizeDept(r.department) : null;
    if (fileDept && fileDept !== emp.department) warnings.push({ row: rowNo, message: `${emp.name}: the file says ${s(r.department)}, but the roster says ${emp.department.replace(/_/g, ' ')}. The roster department is used.` });

    const type = s(r.leaveType).slice(0, 120);
    const note = s(r.note).slice(0, 400);
    const purpose = type ? `[${type}] ${note}`.trim() : note;

    if (entry !== null) seenEntries.add(entry);
    seenKeys.add(key);
    const cancelled = /cancel|withdraw/i.test(s(r.status));
    toInsert.push({ emp, start, end, status, purpose, entry, cancelled });
  });

  const counts = { APPROVED: 0, PENDING: 0, DENIED: 0 } as Record<Status, number>;
  toInsert.forEach(t => { counts[t.status]++; });
  const summary = { toAdd: toInsert.length, byStatus: counts, skipped, errors, warnings, total: rows.length };

  if (dryRun) return res.json({ dryRun: true, ...summary });
  if (errors.length) return res.status(400).json({ error: 'Fix the rows with errors first. Nothing was imported.', ...summary });

  const admin = getAuth(req)!;
  const now = new Date().toISOString();
  const maxQ = (db.prepare(`SELECT MAX(queue_position) AS m FROM leave_requests`).get() as { m: number | null }).m ?? 0;
  const ins = db.prepare(`
    INSERT INTO leave_requests (id, employee_id, start_date, end_date, purpose, submitted_at, status, denial_reasons, warnings, queue_position, is_flagged, cognito_entry_number, decided_at, decided_by, decision_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, 0, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    toInsert.forEach((t, i) => {
      const decided = t.status !== 'PENDING';
      ins.run(uuidv4(), t.emp.id, t.start, t.end, t.purpose, now, t.status, maxQ + i + 1, t.entry, decided ? now : null, decided ? admin.id : null, decided ? (t.cancelled ? 'Cancelled (imported from existing leave list)' : 'Imported from existing leave list') : null);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  logAudit(req, 'LEAVE_IMPORT', { details: `Imported leave list: ${toInsert.length} added (${counts.APPROVED} approved, ${counts.PENDING} pending, ${counts.DENIED} denied), ${skipped.length} skipped` });
  res.json({ dryRun: false, ...summary });
}
