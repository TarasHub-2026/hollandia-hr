import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UserCircle2 } from 'lucide-react';
import { employeesApi } from '../api/employees';
import type { Employee } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import EmployeeForm from './EmployeeForm';

export default function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [editing,   setEditing]   = useState<Employee | undefined>(undefined);
  const [showForm,  setShowForm]  = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const load = () => { setLoading(true); employeesApi.getAll().then(setEmployees).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleSaved = (emp: Employee) => {
    setEmployees(prev => { const i = prev.findIndex(e => e.id === emp.id); return i >= 0 ? prev.map(e => e.id === emp.id ? emp : e) : [...prev, emp]; });
    setShowForm(false); setEditing(undefined);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this employee? This will also remove their leave requests.')) return;
    setDeleting(id);
    try { await employeesApi.delete(id); setEmployees(prev => prev.filter(e => e.id !== id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const loanInfo = (emp: Employee) => {
    if (emp.loanOriginal === 0) return null;
    const pct = Math.round((1 - emp.loanRemaining / emp.loanOriginal) * 100);
    return { pct, ok: emp.loanRemaining / emp.loanOriginal <= 0.5 };
  };
  const tenureOk = (emp: Employee) => { const m = new Date(emp.hireDate); m.setFullYear(m.getFullYear() + 1); return new Date() >= m; };

  return (
    <div className='p-8'>
      <div className='flex items-center justify-between mb-6'>
        <div><h1 className='text-2xl font-bold text-gray-900'>Employees</h1><p className='text-gray-500 text-sm'>{employees.length} total</p></div>
        <button className='btn-primary' onClick={() => { setEditing(undefined); setShowForm(true); }}><Plus size={16} /> Add Employee</button>
      </div>
      {error && <div className='mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
      {loading ? (
        <div className='flex justify-center py-16'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' /></div>
      ) : employees.length === 0 ? (
        <div className='card p-12 text-center'><UserCircle2 size={40} className='mx-auto text-gray-300 mb-3' /><p className='text-gray-500 text-sm'>No employees yet. Add one to get started.</p></div>
      ) : (
        <div className='card overflow-hidden'>
          <table className='w-full text-sm'>
            <thead><tr className='bg-gray-50 border-b border-gray-100'>
              {['Name','Department','Hire Date','Tenure','Loan','Actions'].map(h => (
                <th key={h} className={`px-5 py-3 font-medium text-gray-600 ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className='divide-y divide-gray-50'>
              {employees.map(emp => {
                const loan = loanInfo(emp);
                const ok   = tenureOk(emp);
                return (
                  <tr key={emp.id} className='hover:bg-gray-50 transition-colors'>
                    <td className='px-5 py-3 font-medium text-gray-900'>{emp.name}</td>
                    <td className='px-5 py-3 text-gray-600'>{DEPARTMENT_LABELS[emp.department]}</td>
                    <td className='px-5 py-3 text-gray-600'>{new Date(emp.hireDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</td>
                    <td className='px-5 py-3'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{ok ? '✓ Eligible' : '✗ < 1 yr'}</span>
                    </td>
                    <td className='px-5 py-3'>
                      {loan ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${loan.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{loan.pct}% repaid</span>
                             : <span className='text-gray-400 text-xs'>None</span>}
                    </td>
                    <td className='px-5 py-3'>
                      <div className='flex items-center justify-end gap-2'>
                        <button className='p-1.5 text-gray-400 hover:text-brand-600 rounded-md hover:bg-brand-50 transition-colors' onClick={() => { setEditing(emp); setShowForm(true); }}><Pencil size={15} /></button>
                        <button className='p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors' onClick={() => handleDelete(emp.id)} disabled={deleting === emp.id}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <EmployeeForm employee={editing} onClose={() => { setShowForm(false); setEditing(undefined); }} onSaved={handleSaved} />}
    </div>
  );
}