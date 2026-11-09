import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth, requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { notifyEmployeeInApp } from '../services/employeeNotify';
import { notifyAdminsPush } from '../services/push';
import { notifyHrEmail } from '../services/mailer';

const router = Router();

const TITLE_MAX = 120, BODY_MAX = 2000, MAX_RECIPIENTS = 500;
const DEPARTMENTS = ['GREENHOUSE', 'WAREHOUSE', 'OFFICE', 'PACKING_WATER_BUCKET', 'LOGISTICS', 'SHIPPING', 'MAINTENANCE'];
type Row = Record<string, any>;

/** Today's date in the company's time zone, so an end date lasts until the end of that day in BC. */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
const snippet = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

/** People who sign in as employees: active, with a profile. */
const READERS_SQL = `role != 'ADMIN' AND (active IS NULL OR active = 1) AND registered = 1`;

// ───────────────────────── Announcements ─────────────────────────

function announcementRow(a: Row) {
  return {
    id: a.id, title: a.title, body: a.body, createdAt: a.created_at, updatedAt: a.updated_at,
    endsOn: a.ends_on ?? null, expired: !!a.ends_on && a.ends_on < today(),
  };
}

// GET /api/comms/announcements
//   employee: announcements that are still active, each with whether they acknowledged it
//   HR: every non-removed announcement, each with who has and has not acknowledged it
router.get('/announcements', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role !== 'ADMIN') {
    const rows = db.prepare(`
      SELECT an.*, (SELECT read_at FROM announcement_reads r WHERE r.announcement_id = an.id AND r.employee_id = ?) AS my_read
      FROM announcements an
      WHERE an.removed = 0 AND (an.ends_on IS NULL OR an.ends_on >= ?)
      ORDER BY an.created_at DESC`).all(a.id, today()) as Row[];
    return res.json(rows.map(r => ({ ...announcementRow(r), acknowledged: !!r.my_read })));
  }
  const readers = db.prepare(`SELECT id, name, employee_number FROM employees WHERE ${READERS_SQL} ORDER BY name COLLATE NOCASE`).all() as Row[];
  const reads = db.prepare(`SELECT announcement_id, employee_id, read_at FROM announcement_reads`).all() as Row[];
  const byAnn = new Map<string, Map<string, string>>();
  reads.forEach(r => { if (!byAnn.has(r.announcement_id)) byAnn.set(r.announcement_id, new Map()); byAnn.get(r.announcement_id)!.set(r.employee_id, r.read_at); });
  const rows = db.prepare(`SELECT * FROM announcements WHERE removed = 0 ORDER BY created_at DESC`).all() as Row[];
  res.json(rows.map(r => {
    const got = byAnn.get(r.id) ?? new Map<string, string>();
    return {
      ...announcementRow(r),
      readCount: readers.filter(e => got.has(e.id)).length,
      total: readers.length,
      notRead: readers.filter(e => !got.has(e.id)).map(e => ({ id: e.id, name: e.name, employeeNumber: e.employee_number ?? '' })),
      readBy: readers.filter(e => got.has(e.id)).map(e => ({ id: e.id, name: e.name, employeeNumber: e.employee_number ?? '', readAt: got.get(e.id) })),
    };
  }));
});

// POST /api/comms/announcements  (HR posts; every employee gets a pop-up and phone alert)
router.post('/announcements', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Row;
  const title = cleanText(b.title, TITLE_MAX), body = cleanText(b.body, BODY_MAX);
  if (!title) return res.status(400).json({ error: 'Enter a title for the announcement.' });
  if (!body) return res.status(400).json({ error: 'Enter the announcement message.' });
  let endsOn: string | null = null;
  if (b.endsOn) {
    if (!validDate(b.endsOn)) return res.status(400).json({ error: 'The end date is not valid.' });
    if (b.endsOn < today()) return res.status(400).json({ error: 'The end date cannot be in the past.' });
    endsOn = b.endsOn;
  }
  const id = uuidv4(), now = new Date().toISOString();
  db.prepare(`INSERT INTO announcements (id, title, body, created_at, updated_at, created_by, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, body, now, now, getAuth(req)!.id, endsOn);
  const people = db.prepare(`SELECT id FROM employees WHERE ${READERS_SQL}`).all() as { id: string }[];
  people.forEach(p => notifyEmployeeInApp(p.id, 'ANNOUNCEMENT', `Important announcement: ${title}`, snippet(body)));
  logAudit(req, 'ANNOUNCEMENT_POST', { targetType: 'announcement', targetId: id, targetName: title, details: `Sent to ${people.length} employee(s)${endsOn ? ` | until ${endsOn}` : ''}` });
  res.status(201).json({ id, notified: people.length });
});

// PUT /api/comms/announcements/:id  (edit text or end date; does not notify again)
router.put('/announcements/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const cur = db.prepare(`SELECT * FROM announcements WHERE id = ? AND removed = 0`).get(id) as Row | undefined;
  if (!cur) return res.status(404).json({ error: 'Announcement not found.' });
  const b = (req.body || {}) as Row;
  const title = cleanText(b.title, TITLE_MAX), body = cleanText(b.body, BODY_MAX);
  if (!title || !body) return res.status(400).json({ error: 'The title and message cannot be empty.' });
  let endsOn: string | null = null;
  if (b.endsOn) {
    if (!validDate(b.endsOn)) return res.status(400).json({ error: 'The end date is not valid.' });
    endsOn = b.endsOn;
  }
  db.prepare(`UPDATE announcements SET title = ?, body = ?, ends_on = ?, updated_at = ? WHERE id = ?`).run(title, body, endsOn, new Date().toISOString(), id);
  logAudit(req, 'ANNOUNCEMENT_EDIT', { targetType: 'announcement', targetId: id, targetName: title });
  res.json({ ok: true });
});

// DELETE /api/comms/announcements/:id  (takes it off every employee's screen)
router.delete('/announcements/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const cur = db.prepare(`SELECT title FROM announcements WHERE id = ? AND removed = 0`).get(id) as Row | undefined;
  if (!cur) return res.status(404).json({ error: 'Announcement not found.' });
  db.prepare(`UPDATE announcements SET removed = 1, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  logAudit(req, 'ANNOUNCEMENT_REMOVE', { targetType: 'announcement', targetId: id, targetName: cur.title });
  res.json({ ok: true });
});

