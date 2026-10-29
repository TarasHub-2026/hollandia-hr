import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { checkEligibility } from '../services/eligibility';
import { toISODate } from '../services/scheduling';
import type { Department, EligibilityResult } from '../types';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { importLeave } from './leaveImport';
import { normalizeDate } from './employees';
import { notifyLeaveSubmitted } from '../services/mailer';
import { notifyAdminsPush } from '../services/push';

const router = Router();

// Statutory leaves (sick, bereavement, etc.) skip the home-country travel rules.
// The frontend may also pass extraFlags (e.g. paid sick leave > 5 days) that red-flag the request.
function evaluate(employee: any, start: Date, end: Date, docs: any, body: Record<string, unknown>): EligibilityResult {
  const extra = Array.isArray(body.extraFlags) ? (body.extraFlags as string[]) : [];
  const base: EligibilityResult = body.statutory
    ? { eligible: true, status: 'APPROVED', failures: [], warnings: [], passes: [], adjustedEndDate: null }
    : checkEligibility(employee, start, end, docs);
  if (!extra.length) return base;
  return {
    ...base,
    eligible: false,
    status: 'DENIED',
    failures: [
      ...base.failures,
      ...extra.map(m => ({ rule: 'Leave Entitlement', passed: false, isWarning: false, message: m })),
    ],
  };
}

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
    decisionNote:    r.decision_note ?? null,
    decidedAt:       r.decided_at ?? null,
    decidedBy:       r.decided_by ?? null,
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
      const validDepts: Department[] = ['GREENHOUSE', 'WAREHOUSE', 'OFFICE', 'PACKING_WATER_BUCKET', 'SHIPPING', 'MAINTENANCE'];
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

// POST /api/leave-requests/import  (admin bulk upload of an existing leave list)
router.post('/import', requireAdmin, importLeave);

// GET /api/leave-requests/notifications?since=<iso>  (admin: new in-app submissions + pending count, for pop-ups)
router.get('/notifications', requireAdmin, (req: Request, res: Response) => {
  const since = typeof req.query.since === 'string' ? req.query.since : '';
  const now = new Date().toISOString();
  const pending = (db.prepare(`SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'PENDING'`).get() as { c: number }).c;
  const items = since && !isNaN(Date.parse(since))
    ? db.prepare(`
        SELECT target_id AS id, target_name AS name, details, ts FROM audit_log
        WHERE action = 'LEAVE_SUBMIT' AND ts > ? AND (actor_role IS NULL OR actor_role != 'ADMIN')
        ORDER BY ts ASC LIMIT 20
      `).all(since)
    : [];
  res.json({ now, pending, items });
});

// GET /api/leave-requests
router.get('/', requireAdmin, (req: Request, res: Response) => {
  logAudit(req, 'VIEW_ALL_REQUESTS', { dedupeMinutes: 10 });
  const rows = db.prepare(`
    SELECT lr.*, e.name AS employee_name, e.department
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    ORDER BY lr.queue_position ASC, lr.submitted_at ASC
  `).all() as Record<string, unknown>[];
  res.json(rows.map(mapRow));
});

// GET /api/leave-requests/:id
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  const row = getWithEmployee(req.params.id as string);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  const a = getAuth(req)!;
  if (a.role !== 'ADMIN' && (row as any).employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  res.json(mapRow(row));
});

// GET /api/leave-requests/employee/:employeeId
router.get('/employee/:employeeId', requireAuth, (req: Request, res: Response) => {
  const empId = req.params.employeeId as string;
  const a = getAuth(req)!;
  if (a.role !== 'ADMIN' && empId !== a.id) return res.status(403).json({ error: 'Not allowed' });
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
router.post('/preview', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role !== 'ADMIN') { req.body = { ...req.body, employeeId: a.id, employeeName: undefined }; }
  const parsed = parseAndValidate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const { employee, start, end, docs } = parsed as Exclude<typeof parsed, { error: string }>;
  const eligibility = evaluate(employee, start, end, docs, req.body as Record<string, unknown>);
  res.json({ eligibility });
});

