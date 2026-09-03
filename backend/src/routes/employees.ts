import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { DEPARTMENTS } from '../types/index';
import type { Department } from '../types/index';

const router = Router();

function mapRow(e: Record<string, unknown>) {
  return {
    id:            e.id,
    name:          e.name,
    department:    e.department,
    hireDate:      e.hire_date,
    loanOriginal:  e.loan_original,
    loanRemaining: e.loan_remaining,
    createdAt:     e.created_at,
    updatedAt:     e.updated_at,
  };
}

// GET /api/employees
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare(
    `SELECT * FROM employees ORDER BY name ASC`
  ).all() as Record<string, unknown>[];
  res.json(rows.map(mapRow));
});

// GET /api/employees/:id
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  res.json(mapRow(row));
});

// POST /api/employees
router.post('/', (req: Request, res: Response) => {
  const { name, department, hireDate, loanOriginal = 0, loanRemaining = 0 } = req.body as {
    name?: string;
    department?: string;
    hireDate?: string;
    loanOriginal?: number;
    loanRemaining?: number;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!department)   return res.status(400).json({ error: 'department is required' });
  if (!hireDate)     return res.status(400).json({ error: 'hireDate is required' });
  if (!(DEPARTMENTS as string[]).includes(department))
    return res.status(400).json({ error: `Invalid department. Valid values: ${DEPARTMENTS.join(', ')}` });
  if (loanRemaining > loanOriginal)
    return res.status(400).json({ error: 'loanRemaining cannot exceed loanOriginal' });

  const id  = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO employees (id, name, department, hire_date, loan_original, loan_remaining, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), department, hireDate, loanOriginal, loanRemaining, now, now);

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json(mapRow(row));
});

// PUT /api/employees/:id
router.put('/:id', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, department, hireDate, loanOriginal, loanRemaining } = req.body as Record<string, unknown>;

  if (department && !(DEPARTMENTS as string[]).includes(department as string))
    return res.status(400).json({ error: 'Invalid department' });

  const updated = {
    name:          (name          ?? existing.name)          as string,
    department:    (department    ?? existing.department)    as string,
    hire_date:     (hireDate      ?? existing.hire_date)     as string,
    loan_original: (loanOriginal  ?? existing.loan_original)  as number,
    loan_remaining:(loanRemaining ?? existing.loan_remaining) as number,
  };

  if (updated.loan_remaining > updated.loan_original)
    return res.status(400).json({ error: 'loanRemaining cannot exceed loanOriginal' });

  db.prepare(`
    UPDATE employees SET name=?, department=?, hire_date=?, loan_original=?, loan_remaining=?, updated_at=?
    WHERE id=?
  `).run(updated.name, updated.department, updated.hire_date, updated.loan_original, updated.loan_remaining, new Date().toISOString(), req.params.id);

  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id) as Record<string, unknown>;
  res.json(mapRow(row));
});

// DELETE /api/employees/:id
router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT id FROM employees WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  db.prepare(`DELETE FROM employees WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Employee deleted successfully' });
});

export default router;
