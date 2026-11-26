import React, { useState } from 'react';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { paidSickApi } from '../api/paidSick';
import type { PaidSickRecord, PaidSickAdjustment } from '../types';
import { useAuth } from '../context/AuthContext';

const fmt = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const plural = (n: number) => `${n} day${Math.abs(n) === 1 ? '' : 's'}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
const STATUS_STYLE: Record<string, string> = { APPROVED: 'bg-green-100 text-green-800', PENDING: 'bg-yellow-100 text-yellow-800' };
const fail = (e: unknown, f: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : f);

/** One leave request's paid sick days, which HR can change (like changing a loan's amortization). */
function RequestRow({ r, canEdit, onChanged }: { r: PaidSickRecord; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(String(r.days));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try { await paidSickApi.setRequestDays(r.id, parseInt(days, 10)); setEditing(false); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  return (
    <li className="py-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-gray-700">Leave {fmt(r.startDate)}{r.endDate.split('T')[0] !== r.startDate.split('T')[0] ? ` \u2013 ${fmt(r.endDate)}` : ''}{r.leaveDays ? <span className="text-gray-400"> ({plural(r.leaveDays)} of leave)</span> : null}</span>
      <span className="flex items-center gap-2">
        {editing ? (
          <>
            <input type="number" min={0} max={r.leaveDays} className="form-input !py-0.5 !w-20" value={days} onChange={e => setDays(e.target.value)} aria-label="Paid sick days" />
            <button className="btn-primary !py-0.5 !px-2 text-xs" disabled={busy || days === ''} onClick={save}><Check size={12} /> Save</button>
            <button className="btn-secondary !py-0.5 !px-2 text-xs" disabled={busy} onClick={() => { setEditing(false); setDays(String(r.days)); setErr(''); }}><X size={12} /></button>
          </>
        ) : (
          <>
            <span className="font-semibold">{plural(r.days)}</span>
            {canEdit && <button className="text-brand-700 hover:underline inline-flex items-center gap-0.5" onClick={() => setEditing(true)}><Pencil size={11} /> Change</button>}
          </>
        )}
        <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
      </span>
      {err && <span className="w-full text-red-600">{err}</span>}
    </li>
  );
}

/**
 * HR: one employee's paid sick leave for a year. Leave requests count automatically; HR can change the days on a request,
 * record days taken outside the app, or give days back (like posting and removing deductions on a loan).
 */
export default function PaidSickManager({ employeeId, year, records, adjustments, onChanged }: {
  employeeId: string; year: number; records: PaidSickRecord[]; adjustments: PaidSickAdjustment[]; onChanged: () => void;
}) {
  const { can } = useAuth();
  const canEdit = can('leave', 'edit');
  const [takenOn, setTakenOn] = useState(() => (today().startsWith(String(year)) ? today() : `${year}-01-01`));
  const [kind, setKind] = useState<'TAKEN' | 'RETURNED'>('TAKEN');
  const [days, setDays] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const n = parseInt(days, 10);
    if (!(n > 0)) { setMsg({ ok: false, text: 'Enter the number of days.' }); return; }
    setBusy(true);
    try {
      const r = await paidSickApi.addAdjustment(employeeId, { takenOn, days: kind === 'TAKEN' ? n : -n, note: note.trim() || undefined });
      setNote(''); setDays('1');
      setMsg({ ok: !r.overLimit, text: r.overLimit ? `Saved. This employee is now over the ${year} limit.` : `Saved. ${plural(r.balance.remaining)} left for ${year}. The employee was told.` });
      onChanged();
    } catch (err) { setMsg({ ok: false, text: fail(err, 'Could not save') }); }
    finally { setBusy(false); }
  };
  const remove = async (a: PaidSickAdjustment) => {
    if (!window.confirm(`Remove the ${plural(a.days)} entry dated ${fmt(a.takenOn)}?`)) return;
    try { await paidSickApi.removeAdjustment(a.id); onChanged(); } catch (err) { setMsg({ ok: false, text: fail(err, 'Could not remove') }); }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <p className="font-semibold text-gray-800 mb-1">From leave requests <span className="font-normal text-gray-500">(counted automatically; pending requests hold their days)</span></p>
        {records.length === 0 ? <p className="text-gray-400">No paid sick leave requests in {year}.</p> : (
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {records.map(r => <RequestRow key={`${r.id}-${r.days}`} r={r} canEdit={canEdit} onChanged={onChanged} />)}
          </ul>
        )}
      </div>

      <div>
        <p className="font-semibold text-gray-800 mb-1">Recorded by HR</p>
        {adjustments.length === 0 ? <p className="text-gray-400">No entries.</p> : (
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {adjustments.map(a => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-700">{fmt(a.takenOn)}{a.note ? <span className="text-gray-500"> &middot; {a.note}</span> : null} <span className="text-gray-400">&middot; by {a.createdBy}</span></span>
                <span className="flex items-center gap-2">
                  <span className={`font-semibold ${a.days < 0 ? 'text-green-700' : 'text-gray-900'}`}>{a.days > 0 ? `${plural(a.days)} taken` : `${plural(-a.days)} given back`}</span>
                  {canEdit && <button className="text-gray-400 hover:text-red-600" onClick={() => remove(a)} aria-label="Remove entry"><Trash2 size={13} /></button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 bg-teal-50/60 border border-teal-100 rounded-lg p-3">
          <div><label className="block text-gray-500 mb-0.5">Date</label><input type="date" className="form-input !py-1 !w-40" min={`${year}-01-01`} max={`${year}-12-31`} value={takenOn} onChange={e => setTakenOn(e.target.value)} /></div>
          <div><label className="block text-gray-500 mb-0.5">Entry</label>
            <select className="form-select !py-1 !w-auto" value={kind} onChange={e => setKind(e.target.value as 'TAKEN' | 'RETURNED')}>
              <option value="TAKEN">Days taken</option>
              <option value="RETURNED">Give days back</option>
            </select></div>
          <div><label className="block text-gray-500 mb-0.5">Days</label><input type="number" min={1} max={5} className="form-input !py-1 !w-20" value={days} onChange={e => setDays(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><label className="block text-gray-500 mb-0.5">Note</label><input className="form-input !py-1" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="For example: sick call-in, payroll correction" /></div>
          <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy}><Plus size={13} /> {busy ? 'Saving...' : 'Record'}</button>
          {msg && <p className={`w-full ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</p>}
        </form>
      )}
    </div>
  );
}
