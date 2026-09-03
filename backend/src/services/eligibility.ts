import { db } from '../db/database';
import {
  DEPT_CAPS,
  MAX_LEAVE_DAYS,
  DOC_VALIDITY_HARD_MONTHS,
  DOC_VALIDITY_ADVISORY_MONTHS,
  MIN_TENURE_YEARS,
  MAX_LOAN_OUTSTANDING_RATIO,
} from '../data/policy';
import {
  daysBetween,
  addMonths,
  toISODate,
  rangeContainsBlackout,
  findMaxNonBlackoutEnd,
  getPeriodForDate,
  getMostRestrictiveWindow,
  isDateInBlackout,
} from './scheduling';
import type { Department, EligibilityCheck, EligibilityResult, RequestStatus } from '../types/index';

interface RawEmployee {
  id: string;
  name: string;
  department: string;
  hire_date: string;
  loan_original: number;
  loan_remaining: number;
}

interface DocDates {
  passportExpiry?: Date | null;
  workPermitExpiry?: Date | null;
  contractExpiry?: Date | null;
}

export function checkEligibility(
  employee: RawEmployee,
  startDate: Date,
  endDate: Date,
  docs: DocDates,
  excludeRequestId?: string
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  let adjustedEndDate: Date | null = null;

  // ── 1. Tenure ─────────────────────────────────────────────────────────────
  const hireDate = new Date(employee.hire_date);
  const eligibleFrom = new Date(hireDate);
  eligibleFrom.setFullYear(eligibleFrom.getFullYear() + MIN_TENURE_YEARS);
  const tenurePassed = new Date() >= eligibleFrom;
  checks.push({
    rule: 'Minimum Tenure (1 year)',
    passed: tenurePassed,
    isWarning: false,
    message: tenurePassed
      ? `Employee has completed the required 1 year of continuous employment.`
      : `Employee must complete at least 1 year of continuous employment. Earliest eligible date: ${eligibleFrom.toLocaleDateString('en-CA')}.`,
  });

  // ── 2. Loan Repayment ─────────────────────────────────────────────────────
  let loanPassed = true;
  let loanMsg = 'No outstanding loan on record.';
  if (employee.loan_original > 0) {
    const repaidRatio = 1 - employee.loan_remaining / employee.loan_original;
    loanPassed = repaidRatio >= (1 - MAX_LOAN_OUTSTANDING_RATIO);
    const pct = Math.round(repaidRatio * 100);
    loanMsg = loanPassed
      ? `Loan is ${pct}% repaid — meets the minimum 50% repayment requirement.`
      : `Loan is only ${pct}% repaid ($${employee.loan_remaining.toFixed(2)} remaining of $${employee.loan_original.toFixed(2)}). At least 50% must be repaid before leave can be approved.`;
  }
  checks.push({ rule: 'Loan Repayment (50% minimum)', passed: loanPassed, isWarning: false, message: loanMsg });

  // ── 3. Duration (75-day max) ──────────────────────────────────────────────
  const totalDays = daysBetween(startDate, endDate);
  const durationPassed = totalDays <= MAX_LEAVE_DAYS;
  if (!durationPassed) {
    const trimmedEnd = new Date(startDate);
    trimmedEnd.setDate(trimmedEnd.getDate() + MAX_LEAVE_DAYS - 1);
    adjustedEndDate = trimmedEnd;
  }
  checks.push({
    rule: 'Maximum Leave Duration (75 days)',
    passed: durationPassed,
    isWarning: false,
    message: durationPassed
      ? `Requested duration is ${totalDays} day(s) — within the 75-day maximum.`
      : `Requested duration is ${totalDays} days, exceeding the 75-day maximum. Consider ending on ${adjustedEndDate ? toISODate(adjustedEndDate) : 'N/A'} instead.`,
  });

  // ── 4. Blackout / Scheduling Block ───────────────────────────────────────
  const startPeriod = getPeriodForDate(startDate);
  const hasBlackout = rangeContainsBlackout(startDate, endDate);
  let blockPassed = !hasBlackout;
  let blockMsg = '';

  if (startPeriod?.type === 'BLACKOUT') {
    blockMsg = `Start date falls within a Blackout Period: ${startPeriod.name}. ${startPeriod.notes}. Please choose dates within an approved scheduling block.`;
  } else if (hasBlackout) {
    // Start is in an approved block but range clips into a blackout
    const suggested = findMaxNonBlackoutEnd(startDate, MAX_LEAVE_DAYS);
    adjustedEndDate = suggested;
    blockMsg = `Leave request overlaps a Blackout Period. The latest approved end date for a leave starting ${toISODate(startDate)} is ${toISODate(suggested)}.`;
  } else if (!startPeriod) {
    blockPassed = false;
    blockMsg = `Dates do not fall within any defined scheduling block.`;
  } else {
    blockMsg = `Dates fall within ${startPeriod.name} — an approved scheduling block.`;
  }
  checks.push({ rule: 'Scheduling Block / Blackout Period', passed: blockPassed, isWarning: false, message: blockMsg });

  // ── 5. Document Validity ──────────────────────────────────────────────────
  const returnDate = new Date(endDate); // return = day after leave ends; we use end date as ref
  const hardDeadline     = addMonths(returnDate, DOC_VALIDITY_HARD_MONTHS);
  const advisoryDeadline = addMonths(returnDate, DOC_VALIDITY_ADVISORY_MONTHS);

  const docItems = [
    { label: 'Passport',            expiry: docs.passportExpiry   ?? null },
    { label: 'Work Permit',         expiry: docs.workPermitExpiry ?? null },
    { label: 'Employment Contract', expiry: docs.contractExpiry   ?? null },
  ];

  const docFailures: string[] = [];
  const docAdvisories: string[] = [];

  for (const item of docItems) {
    if (!item.expiry) continue;
    if (item.expiry < hardDeadline) {
      docFailures.push(
        `${item.label} expires ${toISODate(item.expiry)}, which is less than 4 months after your return date (${toISODate(returnDate)}).`
      );
    } else if (item.expiry < advisoryDeadline) {
      docAdvisories.push(
        `${item.label} expires ${toISODate(item.expiry)} — valid but within 6 months of return.`
      );
    }
  }

  checks.push({
    rule: 'Document Validity — 4-Month Rule',
    passed: docFailures.length === 0,
    isWarning: false,
    message: docFailures.length === 0
      ? 'All provided documents meet the 4-month validity requirement beyond the return date.'
      : docFailures.join(' '),
  });

  if (docAdvisories.length > 0) {
    checks.push({
      rule: '6-Month Airline Advisory',
      passed: true,
      isWarning: true,
      message: `Advisory: ${docAdvisories.join(' ')} Many airlines and customs agencies enforce a strict 6-month passport validity rule. We recommend checking the entry requirements for your airline and destination country.`,
    });
  }

  // ── 6. Departmental Coverage Cap ─────────────────────────────────────────
  const dept = employee.department as Department;
  const deptCap = DEPT_CAPS[dept];
  const excludeClause = excludeRequestId ? 'AND lr.id != ?' : '';
  const deptParams: unknown[] = [dept, toISODate(endDate), toISODate(startDate)];
  if (excludeRequestId) deptParams.push(excludeRequestId);

  const deptOverlap = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    WHERE e.department = ?
      AND lr.status = 'APPROVED'
      AND lr.start_date <= ?
      AND lr.end_date   >= ?
      ${excludeClause}
  `).get(...deptParams) as { cnt: number }).cnt;

  const deptPassed = deptOverlap < deptCap;
  checks.push({
    rule: `Departmental Cap — ${dept.replace(/_/g, ' ')}`,
    passed: deptPassed,
    isWarning: false,
    message: deptPassed
      ? `Department has ${deptOverlap} of ${deptCap} simultaneous leave slots filled for this period.`
      : `Departmental cap reached: ${dept.replace(/_/g, ' ')} allows a maximum of ${deptCap} employee(s) away simultaneously. Currently ${deptOverlap} approved.`,
  });

  // ── 7. Seasonal Company-Wide Cap ─────────────────────────────────────────
  const seasonWindow = getMostRestrictiveWindow(startDate, endDate);
  if (seasonWindow) {
    const seasonParams: unknown[] = [toISODate(endDate), toISODate(startDate)];
    if (excludeRequestId) seasonParams.push(excludeRequestId);

    const companyOverlap = (db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM leave_requests
      WHERE status = 'APPROVED'
        AND start_date <= ?
        AND end_date   >= ?
        ${excludeRequestId ? 'AND id != ?' : ''}
    `).get(...seasonParams) as { cnt: number }).cnt;

    const seasonPassed = companyOverlap < seasonWindow.maxCompanyWide;
    checks.push({
      rule: `Seasonal Allowance — ${seasonWindow.name}`,
      passed: seasonPassed,
      isWarning: false,
      message: seasonPassed
        ? `${seasonWindow.name}: ${companyOverlap} of ${seasonWindow.maxCompanyWide} company-wide slots used.`
        : `Company-wide seasonal limit reached for ${seasonWindow.name} (max ${seasonWindow.maxCompanyWide}). Currently ${companyOverlap} employees approved for overlapping dates. Note: Seasonal allowances supersede departmental caps.`,
    });
  }

  // ── Final result ─────────────────────────────────────────────────────────
  const failures = checks.filter(c => !c.passed && !c.isWarning);
  const warnings = checks.filter(c => c.isWarning);
  const passes   = checks.filter(c => c.passed && !c.isWarning);
  const eligible = failures.length === 0;

  return {
    eligible,
    status: eligible ? 'APPROVED' : 'DENIED',
    failures,
    warnings,
    passes,
    adjustedEndDate: adjustedEndDate ? toISODate(adjustedEndDate) : null,
  };
}
