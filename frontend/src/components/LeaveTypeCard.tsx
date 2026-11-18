import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ChevronDown, X, Printer } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { LEAVE_TYPES } from './IntegratedLeaveForm';
import LeaveFormView from './LeaveFormView';
import { localDate as dayOf, leaveDays } from '../utils/dates';

const strip = (s: string) => s.replace(/ \(.*\)$/, '').trim();
const KNOWN = LEAVE_TYPES.map(t => ({ id: t.id, label: t.label, short: strip(t.label) }));

function localDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const fmt = (s: string) => dayOf(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Leave types are stored in the request purpose as a leading "[Type A, Type B]".
function typesOf(r: LeaveRequest): string[] {
  const m = /^\[([^\]]*)\]/.exec(r.purpose || '');
  if (!m) return ['Unspecified'];
  const raw = m[1];
  const out: string[] = [];
  let rest = raw;
  for (const k of KNOWN) {
    if (rest.includes(k.short)) { out.push(k.id); rest = rest.replace(k.short, ''); }
  }
  if (/\bOther\b/.test(rest)) out.push('OTHER_TEXT');
  return out.length ? out : ['Unspecified'];
}

const STATUS_STYLE: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  DENIED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

export default function LeaveTypeCard({ requests }: { requests: LeaveRequest[] }) {
  const today = localDate(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null); // the leave type whose employees are shown
  const [printing, setPrinting] = useState<LeaveRequest | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const { rows, total } = useMemo(() => {
    const inRange = requests.filter(r => {
      const d = localDate(r.submittedAt);
      return d >= from && d <= to;
    });
    const lists: Record<string, LeaveRequest[]> = {};
    inRange.forEach(r => typesOf(r).forEach(t => { (lists[t] = lists[t] || []).push(r); }));
    const count = (id: string) => (lists[id] || []).length;
    const rows = [
      ...KNOWN.map(k => ({ id: k.id, label: k.label, count: count(k.id), list: lists[k.id] || [] })),
      { id: 'OTHER_TEXT', label: 'Other (reason specified)', count: count('OTHER_TEXT'), list: lists['OTHER_TEXT'] || [] },
      ...(count('Unspecified') ? [{ id: 'Unspecified', label: 'Unspecified type', count: count('Unspecified'), list: lists['Unspecified'] }] : []),
    ];
    return { rows, total: inRange.length };
  }, [requests, from, to]);

  const picked = sel ? rows.find(r => r.id === sel) : undefined;
  useEffect(() => { if (picked) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className='card overflow-hidden'>
      <div className='px-5 py-4 bg-sky-600 flex flex-wrap items-center gap-3'>
        <button type='button' onClick={() => setOpen(o => !o)} aria-expanded={open} className='flex items-center gap-2 text-left'>
          <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
          <FileText size={16} className='text-white' />
          <h2 className='font-semibold text-white text-lg'>Leave Requests Filed by Type</h2>
          <span className='text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium'>{total} filed</span>
        </button>
        {open && <div className='ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-600'>
          <input type='date' className='form-input !py-1 !w-auto' value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
          <span>to</span>
          <input type='date' className='form-input !py-1 !w-auto' value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} />
          <button className='btn-secondary !py-1 !px-2 text-xs' onClick={() => { setFrom(today); setTo(today); }}>Today</button>
        </div>}
      </div>
      {open && <>
      <div className='divide-y divide-gray-50'>
        {rows.map(r => (
          <div key={r.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${sel === r.id ? 'bg-sky-50' : ''}`}>
            <p className={`text-sm ${r.count ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{r.label}</p>
            {r.count ? (
              <button type='button' onClick={() => setSel(s => (s === r.id ? null : r.id))} title='Show who applied'
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold shrink-0 bg-brand-100 text-brand-700 underline decoration-dotted underline-offset-4 hover:bg-brand-200 transition ${sel === r.id ? 'ring-2 ring-sky-500' : ''}`}>{r.count}</button>
            ) : (
              <span className='text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 bg-gray-100 text-gray-400'>0</span>
            )}
          </div>
        ))}
      </div>

      {picked && (
        <div ref={detailRef} className='border-t-2 border-sky-300'>
          <div className='px-5 py-2.5 bg-sky-600 text-white flex flex-wrap items-center gap-3'>
            <h3 className='font-bold text-sm'>{picked.label}</h3>
            <span className='text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full'>{picked.list.length} employee{picked.list.length === 1 ? '' : 's'}</span>
            <button onClick={() => setSel(null)} aria-label='Close' className='ml-auto p-1 rounded hover:bg-white/20'><X size={16} /></button>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm min-w-[640px]'>
              <thead className='bg-gray-50 text-xs text-gray-500'>
                <tr>
                  <th className='text-left px-5 py-2'>Employee</th>
                  <th className='text-left px-3 py-2'>Department</th>
                  <th className='text-left px-3 py-2'>Leave dates</th>
                  <th className='text-left px-3 py-2'>Days</th>
                  <th className='text-left px-3 py-2'>Filed on</th>
                  <th className='text-left px-3 py-2'>Status</th>
                  <th className='px-3 py-2'><span className='sr-only'>Print</span></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-50'>
                {[...picked.list].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map(r => (
                  <tr key={r.id}>
                    <td className='px-5 py-2 font-medium text-gray-900'>{r.employeeName}</td>
                    <td className='px-3 py-2 text-gray-600'>{DEPARTMENT_LABELS[r.department] || r.department}</td>
                    <td className='px-3 py-2 whitespace-nowrap text-gray-700'>{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                    <td className='px-3 py-2 text-gray-700'>{leaveDays(r.startDate, r.endDate)}</td>
                    <td className='px-3 py-2 whitespace-nowrap text-gray-600'>{fmt(localDate(r.submittedAt))}</td>
                    <td className='px-3 py-2'><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-700'}`}>{r.status}</span></td>
                    <td className='px-3 py-2 text-right'><button type='button' onClick={() => setPrinting(r)} title='Print leave form' className='inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline'><Printer size={13} /> Print</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {printing && <LeaveFormView request={printing} onClose={() => setPrinting(null)} />}

      <p className='px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100'>
        Counted by the date the request was filed. A request with several leave types counts once under each type. Click a number to see who applied.
      </p>
      </>}
    </div>
  );
}
