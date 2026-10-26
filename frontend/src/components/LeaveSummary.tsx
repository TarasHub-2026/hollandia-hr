import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Plane, PlaneLanding, CalendarRange } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import LeaveTypeCard from './LeaveTypeCard';

interface Period { name: string; sm: number; sd: number; em: number; ed: number; }

// Mirrors backend/src/data/leaveSchedule.ts (annual repeating).
export const BLOCKS: Period[] = [
  { name: 'Block 1', sm: 11, sd: 15, em: 1, ed: 25 },
  { name: 'Block 2', sm: 2, sd: 15, em: 4, ed: 19 },
  { name: 'Block 3', sm: 5, sd: 11, em: 7, ed: 12 },
  { name: 'Block 4', sm: 7, sd: 13, em: 9, ed: 13 },
  { name: 'Block 5', sm: 9, sd: 14, em: 11, ed: 16 },
];
const BLACKOUTS: Period[] = [
  { name: "Valentine's Blackout", sm: 1, sd: 26, em: 2, ed: 14 },
  { name: "Mother's Day Blackout", sm: 4, sd: 20, em: 5, ed: 10 },
];
export const SEASONS: Period[] = [
  { name: 'Winter (Nov–Jan)', sm: 11, sd: 1, em: 1, ed: 31 },
  { name: 'Spring (Feb–mid May)', sm: 2, sd: 1, em: 5, ed: 10 },
  { name: 'Summer (mid May–Aug)', sm: 5, sd: 11, em: 8, ed: 31 },
  { name: 'Autumn (Sep–Oct)', sm: 9, sd: 1, em: 10, ed: 31 },
];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const parse = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function inPeriod(d: Date, p: Period) {
  const v = (d.getMonth() + 1) * 100 + d.getDate();
  const s = p.sm * 100 + p.sd, e = p.em * 100 + p.ed;
  return s <= e ? v >= s && v <= e : v >= s || v <= e;
}
function findPeriod(d: Date, list: Period[], fallback: string) {
  return list.find(p => inPeriod(d, p))?.name ?? fallback;
}
export const blockOf = (d: Date) => findPeriod(d, BLOCKS, findPeriod(d, BLACKOUTS, 'Outside blocks'));
export const seasonOf = (d: Date) => findPeriod(d, SEASONS, 'Other');

interface Row {
  id: string; name: string; dept: string; start: Date; back: Date; days: number;
  status: string; flagged: boolean;
}

export default function LeaveSummary() {
  const [reqs, setReqs] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [year, setYear] = useState<string>('ALL');

  useEffect(() => {
    leaveRequestsApi.getAll().then(setReqs).finally(() => setLoading(false));
  }, []);

  const rows: Row[] = useMemo(() => reqs
    .filter(r => r.status !== 'DENIED' && (!onlyApproved || r.status === 'APPROVED'))
    .map(r => {
      const start = parse(r.startDate);
      const end = parse(r.adjustedEndDate && r.status === 'DENIED' ? r.adjustedEndDate : r.endDate);
      const back = new Date(end); back.setDate(back.getDate() + 1);
      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      return { id: r.id, name: r.employeeName, dept: DEPARTMENT_LABELS[r.department] || r.department,
        start, back, days, status: r.status, flagged: !!r.isFlagged };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime()), [reqs, onlyApproved]);

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.start.getFullYear()))).sort(), [rows]);
  const data = year === 'ALL' ? rows : rows.filter(r => String(r.start.getFullYear()) === year);

  if (loading) return <div className="p-4 md:p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 size={22} /> Leave Summary</h1>
          <p className="text-gray-500 text-sm">Who is leaving and when they return. Season, block and month charts are on the Company Dashboard. Denied requests are excluded.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <select className="form-select py-1.5" value={year} onChange={e => setYear(e.target.value)}>
            <option value="ALL">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyApproved} onChange={e => setOnlyApproved(e.target.checked)} /> Approved only</label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4 border-t-4 border-t-orange-500"><div className="p-3 rounded-xl bg-orange-50 text-orange-600"><Plane size={20} /></div><div><p className="text-2xl font-bold">{data.length}</p><p className="text-xs text-gray-500">Employees going on leave</p></div></div>
        <div className="card p-5 flex items-center gap-4 border-t-4 border-t-green-500"><div className="p-3 rounded-xl bg-green-50 text-green-600"><PlaneLanding size={20} /></div><div><p className="text-2xl font-bold">{data.filter(r => r.back >= new Date(new Date().toDateString())).length}</p><p className="text-xs text-gray-500">Still to return</p></div></div>
        <div className="card p-5 flex items-center gap-4 border-t-4 border-t-blue-500"><div className="p-3 rounded-xl bg-blue-50 text-blue-600"><CalendarRange size={20} /></div><div><p className="text-2xl font-bold">{data.reduce((s, r) => s + r.days, 0)}</p><p className="text-xs text-gray-500">Total leave days</p></div></div>
      </div>

      <LeaveTypeCard requests={reqs} />

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-gray-100 bg-cyan-600 font-bold text-sm text-white">Employee List — start date and return to work</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cyan-50/50 text-xs text-gray-500">
              <tr><th className="text-left px-5 py-2">Employee</th><th className="text-left px-3 py-2">Department</th><th className="text-left px-3 py-2">Leave Start</th><th className="text-left px-3 py-2">Back to Work</th><th className="text-right px-3 py-2">Days</th><th className="text-left px-3 py-2">Season</th><th className="text-left px-3 py-2">Block</th><th className="text-left px-3 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No leave requests yet</td></tr>}
              {data.map(r => (
                <tr key={r.id}>
                  <td className="px-5 py-2 font-medium text-gray-800">{r.flagged && <span title="Red flagged" className="text-red-600">▲ </span>}{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.dept}</td>
                  <td className="px-3 py-2">{fmt(r.start)}</td>
                  <td className="px-3 py-2">{fmt(r.back)}</td>
                  <td className="px-3 py-2 text-right">{r.days}</td>
                  <td className="px-3 py-2 text-gray-600">{seasonOf(r.start).split(' (')[0]}</td>
                  <td className="px-3 py-2 text-gray-600">{blockOf(r.start)}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