// POST /api/comms/announcements/:id/ack  (an employee taps "Got it")
router.post('/announcements/:id/ack', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role === 'ADMIN') return res.json({ ok: true });
  const id = req.params.id as string;
  const ok = db.prepare(`SELECT 1 FROM announcements WHERE id = ? AND removed = 0`).get(id);
  if (!ok) return res.status(404).json({ error: 'Announcement not found.' });
  db.prepare(`INSERT OR IGNORE INTO announcement_reads (announcement_id, employee_id, read_at) VALUES (?, ?, ?)`).run(id, a.id, new Date().toISOString());
  res.json({ ok: true });
});

// ───────────────────────── Private messages ─────────────────────────

// Each recipient gets their own thread, so replies stay private between that employee and HR.

function threadList(a: { id: string; role: string }): Row[] {
  const isAdmin = a.role === 'ADMIN';
  // "unread" = messages written by the other side that this person has not opened yet
  const other = isAdmin ? 'EMPLOYEE' : 'HR';
  return db.prepare(`
    SELECT t.id, t.subject, t.created_at, t.last_message_at, t.employee_id,
           e.name AS employee_name, e.employee_number, e.department,
           (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND m.sender_role = ? AND m.read_at IS NULL) AS unread,
           (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, rowid DESC LIMIT 1) AS last_body,
           (SELECT sender_role FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, rowid DESC LIMIT 1) AS last_sender
    FROM message_threads t JOIN employees e ON e.id = t.employee_id
    ${isAdmin ? '' : 'WHERE t.employee_id = ?'}
    ORDER BY t.last_message_at DESC`).all(...(isAdmin ? [other] : [other, a.id])) as Row[];
}

// GET /api/comms/threads
router.get('/threads', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  res.json(threadList(a).map(t => ({
    id: t.id, subject: t.subject, createdAt: t.created_at, lastMessageAt: t.last_message_at,
    employeeId: t.employee_id, employeeName: t.employee_name, employeeNumber: t.employee_number ?? '', department: t.department,
    unread: t.unread, lastBody: snippet(t.last_body ?? '', 90), lastSender: t.last_sender,
  })));
});

