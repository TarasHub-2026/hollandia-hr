import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { checkEligibility } from '../services/eligibility';
import { toISODate } from '../services/scheduling';
import type { Department } from '../types';

const router = Router();

// Store last raw payload for debugging via GET /last-payload
let lastPayload: unknown = null;

// Department label -> enum
const DEPT_MAP: Record<string, Department> = {
  'greenhouse':             'GREENHOUSE',
  'warehouse':              'WAREHOUSE',
  'office':                 'OFFICE',
  'packing':                'PACKING_WATER_BUCKET',
  'packing & water':        'PACKING_WATER_BUCKET',
  'packing & water bucket': 'PACKING_WATER_BUCKET',
  'packing water':          'PACKING_WATER_BUCKET',
  'packing_water_bucket':   'PACKING_WATER_BUCKET',
  'logistics':              'LOGISTICS',
};

function mapDepartment(raw: string | undefined): Department | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (DEPT_MAP[key]) return DEPT_MAP[key];
  for (const [k, v] of Object.entries(DEPT_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// Try multiple field name variants — Cognito uses camelCase from field labels
function pick(entry: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (entry[k] !== undefined && entry[k] !== null && entry[k] !== '') return String(entry[k]);
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    if (entry[lower] !== undefined && entry[lower] !== null && entry[lower] !== '') return String(entry[lower]);
  }
  return undefined;
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.COGNITO_WEBHOOK_SECRET;
  if (!secret) return true;
  const auth  = req.headers.authorization;
  const query = req.query.secret as string | undefined;
  return auth === `Bearer ${secret}` || query === secret;
}

// GET /api/webhook/cognito/last-payload - inspect raw Cognito JSON for debugging
router.get('/last-payload', (_req: Request, res: Response) => {
  if (!lastPayload) {
    return res.json({ message: 'No payload received yet. Submit a test Cognito form entry first.' });
  }
  res.json(lastPayload);
});

// POST /api/webhook/cognito - main Cognito Forms webhook receiver
router.post('/', (req: Request, res: Response) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  lastPayload = req.body;
  const body = req.body as Record<string, unknown>;

  // Cognito sends { Form:{...}, Entry:{...fields...} } — handle both wrapped and flat
  const entry = (body.Entry && typeof body.Entry === 'object')
    ? (body.Entry as Record<string, unknown>)
    : body;

  const employeeName    = pick(entry, 'EmployeeName', 'Employee_Name', 'Name', 'FullName', 'Full_Name', 'Employee', 'EmployeeFullName', 'WorkerName');
  const departmentRaw   = pick(entry, 'Department', 'Dept', 'Section', 'Team', 'Division', 'EmployeeDepartment', 'WorkDepartment');
  const startDateRaw    = pick(entry, 'StartDate', 'Start_Date', 'LeaveStart', 'LeaveStartDate', 'DateFrom', 'From', 'DepartureDate', 'LeaveFrom');
  const endDateRaw      = pick(entry, 'EndDate', 'End_Date', 'LeaveEnd', 'LeaveEndDate', 'DateTo', 'To', 'ReturnDate', 'LeaveTo');
  const purpose         = pick(entry, 'Purpose', 'Reason', 'LeaveReason', 'Notes', 'Description', 'ReasonForLeave', 'Note', 'Comments', 'TravelReason');
  const passportExpiry  = pick(entry, 'PassportExpiry', 'Passport_Expiry', 'PassportExpiryDate', 'PassportExpiration', 'PassportValidUntil');
  const workPermitExpiry= pick(entry, 'WorkPermitExpiry', 'Work_Permit_Expiry', 'WorkPermitExpiryDate', 'PermitExpiry', 'WorkPermitExpiration', 'WorkPermitValidUntil', 'VisaExpiry');
  const contractExpiry  = pick(entry, 'ContractExpiry', 'Contract_Expiry', 'ContractExpiryDate', 'ContractExpiration', 'ContractValidUntil', 'ContractEndDate', 'EmploymentContractExpiry');

  const errors: string[] = [];
  if (!employeeName) errors.push('Could not find employee name field in payload.');
  if (!startDateRaw) errors.push('Could not find start date field in payload.');
  if (!endDateRaw)   errors.push('Could not find end date field in payload.');

  if (errors.length > 0) {
    console.error('[Webhook] Field mapping failed. Entry keys:', Object.keys(entry));
    // Return 200 so Cognito Forms does NOT keep retrying
    return res.status(200).json({ synced: false, errors, hint: 'Visit /api/webhook/cognito/last-payload to inspect the raw payload.' });
  }

  const startDate = normalizeDate(startDateRaw!);
  const endDate   = normalizeDate(endDateRaw!);
  if (!startDate || !endDate) {
    return res.status(200).json({ synced: false, errors: ['Invalid date format in start/end date fields.'] });
  }

  // Look up employee by name (case-insensitive)
  const employee = db.prepare(
    'SELECT * FROM employees WHERE LOWER(name) = LOWER(?)'
  ).get(employeeName!.trim()) as Record<string, unknown> | undefined;

  if (!employee) {
    console.warn(`[Webhook] Employee not found: "${employeeName}". Add them via the Employees tab.`);
    return res.status(200).json({
      synced: false,
      errors: [`Employee "${employeeName}" not found. Add them via the Employees tab first.`],
    });
  }

  // Dept from form is advisory — always use employee's registered dept for eligibility
  const formDept = mapDepartment(departmentRaw);
  if (formDept && formDept !== employee.department) {
    console.warn(`[Webhook] Dept mismatch: form="${departmentRaw}" record="${employee.department}". Using record.`);
  }

  const docs = {
    passportExpiry:   passportExpiry   ? new Date(passportExpiry)   : null,
    workPermitExpiry: workPermitExpiry ? new Date(workPermitExpiry) : null,
    contractExpiry:   contractExpiry   ? new Date(contractExpiry)   : null,
  };

  const start = new Date(startDate);
  const end   = new Date(endDate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligibility = checkEligibility(employee as any, start, end, docs);

  const { max } = db.prepare('SELECT MAX(queue_position) AS max FROM leave_requests').get() as { max: number | null };
  const queuePosition = (max ?? 0) + 1;
  const id  = uuidv4();
  const now = new Date().toISOString();
  const finalEnd = eligibility.adjustedEndDate || toISODate(end);

  db.prepare(`
    INSERT INTO leave_requests (
      id, employee_id, start_date, end_date, purpose,
      passport_expiry, work_permit_expiry, contract_expiry,
      submitted_at, status, denial_reasons, warnings, adjusted_end_date, queue_position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, employee.id, startDate, finalEnd,
    purpose || 'Submitted via Cognito Forms',
    passportExpiry   ? normalizeDate(passportExpiry)   : null,
    workPermitExpiry ? normalizeDate(workPermitExpiry) : null,
    contractExpiry   ? normalizeDate(contractExpiry)   : null,
    now, eligibility.status,
    JSON.stringify(eligibility.failures.map(f => f.message)),
    JSON.stringify(eligibility.warnings.map(w => w.message)),
    eligibility.adjustedEndDate || null,
    queuePosition
  );

  console.log(`[Webhook] Synced "${employeeName}" -> ${eligibility.status} (queue #${queuePosition})`);

  res.status(200).json({
    synced: true,
    requestId: id,
    employee: employee.name,
    status: eligibility.status,
    queuePosition,
    adjustedEndDate: eligibility.adjustedEndDate || null,
    denialReasons: eligibility.failures.map(f => f.message),
    warnings:      eligibility.warnings.map(w => w.message),
  });
});

export default router;