import React, { useEffect, useState } from 'react';
import { Users, CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';

export default function Dashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests,  setRequests]  = useState<LeaveRequest[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([employeesApi.getAll(), leaveRequestsApi.getAll()])
      .then(([emps, reqs]) => { setEmployees(emps); setRequests(reqs); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className='p-8 flex items-center justify-center h-full'>
      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' />
    </div>
  );

  const approved = requests.filter(r => r.status === 'APPROVED').length;
  const denied   = requests.filter(r => r.status === 'DENIED').length;
  const pending  = requests.filter(r => r.status === 'PENDING').length;
  const today = new Date().toISOString().split('T')[0];
  const currentlyAway = requests.filter(r => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today);
  const deptBreakdown = Object.entries(DEPARTMENT_LABELS).map(([dept, label]) => ({
    dept, label,
    count: employees.filter(e => e.department === dept).length,
    away:  currentlyAway.filter(r => r.department === dept).length,
  }));

  return (
    <div className='p-8'>
      <h1 className='text-2xl font-bold text-gray-900 mb-1'>Dashboard</h1>
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
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <div className='card'>
          <div className='px-5 py-4 border-b border-gray-100 flex items-center gap-2'>
            <TrendingUp size={16} className='text-brand-600' />
            <h2 className='font-semibold text-gray-800 text-sm'>Currently Away Today</h2>
            <span className='ml-auto text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium'>{currentlyAway.length}</span>
          </div>
          <div className='divide-y divide-gray-50'>
            {currentlyAway.length === 0
              ? <p className='px-5 py-6 text-sm text-gray-400 text-center'>No employees currently on leave</p>
              : currentlyAway.map(r => (
                <div key={r.id} className='px-5 py-3 flex items-center justify-between'>
                  <div><p className='text-sm font-medium text-gray-800'>{r.employeeName}</p><p className='text-xs text-gray-500'>{DEPARTMENT_LABELS[r.department]}</p></div>
                  <p className='text-xs text-gray-500'>Until {new Date(r.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</p>
                </div>
              ))}
          </div>
        </div>
        <div className='card'>
          <div className='px-5 py-4 border-b border-gray-100'><h2 className='font-semibold text-gray-800 text-sm'>Department Overview</h2></div>
          <div className='divide-y divide-gray-50'>
            {deptBreakdown.map(d => (
              <div key={d.dept} className='px-5 py-3 flex items-center justify-between'>
                <div><p className='text-sm font-medium text-gray-800'>{d.label}</p><p className='text-xs text-gray-500'>{d.count} employee{d.count !== 1 ? 's' : ''}</p></div>
                {d.away > 0 && <span className='text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium'>{d.away} away</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}