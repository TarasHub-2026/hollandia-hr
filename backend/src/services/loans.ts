import { db } from '../db/database';

// Employee loan terms (from the Employee Loan Application form).
export const LOAN_INTEREST_RATE = 0.05;   // flat 5% of the principal
export const LOAN_BIWEEKLY_FALLBACK = 150; // only used until HR sets the default bi-weekly amortization (Loan Applications page)
export const LOAN_MAX_AMOUNT = 100000;

export const LOAN_AGREEMENTS = 1;         // the employee ticks one box to agree to the full Loan Agreement and Terms & Conditions

const round2 = (n: number) => Math.round(n * 100) / 100;

const SETTING_KEY = 'loan_biweekly_default';

/** The bi-weekly amortization new applications start with. HR can change it; nothing is hard coded but the first-run fallback. */
export function getDefaultBiweekly(): number {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(SETTING_KEY) as { value: string } | undefined;
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : LOAN_BIWEEKLY_FALLBACK;
}
export function setDefaultBiweekly(n: number) {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(SETTING_KEY, String(n));
}
/** Reads an amortization amount from a request: a positive dollar amount, to the cent. */
export function readBiweekly(v: unknown): number | { error: string } {
  const n = Math.round(Number(v) * 100) / 100;
  if (v === '' || v === null || v === undefined || !Number.isFinite(n) || n <= 0) return { error: 'Enter the bi-weekly amortization amount.' };
  if (n > LOAN_MAX_AMOUNT) return { error: 'That bi-weekly amortization is too large.' };
  return n;
}

/**
 * Interest is a flat 5% of the principal (amount x 5%), charged once and not dependent on how fast it is repaid.
 * Payments = the number of bi-weekly amortizations needed to repay principal + interest (the last one may be smaller).
 */
export function calcLoan(amount: number, biweekly: number = getDefaultBiweekly()) {
  const interest = round2(amount * LOAN_INTEREST_RATE);
  const payments = Math.ceil(round2(amount + interest) / biweekly - 1e-9);
  return { payments, biweekly, rate: LOAN_INTEREST_RATE, interest };
}

/**
 * Adds an approved loan to the employee's loan record, which drives the 50% repayment rule for leave.
 * With an outstanding loan the amount is added to both figures; once the old loan is fully repaid the
 * new loan starts the record fresh, so old repayments cannot make a new loan look half repaid.
 */
export function applyLoanToEmployee(employeeId: string, amount: number): { original: number; remaining: number } {
  const e = db.prepare(`SELECT loan_original, loan_remaining FROM employees WHERE id = ?`).get(employeeId) as
    { loan_original: number | null; loan_remaining: number | null } | undefined;
  const oldRemaining = e?.loan_remaining ?? 0;
  const original = oldRemaining > 0 ? round2((e?.loan_original ?? 0) + amount) : round2(amount);
  const remaining = round2(oldRemaining + amount);
  db.prepare(`UPDATE employees SET loan_original = ?, loan_remaining = ?, updated_at = ? WHERE id = ?`)
    .run(original, remaining, new Date().toISOString(), employeeId);
  return { original, remaining };
}
