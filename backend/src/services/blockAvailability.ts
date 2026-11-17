import { db } from '../db/database';
import { SCHEDULE_PERIODS } from '../data/leaveSchedule';
import { DEPT_CAPS } from '../data/policy';

// Company-wide allowance per block. Mirrors the cards on the HR dashboard (BlockCapacity.tsx).
const BLOCK_INFO: Record<string, { season: string; cap: number }> = {
  'Block 1': { season: 'Winter', cap: 10 },
  'Block 2': { season: 'Spring', cap: 2 },
  'Block 3': { season: 'Late Spring / Early Summer', cap: 2 },
  'Block 4': { season: 'Summer', cap: 6 },
  'Block 5': { season: 'Autumn / Early Winter', cap: 6 },
};

export type BlockState = 'OPEN' | 'LIMITED' | 'FULL' | 'ENDED';

export interface BlockAvailability {
  name: string;
  season: string;
  startDate: string;      // ISO yyyy-mm-dd of the window being reported
  endDate: string;
  inProgress: boolean;    // today falls inside this window
  cap: number;
  used: number;           // peak number away at once (approved + pending, no names)
  spotsLeft: number;
  deptCap: number;
  deptUsed: number;
  deptSpotsLeft: number;
  state: BlockState;
  available: boolean;     // open for this employee: company-wide AND department both have room
  reason: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Highest number of leaves that are away at the same moment. */
function peak(items: { start: string; end: string }[]): number {
  let max = 0;
  for (const a of items) {
    const n = items.filter(b => b.start <= a.start && b.end >= a.start).length;
    if (n > max) max = n;
  }
  return max;
}

/** Years an employee can look at: this year and the next few. */
export const YEARS_AHEAD = 3;
export function selectableYears(today = new Date()): number[] {
  return Array.from({ length: YEARS_AHEAD }, (_, i) => today.getFullYear() + i);
}

/**
 * Availability of each block. With no `year`, reports the first window of each block that has not finished yet
 * (the current one, or the next one coming up). With a `year`, reports that block year, the same way the HR
 * dashboard groups them: Block 1 starts in November of that year and runs into the next; Blocks 2 to 5 fall inside it.
 */
export function blockAvailability(department: string, today = new Date(), year?: number): BlockAvailability[] {
  const todayIso = iso(today);
  const rows = db.prepare(`
    SELECT lr.start_date AS s, lr.end_date AS e, emp.department AS d
    FROM leave_requests lr JOIN employees emp ON emp.id = lr.employee_id
    WHERE lr.status IN ('APPROVED', 'PENDING')
  `).all() as { s: string; e: string; d: string }[];
  const leaves = rows.map(r => ({ start: r.s.split('T')[0], end: r.e.split('T')[0], dept: r.d }));

  const deptCap = (DEPT_CAPS as Record<string, number>)[department] ?? 0;
  const out: BlockAvailability[] = [];

  for (const p of SCHEDULE_PERIODS) {
    const info = BLOCK_INFO[p.name];
    if (p.type !== 'APPROVED' || !info) continue;

    // The window being reported: the chosen block year, or the earliest one that has not ended.
    const windowFor = (y: number) => ({
      start: iso(new Date(y, p.startMonth - 1, p.startDay)),
      end: iso(new Date(p.endMonth < p.startMonth ? y + 1 : y, p.endMonth - 1, p.endDay)),
    });
    let win: { start: string; end: string } | null = null;
    if (year !== undefined) win = windowFor(year);
    else for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
      const w = windowFor(y);
      if (w.end >= todayIso) { win = w; break; }
    }
    if (!win) continue;

    if (win.end < todayIso) {
      out.push({
        name: p.name, season: info.season, startDate: win.start, endDate: win.end, inProgress: false,
        cap: info.cap, used: 0, spotsLeft: 0, deptCap, deptUsed: 0, deptSpotsLeft: 0,
        state: 'ENDED', available: false, reason: 'This block has already finished.',
      });
      continue;
    }

    const inWindow = leaves.filter(l => l.start <= win!.end && l.end >= win!.start);
    const used = peak(inWindow);
    const deptUsed = peak(inWindow.filter(l => l.dept === department));
    const spotsLeft = Math.max(0, info.cap - used);
    const deptSpotsLeft = Math.max(0, deptCap - deptUsed);
    const available = spotsLeft > 0 && deptSpotsLeft > 0;

    let reason = `${spotsLeft} of ${info.cap} company spots open.`;
    if (spotsLeft === 0) reason = used > info.cap ? 'Company-wide limit is over capacity.' : 'Company-wide limit reached.';
    else if (deptSpotsLeft === 0) reason = 'Your department already has its maximum away at once.';

    out.push({
      name: p.name, season: info.season, startDate: win.start, endDate: win.end,
      inProgress: win.start <= todayIso,
      cap: info.cap, used, spotsLeft, deptCap, deptUsed, deptSpotsLeft,
      state: !available ? 'FULL' : spotsLeft <= 1 || deptSpotsLeft <= 1 ? 'LIMITED' : 'OPEN',
      available, reason,
    });
  }
  // "Upcoming" is shown in date order; a chosen year keeps Block 1 to 5 order.
  return year === undefined ? out.sort((a, b) => a.startDate.localeCompare(b.startDate)) : out;
}
