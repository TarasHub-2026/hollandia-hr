import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { estimateInterest } from './loans';

const round2 = (n: number) => Math.round(n * 100) / 100;
const PAYDAY_KEY = 'payroll_anchor_date';
const PAY_PERIOD_DAYS = 14;

// ---------- dates (plain YYYY-MM-DD strings, calendar math in UTC so daylight saving cannot shift a day) ----------
const toUtc = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86400000);
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
/** The calendar date in British Columbia for a timestamp (so an evening approval is not counted as the next day). */
export const vancouverDate = (iso: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(typeof iso === 'string' ? new Date(iso) : iso);

export function getPayday(): string | null {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(PAYDAY_KEY) as { value: string } | undefined;
  return row && isIsoDate(row.value) ? row.value : null;
}
export function setPayday(d: string) {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(PAYDAY_KEY, d);
}
/** First payday strictly after a date, given any known payday (paydays repeat every 14 days). */
export function paydayAfter(anchor: string, after: string): string {
  const diff = Math.floor((toUtc(after) - toUtc(anchor)) / 86400000);
  const k = Math.floor(diff / PAY_PERIOD_DAYS) + 1;           // may be negative: paydays before the anchor count too
  return addDays(anchor, k * PAY_PERIOD_DAYS);
}

// ---------- the loan, its payments and its schedule ----------
export interface LoanTerms { amount: number; biweekly: number; interest_rate: number }

export function loanTotals(la: LoanTerms) {
  const interest = estimateInterest(Number(la.amount), Number(la.biweekly), Number(la.interest_rate ?? 0.05));
  return { interest, total: round2(Number(la.amount) + interest) };
}

export interface PaymentRow { id: string; loanId: string; paidOn: string; amount: number; principal: number; interest: number; source: string; note: string | null; createdAt: string }

export function loanPayments(loanId: string): PaymentRow[] {
  return (db.prepare(`SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY paid_on, created_at`).all(loanId) as Record<string, unknown>[]).map(r => ({
    id: r.id as string, loanId: r.loan_id as string, paidOn: r.paid_on as string, amount: r.amount as number,
    principal: r.principal as number, interest: r.interest as number, source: r.source as string, note: (r.note as string) ?? null, createdAt: r.created_at as string,
  }));
}

export function loanBalance(la: LoanTerms, loanId: string) {
  const { interest, total } = loanTotals(la);
  const s = db.prepare(`SELECT COALESCE(SUM(amount),0) AS paid, COALESCE(SUM(principal),0) AS principal FROM loan_payments WHERE loan_id = ?`).get(loanId) as { paid: number; principal: number };
  const paid = round2(s.paid);
  return { interest, total, paid, principalPaid: round2(s.principal), outstanding: Math.max(0, round2(total - paid)) };
}

export interface ScheduleRow {
  n: number; dueDate: string | null; payment: number; interest: number; principal: number; balance: number;
  status: 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE' | null;
}

/** The repayment table: equal bi-weekly payments (the last one smaller), interest spread evenly, one row per payday. */
export function buildSchedule(la: LoanTerms & { status: string; decided_at: string | null }, loanId: string): ScheduleRow[] {
  const { interest, total } = loanTotals(la);
  const biweekly = Number(la.biweekly);
  if (!(biweekly > 0) || !(total > 0)) return [];
  const n = Math.ceil(total / biweekly - 1e-9);
  const anchor = getPayday();
  const approved = la.status === 'APPROVED' && !!la.decided_at;
  const first = approved && anchor ? paydayAfter(anchor, vancouverDate(la.decided_at!)) : null;
  const paid = approved ? loanBalance(la, loanId).paid : 0;
  const today = vancouverDate(new Date());
  const rows: ScheduleRow[] = [];
  let cum = 0, intSoFar = 0;
  for (let k = 1; k <= n; k++) {
    const payment = k < n ? biweekly : round2(total - biweekly * (n - 1));
    const int = k < n ? round2(payment * interest / total) : round2(interest - intSoFar);
    intSoFar = round2(intSoFar + int);
    const before = cum;
    cum = round2(cum + payment);
    const due = first ? addDays(first, PAY_PERIOD_DAYS * (k - 1)) : null;
    let status: ScheduleRow['status'] = null;
    if (approved) {
      if (paid >= cum - 0.005) status = 'PAID';
      else if (due && due < today) status = 'OVERDUE';
      else status = paid > before + 0.005 ? 'PARTIAL' : 'DUE';
    }
    rows.push({ n: k, dueDate: due, payment, interest: int, principal: round2(payment - int), balance: Math.max(0, round2(total - cum)), status });
  }
  return rows;
}

/** Splits a payment into principal and interest in proportion to the loan, and settles exactly on the last one. */
export function splitPayment(la: LoanTerms, bal: ReturnType<typeof loanBalance>, amount: number) {
  const remainingPrincipal = Math.max(0, round2(Number(la.amount) - bal.principalPaid));
  if (amount >= bal.outstanding - 0.005) return { principal: remainingPrincipal, interest: round2(amount - remainingPrincipal) };
  let interest = round2(amount * bal.interest / bal.total);
  let principal = round2(amount - interest);
  if (principal > remainingPrincipal) { principal = remainingPrincipal; interest = round2(amount - principal); }
  return { principal, interest };
}

/** Records a payment on a loan and lowers the employee's loan record by the principal part. Call inside a transaction. */
export function postPayment(la: LoanTerms & { employee_id: string }, loanId: string, paidOn: string, amount: number, source: 'MANUAL' | 'IMPORT', note: string | null, by: string | null) {
  const bal = loanBalance(la, loanId);
  const { principal, interest } = splitPayment(la, bal, amount);
  const id = uuidv4();
  db.prepare(`INSERT INTO loan_payments (id, loan_id, employee_id, paid_on, amount, principal, interest, source, note, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, loanId, la.employee_id, paidOn, amount, principal, interest, source, note, new Date().toISOString(), by);
  db.prepare(`UPDATE employees SET loan_remaining = MAX(0, ROUND(COALESCE(loan_remaining,0) - ?, 2)), updated_at = ? WHERE id = ?`).run(principal, new Date().toISOString(), la.employee_id);
  return { id, principal, interest };
}

/** Undoes a posted payment (the loan record goes back up by the principal that had been taken off). */
export function removePayment(paymentId: string): { loanId: string; amount: number; employeeId: string; paidOn: string } | null {
  const p = db.prepare(`SELECT * FROM loan_payments WHERE id = ?`).get(paymentId) as Record<string, unknown> | undefined;
  if (!p) return null;
  db.prepare(`DELETE FROM loan_payments WHERE id = ?`).run(paymentId);
  db.prepare(`UPDATE employees SET loan_remaining = ROUND(COALESCE(loan_remaining,0) + ?, 2), updated_at = ? WHERE id = ?`).run(p.principal, new Date().toISOString(), p.employee_id);
  return { loanId: p.loan_id as string, amount: p.amount as number, employeeId: p.employee_id as string, paidOn: p.paid_on as string };
}