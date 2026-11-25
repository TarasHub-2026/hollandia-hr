import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { logAudit } from '../middleware/audit';
import { notifyAdminsPush } from './push';
import { fmtDate } from './mailer';

// Tells the HR administrators who is about to go on leave, so nobody is caught by surprise:
//   - a week before the Leave Start date (any approved leave that is 2 to 7 days away and not announced yet),
//   - a follow-up reminder the day before,
//   - and a final reminder on the day.
// Each reminder is an HR-only announcement (employees never see it), a phone/desktop push to every subscribed
// administrator device, and an in-app pop-up for administrators who have the app open.
// Only approved leave is announced. One announcement covers everyone starting on the same date.

const TZ = 'America/Vancouver';
const SEND_AFTER_HOUR = 7; // local time, so phone alerts arrive in the morning and not at midnight
const CHECK_EVERY_MS = 10 * 60 * 1000;

type Stage = 'WEEK' | 'DAY_BEFORE' | 'TODAY';

const todayInBC = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const hourInBC = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
const utc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);
const addDays = (iso: string, n: number) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);

function stageFor(daysAway: number): Stage | null {
  if (daysAway === 0) return 'TODAY';
  if (daysAway === 1) return 'DAY_BEFORE';
  if (daysAway >= 2 && daysAway <= 7) return 'WEEK';
  return null;
}

function whenText(stage: Stage, daysAway: number): string {
  if (stage === 'TODAY') return 'today';
  if (stage === 'DAY_BEFORE') return 'tomorrow';
  return daysAway === 7 ? 'in 1 week' : `in ${daysAway} days`;
}

interface Due { id: string; name: string; department: string; start: string; end: string; purpose: string | null }

/** The leave type(s) are stored at the start of the request purpose as "[Type A, Type B]". */
function leaveTypeOf(purpose: string | null): string {
  const m = /^\[([^\]]*)\]/.exec(purpose || '');
  const t = m ? m[1].replace(/\s+\(.*?\)/g, '').replace(/\s+/g, ' ').trim() : '';
  return (t || 'Type not specified').slice(0, 100);
}

/** Posts any reminders that are due. Safe to call as often as you like: each reminder is only ever sent once. Returns how many announcements were posted. */
export function runLeaveStartReminders(now = new Date()): number {
  const today = todayInBC();
  const rows = db.prepare(`
    SELECT lr.id, e.name, e.department, substr(lr.start_date, 1, 10) AS start, substr(lr.end_date, 1, 10) AS end, lr.purpose AS purpose
    FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
    WHERE lr.status = 'APPROVED' AND substr(lr.start_date, 1, 10) BETWEEN ? AND ?
    ORDER BY lr.start_date, e.name
  `).all(today, addDays(today, 7)) as Due[];

  const sent = db.prepare(`SELECT 1 FROM leave_start_reminders WHERE leave_request_id = ? AND stage = ? AND start_date = ?`);
  const groups = new Map<string, { stage: Stage; daysAway: number; start: string; people: Due[] }>();
  for (const r of rows) {
    const daysAway = daysBetween(today, r.start);
    const stage = stageFor(daysAway);
    if (!stage || sent.get(r.id, stage, r.start)) continue;
    const key = `${stage}|${r.start}`;
    if (!groups.has(key)) groups.set(key, { stage, daysAway, start: r.start, people: [] });
    groups.get(key)!.people.push(r);
  }

  let posted = 0;
  for (const g of groups.values()) {
    const when = whenText(g.stage, g.daysAway);
    const names = g.people.map(p => p.name);
    const who = g.people.length === 1 ? names[0] : `${g.people.length} employees`;
    const title = `${g.stage === 'WEEK' ? 'Heads up: leave' : 'Reminder: leave'} starting ${when}: ${who}`;
    const lines = g.people.map(p => `• ${p.name} (${p.department.replace(/_/g, ' ').toLowerCase()}) - ${leaveTypeOf(p.purpose)}: leave starts ${fmtDate(p.start)}, back to work ${fmtDate(p.end)}`);
    const body = `Leave Start: ${fmtDate(g.start)} (${when}).\n${lines.join('\n')}`.slice(0, 2000);
    const stamp = now.toISOString();
    const annId = uuidv4();

    db.transaction(() => {
      // Shown to administrators only (audience HR) until the start date has passed.
      db.prepare(`INSERT INTO announcements (id, title, body, created_at, updated_at, created_by, ends_on, audience) VALUES (?, ?, ?, ?, ?, NULL, ?, 'HR')`)
        .run(annId, title.slice(0, 120), body, stamp, stamp, g.start);
      const mark = db.prepare(`INSERT OR IGNORE INTO leave_start_reminders (leave_request_id, stage, start_date, sent_at) VALUES (?, ?, ?, ?)`);
      g.people.forEach(p => mark.run(p.id, g.stage, g.start, stamp));
    })();

    // Phone / desktop alert for every administrator device that turned alerts on.
    notifyAdminsPush(title, g.people.length === 1 ? lines[0].replace(/^• /, '') : `${names.slice(0, 4).join(', ')}${names.length > 4 ? `, +${names.length - 4} more` : ''} (Leave Start ${fmtDate(g.start)})`);
    // Pop-up for administrators who have the app open: the pop-up feed reads this audit entry.
    logAudit(null, 'LEAVE_START_REMINDER', { targetType: 'announcement', targetId: annId, targetName: who, details: `Leave starts ${when} (${fmtDate(g.start)})` });
    posted++;
  }
  if (posted) console.log(`[reminders] Posted ${posted} leave start reminder(s) for HR.`);
  return posted;
}

/** Checks on start-up and then every 10 minutes. Nothing is sent before 7:00 am Vancouver time. */
export function startLeaveStartReminders(): void {
  const tick = () => {
    try { if (hourInBC() >= SEND_AFTER_HOUR) runLeaveStartReminders(); }
    catch (e) { console.warn('[reminders] leave start check failed:', e instanceof Error ? e.message : e); }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, CHECK_EVERY_MS);
}
