import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { BLOCKS, SEASONS, MONTHS, parse, seasonOf, blockOf } from './LeaveSummary';

const seasonNames = [...SEASONS.map(s => s.name), 'Other'];
const blockNames = [...BLOCKS.map(b => b.name), 'Outside blocks'];

type Mode = 'leaving' | 'returning';
type Kind = 'season' | 'block' | 'month';
interface Sel { kind: Kind; key: string; mode: Mode }
interface Row { id: string; name: string; dept: string; start: Date; end: Date; back: Date; status: string }

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const same = (a: Sel | null, kind: Kind, key: string, mode: Mode) => !!a && a.kind === kind && a.key === key && a.mode === mode;

/** A clickable count. Zero counts are plain text. */
function Count({ n, active, mode, onClick }: { n: number; active: boolean; mode: Mode; onClick: () => void }) {
  const color = mode === 'leaving' ? 'text-orange-600 hover:bg-orange-50' : 'text-green-700 hover:bg-green-50';
  const on = mode === 'leaving' ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-green-100 ring-2 ring-green-400';
  if (!n) return <span className="text-gray-300 font-semibold px-2.5 py-1 inline-block">0</span>;
  return (
    <button type="button" onClick={onClick} title="Show employees"
      className={`font-semibold min-w-[2.25rem] px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition ${color} ${active ? on : ''}`}>{n}</button>
  );
}

