import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { BLOCKS, SEASONS, MONTHS, parse, seasonOf, blockOf } from './LeaveSummary';

const seasonNames = [...SEASONS.map(s => s.name), 'Other'];
const blockNames = [...BLOCKS.map(b => b.name), 'Outside blocks'];

function SummaryTable({ title, theme, tint, names, leaving, returning }: { title: string; theme: string; tint: string; names: string[]; leaving: Record<string, number>; returning: Record<string, number> }) {
  return (
    <div className={`card overflow-x-auto ${theme}`}>
      <div className={`px-5 py-3 border-b border-gray-100 font-bold text-lg ${tint}`}>{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-5 py-2">&nbsp;</th><th className="px-3 py-2 text-right">Leaving</th><th className="px-5 py-2 text-right">Returning</th></tr></thead>
        <tbody className="divide-y divide-gray-50">
          {names.filter(n => leaving[n] || returning[n] || n !== 'Other' && n !== 'Outside blocks').map(n => (
            <tr key={n}><td className="px-5 py-2 text-gray-800">{n}</td><td className="px-3 py-2 text-right font-semibold text-orange-600">{leaving[n] || 0}</td><td className="px-5 py-2 text-right font-semibold text-green-700">{returning[n] || 0}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Who is leaving and returning, by season, scheduling block and month (denied requests are excluded). */
export default function SeasonBlockSummary({ requests }: { requests: LeaveRequest[] }) {
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [year, setYear] = useState<string>('ALL');
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => requests
    .filter(r => r.status !== 'DENIED' && (!onlyApproved || r.status === 'APPROVED'))
    .map(r => {
      const start = parse(r.startDate);
      const back = parse(r.endDate); back.setDate(back.getDate() + 1);
      return { start, back };
    }), [requests, onlyApproved]);

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.start.getFullYear()))).sort(), [rows]);
  const data = year === 'ALL' ? rows : rows.filter(r => String(r.start.getFullYear()) === year);

  const tally = (pick: (d: Date) => string, which: 'start' | 'back') => {
    const m: Record<string, number> = {};
    data.forEach(r => { const k = pick(r[which]); m[k] = (m[k] || 0) + 1; });
    return m;
  };
  const seasonLeaving = useMemo(() => tally(seasonOf, 'start'), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const seasonReturning = useMemo(() => tally(seasonOf, 'back'), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockLeaving = useMemo(() => tally(blockOf, 'start'), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockReturning = useMemo(() => tally(blockOf, 'back'), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthLeaving = useMemo(() => { const m: number[] = Array(12).fill(0); data.forEach(r => m[r.start.getMonth()]++); return m; }, [data]);
  const monthReturning = useMemo(() => { const m: number[] = Array(12).fill(0); data.forEach(r => m[r.back.getMonth()]++); return m; }, [data]);
  const maxMonth = Math.max(1, ...monthLeaving, ...monthReturning);

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-start gap-2 text-left">
          <ChevronDown size={18} className={`mt-1 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span>
            <span className="block text-2xl font-bold text-gray-900">Leaving and Returning</span>
            <span className="block text-xs text-gray-500">By season, scheduling block and month. Denied requests are excluded.</span>
          </span>
        </button>
        {open && <div className="flex items-center gap-3 text-sm">
          <select className="form-select py-1.5" value={year} onChange={e => setYear(e.target.value)}>
            <option value="ALL">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={onlyApproved} onChange={e => setOnlyApproved(e.target.checked)} /> Approved only</label>
        </div>}
      </div>

      {open && <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SummaryTable title="By Season" theme="" tint="bg-teal-600 text-white" names={seasonNames} leaving={seasonLeaving} returning={seasonReturning} />
        <SummaryTable title="By Scheduling Block" theme="" tint="bg-indigo-600 text-white" names={blockNames} leaving={blockLeaving} returning={blockReturning} />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-gray-100 bg-purple-600 font-bold text-lg text-white">By Month — leaving vs returning</div>
        <div className="p-5 grid grid-cols-12 gap-2 items-end h-48 min-w-[560px]">
          {MONTHS.map((m, i) => (
            <div key={m} className="flex flex-col items-center justify-end h-full">
              <div className="flex items-end gap-1 h-32">
                <div title={`${monthLeaving[i]} leaving`} className="w-3 bg-orange-400 rounded-t" style={{ height: `${(monthLeaving[i] / maxMonth) * 100}%` }} />
                <div title={`${monthReturning[i]} returning`} className="w-3 bg-green-500 rounded-t" style={{ height: `${(monthReturning[i] / maxMonth) * 100}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{m}</p>
              <p className="text-[11px]"><span className="text-orange-600 font-semibold">{monthLeaving[i]}</span>/<span className="text-green-700 font-semibold">{monthReturning[i]}</span></p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-3 text-[11px] text-gray-400"><span className="text-orange-500">■</span> Leaving &nbsp; <span className="text-green-600">■</span> Returning (first day back at work)</p>
      </div>
      </>}
    </div>
  );
}
