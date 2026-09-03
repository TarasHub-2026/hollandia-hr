import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import type { Employee, Department } from '../types';
import { employeesApi } from '../api/employees';

interface Props { employee?: Employee; onClose: () => void; onSaved: (emp: Employee) => void; }

export default function EmployeeForm({ employee, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name:          employee?.name          ?? '',
    department:    (employee?.department   ?? 'GREENHOUSE') as Department,
    hireDate:      employee?.hireDate      ?? '',
    loanOriginal:  employee?.loanOriginal  ?? 0,
    loanRemaining: employee?.loanRemaining ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const pct = form.loanOriginal > 0 ? Math.round((1 - form.loanRemaining / form.loanOriginal) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (form.loanRemaining > form.loanOriginal) { setError('Remaining loan cannot exceed original amount'); return; }
    setSaving(true);
    try {
      const saved = employee ? await employeesApi.update(employee.id, form) : await employeesApi.create(form);
      onSaved(saved);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
      <div className='card w-full max-w-md'>
        <div className='px-6 py-4 border-b border-gray-100 flex items-center justify-between'>
          <h2 className='font-semibold text-gray-900'>{employee ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600'><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className='px-6 py-5 space-y-4'>
          {error && <div className='p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
          <div><label className='form-label'>Full Name *</label>
            <input className='form-input' value={form.name} onChange={e => set('name', e.target.value)} required placeholder='Employee full name' /></div>
          <div><label className='form-label'>Department *</label>
            <select className='form-select' value={form.department} onChange={e => set('department', e.target.value)} required>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
            </select></div>
          <div><label className='form-label'>Hire Date *</label>
            <input className='form-input' type='date' value={form.hireDate} onChange={e => set('hireDate', e.target.value)} required /></div>
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>Loan Original ($)</label>
              <input className='form-input' type='number' min='0' step='0.01' value={form.loanOriginal} onChange={e => set('loanOriginal', parseFloat(e.target.value) || 0)} /></div>
            <div><label className='form-label'>Loan Remaining ($)</label>
              <input className='form-input' type='number' min='0' step='0.01' value={form.loanRemaining} onChange={e => set('loanRemaining', parseFloat(e.target.value) || 0)} /></div>
          </div>
          {form.loanOriginal > 0 && (
            <p className='text-xs text-gray-500'>Repaid: {pct}%
              {pct < 50 && <span className='ml-1 text-amber-600 font-medium'>&mdash; Below 50% repayment threshold</span>}
            </p>
          )}
          <div className='flex justify-end gap-3 pt-2'>
            <button type='button' className='btn-secondary' onClick={onClose}>Cancel</button>
            <button type='submit' className='btn-primary' disabled={saving}>{saving ? 'Saving...' : employee ? 'Save Changes' : 'Add Employee'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}