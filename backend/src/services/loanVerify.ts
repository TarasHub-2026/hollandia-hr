import { db } from '../db/database';
import { loanBalance, vancouverDate } from './loanPayments';

// Cross-checks every employee's loan record (loan original / remaining on the employee) against what the app can prove:
// the approved loan applications and the payments posted against them. It reports differences; it never changes anything.

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;

export interface LoanLine { id: string; amount: number; decidedOn: string | null; applied: boolean; paid: number; owed: number; chequeNumber: string | null; chequeReady: boolean; received: boolean }
export interface VerifyRow {
  employeeId: string; name: string; employeeNumber: string;
  recordOriginal: number; recordRemaining: number;
  expectedOriginal: number | null; expectedRemaining: number | null;
  recordRepaidPercent: number; expectedRepaidPercent: number | null;
  problems: string[];       // things that are wrong
  followUps: string[];      // things still to be done (cheque, receipt)
  fixable: boolean;         // the record can be set to the expected figures
  loans: LoanLine[];
}
export interface VerifyReport {
  checkedAt: string;
  employeesWithLoans: number; loansChecked: number; paymentsChecked: number;
  ok: number; withProblems: number; withFollowUps: number; recordOnly: number;
  rows: VerifyRow[];
}

const pct = (orig: number, rem: number) => (orig > 0 ? Math.round((1 - rem / orig) * 100) : 100);

