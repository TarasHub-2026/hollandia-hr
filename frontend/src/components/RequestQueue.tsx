import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { LeaveRequest, RequestStatus } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import EligibilityResultCard from './EligibilityResult';

const STATUS_BADGE: Record<RequestStatus, string> = { APPROVED:'badge-approved', DENIED:'badge-denied', PENDING:'badge-pending' };
const STATUS_ICON: Record<RequestStatus, React.ReactNode> = { APPROVED:<CheckCircle2 size={12} />, DENIED:<XCircle size={12} />, PENDING:<Clock size={12} /> };

export default function RequestQueue() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<RequestStatus | 'ALL'>('ALL');

  const load = () => { setLoading(true); leaveRequestsApi.getAll().then(setRequests).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this leave request?')) return;
    try { await leaveRequestsApi.delete(id); setRequests(prev => prev.filter(r => r.id !== id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const handleStatus = async (id: string, status: RequestStatus) => {
    try { const updated = await leaveRequestsApi.setStatus(id, status); setRequests(prev => prev.map(r => r.id === id ? updated : r)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Update failed'); }
  };

  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);
  const counts: Record<string, number> = { ALL: requests.length, APPROVED: requests.filter(r => r.status==='APPROVED').length, PENDING: requests.filter(r => r.status==='PENDING').length, DENIED: requests.filter(r => r.status==='DENIED').length };

  return (
    <div className='p-8'>
      <div className='flex items-center justify-between mb-6'>
        <div><h1 className='text-2xl font-bold text-gray-900'>All Leave Requests</h1><p className='text-gray-500 text-sm'>{requests.length} total &mdash; first-come, first-served</p></div>
        <button className='btn-secondary' onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>
      {error && <div className='mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
      <div className='flex gap-2 mb-5'>
        {(['ALL','APPROVED','PENDING','DENIED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter===s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s} <span className='ml-1 opacity-70'>({counts[s]})</span>
          </button>
        ))}
      </div>
      {loading ? (<div className='flex justify-center py-16'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' /></div>)
      : filtered.length === 0 ? (<div className='card p-12 text-center text-gray-400 text-sm'>No requests found</div>)
      : (
        <div className='space-y-2'>
          {filtered.map(req => (
            <div key={req.id} className='card overflow-hidden'>
              <div className='px-5 py-4 flex flex-wrap items-start gap-4'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-semibold text-gray-900 text-sm'>{req.employeeName}</span>
                    <span className='text-gray-400 text-xs'>&middot;</span>
                    <span className='text-xs text-gray-500'>{DEPARTMENT_LABELS[req.department]}</span>
                    <span className={`${STATUS_BADGE[req.status]} flex items-center gap-1`}>{STATUS_ICON[req.status]} {req.status}</span>
                    <span className='text-xs text-gray-400'>#{req.queuePosition}</span>
                  </div>
                  <p className='text-xs text-gray-600 mt-1'>
                    {new Date(req.startDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    {' → '}
                    {new Date(req.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    <span className='text-gray-400 ml-1'>({Math.round((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / 86400000) + 1} days)</span>
                  </p>
                  {req.purpose && <p className='text-xs text-gray-400 mt-0.5 truncate'>{req.purpose}</p>}
                  {req.denialReasons.length > 0 && <p className='text-xs text-red-600 mt-1'>⚠ {req.denialReasons[0]}</p>}
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <button className='text-xs text-brand-600 hover:underline' onClick={() => setExpanded(expanded === req.id ? null : req.id)}>{expanded === req.id ? 'Hide' : 'Details'}</button>
                  <select className='text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400'
                    value={req.status} onChange={e => handleStatus(req.id, e.target.value as RequestStatus)}>
                    <option value='APPROVED'>Approve</option>
                    <option value='PENDING'>Pending</option>
                    <option value='DENIED'>Deny</option>
                  </select>
                  <button className='p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors' onClick={() => handleDelete(req.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              {expanded === req.id && (
                <div className='border-t border-gray-100 px-5 py-4 bg-gray-50'>
                  <EligibilityResultCard result={{ eligible: req.status==='APPROVED', status: req.status, failures: req.denialReasons.map(m => ({ rule:'Denial', passed:false, isWarning:false, message:m })), warnings: req.warnings.map(m => ({ rule:'Advisory', passed:true, isWarning:true, message:m })), passes:[], adjustedEndDate: req.adjustedEndDate }} compact />
                  <p className='mt-3 text-xs text-gray-400'>Submitted: {new Date(req.submittedAt).toLocaleString('en-US')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}