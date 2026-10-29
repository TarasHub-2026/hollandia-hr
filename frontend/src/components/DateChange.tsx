import React, { useState } from 'react';
import { CalendarDays, Check, X } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { DateChange, LeaveRequest } from '../types';

const fmt = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : fallback);

/** Latest change request for each leave request id. */
export function latestByLeave(changes: DateChange[]): Record<string, DateChange> {
  const out: Record<string, DateChange> = {};
  for (const c of changes) { const cur = out[c.leaveRequestId]; if (!cur || c.createdAt > cur.createdAt) out[c.leaveRequestId] = c; }
  return out;
}

/** Employee view: ask HR to change the dates of a pending or approved leave. */
export function EmployeeDateChange({ req, change, onChanged }: { req: LeaveRequest; change?: DateChange; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const canRequest = (req.status === 'APPROVED' || req.status === 'PENDING') && req.endDate.slice(0, 10) >= today && change?.status !== 'PENDING';
  const recentlyDecided = change && (change.status === 'APPROVED' || change.status === 'DENIED') && change.decidedAt
    && Date.now() - Date.parse(change.decidedAt) < 14 * 86400000;

  const openModal = () => { setStart(req.startDate.slice(0, 10)); setEnd(req.endDate.slice(0, 10)); setReason(''); setErr(''); setOpen(true); };
  const send = async () => {
    if (!start || !end) { setErr('Choose both dates.'); return; }
    if (end < start) { setErr('The end date cannot be before the start date.'); return; }
    if (!reason.trim()) { setErr('Please give a reason for the change.'); return; }
    setBusy(true); setErr('');
    try { await leaveRequestsApi.requestDateChange(req.id, start, end, reason.trim()); setOpen(false); onChanged(); }
    catch (e) { setErr(errMsg(e, 'Could not send the request')); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!change || !confirm('Withdraw this date change request?')) return;
    try { await leaveRequestsApi.withdrawDateChange(change.id); onChanged(); }
    catch (e) { alert(errMsg(e, 'Could not withdraw')); }
  };

  return (
    <>
      {change?.status === 'PENDING' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900 flex flex-wrap items-center gap-2">
          <CalendarDays size={14} className="shrink-0" />
          <span className="flex-1 min-w-0"><strong>Date change requested:</strong> {fmt(change.newStart)} → {fmt(change.newEnd)}. Waiting for HR to approve or deny. Your current dates stay in place until then.</span>
          <button className="text-blue-700 underline font-medium" onClick={withdraw}>Withdraw</button>
        </div>
      )}
      {recentlyDecided && (
        <div className={`rounded-lg p-2.5 text-xs border ${change!.status === 'APPROVED' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          <strong>Date change {change!.status === 'APPROVED' ? 'approved' : 'denied'}</strong> ({fmt(change!.newStart)} → {fmt(change!.newEnd)}).
          {change!.decisionNote && <> <strong>Note from HR:</strong> {change!.decisionNote}</>}
        </div>
      )}
      {canRequest && (
        <button className="btn-secondary !py-1.5 text-xs" onClick={openModal}><CalendarDays size={13} /> Request date change</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-xl">Request a date change</h3>
            <p className="text-xs text-gray-500 mt-1">Current dates: {fmt(req.startDate)} → {fmt(req.endDate)}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div><label className="form-label">New start date</label><input type="date" className="form-input" value={start} onChange={e => setStart(e.target.value)} /></div>
              <div><label className="form-label">New end date</label><input type="date" className="form-input" value={end} min={start} onChange={e => setEnd(e.target.value)} /></div>
            </div>
            <label className="form-label mt-3">Reason</label>
            <textarea className="form-input" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. My flight was moved" />
            <p className="text-[11px] text-gray-400 mt-1">HR will approve or deny this. Your leave keeps its current dates until HR decides.</p>
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Close</button>
              <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send request'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** HR view: approve or deny a pending date change request. */
export function AdminDateChange({ change, onDecided }: { change: DateChange; onDecided: (c: DateChange) => void }) {
  const [deciding, setDeciding] = useState<'APPROVED' | 'DENIED' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!deciding) return;
    setBusy(true); setErr('');
    try { const c = await leaveRequestsApi.decideDateChange(change.id, deciding, note); setDeciding(null); setNote(''); onDecided(c); }
    catch (e) { setErr(errMsg(e, 'Could not save')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
      <p className="font-semibold flex items-center gap-1.5"><CalendarDays size={13} /> Date change requested by employee</p>
      <p className="mt-1">{fmt(change.oldStart)} → {fmt(change.oldEnd)} &nbsp;<strong>to</strong>&nbsp; <strong>{fmt(change.newStart)} → {fmt(change.newEnd)}</strong></p>
      {change.reason && <p className="mt-1 text-blue-800">Reason: {change.reason}</p>}
      <div className="flex gap-2 mt-2">
        <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => { setNote(''); setErr(''); setDeciding('APPROVED'); }}><Check size={12} /> Approve</button>
        <button className="btn-primary !py-1 !px-3 text-xs !bg-red-600 hover:!bg-red-700" onClick={() => { setNote(''); setErr(''); setDeciding('DENIED'); }}><X size={12} /> Deny</button>
      </div>
      {deciding && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 text-gray-900" onClick={() => !busy && setDeciding(null)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-xl">{deciding === 'APPROVED' ? 'Approve' : 'Deny'} date change</h3>
            <p className="text-xs text-gray-500 mt-1">{change.employeeName} · {fmt(change.newStart)} → {fmt(change.newEnd)}</p>
            {deciding === 'APPROVED' && <p className="text-[11px] text-gray-400 mt-2">The leave dates will be changed right away. The notice and block rules are not re-checked.</p>}
            <label className="form-label mt-4">Note to employee {deciding === 'DENIED' ? '(recommended)' : '(optional)'}</label>
            <textarea className="form-input" rows={3} maxLength={500} autoFocus value={note} onChange={e => setNote(e.target.value)} />
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-secondary" disabled={busy} onClick={() => setDeciding(null)}>Close</button>
              <button className={deciding === 'DENIED' ? 'btn-primary !bg-red-600 hover:!bg-red-700' : 'btn-primary'} disabled={busy} onClick={save}>{busy ? 'Saving…' : deciding === 'APPROVED' ? 'Approve' : 'Deny'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}