// POST /api/leave-requests
router.post('/', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role !== 'ADMIN') { req.body = { ...req.body, employeeId: a.id, employeeName: undefined }; }
  const parsed = parseAndValidate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const { employee, start, end, docs } = parsed as Exclude<typeof parsed, { error: string }>;

  const eligibility = evaluate(employee, start, end, docs, req.body as Record<string, unknown>);

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
  logAudit(req, 'LEAVE_SUBMIT', { targetType: 'leave_request', targetId: id, targetName: (employee as { name?: string }).name, details: `${toISODate(start)} to ${finalEnd}${isFlagged ? ' (red-flagged)' : ''}` });
  const emp = employee as { name?: string; email?: string | null; department?: string };
  notifyLeaveSubmitted({
    employeeName: emp.name || 'An employee',
    employeeEmail: emp.email,
    department: emp.department || '',
    startDate: toISODate(start),
    endDate: finalEnd,
    purpose: fullPurpose,
    flagged: !!isFlagged,
    notes: eligibility.failures.map(f => f.message),
  }, a.role === 'ADMIN');
  if (a.role !== 'ADMIN') notifyAdminsPush('New leave application', `: ${toISODate(start)} to ${finalEnd}`);
  res.status(201).json({ request: mapRow(created!), eligibility });
});

// PUT /api/leave-requests/:id/status  (manual HR override)
router.put('/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status, note } = req.body as { status?: string; note?: unknown };
  if (!['APPROVED', 'DENIED', 'PENDING', 'CANCELLED'].includes(status ?? ''))
    return res.status(400).json({ error: "status must be 'APPROVED', 'DENIED', 'CANCELLED' or 'PENDING'" });

  const rid = req.params.id as string;
  const existing = db.prepare(`SELECT id, status FROM leave_requests WHERE id = ?`).get(rid) as { id: string; status: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });

  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const decided = status !== 'PENDING';
  const admin = getAuth(req)!;
  db.prepare(`UPDATE leave_requests SET status = ?, decision_note = ?, decided_at = ?, decided_by = ? WHERE id = ?`)
    .run(status, decided && cleanNote ? cleanNote : null, decided ? new Date().toISOString() : null, decided ? admin.id : null, rid);
  const updatedRow = getWithEmployee(rid)!;
  logAudit(req, 'STATUS_CHANGE', { targetType: 'leave_request', targetId: rid, targetName: (updatedRow as any).employee_name, details: `${existing.status} -> ${status}${decided && cleanNote ? ` | Note: ${cleanNote}` : ''}` });
  res.json(mapRow(updatedRow));
});

// PUT /api/leave-requests/:id/dates  (admin changes the leave dates; skips notice and block rules)
router.put('/:id/dates', requireAdmin, (req: Request, res: Response) => {
  const { startDate, endDate } = req.body as { startDate?: unknown; endDate?: unknown };
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return res.status(400).json({ error: 'Enter a valid start date and end date.' });
  if (end < start) return res.status(400).json({ error: 'The end date cannot be before the start date.' });

  const rid = req.params.id as string;
  const existing = db.prepare(`SELECT id, start_date, end_date FROM leave_requests WHERE id = ?`).get(rid) as { id: string; start_date: string; end_date: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });

  db.prepare(`UPDATE leave_requests SET start_date = ?, end_date = ?, adjusted_end_date = NULL WHERE id = ?`).run(start, end, rid);
  const updatedRow = getWithEmployee(rid)!;
  logAudit(req, 'LEAVE_DATES_CHANGE', { targetType: 'leave_request', targetId: rid, targetName: (updatedRow as any).employee_name, details: `${existing.start_date} to ${existing.end_date} -> ${start} to ${end}` });
  res.json(mapRow(updatedRow));
});

// DELETE /api/leave-requests/:id
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const rid = req.params.id as string;
  const existing = db.prepare(`SELECT id FROM leave_requests WHERE id = ?`).get(rid);
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });
  const gone = getWithEmployee(rid) as any;
  db.prepare(`DELETE FROM leave_requests WHERE id = ?`).run(rid);
  logAudit(req, 'LEAVE_DELETE', { targetType: 'leave_request', targetId: rid, targetName: gone?.employee_name, details: gone ? `${gone.start_date} to ${gone.end_date}` : undefined });
  res.json({ message: 'Leave request deleted' });
});

export default router;
