import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { checkEligibility } from './eligibility';
import { toISODate } from './scheduling';
import type { Department } from '../types';

// ── Cognito Forms API ─────────────────────────────────────────────────────────
const COGNITO_API_BASE = 'https://www.cognitoforms.com/api';

export interface SyncResult {
  entriesFound:   number;
  entriesSynced:  number;
  entriesSkipped: number;
  errors:         string[];
  syncedAt:       string;
}

// ── Department mapping ────────────────────────────────────────────────────────
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

// ── Flexible field extractor ──────────────────────────────────────────────────
function pick(entry: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const variants = [k, k.charAt(0).toLowerCase() + k.slice(1)];
    for (const v of variants) {
      if (entry[v] !== undefined && entry[v] !== null && entry[v] !== '') return String(entry[v]);
    }
  }
  return undefined;
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

// ── Fetch all entries from Cognito Forms API ──────────────────────────────────
async function fetchCognitoEntries(apiKey: string, formId: string): Promise<Record<string, unknown>[]> {
  // Step 1: list all forms to find the real API form ID
  // (data-form="6" in embed is the form's index, not its REST API ID)
  const formsRes = await fetch(`${COGNITO_API_BASE}/forms`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!formsRes.ok) {
    const text = await formsRes.text();
    throw new Error(`Cognito API error ${formsRes.status}: ${text.slice(0, 300)}`);
  }
  const forms = await formsRes.json() as Record<string, unknown>[];
  console.log(`[Sync] Found ${forms.length} form(s):`, forms.map((f: Record<string, unknown>) => `${f.Id} - ${f.Name}`).join(', '));

  // Step 2: pick form — by COGNITO_FORM_ID env var (as index 1-based) or name match
  let targetForm: Record<string, unknown> | undefined;
  const formIndex = parseInt(formId, 10); // e.g. 6 means 6th form
  const formName  = process.env.COGNITO_FORM_NAME || '';

  if (formName) {
    targetForm = forms.find((f: Record<string, unknown>) =>
      String(f.Name).toLowerCase().includes(formName.toLowerCase())
    );
  }
  if (!targetForm && formIndex > 0 && formIndex <= forms.length) {
    targetForm = forms[formIndex - 1]; // convert 1-based index to 0-based
  }
  if (!targetForm) targetForm = forms[0]; // fallback to first form
  if (!targetForm) throw new Error('No forms found in Cognito Forms account.');

  const realFormId = targetForm.Id as string;
  console.log(`[Sync] Using form: "${targetForm.Name}" (ID: ${realFormId})`);

  // Step 3: fetch all entries for that form
  const url = `${COGNITO_API_BASE}/forms/${realFormId}/entries`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cognito API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json() as unknown;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (Array.isArray(obj.data))  return obj.data  as Record<string, unknown>[];
  throw new Error(`Unexpected Cognito API response shape: ${JSON.stringify(data).slice(0, 200)}`);
}

