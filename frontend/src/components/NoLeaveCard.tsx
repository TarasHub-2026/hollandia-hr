import React, { useMemo, useState } from 'react';
import { UserX, Download, Search, ChevronDown } from 'lucide-react';
import type { Employee, LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';

const DAY = 86400000;
const parse = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function NoLeaveCard({ employees, requests }: { employees: Employee[]; requests: LeaveRequest[] }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(thisYear);
  const [basis, setBasis] = useState<'APPROVED' | 'ANY'>('APPROVED');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const years = useMemo(() => {
    const s = new Set<number>([thisYear - 1, thisYear, thisYear + 1]);
    requests.forEach(r => { s.add(parse(r.startDate).getFullYear()); s.add(parse(r.endDate).getFullYear()); });
    return Array.from(s).sort();
  }, [requests, thisYear]);

  const { rows, roster, took } = useMemo(() => {
    const ys = new Date(year, 0, 1), ye = new Date(year, 11, 31);
    const counts = (r: LeaveRequest) => basis === 'APPROVED' ? r.status === 'APPROVED' : r.status !== 'DENIED' && r.status !== 'CANCELLED';
    const inYear = new Set<string>();
    const lastBefore = new Map<string, Date>();
    for (const r of requests) {
      if (!counts(r)) continue;
      const s = parse(r.startDate), e = parse(r.endDate);
      if (s <= ye && e >= ys) inYear.add(r.employeeId);
      else if (e < ys) { const prev = lastBefore.get(r.employeeId); if (!prev || e > prev) lastBefore.set(r.employeeId, e); }
    }
    // Active staff who were already employed during that year
    const roster = employees.filter(e => e.role !== 'ADMIN' && e.active !== false && parse(e.hireDate) <= ye);
    const rows = roster
      .filter(e => !inYear.has(e.id))
      .map(e => ({ e, last: lastBefore.get(e.id) || null, tenureYears: Math.floor((ye.getTime() - parse(e.hireDate).getTime()) / (365.25 * DAY)) }))
      .sort((a, b) => a.e.name.localeCompare(b.e.name));
    return { rows, roster, took: roster.length - rows.length };
  }, [employees, requests, year, basis]);

  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter(r => [r.e.name, r.e.employeeNumber, DEPARTMENT_LABELS[r.e.department]].some(v => (v || '').toLowerCase().includes(term))) : rows;

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [['Employee', 'Employee #', 'Department', 'Hire date', 'Last leave before ' + year].map(esc).join(',')];
    shown.forEach(r => lines.push([r.e.name, r.e.employeeNumber || '', DEPARTMENT_LABELS[r.e.department] || '', r.e.hireDate.split('T')[0], r.last ? r.last.toISOString().split('T')[0] : ''].map(esc).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `employees-without-leave-${year}.csv`; a.click();
  };

  return (
    <div className='card mt-8 overflow-hidden'>
      <div className='px-5 py-4 border-b border-gray-100 bg-brand-700 flex flex-wrap items-center gap-3'>
        <button type='button' onClick={() => setOpen(o => !o)} aria-expanded={open} className='flex items-center gap-2 text-left'>
          <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
          <UserX size={16} className='text-white' />
          <h2 className='font-semibold text-white text-lg'>Employees With No Leave in {year}</h2>
          <span className='text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium'>{rows.length} of {roster.length}</span>
        </button>
        {open && <div className='ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-600'>
          <select className='form-select !py-1 !w-auto' value={year} onChange={e => setYear(+e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className='form-select !py-1 !w-auto' value={basis} onChange={e => setBasis(e.target.value as 'APPROVED' | 'ANY')}>
            <option value='APPROVED'>Approved leave only</option>
            <option value='ANY'>Approved or pending</option>
          </select>
          <div className='relative'>
            <Search size={12} className='absolute left-2.5 top-2 text-gray-400' />
            <input className='form-input !py-1 pl-7 !w-44' placeholder='Search' value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button className='btn-secondary !py-1 !px-2 text-xs' onClick={exportCsv} disabled={!shown.length}><Download size={12} /> CSV</button>
        </div>}
      </div>
      {open && <>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm min-w-[560px]'>
          <thead className='bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500'>
            <tr>{['Employee', 'Emp #', 'Department', 'Hire Date', `Last Leave Before ${year}`].map(h => <th key={h} className='text-left px-5 py-2.5 font-semibold whitespace-nowrap'>{h}</th>)}</tr>
          </thead>
          <tbody className='divide-y divide-gray-50'>
            {shown.length === 0 && <tr><td colSpan={5} className='px-5 py-8 text-center text-gray-400 text-sm'>{rows.length === 0 ? `Everyone on the roster has leave in ${year}.` : 'No matches.'}</td></tr>}
            {shown.map(({ e, last }) => (
              <tr key={e.id}>
                <td className='px-5 py-2.5 font-medium text-gray-900'>{e.name}</td>
                <td className='px-5 py-2.5 text-gray-600'>{e.employeeNumber || '—'}</td>
                <td className='px-5 py-2.5 text-gray-600'>{DEPARTMENT_LABELS[e.department] || '—'}</td>
                <td className='px-5 py-2.5 text-gray-600 whitespace-nowrap'>{fmt(parse(e.hireDate))}</td>
                <td className='px-5 py-2.5 text-gray-600 whitespace-nowrap'>{last ? fmt(last) : <span className='text-gray-400'>No earlier leave</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100'>
        Active employees hired on or before Dec 31, {year}. {took} of {roster.length} had leave overlapping {year}. Updates automatically with the dashboard.
      </p>
      </>}
    </div>
  );
}
