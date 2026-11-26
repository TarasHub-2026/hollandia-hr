import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartPulse, ChevronDown, Search, Settings2 } from 'lucide-react';
import PaidSickManager from './PaidSickManager';
import { paidSickApi } from '../api/paidSick';
import type { PaidSickOverview } from '../types';
import { DEPARTMENT_LABELS } from '../types';

/** HR view: every active employee's paid sick leave for a year (5 days each, no carry-over). */
export default function PaidSickOverviewCard() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number | undefined>(undefined);
  const [data, setData] = useState<PaidSickOverview | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyUsed, setOnlyUsed] = useState(false);

  const [managing, setManaging] = useState<string | null>(null);   // the employee whose paid sick leave HR is updating
  const load = useCallback(() => {
    setError('');
    paidSickApi.overview(year).then(d => { setData(d); if (year === undefined) setYear(d.year); }).catch(e => setError(e instanceof Error ? e.message : 'Could not load paid sick leave'));
  }, [year]);
  useEffect(load, [load]);

  const years = useMemo(() => {
    const start = data?.startYear ?? 2027;
    const end = Math.max(thisYear, start) + 1;
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [data?.startYear, thisYear]);

  const term = search.trim().toLowerCase();
  const rows = (data?.employees ?? []).filter(e =>
    (!term || e.name.toLowerCase().includes(term) || e.employeeNumber.toLowerCase().includes(term)) &&
    (!onlyUsed || e.approved + e.pending + e.adjusted !== 0));
  const totalUsed = (data?.employees ?? []).reduce((s, e) => s + e.approved, 0);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 bg-teal-600 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-2 text-left">
          <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
          <HeartPulse size={16} className="text-white" />
          <h2 className="font-semibold text-white text-lg">Paid Sick Leave Tracker</h2>
        </button>
        {open && (
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <select className="form-select !py-1 !w-auto" value={year ?? ''} onChange={e => setYear(parseInt(e.target.value, 10))} aria-label="Year">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>
      {open && (
        <>
          {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}
          {data && !data.tracked && (
            <p className="px-5 py-4 text-sm text-gray-600">Paid sick leave is tracked from January 1, {data.startYear}. Pick {data.startYear} or later.</p>
          )}
          {data && data.tracked && (
            <>
              <div className="px-5 py-3 flex flex-wrap items-center gap-3 text-sm border-b border-gray-100">
                <div className="relative flex-1 min-w-[14rem]">
                  <Search size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input className="form-input pl-9" placeholder="Search employee name or number" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={onlyUsed} onChange={e => setOnlyUsed(e.target.checked)} /> Only employees who used paid sick leave</label>
                <span className="text-xs text-gray-500 ml-auto">{data.entitlement} days each · {totalUsed} approved day{totalUsed === 1 ? '' : 's'} in total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-teal-50/60 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-5 py-2">Employee</th>
                      <th className="text-left px-3 py-2">Emp #</th>
                      <th className="text-left px-3 py-2">Department</th>
                      <th className="text-right px-3 py-2">Entitled</th>
                      <th className="text-right px-3 py-2">Approved</th>
                      <th className="text-right px-3 py-2">Pending</th>
                      <th className="text-right px-3 py-2" title="Days recorded or given back by HR">By HR</th>
                      <th className="text-right px-3 py-2">Remaining</th>
                      <th className="px-3 py-2"><span className="sr-only">Update</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">{term || onlyUsed ? 'No employees match.' : 'No employees yet.'}</td></tr>}
                    {rows.map(e => (
                      <React.Fragment key={e.id}>
                      <tr className={managing === e.id ? 'bg-teal-50/60' : ''}>
                        <td className="px-5 py-2 font-medium text-gray-800">{e.name}</td>
                        <td className="px-3 py-2 text-gray-600">{e.employeeNumber || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{DEPARTMENT_LABELS[e.department] || e.department}</td>
                        <td className="px-3 py-2 text-right">{data.entitlement}</td>
                        <td className="px-3 py-2 text-right">{e.approved}</td>
                        <td className="px-3 py-2 text-right">{e.pending || '—'}</td>
                        <td className="px-3 py-2 text-right">{e.adjusted ? (e.adjusted > 0 ? e.adjusted : `-${-e.adjusted}`) : '\u2014'}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${e.remaining === 0 ? 'text-red-600' : 'text-teal-700'}`}>{e.remaining}</td>
                        <td className="px-3 py-2 text-right"><button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => setManaging(m => (m === e.id ? null : e.id))} aria-expanded={managing === e.id}><Settings2 size={12} /> {managing === e.id ? 'Close' : 'Update'}</button></td>
                      </tr>
                      {managing === e.id && (
                        <tr className="bg-teal-50/30"><td colSpan={9} className="px-5 py-3"><PaidSickManager employeeId={e.id} year={data.year} records={e.records} adjustments={e.adjustments || []} onChanged={load} /></td></tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                Counted by the year the leave starts. Paid sick leave requests come off the balance automatically: pending requests hold their days, approved ones use them, denied and cancelled ones give them back. Use Update to change the days on a request, record days taken outside the app, or give days back. Unused days do not carry over.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
