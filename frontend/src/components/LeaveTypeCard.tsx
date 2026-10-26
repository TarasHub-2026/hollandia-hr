import React, { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { LEAVE_TYPES } from './IntegratedLeaveForm';

const strip = (s: string) => s.replace(/ \(.*\)$/, '').trim();
const KNOWN = LEAVE_TYPES.map(t => ({ id: t.id, label: t.label, short: strip(t.label) }));

function localDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

export default function LeaveTypeCard({ requests }: { requests: LeaveRequest[] }) {
  const today = localDate(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { rows, total } = useMemo(() => {
    const inRange = requests.filter(r => {
      const d = localDate(r.submittedAt);
      return d >= from && d <= to;
    });
    const counts: Record<string, number> = {};
    inRange.forEach(r => typesOf(r).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const rows = [
      ...KNOWN.map(k => ({ id: k.id, label: k.label, count: counts[k.id] || 0 })),
      { id: 'OTHER_TEXT', label: 'Other (reason specified)', count: counts['OTHER_TEXT'] || 0 },
      ...(counts['Unspecified'] ? [{ id: 'Unspecified', label: 'Unspecified type', count: counts['Unspecified'] }] : []),
    ];
    return { rows, total: inRange.length };
  }, [requests, from, to]);

  return (
    <div className='card overflow-hidden'>
      <div className='px-5 py-4 border-b border-gray-100 bg-sky-600 flex flex-wrap items-center gap-3'>
        <FileText size={16} className='text-white' />
        <h2 className='font-semibold text-white text-sm'>Leave Requests Filed by Type</h2>
        <span className='text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium'>{total} filed</span>
        <div className='ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-600'>
          <input type='date' className='form-input !py-1 !w-auto' value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
          <span>to</span>
          <input type='date' className='form-input !py-1 !w-auto' value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} />
          <button className='btn-secondary !py-1 !px-2 text-xs' onClick={() => { setFrom(today); setTo(today); }}>Today</button>
        </div>
      </div>
      <div className='divide-y divide-gray-50'>
        {rows.map(r => (
          <div key={r.id} className='px-5 py-2.5 flex items-center justify-between gap-3'>
            <p className={`text-sm ${r.count ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{r.label}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${r.count ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>{r.count}</span>
          </div>
        ))}
      </div>
      <p className='px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100'>
        Counted by the date the request was filed. A request with several leave types counts once under each type.
      </p>
    </div>
  );
}