// GET /api/comms/summary  (numbers for the menu badges)
router.get('/summary', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  if (a.role === 'ADMIN') {
    const unread = (db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE sender_role = 'EMPLOYEE' AND read_at IS NULL`).get() as Row).c;
    return res.json({ unreadMessages: unread, newAnnouncements: 0 });
  }
  const unread = (db.prepare(`SELECT COUNT(*) AS c FROM messages m JOIN message_threads t ON t.id = m.thread_id WHERE t.employee_id = ? AND m.sender_role = 'HR' AND m.read_at IS NULL`).get(a.id) as Row).c;
  const ann = (db.prepare(`SELECT COUNT(*) AS c FROM announcements an WHERE an.removed = 0 AND (an.ends_on IS NULL OR an.ends_on >= ?)
      AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = an.id AND r.employee_id = ?)`).get(today(), a.id) as Row).c;
  res.json({ unreadMessages: unread, newAnnouncements: ann });
});

// GET /api/comms/threads/:id  (opening a thread marks the other side's messages as read)
router.get('/threads/:id', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  const t = db.prepare(`SELECT t.*, e.name AS employee_name, e.employee_number FROM message_threads t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?`).get(id) as Row | undefined;
  if (!t) return res.status(404).json({ error: 'Conversation not found.' });
  if (a.role !== 'ADMIN' && t.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  const mine = a.role === 'ADMIN' ? 'HR' : 'EMPLOYEE';
  db.prepare(`UPDATE messages SET read_at = ? WHERE thread_id = ? AND sender_role != ? AND read_at IS NULL`).run(new Date().toISOString(), id, mine);
  const msgs = db.prepare(`SELECT m.id, m.sender_role, m.body, m.created_at, m.read_at, e.name AS sender_name
      FROM messages m LEFT JOIN employees e ON e.id = m.sender_id WHERE m.thread_id = ? ORDER BY m.created_at, m.rowid`).all(id) as Row[];
  res.json({
    id: t.id, subject: t.subject, employeeId: t.employee_id, employeeName: t.employee_name, employeeNumber: t.employee_number ?? '',
    messages: msgs.map(m => ({ id: m.id, from: m.sender_role, senderName: m.sender_role === 'HR' ? 'HR' : m.sender_name, body: m.body, createdAt: m.created_at, readAt: m.read_at })),
  });
});

// POST /api/comms/threads  (HR starts a conversation with chosen employees and/or a whole department)
router.post('/threads', requireAdmin, (req: Request, res: Response) => {
  const b = (req.body || {}) as Row;
  const subject = cleanText(b.subject, TITLE_MAX), body = cleanText(b.body, BODY_MAX);
  if (!subject) return res.status(400).json({ error: 'Enter a subject.' });
  if (!body) return res.status(400).json({ error: 'Enter your message.' });

  const ids = new Set<string>();
  if (Array.isArray(b.recipientIds)) b.recipientIds.forEach((x: unknown) => { if (typeof x === 'string') ids.add(x); });
  if (b.department) {
    if (!DEPARTMENTS.includes(String(b.department))) return res.status(400).json({ error: 'Choose a valid department.' });
    (db.prepare(`SELECT id FROM employees WHERE role != 'ADMIN' AND (active IS NULL OR active = 1) AND department = ?`).all(String(b.department)) as { id: string }[]).forEach(r => ids.add(r.id));
  }
  if (!ids.size) return res.status(400).json({ error: 'Choose at least one employee or a department.' });
  if (ids.size > MAX_RECIPIENTS) return res.status(400).json({ error: `You can message up to ${MAX_RECIPIENTS} people at once.` });

  const people = [...ids].map(id => db.prepare(`SELECT id, name FROM employees WHERE id = ? AND role != 'ADMIN' AND (active IS NULL OR active = 1)`).get(id) as { id: string; name: string } | undefined).filter(Boolean) as { id: string; name: string }[];
  if (!people.length) return res.status(404).json({ error: 'None of those employees could be found.' });

  const adminId = getAuth(req)!.id, now = new Date().toISOString();
  db.transaction(() => {
    for (const p of people) {
      const tid = uuidv4();
      db.prepare(`INSERT INTO message_threads (id, employee_id, subject, created_at, created_by, last_message_at) VALUES (?, ?, ?, ?, ?, ?)`).run(tid, p.id, subject, now, adminId, now);
      db.prepare(`INSERT INTO messages (id, thread_id, sender_role, sender_id, body, created_at) VALUES (?, ?, 'HR', ?, ?, ?)`).run(uuidv4(), tid, adminId, body, now);
    }
  })();
  people.forEach(p => notifyEmployeeInApp(p.id, 'MESSAGE', `Message from HR: ${subject}`, snippet(body)));
  logAudit(req, 'MESSAGE_SEND', { targetType: 'message', targetName: subject, details: `To ${people.length} employee(s): ${people.slice(0, 5).map(p => p.name).join(', ')}${people.length > 5 ? '…' : ''}` });
  res.status(201).json({ created: people.length });
});

// POST /api/comms/threads/:id/messages  (the employee replies, or HR answers)
router.post('/threads/:id/messages', requireAuth, (req: Request, res: Response) => {
  const a = getAuth(req)!;
  const id = req.params.id as string;
  const t = db.prepare(`SELECT t.*, e.name AS employee_name FROM message_threads t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?`).get(id) as Row | undefined;
  if (!t) return res.status(404).json({ error: 'Conversation not found.' });
  const isAdmin = a.role === 'ADMIN';
  if (!isAdmin && t.employee_id !== a.id) return res.status(403).json({ error: 'Not allowed' });
  const body = cleanText((req.body || {}).body, BODY_MAX);
  if (!body) return res.status(400).json({ error: 'Type your message first.' });

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messages (id, thread_id, sender_role, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), id, isAdmin ? 'HR' : 'EMPLOYEE', a.id, body, now);
  db.prepare(`UPDATE message_threads SET last_message_at = ? WHERE id = ?`).run(now, id);

  if (isAdmin) {
    notifyEmployeeInApp(t.employee_id, 'MESSAGE', `Message from HR: ${t.subject}`, snippet(body));
  } else {
    logAudit(req, 'MESSAGE_REPLY', { targetType: 'message', targetId: id, targetName: t.employee_name, details: `Reply: ${t.subject}` });
    notifyAdminsPush('New message from an employee', `${t.employee_name}: ${snippet(body, 80)}`);
    notifyHrEmail('New message from an employee', 'New message from an employee', `${t.employee_name} replied to "${t.subject}".`, [['Employee', t.employee_name], ['Subject', t.subject], ['Message', snippet(body, 400)]]);
  }
  res.status(201).json({ ok: true });
});

export default router;
