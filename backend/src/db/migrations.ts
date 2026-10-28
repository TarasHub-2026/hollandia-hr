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
                           CHECK(status IN ('PENDING','APPROVED','DENIED')),
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

  // Devices (phones/computers) that receive push alerts for new leave applications
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    admin_id   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

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
