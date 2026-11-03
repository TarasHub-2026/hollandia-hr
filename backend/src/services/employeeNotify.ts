import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { notifyUserPush } from './push';
import { sendMail, mailEnabled, layout, firstName, fmtDate } from './mailer';

// Tells an employee about a decision on their leave: an in-app notice (with pop-up and badge), a phone alert
// if they turned alerts on, and an email if email is set up. Never throws and never blocks the HR action.

interface Deliver {
  employeeId: string; kind: string; title: string; base: string; note?: string;
  leaveRequestId?: string; rows: [string, string][];
}

function deliver(o: Deliver): void {
  try {
    const emp = db.prepare(`SELECT name, email, role FROM employees WHERE id = ?`).get(o.employeeId) as { name: string; email: string | null; role: string } | undefined;
    if (!emp || emp.role === 'ADMIN') return;
    const message = o.note ? `${o.base} Note from HR: ${o.note}` : o.base;
    const now = new Date();
    db.prepare(`DELETE FROM employee_notices WHERE created_at < ?`).run(new Date(now.getTime() - 60 * 86400000).toISOString());
    db.prepare(`INSERT INTO employee_notices (id, employee_id, kind, title, message, leave_request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), o.employeeId, o.kind, o.title, message, o.leaveRequestId ?? null, now.toISOString());
    notifyUserPush(o.employeeId, o.title, message);

    if (mailEnabled() && process.env.NOTIFY_EMPLOYEE !== 'false' && emp.email && /^\S+@\S+\.\S+$/.test(emp.email)) {
      const link = (process.env.APP_URL || 'https://tarashub-2026.github.io/hollandia-hr/').trim();
      const rows: [string, string][] = o.note ? [...o.rows, ['Note from HR', o.note]] : o.rows;
      const m = layout(o.title, rows, `Hi ${firstName(emp.name)}, ${o.base}`, 'Open the app', link);
      void sendMail({ to: emp.email, subject: o.title, ...m });
    }
  } catch (e) {
    console.warn('[notify] could not notify employee:', e instanceof Error ? e.message : e);
  }
}

const range = (s: string, e: string) => `${fmtDate(s)} to ${fmtDate(e)}`;

/** HR approved, denied or cancelled a leave request. */
export function notifyLeaveDecision(employeeId: string, status: 'APPROVED' | 'DENIED' | 'CANCELLED', start: string, end: string, note: string, leaveRequestId: string): void {
  const word = status === 'APPROVED' ? 'approved' : status === 'DENIED' ? 'denied' : 'cancelled';
  deliver({
    employeeId, kind: status, title: `Leave ${word}`, leaveRequestId, note,
    base: `Your leave request for ${range(start, end)} was ${word}.`,
    rows: [['Leave dates', range(start, end)], ['Decision', word[0].toUpperCase() + word.slice(1)]],
  });
}

/** HR approved or denied an employee's request to change the dates of their leave. */
export function notifyDateChangeDecision(employeeId: string, approved: boolean, oldS: string, oldE: string, newS: string, newE: string, note: string, leaveRequestId: string): void {
  deliver({
    employeeId, kind: approved ? 'DATE_CHANGE_APPROVED' : 'DATE_CHANGE_DENIED', title: approved ? 'Date change approved' : 'Date change denied', leaveRequestId, note,
    base: approved
      ? `HR approved your date change. Your leave is now ${range(newS, newE)}.`
      : `HR denied your date change request (${range(newS, newE)}). Your leave stays ${range(oldS, oldE)}.`,
    rows: [['Requested dates', range(newS, newE)], ['Current leave dates', approved ? range(newS, newE) : range(oldS, oldE)], ['Decision', approved ? 'Approved' : 'Denied']],
  });
}

/** HR changed the dates of a leave directly. */
export function notifyDatesChangedByHr(employeeId: string, oldS: string, oldE: string, newS: string, newE: string, leaveRequestId: string): void {
  deliver({
    employeeId, kind: 'DATES_CHANGED', title: 'Leave dates changed', leaveRequestId,
    base: `HR changed your leave dates from ${range(oldS, oldE)} to ${range(newS, newE)}.`,
    rows: [['Previous dates', range(oldS, oldE)], ['New dates', range(newS, newE)]],
  });
}