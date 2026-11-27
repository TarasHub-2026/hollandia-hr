import { localDate } from '../utils/dates';
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, TrendingUp, ChevronDown, Plane } from 'lucide-react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, LeaveRequest } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import BlockCapacity from './BlockCapacity';
import NoLeaveCard from './NoLeaveCard';
import SeasonBlockSummary from './SeasonBlockSummary';

/**
 * HR: the leave information that used to sit on the Company Dashboard. It now lives in cards under Leaves
 * (and the department overview under Company Profile).
 */

export interface LeaveData {
  employees: Employee[];
  requests: LeaveRequest[];
  loading: boolean;
  updatedAt?: Date;
  load: () => void;
}

/** Employees and leave requests, kept live: reloads every 60s, when the tab regains focus, and on demand. */
export function useLeaveData(): LeaveData {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | undefined>();

  const load = useCallback(() => {
    Promise.all([employeesApi.getAll(), leaveRequestsApi.getAll()])
      .then(([emps, reqs]) => { setEmployees(emps); setRequests(reqs); setUpdatedAt(new Date()); })
      .catch(() => { /* keep showing the last good data */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  return { employees, requests, loading, updatedAt, load };
}

const todayKey = () => new Date().toISOString().split('T')[0];
export const awayToday = (requests: LeaveRequest[]) => {
  const today = todayKey();
  return requests.filter(r => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today);
};

const Spinner = () => <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;

/** Approved, denied, pending and away-today counts (top of the Leaves page). */
export function LeaveKpis({ data }: { data: LeaveData }) {
  const { requests } = data;
  const kpis = [
    { label: 'Pending Review', value: requests.filter(r => r.status === 'PENDING').length, icon: <Clock size={18} />, color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Approved Leaves', value: requests.filter(r => r.status === 'APPROVED').length, icon: <CheckCircle2 size={18} />, color: 'bg-green-50 text-green-600' },
    { label: 'Denied Requests', value: requests.filter(r => r.status === 'DENIED').length, icon: <XCircle size={18} />, color: 'bg-red-50 text-red-600' },
    { label: 'Away Today', value: awayToday(requests).length, icon: <Plane size={18} />, color: 'bg-orange-50 text-orange-600' },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {kpis.map(k => (
        <div key={k.label} className="card p-3 md:p-4 flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${k.color}`}>{k.icon}</div>
          <div><p className="text-xl font-bold text-gray-900">{data.loading ? '\u2013' : k.value}</p><p className="text-xs text-gray-500">{k.label}</p></div>
        </div>
      ))}
    </div>
  );
}

function CurrentlyAway({ requests }: { requests: LeaveRequest[] }) {
  const [open, setOpen] = useState(true);
  const away = awayToday(requests);
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={`w-full px-5 py-4 flex items-center gap-2 text-left bg-green-600 ${open ? 'border-b border-gray-100' : ''}`}>
        <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
        <TrendingUp size={16} className="text-white" />
        <h2 className="font-semibold text-white text-lg">Currently Away Today</h2>
        <span className="ml-auto text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">{away.length}</span>
      </button>
      {open && <div className="divide-y divide-gray-50">
        {away.length === 0
          ? <p className="px-5 py-6 text-sm text-gray-400 text-center">No employees currently on leave</p>
          : away.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-800">{r.employeeName}</p><p className="text-xs text-gray-500">{DEPARTMENT_LABELS[r.department]}</p></div>
              <p className="text-xs text-gray-500">Until {localDate(r.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          ))}
      </div>}
    </div>
  );
}

/** Employees per department and how many are away today (Company Profile). Loads its own data. */
export function DepartmentOverview() {
  const { employees, requests, loading } = useLeaveData();
  const [open, setOpen] = useState(true);
  if (loading) return <div className="p-4 md:p-8"><Spinner /></div>;
  const away = awayToday(requests);
  const rows = DEPARTMENTS.map(dept => ({
    dept, label: DEPARTMENT_LABELS[dept],
    count: employees.filter(e => e.department === dept).length,
    away: away.filter(r => r.department === dept).length,
  }));
  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="card overflow-hidden">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={`w-full px-5 py-4 flex items-center gap-2 text-left bg-blue-600 ${open ? 'border-b border-gray-100' : ''}`}>
          <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
          <h2 className="font-semibold text-white text-lg">Department Overview</h2>
          <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">{employees.length} employees</span>
        </button>
        {open && <div className="divide-y divide-gray-50">
          {rows.map(d => (
            <div key={d.dept} className="px-5 py-3 flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-800">{d.label}</p><p className="text-xs text-gray-500">{d.count} employee{d.count !== 1 ? 's' : ''}</p></div>
              {d.away > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{d.away} away</span>}
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}

export type LeavePart = 'block-capacity' | 'away-today' | 'season-blocks' | 'no-leave';

/** One of the leave cards that came from the Company Dashboard. */
export function LeaveSection({ part, data }: { part: LeavePart; data: LeaveData }) {
  if (data.loading) return <div className="p-4 md:p-8"><Spinner /></div>;
  return (
    <div className="p-4 md:p-8 [&>div]:!mt-0">
      {part === 'block-capacity' && <BlockCapacity requests={data.requests} employees={data.employees} onRefresh={data.load} updatedAt={data.updatedAt} />}
      {part === 'away-today' && <div className="max-w-3xl"><CurrentlyAway requests={data.requests} /></div>}
      {part === 'season-blocks' && <SeasonBlockSummary requests={data.requests} />}
      {part === 'no-leave' && <NoLeaveCard employees={data.employees} requests={data.requests} />}
    </div>
  );
}
