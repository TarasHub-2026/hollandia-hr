import React, { useEffect, useState } from 'react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, EligibilityResult, CreateLeaveRequestPayload } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import EligibilityResultCard from './EligibilityResult';

export default function LeaveRequestForm() {
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [eligResult,  setEligResult]  = useState<EligibilityResult | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [previewing,  setPreviewing]  = useState(false);
  const [error,       setError]       = useState('');
  const [submitted,   setSubmitted]   = useState(false);
  const [form, setForm] = useState({ employeeId:'', startDate:'', endDate:'', purpose:'', passportExpiry:'', workPermitExpiry:'', contractExpiry:'' });

  useEffect(() => { employeesApi.getAll().then(setEmployees).finally(() => setLoadingEmps(false)); }, []);

  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setEligResult(null); };
  const buildPayload = (): CreateLeaveRequestPayload => ({
    employeeId: form.employeeId, startDate: form.startDate, endDate: form.endDate, purpose: form.purpose,
    passportExpiry: form.passportExpiry || null, workPermitExpiry: form.workPermitExpiry || null, contractExpiry: form.contractExpiry || null,
  });

  const handlePreview = async () => {
    setError(''); setPreviewing(true);
    try { const { eligibility } = await leaveRequestsApi.preview(buildPayload()); setEligResult(eligibility); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setPreviewing(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSubmitting(true);
    try { const { eligibility } = await leaveRequestsApi.submit(buildPayload()); setEligResult(eligibility); setSubmitted(true); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Submission failed'); }
    finally { setSubmitting(false); }
  };

  const handleReset = () => { setForm({ employeeId:'', startDate:'', endDate:'', purpose:'', passportExpiry:'', workPermitExpiry:'', contractExpiry:'' }); setEligResult(null); setSubmitted(false); setError(''); };

  const selectedEmp = employees.find(e => e.id === form.employeeId);
  const days = form.startDate && form.endDate ? Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1 : 0;
  const canSubmit = !!form.employeeId && !!form.startDate && !!form.endDate;

  return (
    <div className='p-8 max-w-3xl'>
      <h1 className='text-2xl font-bold text-gray-900 mb-1'>Submit Leave Request</h1>
      <p className='text-gray-500 text-sm mb-8'>Complete all fields. Use Preview to check eligibility before submitting.</p>
      {error && <div className='mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
      {submitted && eligResult ? (
        <div className='space-y-4'><EligibilityResultCard result={eligResult} /><button className='btn-secondary' onClick={handleReset}>Submit Another Request</button></div>
      ) : (
        <form onSubmit={handleSubmit} className='space-y-6'>
          <div className='card px-6 py-5 space-y-4'>
            <h2 className='font-semibold text-gray-800 text-sm'>Employee Information</h2>
            <div><label className='form-label'>Select Employee *</label>
              {loadingEmps ? <p className='text-sm text-gray-400'>Loading...</p> : (
                <select className='form-select' value={form.employeeId} onChange={e => set('employeeId', e.target.value)} required>
                  <option value=''>Choose an employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {DEPARTMENT_LABELS[emp.department]}</option>)}
                </select>
              )}
            </div>
            {selectedEmp && (
              <div className='p-3 bg-gray-50 rounded-lg text-xs text-gray-600 grid grid-cols-2 gap-2'>
                <div><span className='font-medium'>Dept:</span> {DEPARTMENT_LABELS[selectedEmp.department]}</div>
                <div><span className='font-medium'>Hired:</span> {new Date(selectedEmp.hireDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
                {selectedEmp.loanOriginal > 0 && <div className='col-span-2'><span className='font-medium'>Loan:</span> ${selectedEmp.loanRemaining.toFixed(2)} of ${selectedEmp.loanOriginal.toFixed(2)} remaining</div>}
              </div>
            )}
          </div>
          <div className='card px-6 py-5 space-y-4'>
            <h2 className='font-semibold text-gray-800 text-sm'>Leave Dates</h2>
            <div className='grid grid-cols-2 gap-4'>
              <div><label className='form-label'>Start Date *</label><input className='form-input' type='date' value={form.startDate} onChange={e => set('startDate', e.target.value)} required /></div>
              <div><label className='form-label'>End Date *</label><input className='form-input' type='date' value={form.endDate} min={form.startDate} onChange={e => set('endDate', e.target.value)} required /></div>
            </div>
            {days > 0 && <p className='text-xs text-gray-500'>Duration: {days} day(s){days > 75 && <span className='text-red-500 font-medium ml-1'>— exceeds 75-day maximum</span>}</p>}
            <div><label className='form-label'>Purpose / Notes</label>
              <textarea className='form-input resize-none' rows={2} value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder='e.g. Home country travel, family visit...' /></div>
          </div>
          <div className='card px-6 py-5 space-y-4'>
            <div><h2 className='font-semibold text-gray-800 text-sm'>Travel Document Expiry Dates</h2>
              <p className='text-xs text-gray-500 mt-0.5'>Leave blank if not traveling internationally.</p></div>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
              <div><label className='form-label'>Passport Expiry</label><input className='form-input' type='date' value={form.passportExpiry} onChange={e => set('passportExpiry', e.target.value)} /></div>
              <div><label className='form-label'>Work Permit Expiry</label><input className='form-input' type='date' value={form.workPermitExpiry} onChange={e => set('workPermitExpiry', e.target.value)} /></div>
              <div><label className='form-label'>Contract Expiry</label><input className='form-input' type='date' value={form.contractExpiry} onChange={e => set('contractExpiry', e.target.value)} /></div>
            </div>
            <p className='text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg'>📋 All documents must be valid for at least <strong>4 months</strong> after your return. Many airlines enforce a <strong>6-month</strong> passport validity rule.</p>
          </div>
          {eligResult && !submitted && <EligibilityResultCard result={eligResult} onClose={() => setEligResult(null)} />}
          <div className='flex gap-3'>
            <button type='button' className='btn-secondary' onClick={handlePreview} disabled={previewing || !canSubmit}>{previewing ? 'Checking...' : '🔍 Preview Eligibility'}</button>
            <button type='submit' className='btn-primary' disabled={submitting || !canSubmit}>{submitting ? 'Submitting...' : 'Submit Request →'}</button>
          </div>
        </form>
      )}
    </div>
  );
}