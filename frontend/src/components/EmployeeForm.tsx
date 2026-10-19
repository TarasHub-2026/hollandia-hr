import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import type { Employee, Department } from '../types';
import { employeesApi } from '../api/employees';

interface Props { employee?: Employee; onClose: () => void; onSaved: (emp: Employee) => void; }

const day = (v?: string) => (v ? v.split('T')[0] : '');

export default function EmployeeForm({ employee, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    firstName:         employee?.firstName ?? (employee?.name ? employee.name.split(' ')[0] : ''),
    lastName:          employee?.lastName ?? (employee?.name ? employee.name.split(' ').slice(1).join(' ') : ''),
    employeeNumber:    employee?.employeeNumber ?? '',
    email:             employee?.email ?? '',
    department:        (employee?.department ?? 'GREENHOUSE') as Department,
    hireDate:          day(employee?.hireDate),
    immigrationStatus: (employee?.immigrationStatus ?? '') as '' | 'TFW' | 'NON_TFW',
    passportExpiry:    day(employee?.passportExpiry),
    workPermitExpiry:  day(employee?.workPermitExpiry),
    nationality:       employee?.nationality ?? '',
    passportNumber:    employee?.passportNumber ?? '',
    lmiaNumber:        employee?.lmiaNumber ?? '',
    cowanCertNumber:   employee?.cowanCertNumber ?? '',
    cowanCertExpiry:   day(employee?.cowanCertExpiry),
    loanOriginal:      employee?.loanOriginal ?? 0,
    loanRemaining:     employee?.loanRemaining ?? 0,
    active:            employee?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const isTfw = form.immigrationStatus === 'TFW';
  const pct = form.loanOriginal > 0 ? Math.round((1 - form.loanRemaining / form.loanOriginal) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (form.loanRemaining > form.loanOriginal) { setError('Remaining loan cannot exceed original amount'); return; }
    setSaving(true);
    try {
      const payload = { ...form, passportExpiry: isTfw ? form.passportExpiry : '', workPermitExpiry: isTfw ? form.workPermitExpiry : '',
        passportNumber: isTfw ? form.passportNumber : '', lmiaNumber: isTfw ? form.lmiaNumber : '' };
      const saved = employee ? await employeesApi.update(employee.id, payload) : await employeesApi.create(payload);
      onSaved(saved);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
      <div className='card w-full max-w-xl max-h-[92vh] overflow-y-auto'>
        <div className='px-6 py-4 border-b border-gray-100 flex items-center justify-between'>
          <h2 className='font-semibold text-gray-900'>{employee ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600'><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className='px-6 py-5 space-y-4'>
          {error && <div className='p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>First Name *</label><input className='form-input' value={form.firstName} onChange={e => set('firstName', e.target.value)} required /></div>
            <div><label className='form-label'>Last Name *</label><input className='form-input' value={form.lastName} onChange={e => set('lastName', e.target.value)} required /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>Employee Number *</label><input className='form-input' value={form.employeeNumber} onChange={e => set('employeeNumber', e.target.value)} required /></div>
            <div><label className='form-label'>Nationality</label><input className='form-input' value={form.nationality} onChange={e => set('nationality', e.target.value)} /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>Email *</label><input type='email' className='form-input' value={form.email} onChange={e => set('email', e.target.value)} required /></div>
          </div>
          <p className='text-[11px] text-gray-400 -mt-2'>Employee number, email and hire date are what the employee must enter to create their profile.</p>
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>Department *</label>
              <select className='form-select' value={form.department} onChange={e => set('department', e.target.value)} required>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
              </select></div>
            <div><label className='form-label'>Hire Date *</label><input className='form-input' type='date' value={form.hireDate} onChange={e => set('hireDate', e.target.value)} required /></div>
          </div>
          <div>
            <label className='form-label'>Immigration Status</label>
            <select className='form-select' value={form.immigrationStatus} onChange={e => set('immigrationStatus', e.target.value)}>
              <option value=''>Not set (employee chooses at sign-up)</option>
              <option value='TFW'>TFW</option>
              <option value='NON_TFW'>Non-TFW</option>
            </select>
          </div>
          {isTfw && (
            <div className='grid grid-cols-2 gap-3'>
              <div><label className='form-label'>Passport Number</label><input className='form-input' value={form.passportNumber} onChange={e => set('passportNumber', e.target.value)} /></div>
              <div><label className='form-label'>Passport Expiry</label><input className='form-input' type='date' value={form.passportExpiry} onChange={e => set('passportExpiry', e.target.value)} /></div>
              <div><label className='form-label'>Work Permit Expiry</label><input className='form-input' type='date' value={form.workPermitExpiry} onChange={e => set('workPermitExpiry', e.target.value)} /></div>
              <div><label className='form-label'>LMIA Number</label><input className='form-input' value={form.lmiaNumber} onChange={e => set('lmiaNumber', e.target.value)} /></div>
            </div>
          )}
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
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='form-label'>Cowan Certificate Number</label><input className='form-input' value={form.cowanCertNumber} onChange={e => set('cowanCertNumber', e.target.value)} /></div>
            <div><label className='form-label'>Cowan Certificate Expiry Date</label><input className='form-input' type='date' value={form.cowanCertExpiry} onChange={e => set('cowanCertExpiry', e.target.value)} /></div>
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input type='checkbox' checked={form.active} onChange={e => set('active', e.target.checked)} />
            Active (inactive employees cannot sign in)
          </label>
          <div className='flex justify-end gap-3 pt-2'>
            <button type='button' className='btn-secondary' onClick={onClose}>Cancel</button>
            <button type='submit' className='btn-primary' disabled={saving}>{saving ? 'Saving...' : employee ? 'Save Changes' : 'Add Employee'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
