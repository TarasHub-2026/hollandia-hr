import { db } from '../db/database';
import { notifyEmployeeInApp } from './employeeNotify';
import { sendMail, mailEnabled, layout, firstName } from './mailer';

// Greets employees on their birthday and on their work anniversary. Each greeting is an in-app notice (with a
// pop-up on their dashboard), a phone alert if they turned alerts on, and an email if email is set up.
// Checked on start-up and every 10 minutes, but nothing goes out before 7:00 am Vancouver time. A greeting is only
// sent on the day itself and only once per person, per kind, per year. A 29 February birthday is greeted on 28 February
// in years that have no 29 February. Set GREETINGS=false on the server to switch this off.

const TZ = 'America/Vancouver';
const SEND_AFTER_HOUR = 7;
const CHECK_EVERY_MS = 10 * 60 * 1000;

const todayInBC = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const hourInBC = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Person { id: string; name: string; email: string | null; hire_date: string | null; date_of_birth: string | null }

/** Posts any greetings that are due for the given day (YYYY-MM-DD). Returns how many were sent. */
export function runGreetings(today: string = todayInBC()): number {
  if ((process.env.GREETINGS || '').trim().toLowerCase() === 'false') return 0;
  const [Y, M, D] = today.split('-').map(Number);
  const leap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0;
  // The same month and day as today (a 29 February date counts on 28 February when the year has no 29 February).
  const onToday = (iso: string | null): boolean => {
    if (!iso) return false;
    const [, m, d] = iso.slice(0, 10).split('-').map(Number);
    return (m === M && d === D) || (m === 2 && d === 29 && !leap && M === 2 && D === 28);
  };

  const people = db.prepare(`SELECT id, name, email, hire_date, date_of_birth FROM employees WHERE role != 'ADMIN' AND (active IS NULL OR active = 1)`).all() as Person[];
  const done = db.prepare(`SELECT 1 FROM greetings_sent WHERE employee_id = ? AND kind = ? AND year = ?`);
  const mark = db.prepare(`INSERT OR IGNORE INTO greetings_sent (employee_id, kind, year, sent_at) VALUES (?, ?, ?, ?)`);
  const link = (process.env.APP_URL || 'https://tarashub-2026.github.io/hollandia-hr/').trim();
  const emails: { to: string; subject: string; html: string; text: string }[] = [];
  let count = 0;

  const greet = (p: Person, kind: 'BIRTHDAY' | 'ANNIVERSARY', title: string, message: string) => {
    notifyEmployeeInApp(p.id, kind, title, message);
    mark.run(p.id, kind, Y, new Date().toISOString());
    count++;
    if (mailEnabled() && process.env.NOTIFY_EMPLOYEE !== 'false' && p.email && /^\S+@\S+\.\S+$/.test(p.email)) {
      emails.push({ to: p.email, subject: title, ...layout(title, [], `Hi ${firstName(p.name)}, ${message}`, 'Open the app', link) });
    }
  };

  for (const p of people) {
    const first = firstName(p.name);
    if (onToday(p.date_of_birth) && !done.get(p.id, 'BIRTHDAY', Y)) {
      greet(p, 'BIRTHDAY', `Happy Birthday, ${first}!`, 'Everyone at Hollandia Greenhouses wishes you a wonderful birthday. Thank you for being part of our team!');
    }
    const hireYear = p.hire_date ? Number(p.hire_date.slice(0, 4)) : 0;
    if (onToday(p.hire_date) && hireYear > 0 && hireYear < Y && !done.get(p.id, 'ANNIVERSARY', Y)) {
      const years = Y - hireYear;
      greet(p, 'ANNIVERSARY', `Happy work anniversary, ${first}!`, `Today marks ${years} year${years === 1 ? '' : 's'} with Hollandia Greenhouses. Thank you for your hard work and dedication!`);
    }
  }

  // Emails go out one at a time, in the background, to stay under the mail service's rate limit.
  if (emails.length) void (async () => { for (const m of emails) { await sendMail(m); await sleep(600); } })();
  if (count) console.log(`[greetings] Sent ${count} birthday/anniversary greeting(s).`);
  return count;
}

export function startGreetings(): void {
  const tick = () => {
    try { if (hourInBC() >= SEND_AFTER_HOUR) runGreetings(); }
    catch (e) { console.warn('[greetings] check failed:', e instanceof Error ? e.message : e); }
  };
  setTimeout(tick, 45 * 1000);
  setInterval(tick, CHECK_EVERY_MS);
}
