import { db } from './database';

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      department        TEXT NOT NULL CHECK(department IN (
                          'GREENHOUSE','WAREHOUSE','OFFICE','PACKING_WATER_BUCKET','LOGISTICS'
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
  `);

  console.log('[DB] Migrations complete.');
}
