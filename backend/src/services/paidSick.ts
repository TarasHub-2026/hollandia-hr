import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { PAID_SICK_ANNUAL_DAYS, PAID_SICK_START_YEAR } from '../data/policy';

export interface PaidSickRecord {
  id: string; startDate: string; endDate: string; days: number; status: string;
  /** The days the leave itself spans, so HR can see when only part of it is paid sick leave. */
  leaveDays?: number;
}
/** A change HR made to the balance by hand: days taken outside the app (positive) or days given back (negative). */
export interface PaidSickAdjustment {
  id: string; takenOn: string; days: number; note: string; createdAt: string; createdBy: string;
}
export interface PaidSickBalance {
  year: number;
  entitlement: number;
  tracked: boolean;       // false for years before the entitlement starts
  approved: number;
  pending: number;
  adjusted: number;       // net days from HR's adjustments (taken minus given back)
  remaining: number;      // never below 0
  records: PaidSickRecord[];
  adjustments: PaidSickAdjustment[];
}

/** The year a leave counts against is the year it starts (no carry-over between years). */
export function leaveYear(startDate: string): number {
  return parseInt(String(startDate).slice(0, 4), 10);
}

/** Days of leave: the days before the date of return to work (Nov 23 to Nov 24 is 1 day); a same-day return counts as 1. */
export function leaveDayCount(start: string, end: string): number {
  const p = (s: string) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const n = Math.round((p(end) - p(start)) / 86400000);
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

/**
 * Paid sick days used by an employee in a calendar year.
 * Approved and pending requests both use up days (a pending request holds them); denied and cancelled requests give them back.
 * HR's adjustments are added on top. `excludeRequestId` lets a request be re-checked without counting itself.
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
  const adj = db.prepare(`SELECT id, taken_on, days, note, created_at, created_by_name FROM paid_sick_adjustments WHERE employee_id = ? AND year = ? ORDER BY taken_on, created_at`)
    .all(employeeId, year) as { id: string; taken_on: string; days: number; note: string | null; created_at: string; created_by_name: string | null }[];

  const approved = rows.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.paid_sick_days, 0);
  const pending = rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.paid_sick_days, 0);
  const adjusted = adj.reduce((s, a) => s + a.days, 0);
  return {
    year,
    entitlement: PAID_SICK_ANNUAL_DAYS,
    tracked: year >= PAID_SICK_START_YEAR,
    approved,
    pending,
    adjusted,
    // Never below 0, and never above the entitlement (days given back cannot create extra days).
    remaining: Math.min(PAID_SICK_ANNUAL_DAYS, Math.max(0, PAID_SICK_ANNUAL_DAYS - approved - pending - adjusted)),
    records: rows.map(r => ({ id: r.id, startDate: r.start_date, endDate: r.end_date, days: r.paid_sick_days, status: r.status, leaveDays: leaveDayCount(r.start_date, r.end_date) })),
    adjustments: adj.map(a => ({ id: a.id, takenOn: a.taken_on, days: a.days, note: a.note ?? '', createdAt: a.created_at, createdBy: a.created_by_name ?? 'HR' })),
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
    return [`Paid sick leave requested (${days} day${days === 1 ? '' : 's'}) exceeds the remaining ${year} balance of ${bal.remaining} day${bal.remaining === 1 ? '' : 's'} (${PAID_SICK_ANNUAL_DAYS} per year; ${bal.approved} approved, ${bal.pending} pending${bal.adjusted ? `, ${bal.adjusted} recorded by HR` : ''}).`];
  }
  return [];
}

/**
 * Whole days of paid sick leave on a submission, or null when it is not a paid sick request.
 * When the form does not say how many days, every day of the leave counts as paid sick leave, so it comes off the balance automatically.
 */
export function requestedPaidSickDays(body: Record<string, unknown>): number | null {
  if (!String(body.category ?? '').includes('Paid Sick')) return null;
  const n = Math.floor(Number(body.paidSickDays));
  if (Number.isFinite(n) && n > 0) return Math.min(n, 366);
  if (typeof body.startDate === 'string' && typeof body.endDate === 'string') return Math.min(leaveDayCount(body.startDate, body.endDate), 366);
  return null;
}

// ───────── HR adjustments (like posting deductions on a loan) ─────────

export function addAdjustment(employeeId: string, takenOn: string, days: number, note: string, by: { id: string; name: string }): PaidSickAdjustment {
  const id = uuidv4(), now = new Date().toISOString();
  db.prepare(`INSERT INTO paid_sick_adjustments (id, employee_id, year, taken_on, days, note, created_at, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, employeeId, leaveYear(takenOn), takenOn, days, note || null, now, by.id, by.name);
  return { id, takenOn, days, note, createdAt: now, createdBy: by.name };
}

export function removeAdjustment(id: string): { employeeId: string; takenOn: string; days: number; year: number } | null {
  const a = db.prepare(`SELECT employee_id, taken_on, days, year FROM paid_sick_adjustments WHERE id = ?`).get(id) as { employee_id: string; taken_on: string; days: number; year: number } | undefined;
  if (!a) return null;
  db.prepare(`DELETE FROM paid_sick_adjustments WHERE id = ?`).run(id);
  return { employeeId: a.employee_id, takenOn: a.taken_on, days: a.days, year: a.year };
}
