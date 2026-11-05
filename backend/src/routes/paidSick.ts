import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { PAID_SICK_ANNUAL_DAYS, PAID_SICK_START_YEAR } from '../data/policy';
import { getPaidSickBalance } from '../services/paidSick';

const router = Router();

function yearParam(q: unknown): number {
  const n = parseInt(String(q ?? ''), 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  return Math.max(new Date().getFullYear(), PAID_SICK_START_YEAR);
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
        approved: b.approved, pending: b.pending, remaining: b.remaining, records: b.records,
      };
    }),
  });
});

export default router;
