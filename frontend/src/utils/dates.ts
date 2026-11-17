/** Parses a "YYYY-MM-DD" (or ISO) date as a local calendar day, so it never shifts a day in western time zones. */
export function localDate(s: string): Date {
  const [y, m, d] = s.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Days of leave: the days away before the date of return to work (Nov 23 to Nov 24 is 1 day). A same-day return counts as 1. */
export function leaveDays(start: string, end: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.max(1, Math.round((p(end) - p(start)) / 86400000));
}
