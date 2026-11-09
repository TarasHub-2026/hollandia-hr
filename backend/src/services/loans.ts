import { db } from '../db/database';

// Employee loan terms (from the Employee Loan Application form).
export const LOAN_INTEREST_RATE = 0.05;   // 5% per annum, simple interest
export const LOAN_BIWEEKLY_PAYMENT = 150; // required bi-weekly amortization
export const LOAN_MAX_AMOUNT = 100000;

export const LOAN_AGREEMENTS = 5;         // the five terms and conditions the employee must agree to

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Estimated interest = amount x 5% x years to repay, where years = (amount / bi-weekly payment) / 26.
 * Bi-weekly means 26 pay periods a year.
 */
export function calcLoan(amount: number) {
  const payments = Math.ceil(amount / LOAN_BIWEEKLY_PAYMENT);
  const years = (amount / LOAN_BIWEEKLY_PAYMENT) / 26;
  return {
    payments,
    biweekly: LOAN_BIWEEKLY_PAYMENT,
    rate: LOAN_INTEREST_RATE,
    interest: round2(amount * LOAN_INTEREST_RATE * years),
  };
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
