import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { PAID_SICK_ANNUAL_DAYS, PAID_SICK_START_YEAR } from '../data/policy';
import { getPaidSickBalance, addAdjustment, removeAdjustment, leaveYear, leaveDayCount } from '../services/paidSick';
import { notifyEmployeeInApp } from '../services/employeeNotify';

const router = Router();

function yearParam(q: unknown): number {
  const n = parseInt(String(q ?? ''), 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  return Math.max(new Date().getFullYear(), PAID_SICK_START_YEAR);
}
const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const adminWho = (req: Request) => {
  const id = getAuth(req)!.id;
  return { id, name: (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(id) as { name?: string } | undefined)?.name || 'HR' };
};
const plural = (n: number) => `${n} day${Math.abs(n) === 1 ? '' : 's'}`;

/** Tells the employee their paid sick balance changed, under My Leave. */
function tellEmployee(employeeId: string, year: number, what: string) {
  const b = getPaidSickBalance(employeeId, year);
  notifyEmployeeInApp(employeeId, 'PAID_SICK_UPDATED', `Paid sick leave ${year} updated`, `${what} You have ${plural(b.remaining)} of paid sick leave left for ${year}.`);
}

// GET /api/paid-sick/employee/:id?year=2027  (an employee sees their own balance; HR sees anyone's)
router.get('/employee/:id', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  if (a.role !== 'ADMIN' && id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  const exists = db.prepare(`SELECT 1 FROM employees WHERE id = ?`).get(id);
  if (!exists) return res.status(404).json({ error: 'Employee not found' });
  res.json({ ...getPaidSickBalance(id, yearParam(req.query.year)), startYear: PAID_SICK_START_YEAR });
});

// GET /api/paid-sick?year=2027  (HR: every active employee's balance for the year)
router.get('/', requireAdmin, (req: Request, res: Response) => {
  const year = yearParam(req.query.year);
  const emps = db.prepare(`
    SELECT id, name, employee_number, department FROM employees
    WHERE role != 'ADMIN' AND (active IS NULL OR active = 1)
    ORDER BY name COLLATE NOCASE
  `).all() as { id: string; name: string; employee_number: string | null; department: string }[];
  res.json({
    year,
    entitlement: PAID_SICK_ANNUAL_DAYS,
    startYear: PAID_SICK_START_YEAR,
    tracked: year >= PAID_SICK_START_YEAR,
    employees: emps.map(e => {
      const b = getPaidSickBalance(e.id, year);
      return {
        id: e.id, name: e.name, employeeNumber: e.employee_number || '', department: e.department,
        approved: b.approved, pending: b.pending, adjusted: b.adjusted, remaining: b.remaining, records: b.records, adjustments: b.adjustments,
      };
    }),
  });
});

// POST /api/paid-sick/employee/:id/adjustments  { takenOn, days, note }
//   HR records paid sick days taken outside the app (positive days) or gives days back (negative days), like posting a loan deduction.
router.post('/employee/:id/adjustments', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const emp = db.prepare(`SELECT id, name, role FROM employees WHERE id = ?`).get(id) as { id: string; name: string; role: string } | undefined;
  if (!emp || emp.role === 'ADMIN') return res.status(404).json({ error: 'Employee not found' });
  const b = (req.body || {}) as Record<string, unknown>;
  if (!isIso(b.takenOn)) return res.status(400).json({ error: 'Enter the date.' });
  const year = leaveYear(b.takenOn);
  if (year < PAID_SICK_START_YEAR) return res.status(400).json({ error: `Paid sick leave is tracked from January 1, ${PAID_SICK_START_YEAR}. Choose a date in ${PAID_SICK_START_YEAR} or later.` });
  const days = Number(b.days);
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > PAID_SICK_ANNUAL_DAYS)
    return res.status(400).json({ error: `Enter whole days from 1 to ${PAID_SICK_ANNUAL_DAYS} (days taken), or -1 to -${PAID_SICK_ANNUAL_DAYS} to give days back.` });
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
  const before = getPaidSickBalance(id, year);
  if (days < 0 && before.approved + before.pending + before.adjusted + days < 0)
    return res.status(400).json({ error: `Only ${plural(before.approved + before.pending + before.adjusted)} have been used in ${year}, so that many cannot be given back.` });
  const who = adminWho(req);
  const added = addAdjustment(id, b.takenOn, days, note, who);
  logAudit(req, 'PAID_SICK_ADJUST', { targetType: 'employee', targetId: id, targetName: emp.name,
    details: `${days > 0 ? `${plural(days)} recorded as taken` : `${plural(-days)} given back`} on ${b.takenOn}${note ? ` | ${note}` : ''}` });
  tellEmployee(id, year, days > 0 ? `HR recorded ${plural(days)} of paid sick leave taken on ${b.takenOn}${note ? ` (${note})` : ''}.` : `HR gave back ${plural(-days)} of paid sick leave${note ? ` (${note})` : ''}.`);
  const after = getPaidSickBalance(id, year);
  res.status(201).json({ adjustment: added, balance: after, overLimit: PAID_SICK_ANNUAL_DAYS - after.approved - after.pending - after.adjusted < 0 });
});

