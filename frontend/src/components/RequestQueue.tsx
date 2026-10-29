import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, Trash2, CheckCircle2, XCircle, Clock, Upload, Search, X, Ban, CalendarDays } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import { employeesApi } from '../api/employees';
import type { LeaveRequest, RequestStatus } from '../types';
import { DEPARTMENT_LABELS, DEPARTMENTS } from '../types';
import EligibilityResultCard from './EligibilityResult';
import ImportLeaveModal from './ImportLeaveModal';
import { AdminDateChange } from './DateChange';
import type { DateChange } from '../types';

const STATUS_BADGE: Record<RequestStatus, string> = { APPROVED:'badge-approved', DENIED:'badge-denied', PENDING:'badge-pending', CANCELLED:'badge-cancelled' };
const STATUS_ICON: Record<RequestStatus, React.ReactNode> = { APPROVED:<CheckCircle2 size={12} />, DENIED:<XCircle size={12} />, PENDING:<Clock size={12} />, CANCELLED:<Ban size={12} /> };
const DECISION_LABEL: Record<RequestStatus, string> = { APPROVED:'Approve', DENIED:'Deny', PENDING:'Pending', CANCELLED:'Cancel' };

export default function RequestQueue() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<RequestStatus | 'ALL' | 'FLAGGED' | 'CHANGES'>('ALL');

  const [search, setSearch] = useState('');
  const [year, setYear] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [dept, setDept] = useState('ALL');
  const [empNos, setEmpNos] = useState<Record<string, string>>({});
  useEffect(() => { employeesApi.getAll().then(l => setEmpNos(Object.fromEntries(l.map(e => [e.id, e.employeeNumber || ''])))).catch(() => {}); }, []);

  const [changes, setChanges] = useState<DateChange[]>([]);
  const pendingChange = useMemo(() => Object.fromEntries(changes.filter(c => c.status === 'PENDING').map(c => [c.leaveRequestId, c])) as Record<string, DateChange>, [changes]);
  const load = useCallback(() => { leaveRequestsApi.getDateChanges().then(setChanges).catch(() => {}); setLoading(true); leaveRequestsApi.getAll().then(setRequests).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this leave request?')) return;
    try { await leaveRequestsApi.delete(id); setRequests(prev => prev.filter(r => r.id !== id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const [decision, setDecision] = useState<{ req: LeaveRequest; status: RequestStatus } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [dateError, setDateError] = useState('');

  const openEditDates = (r: LeaveRequest) => { setEditing(r); setNewStart(r.startDate.slice(0, 10)); setNewEnd(r.endDate.slice(0, 10)); setDateError(''); };
  const saveDates = async () => {
    if (!editing) return;
    if (!newStart || !newEnd) { setDateError('Choose both dates.'); return; }
    if (newEnd < newStart) { setDateError('The end date cannot be before the start date.'); return; }
    setSaving(true); setDateError('');
    try { const updated = await leaveRequestsApi.setDates(editing.id, newStart, newEnd); setRequests(prev => prev.map(r => r.id === editing.id ? updated : r)); setEditing(null); }
    catch (e: unknown) { const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error; setDateError(msg || (e instanceof Error ? e.message : 'Could not save the dates')); }
    finally { setSaving(false); }
  };

  const applyStatus = async (id: string, status: RequestStatus, n?: string) => {
    setSaving(true);
    try { const updated = await leaveRequestsApi.setStatus(id, status, n); setRequests(prev => prev.map(r => r.id === id ? updated : r)); setDecision(null); setNote(''); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Update failed'); }
    finally { setSaving(false); }
  };

  // Approve / Deny open a note box; Pending applies straight away.
  const handleStatus = (req: LeaveRequest, status: RequestStatus) => {
    if (status === req.status) return;
    if (status === 'PENDING') { applyStatus(req.id, status); return; }
    setNote(''); setDecision({ req, status });
  };

  const day = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
  const years = useMemo(() => Array.from(new Set(requests.flatMap(r => [day(r.startDate).getFullYear(), day(r.endDate).getFullYear()]))).sort(), [requests]);
  const term = search.trim().toLowerCase();
  const filtersOn = year !== 'ALL' || month !== 'ALL' || dept !== 'ALL' || !!term;
  // Month = on leave at any point in that month (in the chosen year, or in any year if "All years").
  // Year alone = leave that overlaps that year.
  const base = requests.filter(r => {
    const s = day(r.startDate), e = day(r.endDate);
    if (dept !== 'ALL' && r.department !== dept) return false;
    if (term && !((r.employeeName || '').toLowerCase().includes(term) || (empNos[r.employeeId] || '').toLowerCase().includes(term))) return false;
    if (month !== 'ALL') {
      const m = Number(month);
      const ys = year !== 'ALL' ? [Number(year)] : Array.from({ length: e.getFullYear() - s.getFullYear() + 1 }, (_, i) => s.getFullYear() + i);
      return ys.some(y => s <= new Date(y, m + 1, 0) && e >= new Date(y, m, 1));
    }
    if (year !== 'ALL') { const y = Number(year); return s <= new Date(y, 11, 31) && e >= new Date(y, 0, 1); }
    return true;
  });
  const filtered = filter === 'ALL' ? base : filter === 'FLAGGED' ? base.filter(r => r.isFlagged) : filter === 'CHANGES' ? base.filter(r => pendingChange[r.id]) : base.filter(r => r.status === filter);
  const counts: Record<string, number> = {
    ALL: base.length,
    APPROVED: base.filter(r => r.status==='APPROVED').length,
    PENDING: base.filter(r => r.status==='PENDING').length,
    FLAGGED: base.filter(r => r.isFlagged).length,
    CHANGES: base.filter(r => pendingChange[r.id]).length,
    DENIED: base.filter(r => r.status==='DENIED').length,
    CANCELLED: base.filter(r => r.status==='CANCELLED').length
  };
  const clearFilters = () => { setSearch(''); setYear('ALL'); setMonth('ALL'); setDept('ALL'); setFilter('ALL'); };

  return (
    <div className='p-4 md:p-8'>
      <div className='flex flex-wrap gap-3 items-center justify-between mb-6'>
        <div><h1 className='text-3xl md:text-4xl font-bold text-gray-900'>All Leave Requests</h1><p className='text-gray-500 text-sm'>{requests.length} total &mdash; first-come, first-served</p></div>
        <div className='flex items-center gap-2'>
          <button className='btn-secondary' onClick={() => setShowImport(true)}><Upload size={15} /> Import leave list</button>
          <button className='btn-secondary' onClick={load}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>
      {showImport && <ImportLeaveModal onClose={() => setShowImport(false)} onImported={load} />}
      {error && <div className='mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm'>{error}</div>}
      <div className='card p-3 md:p-4 mb-4 flex flex-wrap items-center gap-3 text-sm'>
        <div className='relative flex-1 min-w-[14rem]'>
          <Search size={14} className='absolute left-3 top-3 text-gray-400' />
          <input className='form-input pl-9' placeholder='Search employee name or number' value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className='form-select !w-auto' value={dept} onChange={e => setDept(e.target.value)} aria-label='Department'>
          <option value='ALL'>All departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
        </select>
        <select className='form-select !w-auto' value={year} onChange={e => setYear(e.target.value)} aria-label='Year'>
          <option value='ALL'>All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className='form-select !w-auto' value={month} onChange={e => setMonth(e.target.value)} aria-label='Month'>
          <option value='ALL'>All months</option>
          {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        {(filtersOn || filter !== 'ALL') && <button className='btn-secondary !py-1.5 text-xs' onClick={clearFilters}><X size={12} /> Clear filters</button>}
        <span className='text-xs text-gray-500 ml-auto'>{filtered.length} of {requests.length} request{requests.length === 1 ? '' : 's'}{month !== 'ALL' ? ' (on leave at any point in the month)' : ''}</span>
      </div>
      <div className='flex gap-2 mb-5 flex-wrap'>
        {(['ALL','APPROVED','PENDING','FLAGGED','CHANGES','DENIED','CANCELLED'] as const).map(s => (
          <button 
            key={s} 
            onClick={() => setFilter(s)} 
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s 
                ? (s === 'FLAGGED' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white')
                : (s === 'FLAGGED' ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')
            }`}
          >
            {s === 'FLAGGED' ? '🚩 FLAGGED' : s === 'CHANGES' ? '📅 DATE CHANGES' : s} <span className='ml-1 opacity-70'>({counts[s]})</span>
          </button>
        ))}
      </div>
      {loading ? (<div className='flex justify-center py-16'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600' /></div>)
      : filtered.length === 0 ? (<div className='card p-12 text-center text-gray-400 text-sm'>No requests found</div>)
      : (
        <div className='space-y-2'>
          {filtered.map(req => (
            <div key={req.id} className={`card overflow-hidden ${req.isFlagged ? 'border-red-200' : ''}`}>
              <div className='px-5 py-4 flex flex-wrap items-start gap-4'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-semibold text-gray-900 text-sm'>{req.employeeName}</span>
                    <span className='text-gray-400 text-xs'>&middot;</span>
                    <span className='text-xs text-gray-500'>{DEPARTMENT_LABELS[req.department]}</span>
                    <span className={`${STATUS_BADGE[req.status]} flex items-center gap-1`}>{STATUS_ICON[req.status]} {req.status}</span>
                    {req.isFlagged && (
                      <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm'>
                        <span>🚩</span> Red-Flagged
                      </span>
                    )}
                    <span className='text-xs text-gray-400'>#{req.queuePosition}</span>
                  </div>
                  <p className='text-xs text-gray-600 mt-1'>
                    {new Date(req.startDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    {' → '}
                    {new Date(req.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    <span className='text-gray-400 ml-1'>({Math.round((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / 86400000) + 1} days)</span>
                  </p>
                  {req.purpose && <p className='text-xs text-gray-400 mt-0.5 truncate'>{req.purpose}</p>}
                  {req.decisionNote && <p className='text-xs text-gray-700 mt-1'>HR note: {req.decisionNote}</p>}
                  {req.denialReasons.length > 0 && <p className='text-xs text-red-600 mt-1'>⚠ {req.denialReasons[0]}</p>}
                  {pendingChange[req.id] && <AdminDateChange change={pendingChange[req.id]} onDecided={() => load()} />}
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <button className='text-xs text-brand-600 hover:underline' onClick={() => setExpanded(expanded === req.id ? null : req.id)}>{expanded === req.id ? 'Hide' : 'Details'}</button>
                  <button className='p-1.5 text-gray-400 hover:text-brand-600 rounded-md hover:bg-brand-50 transition-colors' title='Change dates' aria-label='Change dates' onClick={() => openEditDates(req)}><CalendarDays size={14} /></button>
                  <select className='text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400'
                    value={req.status} onChange={e => handleStatus(req, e.target.value as RequestStatus)}>
                    <option value='APPROVED'>Approve</option>
                    <option value='PENDING'>Pending</option>
                    <option value='DENIED'>Deny</option>
                    <option value='CANCELLED'>Cancel</option>
                  </select>
                  <button className='p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors' onClick={() => handleDelete(req.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              {expanded === req.id && (
                <div className='border-t border-gray-100 px-5 py-4 bg-gray-50'>
                  <EligibilityResultCard result={{ eligible: req.status==='APPROVED', status: req.status, failures: req.denialReasons.map(m => ({ rule:'Denial', passed:false, isWarning:false, message:m })), warnings: req.warnings.map(m => ({ rule:'Advisory', passed:true, isWarning:true, message:m })), passes:[], adjustedEndDate: req.adjustedEndDate }} compact />
                  {req.decisionNote && (
                    <p className='mt-3 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5'>
                      <span className='font-semibold'>HR note:</span> {req.decisionNote}
                    </p>
                  )}
                  <p className='mt-3 text-xs text-gray-400'>Submitted: {new Date(req.submittedAt).toLocaleString('en-US')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4' onClick={() => !saving && setEditing(null)}>
          <div className='card w-full max-w-md p-5' onClick={e => e.stopPropagation()}>
            <h3 className='font-semibold text-gray-900 text-xl'>Change leave dates</h3>
            <p className='text-xs text-gray-500 mt-1'>{editing.employeeName} · {DEPARTMENT_LABELS[editing.department]}</p>
            <div className='grid grid-cols-2 gap-3 mt-4'>
              <div><label className='form-label'>Start date</label><input type='date' className='form-input' value={newStart} onChange={e => setNewStart(e.target.value)} /></div>
              <div><label className='form-label'>End date</label><input type='date' className='form-input' value={newEnd} min={newStart} onChange={e => setNewEnd(e.target.value)} /></div>
            </div>
            <p className='text-[11px] text-gray-400 mt-2'>Admin change: the notice and block rules are not re-checked. The change is recorded in the audit log.</p>
            {dateError && <p className='text-xs text-red-600 mt-2'>{dateError}</p>}
            <div className='flex justify-end gap-2 mt-4'>
              <button className='btn-secondary' disabled={saving} onClick={() => setEditing(null)}>Close</button>
              <button className='btn-primary' disabled={saving} onClick={saveDates}>{saving ? 'Saving…' : 'Save dates'}</button>
            </div>
          </div>
        </div>
      )}
      {decision && (
        <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4' onClick={() => !saving && setDecision(null)}>
          <div className='card w-full max-w-md p-5' onClick={e => e.stopPropagation()}>
            <h3 className='font-semibold text-gray-900 text-xl'>{DECISION_LABEL[decision.status]} leave request</h3>
            <p className='text-xs text-gray-500 mt-1'>
              {decision.req.employeeName} · {new Date(decision.req.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(decision.req.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <label className='form-label mt-4'>Note to employee {decision.status === 'DENIED' || decision.status === 'CANCELLED' ? '(recommended)' : '(optional)'}</label>
            <textarea className='form-input' rows={4} maxLength={500} autoFocus value={note} onChange={e => setNote(e.target.value)}
              placeholder={decision.status === 'DENIED' ? 'e.g. Peak season - please resubmit for Block 4' : decision.status === 'CANCELLED' ? 'e.g. Cancelled at the employee request' : 'e.g. Approved. Enjoy your leave!'} />
            <p className='text-[11px] text-gray-400 text-right'>{note.length}/500</p>
            <div className='flex justify-end gap-2 mt-3'>
              <button className='btn-secondary' disabled={saving} onClick={() => setDecision(null)}>Close</button>
              <button className={decision.status === 'DENIED' ? 'btn-primary !bg-red-600 hover:!bg-red-700' : decision.status === 'CANCELLED' ? 'btn-primary !bg-gray-600 hover:!bg-gray-700' : 'btn-primary'} disabled={saving}
                onClick={() => applyStatus(decision.req.id, decision.status, note)}>
                {saving ? 'Saving…' : DECISION_LABEL[decision.status]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}