function SummaryTable({ title, tint, kind, names, leaving, returning, sel, onPick }: {
  title: string; tint: string; kind: Kind; names: string[];
  leaving: Record<string, number>; returning: Record<string, number>;
  sel: Sel | null; onPick: (kind: Kind, key: string, mode: Mode) => void;
}) {
  return (
    <div className="card overflow-x-auto">
      <div className={`px-5 py-3 border-b border-gray-100 font-bold text-lg ${tint}`}>{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-5 py-2">&nbsp;</th><th className="px-3 py-2 text-right">Leaving</th><th className="px-5 py-2 text-right">Returning</th></tr></thead>
        <tbody className="divide-y divide-gray-50">
          {names.filter(n => leaving[n] || returning[n] || n !== 'Other' && n !== 'Outside blocks').map(n => (
            <tr key={n}>
              <td className="px-5 py-1.5 text-gray-800">{n}</td>
              <td className="px-3 py-1.5 text-right"><Count n={leaving[n] || 0} mode="leaving" active={same(sel, kind, n, 'leaving')} onClick={() => onPick(kind, n, 'leaving')} /></td>
              <td className="px-5 py-1.5 text-right"><Count n={returning[n] || 0} mode="returning" active={same(sel, kind, n, 'returning')} onClick={() => onPick(kind, n, 'returning')} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">Click a number to see which employees.</p>
    </div>
  );
}

function DetailPanel({ sel, rows, label, onClose }: { sel: Sel; rows: Row[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [sel.kind, sel.key, sel.mode]);
  const leaving = sel.mode === 'leaving';

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [['Employee', 'Department', 'Leave start', 'Back to work', 'Status'].map(esc).join(',')];
    rows.forEach(r => lines.push([r.name, DEPARTMENT_LABELS[r.dept as keyof typeof DEPARTMENT_LABELS] || r.dept, r.start.toISOString().split('T')[0], r.back.toISOString().split('T')[0], r.status].map(esc).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `${leaving ? 'leaving' : 'returning'}-${label.replace(/[^A-Za-z0-9]+/g, '-')}.csv`;
    a.click();
  };

  return (
    <div ref={ref} className={`card overflow-hidden border-2 ${leaving ? 'border-orange-300' : 'border-green-300'}`}>
      <div className={`px-5 py-3 flex flex-wrap items-center gap-3 text-white ${leaving ? 'bg-orange-600' : 'bg-green-700'}`}>
        <h3 className="font-bold text-lg">{label}: {leaving ? 'Leaving' : 'Returning'}</h3>
        <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">{rows.length} employee{rows.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary !py-1 !px-2 text-xs" onClick={exportCsv} disabled={!rows.length}><Download size={12} /> CSV</button>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-white/20"><X size={18} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-5 py-2">Employee</th>
              <th className="text-left px-3 py-2">Department</th>
              <th className={`text-left px-3 py-2 ${leaving ? 'text-orange-700' : ''}`}>Leave starts</th>
              <th className={`text-left px-3 py-2 ${leaving ? '' : 'text-green-700'}`}>Back to work</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="px-5 py-2 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 py-2 text-gray-600">{DEPARTMENT_LABELS[r.dept as keyof typeof DEPARTMENT_LABELS] || r.dept}</td>
                <td className={`px-3 py-2 whitespace-nowrap ${leaving ? 'font-semibold text-orange-700' : 'text-gray-600'}`}>{fmt(r.start)}</td>
                <td className={`px-3 py-2 whitespace-nowrap ${leaving ? 'text-gray-600' : 'font-semibold text-green-700'}`}>{fmt(r.back)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{r.status}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-400">No employees.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Who is leaving and returning, by season, scheduling block and month (denied and cancelled requests are excluded). Click any number to see who. */
export default function SeasonBlockSummary({ requests }: { requests: LeaveRequest[] }) {
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [year, setYear] = useState<string>('ALL');
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<Sel | null>(null);

  const rows: Row[] = useMemo(() => requests
    .filter(r => r.status !== 'DENIED' && r.status !== 'CANCELLED' && (!onlyApproved || r.status === 'APPROVED'))
    .map(r => {
      const start = parse(r.startDate);
      const end = parse(r.endDate);
      const back = new Date(end); back.setDate(back.getDate() + 1);
      return { id: r.id, name: r.employeeName, dept: r.department as string, start, end, back, status: r.status };
    }), [requests, onlyApproved]);

  const years = useMemo(() => Array.from(new Set(rows.flatMap(r => [r.start.getFullYear(), r.back.getFullYear()]))).sort(), [rows]);
  // The year applies to the date in each column: leaving uses the start year, returning uses the return year.
  const inYear = (r: Row, which: 'start' | 'back') => year === 'ALL' || String(r[which].getFullYear()) === year;
  const leavingData = useMemo(() => rows.filter(r => inYear(r, 'start')), [rows, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const returningData = useMemo(() => rows.filter(r => inYear(r, 'back')), [rows, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const tally = (pick: (d: Date) => string, which: 'start' | 'back') => {
    const m: Record<string, number> = {};
    (which === 'start' ? leavingData : returningData).forEach(r => { const k = pick(r[which]); m[k] = (m[k] || 0) + 1; });
    return m;
  };
  const seasonLeaving = useMemo(() => tally(seasonOf, 'start'), [leavingData, returningData]); // eslint-disable-line react-hooks/exhaustive-deps
  const seasonReturning = useMemo(() => tally(seasonOf, 'back'), [leavingData, returningData]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockLeaving = useMemo(() => tally(blockOf, 'start'), [leavingData, returningData]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockReturning = useMemo(() => tally(blockOf, 'back'), [leavingData, returningData]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthLeaving = useMemo(() => { const m: number[] = Array(12).fill(0); leavingData.forEach(r => m[r.start.getMonth()]++); return m; }, [leavingData]);
  const monthReturning = useMemo(() => { const m: number[] = Array(12).fill(0); returningData.forEach(r => m[r.back.getMonth()]++); return m; }, [returningData]);
  const maxMonth = Math.max(1, ...monthLeaving, ...monthReturning);

  const pick = (kind: Kind, key: string, mode: Mode) => setSel(s => (same(s, kind, key, mode) ? null : { kind, key, mode }));

  const detail = useMemo(() => {
    if (!sel) return null;
    const dateOf = (r: Row) => (sel.mode === 'leaving' ? r.start : r.back);
    const hit = (r: Row) => {
      const d = dateOf(r);
      return sel.kind === 'season' ? seasonOf(d) === sel.key : sel.kind === 'block' ? blockOf(d) === sel.key : d.getMonth() === Number(sel.key);
    };
    const list = (sel.mode === 'leaving' ? leavingData : returningData).filter(hit).sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime() || a.name.localeCompare(b.name));
    const label = sel.kind === 'month' ? `${MONTHS[Number(sel.key)]}${year === 'ALL' ? '' : ' ' + year}` : sel.key;
    return { list, label };
  }, [sel, leavingData, returningData, year]);

  const monthNum = (n: number, i: number, mode: Mode) => (
    <Count n={n} mode={mode} active={same(sel, 'month', String(i), mode)} onClick={() => pick('month', String(i), mode)} />
  );

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-start gap-2 text-left">
          <ChevronDown size={18} className={`mt-1 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span>
            <span className="block text-2xl font-bold text-gray-900">Leaving and Returning</span>
            <span className="block text-xs text-gray-500">By season, scheduling block and month. Click a number to see who. Denied and cancelled requests are excluded.</span>
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
        <SummaryTable title="By Season" tint="bg-teal-600 text-white" kind="season" names={seasonNames} leaving={seasonLeaving} returning={seasonReturning} sel={sel} onPick={pick} />
        <SummaryTable title="By Scheduling Block" tint="bg-indigo-600 text-white" kind="block" names={blockNames} leaving={blockLeaving} returning={blockReturning} sel={sel} onPick={pick} />
      </div>

      {sel && detail && sel.kind !== 'month' && <DetailPanel sel={sel} rows={detail.list} label={detail.label} onClose={() => setSel(null)} />}

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-gray-100 bg-purple-600 font-bold text-lg text-white">By Month — leaving vs returning</div>
        <div className="p-5 grid grid-cols-12 gap-2 items-end min-w-[560px]">
          {MONTHS.map((m, i) => (
            <div key={m} className="flex flex-col items-center justify-end">
              <div className="flex items-end gap-1 h-32">
                <button type="button" disabled={!monthLeaving[i]} onClick={() => pick('month', String(i), 'leaving')} title={`${monthLeaving[i]} leaving`}
                  className={`w-4 bg-orange-400 rounded-t hover:bg-orange-500 ${same(sel, 'month', String(i), 'leaving') ? 'ring-2 ring-orange-600' : ''}`} style={{ height: `${(monthLeaving[i] / maxMonth) * 100}%` }} />
                <button type="button" disabled={!monthReturning[i]} onClick={() => pick('month', String(i), 'returning')} title={`${monthReturning[i]} returning`}
                  className={`w-4 bg-green-500 rounded-t hover:bg-green-600 ${same(sel, 'month', String(i), 'returning') ? 'ring-2 ring-green-700' : ''}`} style={{ height: `${(monthReturning[i] / maxMonth) * 100}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{m}</p>
              <p className="text-[11px] flex items-center"><span className="scale-90">{monthNum(monthLeaving[i], i, 'leaving')}</span><span className="text-gray-300">/</span><span className="scale-90">{monthNum(monthReturning[i], i, 'returning')}</span></p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-3 text-[11px] text-gray-400"><span className="text-orange-500">■</span> Leaving &nbsp; <span className="text-green-600">■</span> Returning (first day back at work). Click a bar or number to see who.</p>
      </div>

      {sel && detail && sel.kind === 'month' && <DetailPanel sel={sel} rows={detail.list} label={detail.label} onClose={() => setSel(null)} />}
      </>}
    </div>
  );
}