// ── Process a single Cognito entry ───────────────────────────────────────────
function processEntry(
  entry: Record<string, unknown>,
  errors: string[],
): { synced: boolean; skipped: boolean } {
  const entryNumber = entry.Number || entry.EntryNumber || entry.Id || entry.id;

  const employeeName    = pick(entry, 'EmployeeName', 'Employee_Name', 'Name', 'FullName', 'Full_Name', 'Employee', 'EmployeeFullName', 'WorkerName');
  const departmentRaw   = pick(entry, 'Department', 'Dept', 'Section', 'Team', 'Division', 'EmployeeDepartment', 'WorkDepartment');
  const startDateRaw    = pick(entry, 'StartDate', 'Start_Date', 'LeaveStart', 'LeaveStartDate', 'DateFrom', 'From', 'DepartureDate', 'LeaveFrom');
  const endDateRaw      = pick(entry, 'EndDate', 'End_Date', 'LeaveEnd', 'LeaveEndDate', 'DateTo', 'To', 'ReturnDate', 'LeaveTo');
  const purpose         = pick(entry, 'Purpose', 'Reason', 'LeaveReason', 'Notes', 'Description', 'ReasonForLeave', 'Note', 'Comments', 'TravelReason');
  const passportExpiry  = pick(entry, 'PassportExpiry', 'Passport_Expiry', 'PassportExpiryDate', 'PassportExpiration', 'PassportValidUntil');
  const workPermitExpiry= pick(entry, 'WorkPermitExpiry', 'Work_Permit_Expiry', 'WorkPermitExpiryDate', 'PermitExpiry', 'WorkPermitExpiration', 'WorkPermitValidUntil', 'VisaExpiry');
  const contractExpiry  = pick(entry, 'ContractExpiry', 'Contract_Expiry', 'ContractExpiryDate', 'ContractExpiration', 'ContractValidUntil', 'ContractEndDate', 'EmploymentContractExpiry');

  // Skip entries missing required fields
  if (!employeeName || !startDateRaw || !endDateRaw) {
    errors.push(`Entry #${entryNumber}: missing required fields (name/startDate/endDate). Keys: ${Object.keys(entry).join(', ')}`);
    return { synced: false, skipped: true };
  }

  const startDate = normalizeDate(startDateRaw);
  const endDate   = normalizeDate(endDateRaw);
  if (!startDate || !endDate) {
    errors.push(`Entry #${entryNumber}: invalid dates "${startDateRaw}" / "${endDateRaw}"`);
    return { synced: false, skipped: true };
  }

  // Look up employee by name
  const employee = db.prepare(
    'SELECT * FROM employees WHERE LOWER(name) = LOWER(?)'
  ).get(employeeName.trim()) as Record<string, unknown> | undefined;

  if (!employee) {
    errors.push(`Entry #${entryNumber}: employee "${employeeName}" not found in HR system.`);
    return { synced: false, skipped: true };
  }

  // Department advisory
  const formDept = mapDepartment(departmentRaw);
  if (formDept && formDept !== employee.department) {
    console.warn(`[Sync] Entry #${entryNumber}: dept mismatch form="${departmentRaw}" record="${employee.department}"`);
  }

  // Check if already synced by cognito_entry_number
  if (entryNumber !== undefined && entryNumber !== null) {
    const existing = db.prepare(
      'SELECT id FROM leave_requests WHERE cognito_entry_number = ?'
    ).get(Number(entryNumber));
    if (existing) {
      // Re-run eligibility and update the existing record (re-analyze)
      const docs = {
        passportExpiry:   passportExpiry   ? new Date(passportExpiry)   : null,
        workPermitExpiry: workPermitExpiry ? new Date(workPermitExpiry) : null,
        contractExpiry:   contractExpiry   ? new Date(contractExpiry)   : null,
      };
      const eligibility = checkEligibility(employee as any, new Date(startDate), new Date(endDate), docs);
      const finalEnd = eligibility.adjustedEndDate || toISODate(new Date(endDate));
      db.prepare(`
        UPDATE leave_requests SET
          start_date=?, end_date=?, purpose=?,
          passport_expiry=?, work_permit_expiry=?, contract_expiry=?,
          status=?, denial_reasons=?, warnings=?, adjusted_end_date=?
        WHERE cognito_entry_number=?
      `).run(
        startDate, finalEnd, purpose || 'Cognito Forms entry',
        passportExpiry   ? normalizeDate(passportExpiry)   : null,
        workPermitExpiry ? normalizeDate(workPermitExpiry) : null,
        contractExpiry   ? normalizeDate(contractExpiry)   : null,
        eligibility.status,
        JSON.stringify(eligibility.failures.map(f => f.message)),
        JSON.stringify(eligibility.warnings.map(w => w.message)),
        eligibility.adjustedEndDate || null,
        Number(entryNumber)
      );
      return { synced: true, skipped: false };
    }
  }

  // New entry — run eligibility and insert
  const docs = {
    passportExpiry:   passportExpiry   ? new Date(passportExpiry)   : null,
    workPermitExpiry: workPermitExpiry ? new Date(workPermitExpiry) : null,
    contractExpiry:   contractExpiry   ? new Date(contractExpiry)   : null,
  };
  const eligibility = checkEligibility(employee as any, new Date(startDate), new Date(endDate), docs);
  const { max } = db.prepare('SELECT MAX(queue_position) AS max FROM leave_requests').get() as { max: number | null };
  const queuePosition = (max ?? 0) + 1;
  const id  = uuidv4();
  const now = entry.DateCreated ? new Date(String(entry.DateCreated)).toISOString() : new Date().toISOString();
  const finalEnd = eligibility.adjustedEndDate || toISODate(new Date(endDate));

  db.prepare(`
    INSERT INTO leave_requests (
      id, employee_id, start_date, end_date, purpose,
      passport_expiry, work_permit_expiry, contract_expiry,
      submitted_at, status, denial_reasons, warnings, adjusted_end_date,
      queue_position, cognito_entry_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, employee.id, startDate, finalEnd,
    purpose || 'Cognito Forms entry',
    passportExpiry   ? normalizeDate(passportExpiry)   : null,
    workPermitExpiry ? normalizeDate(workPermitExpiry) : null,
    contractExpiry   ? normalizeDate(contractExpiry)   : null,
    now, eligibility.status,
    JSON.stringify(eligibility.failures.map(f => f.message)),
    JSON.stringify(eligibility.warnings.map(w => w.message)),
    eligibility.adjustedEndDate || null,
    queuePosition,
    entryNumber !== undefined ? Number(entryNumber) : null
  );

  return { synced: true, skipped: false };
}

// ── Main sync function ────────────────────────────────────────────────────────
export async function syncFromCognito(): Promise<SyncResult> {
  const apiKey = process.env.COGNITO_API_KEY;
  const formId = process.env.COGNITO_FORM_ID || '6';

  if (!apiKey) throw new Error('COGNITO_API_KEY environment variable is not set.');

  const entries = await fetchCognitoEntries(apiKey, formId);
  const errors: string[] = [];
  let entriesSynced  = 0;
  let entriesSkipped = 0;

  for (const entry of entries) {
    try {
      const result = processEntry(entry, errors);
      if (result.synced)   entriesSynced++;
      if (result.skipped)  entriesSkipped++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Unexpected error on entry: ${msg}`);
      entriesSkipped++;
    }
  }

  const syncedAt = new Date().toISOString();

  // Log the sync
  db.prepare(`
    INSERT INTO sync_log (synced_at, entries_found, entries_synced, entries_skipped, errors)
    VALUES (?, ?, ?, ?, ?)
  `).run(syncedAt, entries.length, entriesSynced, entriesSkipped, JSON.stringify(errors));

  console.log(`[Sync] Complete: ${entriesSynced} synced, ${entriesSkipped} skipped, ${errors.length} errors`);
  return { entriesFound: entries.length, entriesSynced, entriesSkipped, errors, syncedAt };
}

// ── Get last sync status ──────────────────────────────────────────────────────
export function getLastSyncStatus(): Record<string, unknown> | null {
  return db.prepare(
    'SELECT * FROM sync_log ORDER BY id DESC LIMIT 1'
  ).get() as Record<string, unknown> | null;
}