/** What the loan record should be, found by replaying every approved loan and every posted payment in date order. */
export function expectedRecord(employeeId: string): { original: number; remaining: number } | null {
  const loans = db.prepare(`SELECT id, amount, decided_at FROM loan_applications WHERE employee_id = ? AND status = 'APPROVED' AND loan_applied = 1`).all(employeeId) as { id: string; amount: number; decided_at: string | null }[];
  if (!loans.length) return null;
  const pays = db.prepare(`SELECT paid_on, principal, created_at FROM loan_payments WHERE employee_id = ?`).all(employeeId) as { paid_on: string; principal: number; created_at: string }[];
  type Ev = { date: string; order: number; at: string; kind: 'loan' | 'pay'; amount: number };
  const events: Ev[] = [
    ...loans.map(l => ({ date: l.decided_at ? vancouverDate(l.decided_at) : '0000-00-00', order: 0, at: l.decided_at || '', kind: 'loan' as const, amount: Number(l.amount) })),
    ...pays.map(p => ({ date: p.paid_on, order: 1, at: p.created_at, kind: 'pay' as const, amount: Number(p.principal) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.at.localeCompare(b.at));
  let original = 0, remaining = 0;
  for (const e of events) {
    if (e.kind === 'loan') { original = remaining > 0 ? round2(original + e.amount) : round2(e.amount); remaining = round2(remaining + e.amount); }
    else remaining = Math.max(0, round2(remaining - e.amount));
  }
  return { original, remaining };
}

export function verifyLoans(): VerifyReport {
  const emps = db.prepare(`SELECT id, name, employee_number, loan_original, loan_remaining FROM employees WHERE role != 'ADMIN' ORDER BY name`).all() as
    { id: string; name: string; employee_number: string | null; loan_original: number | null; loan_remaining: number | null }[];
  const apps = db.prepare(`SELECT id, employee_id, amount, biweekly, interest_rate, decided_at, loan_applied, cheque_number, cheque_ready_at, cheque_received_on
                           FROM loan_applications WHERE status = 'APPROVED' ORDER BY decided_at`).all() as
    { id: string; employee_id: string; amount: number; biweekly: number; interest_rate: number; decided_at: string | null; loan_applied: number; cheque_number: string | null; cheque_ready_at: string | null; cheque_received_on: string | null }[];
  const byEmp = new Map<string, typeof apps>();
  apps.forEach(a => { if (!byEmp.has(a.employee_id)) byEmp.set(a.employee_id, []); byEmp.get(a.employee_id)!.push(a); });
  const paymentsChecked = (db.prepare(`SELECT COUNT(*) AS c FROM loan_payments`).get() as { c: number }).c;

  const rows: VerifyRow[] = [];
  let employeesWithLoans = 0, ok = 0, recordOnly = 0;
  for (const e of emps) {
    const mine = byEmp.get(e.id) ?? [];
    const recOrig = round2(Number(e.loan_original ?? 0)), recRem = round2(Number(e.loan_remaining ?? 0));
    if (!mine.length && recOrig <= 0 && recRem <= 0) continue;     // never had a loan
    employeesWithLoans++;
    const problems: string[] = [], followUps: string[] = [];
    const exp = expectedRecord(e.id);

    const lines: LoanLine[] = mine.map(a => {
      const bal = loanBalance({ amount: a.amount, biweekly: a.biweekly, interest_rate: a.interest_rate }, a.id);
      if (bal.paid > bal.total + 0.01) problems.push(`Loan of $${Number(a.amount).toFixed(2)} (approved ${a.decided_at ? vancouverDate(a.decided_at) : ''}) has $${bal.paid.toFixed(2)} paid, which is more than the $${bal.total.toFixed(2)} owed including interest.`);
      if (!a.loan_applied) problems.push(`Loan of $${Number(a.amount).toFixed(2)} was approved but was never added to the loan record.`);
      if (!a.cheque_ready_at) followUps.push(`Loan of $${Number(a.amount).toFixed(2)}: Accounting has not entered the cheque yet.`);
      else if (!a.cheque_received_on) followUps.push(`Loan of $${Number(a.amount).toFixed(2)}: cheque ${a.cheque_number || ''} is ready; the employee has not confirmed receiving it.`);
      return { id: a.id, amount: Number(a.amount), decidedOn: a.decided_at ? vancouverDate(a.decided_at) : null, applied: !!a.loan_applied, paid: bal.paid, owed: bal.total,
        chequeNumber: a.cheque_number, chequeReady: !!a.cheque_ready_at, received: !!a.cheque_received_on };
    });

    // The record itself must make sense.
    if (recRem < 0 || recOrig < 0) problems.push('The loan record has a negative amount.');
    if (recRem > recOrig + 0.01) problems.push(`The loan record shows more remaining ($${recRem.toFixed(2)}) than the original loan ($${recOrig.toFixed(2)}).`);
    if (recOrig <= 0 && recRem > 0) problems.push(`The loan record shows $${recRem.toFixed(2)} remaining but no original loan amount.`);

    let fixable = false;
    if (exp) {
      if (!near(recRem, exp.remaining) || !near(recOrig, exp.original)) {
        problems.push(`The loan record shows $${recRem.toFixed(2)} remaining of $${recOrig.toFixed(2)}, but the approved loans and posted payments give $${exp.remaining.toFixed(2)} remaining of $${exp.original.toFixed(2)}.`);
        fixable = true;
      }
    } else { recordOnly++; }   // a loan from before the app: there is nothing in the app to check it against

    if (!problems.length) ok++;
    rows.push({
      employeeId: e.id, name: e.name, employeeNumber: e.employee_number ?? '',
      recordOriginal: recOrig, recordRemaining: recRem,
      expectedOriginal: exp ? exp.original : null, expectedRemaining: exp ? exp.remaining : null,
      recordRepaidPercent: pct(recOrig, recRem), expectedRepaidPercent: exp ? pct(exp.original, exp.remaining) : null,
      problems, followUps, fixable, loans: lines,
    });
  }
  const report: VerifyReport = {
    checkedAt: new Date().toISOString(), employeesWithLoans, loansChecked: apps.length, paymentsChecked, ok,
    withProblems: rows.filter(r => r.problems.length).length, withFollowUps: rows.filter(r => r.followUps.length).length, recordOnly,
    rows: rows.filter(r => r.problems.length || r.followUps.length),
  };
  return report;
}

/** Sets the loan record to what the approved loans and posted payments give, for employees where they differ. Returns what changed. */
export function fixLoanRecords(employeeIds: string[]): { employeeId: string; name: string; before: { original: number; remaining: number }; after: { original: number; remaining: number } }[] {
  const out: { employeeId: string; name: string; before: { original: number; remaining: number }; after: { original: number; remaining: number } }[] = [];
  const upd = db.prepare(`UPDATE employees SET loan_original = ?, loan_remaining = ?, updated_at = ? WHERE id = ?`);
  db.transaction(() => {
    for (const id of employeeIds) {
      const e = db.prepare(`SELECT id, name, loan_original, loan_remaining FROM employees WHERE id = ? AND role != 'ADMIN'`).get(id) as { id: string; name: string; loan_original: number | null; loan_remaining: number | null } | undefined;
      const exp = e ? expectedRecord(id) : null;
      if (!e || !exp) continue;
      const before = { original: round2(Number(e.loan_original ?? 0)), remaining: round2(Number(e.loan_remaining ?? 0)) };
      if (near(before.original, exp.original) && near(before.remaining, exp.remaining)) continue;
      upd.run(exp.original, exp.remaining, new Date().toISOString(), id);
      out.push({ employeeId: id, name: e.name, before, after: exp });
    }
  })();
  return out;
}
