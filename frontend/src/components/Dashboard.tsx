import React, { useCallback, useEffect, useState } from 'react';
import { Users, CheckCircle2, XCircle, Clock, TrendingUp, ChevronDown } from 'lucide-react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, LeaveRequest } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import BlockCapacity from './BlockCapacity';
import NoLeaveCard from './NoLeaveCard';
import SeasonBlockSummary from './SeasonBlockSummary';

export default function Dashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests,  setRequests]  = useState<LeaveRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [awayOpen, setAwayOpen] = useState(true);
  const [deptOpen, setDeptOpen] = useState(true);

  const [updatedAt, setUpdatedAt] = useState<Date | undefined>();

  const load = useCallback(() => {
    return Promise.all([employeesApi.getAll(), leaveRequestsApi.getAll()])
      .then(([emps, reqs]) => { setEmployees(emps); setRequests(reqs); setUpdatedAt(new Date()); })
      .catch(() => { /* keep showing the last good data */ })
      .finally(() => setLoading(false));
  }, []);

  // Keep the dashboard live: reload every 60s, when the tab regains focus, and on demand.
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  if (loading) return (
    <div className='p-4 md:p-8 flex items-center justify-center h-full'>
      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' />
    </div>
  );

  const approved = requests.filter(r => r.status === 'APPROVED').length;
  const denied   = requests.filter(r => r.status === 'DENIED').length;
  const pending  = requests.filter(r => r.status === 'PENDING').length;
  const today = new Date().toISOString().split('T')[0];
  const currentlyAway = requests.filter(r => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today);
  const deptBreakdown = DEPARTMENTS.map(dept => ({
    dept, label: DEPARTMENT_LABELS[dept],
    count: employees.filter(e => e.department === dept).length,
    away:  currentlyAway.filter(r => r.department === dept).length,
  }));

  return (
    <div className='p-4 md:p-8'>
      <h1 className='text-3xl md:text-4xl font-bold text-gray-900 mb-1'>Dashboard</h1>
      <p className='text-gray-500 text-sm mb-8'>
        {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
      </p>
      <div className='grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8'>
        {[
          { label: 'Total Employees', value: employees.length, icon: <Users size={20} />,        color: 'bg-blue-50 text-blue-600' },
          { label: 'Approved Leaves', value: approved,         icon: <CheckCircle2 size={20} />, color: 'bg-green-50 text-green-600' },
          { label: 'Denied Requests', value: denied,           icon: <XCircle size={20} />,      color: 'bg-red-50 text-red-600' },
          { label: 'Pending Review',  value: pending,          icon: <Clock size={20} />,         color: 'bg-yellow-50 text-yellow-600' },
        ].map(kpi => (
          <div key={kpi.label} className='card p-5 flex items-center gap-4'>
            <div className={`p-3 rounded-xl ${kpi.color}`}>{kpi.icon}</div>
            <div><p className='text-2xl font-bold text-gray-900'>{kpi.value}</p><p className='text-xs text-gray-500'>{kpi.label}</p></div>
          </div>
        ))}
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6 items-start'>
        <div className='card overflow-hidden'>
          <button type='button' onClick={() => setAwayOpen(o => !o)} aria-expanded={awayOpen} className={`w-full px-5 py-4 flex items-center gap-2 text-left bg-green-600 ${awayOpen ? 'border-b border-gray-100' : ''}`}>
            <ChevronDown size={16} className={`text-white/80 transition-transform ${awayOpen ? '' : '-rotate-90'}`} />
            <TrendingUp size={16} className='text-white' />
            <h2 className='font-semibold text-white text-lg'>Currently Away Today</h2>
            <span className='ml-auto text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium'>{currentlyAway.length}</span>
          </button>
          {awayOpen && <div className='divide-y divide-gray-50'>
            {currentlyAway.length === 0
              ? <p className='px-5 py-6 text-sm text-gray-400 text-center'>No employees currently on leave</p>
              : currentlyAway.map(r => (
                <div key={r.id} className='px-5 py-3 flex items-center justify-between'>
                  <div><p className='text-sm font-medium text-gray-800'>{r.employeeName}</p><p className='text-xs text-gray-500'>{DEPARTMENT_LABELS[r.department]}</p></div>
                  <p className='text-xs text-gray-500'>Until {new Date(r.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</p>
                </div>
              ))}
          </div>}
        </div>
        <div className='card overflow-hidden'>
          <button type='button' onClick={() => setDeptOpen(o => !o)} aria-expanded={deptOpen} className={`w-full px-5 py-4 flex items-center gap-2 text-left bg-blue-600 ${deptOpen ? 'border-b border-gray-100' : ''}`}>
            <ChevronDown size={16} className={`text-white/80 transition-transform ${deptOpen ? '' : '-rotate-90'}`} />
            <h2 className='font-semibold text-white text-lg'>Department Overview</h2>
          </button>
          {deptOpen && <div className='divide-y divide-gray-50'>
            {deptBreakdown.map(d => (
              <div key={d.dept} className='px-5 py-3 flex items-center justify-between'>
                <div><p className='text-sm font-medium text-gray-800'>{d.label}</p><p className='text-xs text-gray-500'>{d.count} employee{d.count !== 1 ? 's' : ''}</p></div>
                {d.away > 0 && <span className='text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium'>{d.away} away</span>}
              </div>
            ))}
          </div>}
        </div>
      </div>
      <NoLeaveCard employees={employees} requests={requests} />
      <SeasonBlockSummary requests={requests} />
      <BlockCapacity requests={requests} onRefresh={load} updatedAt={updatedAt} />
    </div>
  );
}