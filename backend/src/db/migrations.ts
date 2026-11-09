import { db } from './database';

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      department        TEXT NOT NULL CHECK(department IN (
                          'GREENHOUSE','WAREHOUSE','OFFICE','PACKING_WATER_BUCKET','LOGISTICS','SHIPPING','MAINTENANCE'
                        )),
      hire_date         TEXT NOT NULL,
      loan_original     REAL NOT NULL DEFAULT 0,
      loan_remaining    REAL NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id                 TEXT PRIMARY KEY,
      employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      start_date         TEXT NOT NULL,
      end_date           TEXT NOT NULL,
      purpose            TEXT NOT NULL DEFAULT '',
      passport_expiry    TEXT,
      work_permit_expiry TEXT,
      contract_expiry    TEXT,
      submitted_at       TEXT NOT NULL DEFAULT (datetime('now')),
      status             TEXT NOT NULL DEFAULT 'PENDING'
                           CHECK(status IN ('PENDING','APPROVED','DENIED','CANCELLED')),
      denial_reasons     TEXT NOT NULL DEFAULT '[]',
      warnings           TEXT NOT NULL DEFAULT '[]',
      adjusted_end_date  TEXT,
      queue_position     INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_lr_employee   ON leave_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_lr_status     ON leave_requests(status);
    CREATE INDEX IF NOT EXISTS idx_lr_dates      ON leave_requests(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_lr_submitted  ON leave_requests(submitted_at);

    CREATE TABLE IF NOT EXISTS sync_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
      entries_found   INTEGER NOT NULL DEFAULT 0,
      entries_synced  INTEGER NOT NULL DEFAULT 0,
      entries_skipped INTEGER NOT NULL DEFAULT 0,
      errors       TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // Existing databases: widen the department CHECK to allow SHIPPING and MAINTENANCE.
  // SQLite cannot alter a CHECK in place, so rebuild the table (SQLite's documented 12-step procedure).
  try {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'`).get() as { sql: string } | undefined;
    if (row && !row.sql.includes('MAINTENANCE')) {
      const newSql = row.sql
        .replace(/^CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?employees["`]?/i, 'CREATE TABLE employees_new')
        .replace(`'LOGISTICS'`, `'LOGISTICS','SHIPPING','MAINTENANCE'`);
      if (!newSql.includes('MAINTENANCE')) throw new Error('could not locate department CHECK list');
      const idx = db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='employees' AND sql IS NOT NULL`).all() as { sql: string }[];
      db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          db.exec(`DROP TABLE IF EXISTS employees_new`);
          db.exec(newSql);
          db.exec(`INSERT INTO employees_new SELECT * FROM employees`);
          db.exec(`DROP TABLE employees`);
          db.exec(`ALTER TABLE employees_new RENAME TO employees`);
          idx.forEach(i => db.exec(i.sql));
          const bad = db.pragma('foreign_key_check') as unknown[];
          if (bad.length) throw new Error(`foreign key check failed (${bad.length})`);
        })();
        console.log('[DB] Widened employees.department CHECK (added SHIPPING, MAINTENANCE).');
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    console.error('[DB] Department CHECK migration failed; nothing was changed:', e);
  }

  // Idempotent: add cognito_entry_number and is_flagged columns if they don't exist yet
  const cols = db.prepare(`PRAGMA table_info(leave_requests)`).all() as { name: string }[];
  if (!cols.find(c => c.name === 'cognito_entry_number')) {
    db.exec(`ALTER TABLE leave_requests ADD COLUMN cognito_entry_number INTEGER`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lr_cognito ON leave_requests(cognito_entry_number) WHERE cognito_entry_number IS NOT NULL`);
    console.log('[DB] Added cognito_entry_number column.');
  }
  if (!cols.find(c => c.name === 'is_flagged')) {
    db.exec(`ALTER TABLE leave_requests ADD COLUMN is_flagged INTEGER DEFAULT 0`);
    console.log('[DB] Added is_flagged column to leave_requests.');
  }

  // Idempotent: HR decision note / who decided / when
  for (const [name, def] of [['decision_note', 'TEXT'], ['decided_at', 'TEXT'], ['decided_by', 'TEXT']] as const) {
    if (!cols.find(c => c.name === name)) {
      db.exec(`ALTER TABLE leave_requests ADD COLUMN ${name} ${def}`);
      console.log(`[DB] Added ${name} column to leave_requests.`);
    }
  }

  // Idempotent: add pin, role, email columns to employees table
  const empCols = db.prepare(`PRAGMA table_info(employees)`).all() as { name: string }[];
  if (!empCols.find(c => c.name === 'pin')) {
    db.exec(`ALTER TABLE employees ADD COLUMN pin TEXT DEFAULT '1234'`);
    console.log('[DB] Added pin column to employees with default 1234.');
  }
  if (!empCols.find(c => c.name === 'role')) {
    db.exec(`ALTER TABLE employees ADD COLUMN role TEXT DEFAULT 'EMPLOYEE'`);
    console.log('[DB] Added role column to employees with default EMPLOYEE.');
  }
  if (!empCols.find(c => c.name === 'email')) {
    db.exec(`ALTER TABLE employees ADD COLUMN email TEXT`);
    console.log('[DB] Added email column to employees.');
  }
  // Profile columns for employee self-registration
  const profileCols: [string, string][] = [
    ['first_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['employee_number', 'TEXT'], ['username', 'TEXT'],
    ['immigration_status', 'TEXT'],
    ['passport_expiry', 'TEXT'],
    ['work_permit_expiry', 'TEXT'],
    ['nationality', 'TEXT'], ['passport_number', 'TEXT'], ['lmia_number', 'TEXT'],
    ['cowan_cert_number', 'TEXT'], ['cowan_cert_expiry', 'TEXT'],
    ['dept_pending', 'INTEGER DEFAULT 0'],
    ['must_change_pin', 'INTEGER DEFAULT 0'], ['temp_pin_expires', 'TEXT'],
  ];
  for (const [col, type] of profileCols) {
    if (!empCols.find(c => c.name === col)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${type}`);
      console.log(`[DB] Added ${col} column to employees.`);
    }
  }

  // Roster columns: active (can sign in) and registered (employee has created their profile)
  const rosterCols = db.prepare(`PRAGMA table_info(employees)`).all() as { name: string }[];
  if (!rosterCols.find(c => c.name === 'active')) {
    db.exec(`ALTER TABLE employees ADD COLUMN active INTEGER DEFAULT 1`);
    console.log('[DB] Added active column to employees.');
  }
  if (!rosterCols.find(c => c.name === 'registered')) {
    db.exec(`ALTER TABLE employees ADD COLUMN registered INTEGER DEFAULT 0`);
    // Everyone who already has a profile (employee number) or is the admin counts as registered.
    db.exec(`UPDATE employees SET registered = 1 WHERE employee_number IS NOT NULL OR role = 'ADMIN'`);
    console.log('[DB] Added registered column to employees and backfilled.');
  }

  // Existing databases: allow the CANCELLED status. SQLite cannot alter a CHECK in place, so rebuild the table.
  try {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='leave_requests'`).get() as { sql: string } | undefined;
    if (row && !row.sql.includes('CANCELLED')) {
      const newSql = row.sql
        .replace(/^CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?leave_requests["`]?/i, 'CREATE TABLE leave_requests_new')
        .replace(`'DENIED')`, `'DENIED','CANCELLED')`);
      if (!newSql.includes('CANCELLED')) throw new Error('could not locate status CHECK list');
      const idx = db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='leave_requests' AND sql IS NOT NULL`).all() as { sql: string }[];
      db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          db.exec(`DROP TABLE IF EXISTS leave_requests_new`);
          db.exec(newSql);
          db.exec(`INSERT INTO leave_requests_new SELECT * FROM leave_requests`);
          db.exec(`DROP TABLE leave_requests`);
          db.exec(`ALTER TABLE leave_requests_new RENAME TO leave_requests`);
          idx.forEach(i => db.exec(i.sql));
          const bad = db.pragma('foreign_key_check') as unknown[];
          if (bad.length) throw new Error(`foreign key check failed (${bad.length})`);
        })();
        console.log('[DB] Widened leave_requests.status CHECK (added CANCELLED).');
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    console.error('[DB] Status CHECK migration failed; nothing was changed:', e);
  }

  // Devices (phones/computers) that receive push alerts for new leave applications
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    admin_id   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  // Employee requests to change the dates of their leave (HR approves or denies)
  db.exec(`CREATE TABLE IF NOT EXISTS leave_date_changes (
    id               TEXT PRIMARY KEY,
    leave_request_id TEXT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    employee_id      TEXT NOT NULL,
    old_start        TEXT NOT NULL,
    old_end          TEXT NOT NULL,
    new_start        TEXT NOT NULL,
    new_end          TEXT NOT NULL,
    reason           TEXT,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    created_at       TEXT NOT NULL,
    decided_at       TEXT,
    decided_by       TEXT,
    decision_note    TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ldc_leave ON leave_date_changes(leave_request_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ldc_status ON leave_date_changes(status)`);

  // People who asked for administrator access; an existing administrator approves or denies
  db.exec(`CREATE TABLE IF NOT EXISTS admin_requests (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    username      TEXT NOT NULL,
    pin           TEXT NOT NULL,
    reason        TEXT,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    created_at    TEXT NOT NULL,
    decided_at    TEXT,
    decided_by    TEXT,
    decision_note TEXT
  )`);

  // In-app notices for employees (leave approved/denied/cancelled, date changes)
  db.exec(`CREATE TABLE IF NOT EXISTS employee_notices (
    id               TEXT PRIMARY KEY,
    employee_id      TEXT NOT NULL,
    kind             TEXT NOT NULL,
    title            TEXT NOT NULL,
    message          TEXT NOT NULL,
    leave_request_id TEXT,
    created_at       TEXT NOT NULL,
    read_at          TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_en_employee ON employee_notices(employee_id, created_at)`);

  // One-time "forgot PIN" email links (only a hash of the token is stored)
  db.exec(`CREATE TABLE IF NOT EXISTS pin_resets (
    token_hash  TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )`);

  // One-time: leave that was uploaded from a leave list is annual vacation entitlement. The leave type lives in the
  // purpose as a leading "[Type]", so rewrite it on rows that came from an import (they carry an Entry # or the import note).
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (!db.prepare(`SELECT 1 FROM app_settings WHERE key = 'imports_annual_v1'`).get()) {
    try {
      const imported = db.prepare(`SELECT id, purpose FROM leave_requests WHERE cognito_entry_number IS NOT NULL OR decision_note LIKE '%mported from existing leave list%'`).all() as { id: string; purpose: string | null }[];
      const upd = db.prepare(`UPDATE leave_requests SET purpose = ? WHERE id = ?`);
      db.transaction(() => {
        for (const r of imported) {
          const note = (r.purpose || '').replace(/^\[[^\]]*\]\s*/, '').trim();
          upd.run(`[Annual Vacation Entitlement] ${note}`.trim(), r.id);
        }
        db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('imports_annual_v1', 'done')`).run();
      })();
      console.log(`[DB] Marked ${imported.length} imported leave record(s) as Annual Vacation Entitlement.`);
    } catch (e) {
      console.error('[DB] Annual entitlement migration failed; nothing was changed:', e);
    }
  }

  // Paid sick leave tracking: days of paid sick leave on a request (NULL when the request is not paid sick leave).
  const lrCols = db.prepare(`PRAGMA table_info(leave_requests)`).all() as { name: string }[];
  if (!lrCols.find(c => c.name === 'paid_sick_days')) {
    db.exec(`ALTER TABLE leave_requests ADD COLUMN paid_sick_days INTEGER`);
    console.log('[DB] Added paid_sick_days column to leave_requests.');
  }
  // One-time: requests already filed as paid sick leave carry their days in the purpose ("Paid sick days: N").
  if (!db.prepare(`SELECT 1 FROM app_settings WHERE key = 'paid_sick_days_v1'`).get()) {
    try {
      const existing = db.prepare(`SELECT id, purpose FROM leave_requests WHERE paid_sick_days IS NULL AND purpose LIKE '%Paid Sick Leave%' AND purpose LIKE '%Paid sick days:%'`).all() as { id: string; purpose: string }[];
      const upd = db.prepare(`UPDATE leave_requests SET paid_sick_days = ? WHERE id = ?`);
      let n = 0;
      db.transaction(() => {
        for (const r of existing) {
          const m = /Paid sick days:\s*(\d+)/i.exec(r.purpose);
          if (m && parseInt(m[1], 10) > 0) { upd.run(parseInt(m[1], 10), r.id); n++; }
        }
        db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('paid_sick_days_v1', 'done')`).run();
      })();
      console.log(`[DB] Recorded paid sick days on ${n} existing leave request(s).`);
    } catch (e) {
      console.error('[DB] Paid sick days backfill failed; nothing was changed:', e);
    }
  }

  // Employee loan applications (HR approves or denies; an approved loan is added to the employee's loan record).
  // The proof of medical emergency is kept in its own table, inside the same database file, so backups include it.
  db.exec(`CREATE TABLE IF NOT EXISTS loan_applications (
    id                 TEXT PRIMARY KEY,
    employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount             REAL NOT NULL,
    purpose            TEXT NOT NULL,
    estimated_interest REAL NOT NULL,
    payments           INTEGER NOT NULL,
    biweekly           REAL NOT NULL,
    interest_rate      REAL NOT NULL,
    status             TEXT NOT NULL DEFAULT 'PENDING',
    submitted_at       TEXT NOT NULL,
    submitted_by       TEXT,
    has_proof          INTEGER NOT NULL DEFAULT 0,
    decided_at         TEXT,
    decided_by         TEXT,
    decision_note      TEXT,
    signature_type     TEXT,
    signature          TEXT,
    signature_name     TEXT,
    loan_applied       INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loan_employee ON loan_applications(employee_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loan_status ON loan_applications(status)`);
  db.exec(`CREATE TABLE IF NOT EXISTS loan_proofs (
    loan_id  TEXT PRIMARY KEY REFERENCES loan_applications(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime     TEXT NOT NULL,
    data     BLOB NOT NULL
  )`);

  // Important announcements (to every employee) and private two-way messages (HR and one employee per thread).
  db.exec(`CREATE TABLE IF NOT EXISTS announcements (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT,
    ends_on    TEXT,
    removed    INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    read_at         TEXT NOT NULL,
    PRIMARY KEY (announcement_id, employee_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS message_threads (
    id              TEXT PRIMARY KEY,
    employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    subject         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    created_by      TEXT,
    last_message_at TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_thread_employee ON message_threads(employee_id)`);
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    read_at     TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id, created_at)`);

  // Seed default HR Administrator account if none exists
  const adminUser = db.prepare(`SELECT * FROM employees WHERE role = 'ADMIN'`).get();
  if (!adminUser) {
    db.prepare(`
      INSERT INTO employees (id, name, department, hire_date, loan_original, loan_remaining, pin, role, created_at, updated_at)
      VALUES ('admin-001', 'HR Administrator', 'OFFICE', '2020-01-01', 0, 0, '8888', 'ADMIN', datetime('now'), datetime('now'))
    `).run();
    console.log('[DB] Created default HR Administrator account (PIN: 8888).');
  }

  console.log('[DB] Migrations complete.');
}
