import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { checkEligibility } from '../services/eligibility';
import { toISODate } from '../services/scheduling';
import type { Department } from '../types';

const router = Router();

function mapRow(r: Record<string, unknown>) {
  return {
    id:              r.id,
    employeeId:      r.employee_id,
    employeeName:    r.employee_name,
    department:      r.department,
    startDate:       r.start_date,
    endDate:         r.end_date,
    purpose:         r.purpose,
    passportExpiry:  r.passport_expiry,
    workPermitExpiry:r.work_permit_expiry,
    contractExpiry:  r.contract_expiry,
    submittedAt:     r.submitted_at,
    status:          r.status,
    denialReasons:   JSON.parse((r.denial_reasons as string) || '[]'),
    warnings:        JSON.parse((r.warnings       as string) || '[]'),
    adjustedEndDate: r.adjusted_end_date,
    queuePosition:   r.queue_position,
    isFlagged:       Boolean(r.is_flagged || JSON.parse((r.denial_reasons as string) || '[]').length > 0),
  };
}

function getWithEmployee(id: string) {
  return db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.department
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    WHERE lr.id = ?
  `).get(id) as Record<string, unknown> | undefined;
}

function parseAndValidate(body: Record<string, unknown>) {
  const { employeeId, employeeName, department, startDate, endDate, passportExpiry, workPermitExpiry, contractExpiry } = body;

  if ((!employeeId && !employeeName) || !startDate || !endDate)
    return { error: 'Employee (ID or Name), startDate, and endDate are required' };

  let employee: Record<string, unknown> | undefined;

  if (employeeId) {
    employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId as string) as Record<string, unknown> | undefined;
  } else if (employeeName) {
    const trimmedName = (employeeName as string).trim();
    employee = db.prepare(`SELECT * FROM employees WHERE LOWER(name) = LOWER(?)`).get(trimmedName) as Record<string, unknown> | undefined;

    if (!employee) {
      // Auto-create employee record if department is provided
      const validDepts: Department[] = ['GREENHOUSE', 'WAREHOUSE', 'OFFICE', 'PACKING_WATER_BUCKET', 'LOGISTICS'];
      const dept = (department as Department) || 'GREENHOUSE';
      if (!validDepts.includes(dept)) {
        return { error: `Invalid department: ${department}. Must be one of ${validDepts.join(', ')}` };
      }
      const newEmpId = uuidv4();
      const now = new Date().toISOString();
      const hireDate = (body.hireDate as string) || toISODate(new Date());
      db.prepare(`
        INSERT INTO employees (id, name, department, hire_date, loan_original, loan_remaining, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `).run(newEmpId, trimmedName, dept, hireDate, now, now);
      employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(newEmpId) as Record<string, unknown>;
    }
  }

  if (!employee) return { error: 'Employee not found' };

  const start = new Date(startDate as string);
  const end   = new Date(endDate   as string);

  if (isNaN(start.getTime()) || isNaN(end.getTime()))
    return { error: 'Invalid date format. Use YYYY-MM-DD.' };
  if (start > end)
    return { error: 'startDate must be on or before endDate' };

  const docs = {
    passportExpiry:   passportExpiry   ? new Date(passportExpiry   as string) : null,
    workPermitExpiry: workPermitExpiry ? new Date(workPermitExpiry as string) : null,
    contractExpiry:   contractExpiry   ? new Date(contractExpiry   as string) : null,
  };

  return { employee, start, end, docs };
}

// GET /api/leave-requests
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.department
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    ORDER BY lr.queue_position ASC, lr.submitted_at ASC
  `).all() as Record<string, unknown>[];
  res.json(rows.map(mapRow));
});

