import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, UserCircle2, Upload, Search, Power } from 'lucide-react';
import { employeesApi } from '../api/employees';
import type { Employee } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import EmployeeForm from './EmployeeForm';
import ImportEmployeesModal from './ImportEmployeesModal';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'NOT_REGISTERED' | 'NEEDS_INFO';

export default function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [editing,   setEditing]   = useState<Employee | undefined>(undefined);
  const [showForm,  setShowForm]  = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busyId,    setBusyId]    = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = () => { setLoading(true); employeesApi.getAll().then(setEmployees).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleSaved = (emp: Employee) => {
    setEmployees(prev => { const i = prev.findIndex(e => e.id === emp.id); return i >= 0 ? prev.map(e => e.id === emp.id ? emp : e) : [...prev, emp]; });
    setShowForm(false); setEditing(undefined);
  };

  const toggleActive = async (emp: Employee) => {
    const next = !(emp.active ?? true);
    if (!next && !confirm(`Deactivate ${emp.name}? They will no longer be able to sign in. Their records are kept.`)) return;
    setBusyId(emp.id);
    try { handleSaved(await employeesApi.setActive(emp.id, next)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Permanently delete ${emp.name} and all their leave requests? This cannot be undone. Deactivating is usually better.`)) return;
    setBusyId(emp.id);
    try { await employeesApi.delete(emp.id); setEmployees(prev => prev.filter(e => e.id !== emp.id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setBusyId(null); }
  };

  const roster = useMemo(() => employees.filter(e => e.role !== 'ADMIN'), [employees]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return roster.filter(e => {
      if (filter === 'ACTIVE' && e.active === false) return false;
      if (filter === 'INACTIVE' && e.active !== false) return false;
      if (filter === 'NOT_REGISTERED' && e.registered) return false;
      if (filter === 'NEEDS_INFO' && !(e.deptPending || !e.email)) return false;
      if (!term) return true;
      return [e.name, e.employeeNumber, e.email].some(v => (v || '').toLowerCase().includes(term));
    });
  }, [roster, q, filter]);

  const fmt = (d?: string) => d ? new Date(d.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const tenureOk = (emp: Employee) => { const m = new Date(emp.hireDate); m.setFullYear(m.getFullYear() + 1); return new Date() >= m; };

  return (
    <div className='p-4 md:p-8'>
      <div className='flex flex-wrap items-center justify-between gap-3 mb-6'>
        <div>
          <h1 className='text-3xl md:text-4xl font-bold text-gray-900'>Employees Roster</h1>
          <p className='text-gray-500 text-sm'>{roster.length} total &middot; {roster.filter(e => e.registered).length} have created a profile &middot; {roster.filter(e => e.active === false).length} inactive</p>
        </div>
        <div className='flex gap-2'>
          <button className='btn-secondary' onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
          <button className='btn-primary' onClick={() => { setEditing(undefined); setShowForm(true); }}><Plus size={16} /> Add Employee</button>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-3 mb-4'>
        <div className='relative'>
          <Search size={14} className='absolute left-3 top-3 text-gray-400' />
          <input className='form-input pl-9 w-72' placeholder='Search name, employee number or email' value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className='form-select w-auto' value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          <option value='ALL'>All employees</option>
          <option value='ACTIVE'>Active</option>
          <option value='INACTIVE'>Inactive</option>
          <option value='NOT_REGISTERED'>No profile yet</option>
          <option value='NEEDS_INFO'>Missing information</option>
        </select>
      </div>

      {error && <div className='mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
      {loading ? (
        <div className='flex justify-center py-16'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' /></div>
      ) : roster.length === 0 ? (
        <div className='card p-12 text-center'><UserCircle2 size={40} className='mx-auto text-gray-300 mb-3' /><p className='text-gray-500 text-sm'>No employees yet. Import a CSV or add one to get started. Employees can only create a profile once they are on this roster.</p></div>
      ) : (
        <div className='card overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead><tr className='bg-brand-600 border-b border-gray-100'>
              {['Employee','Emp #','Department','Hire Date','Immigration','Profile','Status','Actions'].map(h => (
                <th key={h} className={`px-4 py-3 font-medium text-white ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className='divide-y divide-gray-50'>
              {shown.length === 0 && <tr><td colSpan={8} className='px-4 py-8 text-center text-gray-400'>No employees match</td></tr>}
              {shown.map(emp => {
                const inactive = emp.active === false;
                return (
                  <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${inactive ? 'opacity-60' : ''}`}>
                    <td className='px-4 py-3'><p className='font-medium text-gray-900'>{emp.name}</p><p className={`text-xs ${emp.email ? 'text-gray-400' : 'text-red-600 font-medium'}`}>{emp.email || 'Email missing'}</p></td>
                    <td className='px-4 py-3 text-gray-600'>{emp.employeeNumber || '—'}</td>
                    <td className='px-4 py-3 text-gray-600'>{DEPARTMENT_LABELS[emp.department]}{emp.deptPending && <span className='ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium'>Confirm department</span>}</td>
                    <td className='px-4 py-3 text-gray-600'>{fmt(emp.hireDate)}<span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${tenureOk(emp) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{tenureOk(emp) ? '1yr+' : '<1yr'}</span></td>
                    <td className='px-4 py-3 text-gray-600'>{emp.immigrationStatus === 'TFW' ? 'TFW' : emp.immigrationStatus === 'NON_TFW' ? 'Non-TFW' : '—'}</td>
                    <td className='px-4 py-3'><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.registered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{emp.registered ? 'Created' : 'Not yet'}</span></td>
                    <td className='px-4 py-3'><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inactive ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{inactive ? 'Inactive' : 'Active'}</span></td>
                    <td className='px-4 py-3'>
                      <div className='flex items-center justify-end gap-1'>
                        <button title='Edit' className='p-1.5 text-gray-400 hover:text-brand-600 rounded-md hover:bg-brand-50' onClick={() => { setEditing(emp); setShowForm(true); }}><Pencil size={15} /></button>
                        <button title={inactive ? 'Reactivate' : 'Deactivate'} className={`p-1.5 rounded-md ${inactive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`} onClick={() => toggleActive(emp)} disabled={busyId === emp.id}><Power size={15} /></button>
                        <button title='Delete permanently' className='p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50' onClick={() => handleDelete(emp)} disabled={busyId === emp.id}><Trash2 size={15} /></button>
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
      {showImport && <ImportEmployeesModal onClose={() => setShowImport(false)} onImported={load} />}
    </div>
  );
}
