import { db } from '../db/database';
import { PAID_SICK_ANNUAL_DAYS, PAID_SICK_START_YEAR } from '../data/policy';

export interface PaidSickRecord {
  id: string; startDate: string; endDate: string; days: number; status: string;
}
export interface PaidSickBalance {
  year: number;
  entitlement: number;
  tracked: boolean;       // false for years before the entitlement starts
  approved: number;
  pending: number;
  remaining: number;      // never below 0
  records: PaidSickRecord[];
}

/** The year a leave counts against is the year it starts (no carry-over between years). */
export function leaveYear(startDate: string): number {
  return parseInt(String(startDate).slice(0, 4), 10);
}

/**
 * Paid sick days used by an employee in a calendar year.
 * Approved and pending requests both use up days; denied and cancelled requests give them back.
 * `excludeRequestId` lets a request be re-checked without counting itself.
 */
export function getPaidSickBalance(employeeId: string, year: number, excludeRequestId?: string): PaidSickBalance {
  const rows = db.prepare(`
    SELECT id, start_date, end_date, paid_sick_days, status
    FROM leave_requests
    WHERE employee_id = ? AND paid_sick_days IS NOT NULL AND paid_sick_days > 0
      AND status IN ('APPROVED', 'PENDING') AND substr(start_date, 1, 4) = ?
      ${excludeRequestId ? 'AND id != ?' : ''}
    ORDER BY start_date
  `).all(...(excludeRequestId ? [employeeId, String(year), excludeRequestId] : [employeeId, String(year)])) as
    { id: string; start_date: string; end_date: string; paid_sick_days: number; status: string }[];

  const approved = rows.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.paid_sick_days, 0);
  const pending = rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.paid_sick_days, 0);
  return {
    year,
    entitlement: PAID_SICK_ANNUAL_DAYS,
    tracked: year >= PAID_SICK_START_YEAR,
    approved,
    pending,
    remaining: Math.max(0, PAID_SICK_ANNUAL_DAYS - approved - pending),
    records: rows.map(r => ({ id: r.id, startDate: r.start_date, endDate: r.end_date, days: r.paid_sick_days, status: r.status })),
  };
}

/**
 * Red-flag messages for a paid sick request. Before the entitlement starts there is no balance,
 * so only the 5-day cap on a single request applies.
 */
export function paidSickFlags(employeeId: string, startDate: string, days: number): string[] {
  if (!Number.isFinite(days) || days <= 0) return [];
  const year = leaveYear(startDate);
  if (year < PAID_SICK_START_YEAR) {
    return days > PAID_SICK_ANNUAL_DAYS
      ? [`Paid sick leave requested (${days} days) exceeds the annual maximum of ${PAID_SICK_ANNUAL_DAYS} days.`]
      : [];
  }
  const bal = getPaidSickBalance(employeeId, year);
  if (days > bal.remaining) {
    return [`Paid sick leave requested (${days} day${days === 1 ? '' : 's'}) exceeds the remaining ${year} balance of ${bal.remaining} day${bal.remaining === 1 ? '' : 's'} (${PAID_SICK_ANNUAL_DAYS} per year; ${bal.approved} approved, ${bal.pending} pending).`];
  }
  return [];
}

/** Whole days of paid sick leave on a submission, or null when it is not a paid sick request. */
export function requestedPaidSickDays(body: Record<string, unknown>): number | null {
  if (!String(body.category ?? '').includes('Paid Sick')) return null;
  const n = Math.floor(Number(body.paidSickDays));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 366) : null;
}