// DELETE /api/paid-sick/adjustments/:aid  (HR removes an adjustment made by mistake)
router.delete('/adjustments/:aid', requireAdmin, (req: Request, res: Response) => {
  const gone = removeAdjustment(req.params.aid as string);
  if (!gone) return res.status(404).json({ error: 'That entry was not found.' });
  const name = (db.prepare(`SELECT name FROM employees WHERE id = ?`).get(gone.employeeId) as { name?: string } | undefined)?.name || '';
  logAudit(req, 'PAID_SICK_ADJUST_DELETE', { targetType: 'employee', targetId: gone.employeeId, targetName: name, details: `Removed the ${plural(gone.days)} entry dated ${gone.takenOn}` });
  tellEmployee(gone.employeeId, gone.year, `HR removed a paid sick leave entry dated ${gone.takenOn}.`);
  res.json({ balance: getPaidSickBalance(gone.employeeId, gone.year) });
});

// PUT /api/paid-sick/requests/:rid  { days }
//   HR changes how many days of a leave request count as paid sick leave (like changing a loan's amortization). 0 = none.
router.put('/requests/:rid', requireAdmin, (req: Request, res: Response) => {
  const rid = req.params.rid as string;
  const r = db.prepare(`SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.paid_sick_days, lr.status, e.name FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = ?`).get(rid) as
    { id: string; employee_id: string; start_date: string; end_date: string; paid_sick_days: number | null; status: string; name: string } | undefined;
  if (!r) return res.status(404).json({ error: 'Leave request not found.' });
  const days = Number((req.body || {}).days);
  const span = leaveDayCount(r.start_date, r.end_date);
  if (!Number.isInteger(days) || days < 0) return res.status(400).json({ error: 'Enter a whole number of days (0 or more).' });
  if (days > span) return res.status(400).json({ error: `This leave is ${plural(span)} long, so no more than ${plural(span)} can be paid sick leave.` });
  const year = leaveYear(r.start_date);
  const before = r.paid_sick_days ?? 0;
  db.prepare(`UPDATE leave_requests SET paid_sick_days = ? WHERE id = ?`).run(days > 0 ? days : null, rid);
  logAudit(req, 'PAID_SICK_REQUEST_DAYS', { targetType: 'leave_request', targetId: rid, targetName: r.name, details: `Paid sick days on the leave from ${r.start_date.slice(0, 10)} changed from ${before} to ${days}` });
  if (year >= PAID_SICK_START_YEAR && before !== days) tellEmployee(r.employee_id, year, `HR changed the paid sick days on your leave starting ${r.start_date.slice(0, 10)} from ${before} to ${days}.`);
  res.json({ balance: getPaidSickBalance(r.employee_id, year) });
});

export default router;
