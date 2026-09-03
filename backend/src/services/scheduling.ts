import { SCHEDULE_PERIODS, SEASONAL_WINDOWS } from '../data/leaveSchedule';
import type { SchedulePeriod, SeasonalWindow } from '../data/leaveSchedule';

// ─── Core date-in-period helper ──────────────────────────────────────────────
// Handles year-wrapping periods (e.g. Block 1: Nov 15 → Jan 25)
function monthDayInPeriod(
  month: number,
  day: number,
  p: { startMonth: number; startDay: number; endMonth: number; endDay: number }
): boolean {
  const md      = month * 100 + day;
  const startMD = p.startMonth * 100 + p.startDay;
  const endMD   = p.endMonth   * 100 + p.endDay;
  if (startMD <= endMD) {
    return md >= startMD && md <= endMD;
  }
  // Year-wrapping: e.g. Nov(11) > Jan(1) — matches Nov–Dec AND Jan
  return md >= startMD || md <= endMD;
}

// ─── Schedule period lookup ───────────────────────────────────────────────────
export function getPeriodForDate(date: Date): SchedulePeriod | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  // Peak periods are listed first in SEASONAL_WINDOWS but schedule periods
  // are what we need here. Search in declared order; Block 5 and Block 1 share
  // Nov 15-16, so the first match (Block 1 after Nov 15) is fine — both are APPROVED.
  for (const p of SCHEDULE_PERIODS) {
    if (monthDayInPeriod(m, d, p)) return p;
  }
  return null;
}

export function isDateInBlackout(date: Date): boolean {
  const p = getPeriodForDate(date);
  return p?.type === 'BLACKOUT';
}

// ─── Seasonal window lookup ───────────────────────────────────────────────────
// Returns the MOST RESTRICTIVE window that applies to a date (peak > spring > etc.)
export function getSeasonalWindowForDate(date: Date): SeasonalWindow | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  for (const w of SEASONAL_WINDOWS) {
    if (monthDayInPeriod(m, d, w)) return w;
  }
  return null;
}

// Returns the most restrictive window across the entire date range
export function getMostRestrictiveWindow(
  start: Date,
  end: Date
): SeasonalWindow | null {
  let worst: SeasonalWindow | null = null;
  const cur = new Date(start);
  while (cur <= end) {
    const w = getSeasonalWindowForDate(cur);
    if (w && (!worst || w.maxCompanyWide < worst.maxCompanyWide)) {
      worst = w;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return worst;
}

// ─── Range helpers ────────────────────────────────────────────────────────────
export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function datesOverlap(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1 <= e2 && e1 >= s2;
}

export function rangeContainsBlackout(start: Date, end: Date): boolean {
  const cur = new Date(start);
  while (cur <= end) {
    if (isDateInBlackout(cur)) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

// Find the latest end date starting from `start` that stays within 75 days
// AND does not cross into any blackout period.
export function findMaxNonBlackoutEnd(start: Date, maxDays: number): Date {
  const hardEnd = new Date(start);
  hardEnd.setDate(hardEnd.getDate() + maxDays - 1);

  const cur = new Date(start);
  while (cur <= hardEnd) {
    if (isDateInBlackout(cur)) {
      const adjusted = new Date(cur);
      adjusted.setDate(adjusted.getDate() - 1);
      return adjusted < start ? start : adjusted;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return hardEnd;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}
