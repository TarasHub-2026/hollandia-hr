/** Parses a "YYYY-MM-DD" (or ISO) date as a local calendar day, so it never shifts a day in western time zones. */
export function localDate(s: string): Date {
  const [y, m, d] = s.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}