// GET /api/leave-requests/:id
router.get('/:id', (req: Request, res: Response) => {
  const row = getWithEmployee(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  res.json(mapRow(row));
});

// GET /api/leave-requests/employee/:employeeId
router.get('/employee/:employeeId', (req: Request, res: Response) => {
  const empId = req.params.employeeId as string;
  const rows = db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.department
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    WHERE lr.employee_id = ?
    ORDER BY lr.submitted_at DESC
  `).all(empId) as Record<string, unknown>[];
  res.json(rows.map(mapRow));
});

// POST /api/leave-requests/preview  (dry-run — no DB write)
router.post('/preview', (req: Request, res: Response) => {
  const parsed = parseAndValidate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const { employee, start, end, docs } = parsed as Exclude<typeof parsed, { error: string }>;
  const eligibility = checkEligibility(employee as any, start, end, docs);
  res.json({ eligibility });
});

// POST /api/leave-requests
router.post('/', (req: Request, res: Response) => {
  const parsed = parseAndValidate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const { employee, start, end, docs } = parsed as Exclude<typeof parsed, { error: string }>;

  const eligibility = checkEligibility(employee as any, start, end, docs);

  const id  = uuidv4();
  const now = new Date().toISOString();

  const { max } = db.prepare(`SELECT MAX(queue_position) AS max FROM leave_requests`).get() as { max: number | null };
  const queuePosition = (max ?? 0) + 1;

  // Use adjusted end date if provided (blackout trim)
  const finalEnd = eligibility.adjustedEndDate || toISODate(end);
  const body = req.body as Record<string, unknown>;
  const resolvedEmployeeId = (employee as { id: string }).id;

  let fullPurpose = (body.purpose as string) || '';
  if (body.category && !fullPurpose.includes(String(body.category))) {
    fullPurpose = `[${body.category}] ${fullPurpose}`.trim();
  }
  if (body.destination && !fullPurpose.includes(String(body.destination))) {
    fullPurpose = `${fullPurpose} (Dest: ${body.destination})`.trim();
  }
  if (body.emergencyContactName && !fullPurpose.includes(String(body.emergencyContactName))) {
    fullPurpose = `${fullPurpose} | Emergency: ${body.emergencyContactName} (${body.emergencyContactPhone || 'N/A'})`.trim();
  }

  const isFlagged = eligibility.failures.length > 0 ? 1 : 0;
  const initialStatus = 'PENDING';

  db.prepare(`
    INSERT INTO leave_requests (
      id, employee_id, start_date, end_date, purpose,
      passport_expiry, work_permit_expiry, contract_expiry,
      submitted_at, status, denial_reasons, warnings, adjusted_end_date, queue_position, is_flagged
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    resolvedEmployeeId,
    toISODate(start),
    finalEnd,
    fullPurpose,
    body.passportExpiry   || null,
    body.workPermitExpiry || null,
    body.contractExpiry   || null,
    now,
    initialStatus,
    JSON.stringify(eligibility.failures.map(f => f.message)),
    JSON.stringify(eligibility.warnings.map(w => w.message)),
    eligibility.adjustedEndDate || null,
    queuePosition,
    isFlagged
  );

  const created = getWithEmployee(id);
  res.status(201).json({ request: mapRow(created!), eligibility });
});

// PUT /api/leave-requests/:id/status  (manual HR override)
router.put('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!['APPROVED', 'DENIED', 'PENDING'].includes(status ?? ''))
    return res.status(400).json({ error: "status must be 'APPROVED', 'DENIED', or 'PENDING'" });

  const rid = req.params.id as string;
  const existing = db.prepare(`SELECT id FROM leave_requests WHERE id = ?`).get(rid);
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });

  db.prepare(`UPDATE leave_requests SET status = ? WHERE id = ?`).run(status, rid);
  res.json(mapRow(getWithEmployee(rid)!));
});

// DELETE /api/leave-requests/:id
router.delete('/:id', (req: Request, res: Response) => {
  const rid = req.params.id as string;
  const existing = db.prepare(`SELECT id FROM leave_requests WHERE id = ?`).get(rid);
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });
  db.prepare(`DELETE FROM leave_requests WHERE id = ?`).run(rid);
  res.json({ message: 'Leave request deleted' });
});

export default router;
