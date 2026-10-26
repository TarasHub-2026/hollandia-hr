import React, { useMemo, useState, useRef } from 'react';
import { AlertTriangle, CalendarClock, Building2, Calendar, Clock, ShieldAlert, CheckCircle2, Filter, Flag, ChevronDown, ChevronUp } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';

// ---- Policy constants (mirror backend/src/data/policy.ts and leaveSchedule.ts) ----
const MAX_DAYS = 75;
const DOC_MONTHS = 4;
const DEPT_CAPS: Record<string, number> = { GREENHOUSE: 5, WAREHOUSE: 4, OFFICE: 2, PACKING_WATER_BUCKET: 1, SHIPPING: 1, MAINTENANCE: 2 };

interface Block { name: string; season: string; label: string; sm: number; sd: number; em: number; ed: number; cap: number; capNote: string; }
const BLOCKS: Block[] = [
  { name: 'Block 1', season: 'Winter', label: 'November 15 (Current Yr) – January 25 (Next Yr)', sm: 11, sd: 15, em: 1, ed: 25, cap: 10, capNote: 'Winter' },
  { name: 'Block 2', season: 'Spring', label: 'February 15 – April 19', sm: 2, sd: 15, em: 4, ed: 19, cap: 2, capNote: 'Spring' },
  { name: 'Block 3', season: 'Late Spring / Early Summer', label: 'May 11 – July 12', sm: 5, sd: 11, em: 7, ed: 12, cap: 6, capNote: 'Late Spring / Early Summer' },
  { name: 'Block 4', season: 'Summer', label: 'July 13 – September 13', sm: 7, sd: 13, em: 9, ed: 13, cap: 6, capNote: 'Summer' },
  { name: 'Block 5', season: 'Autumn / Early Winter', label: 'September 14 – November 16', sm: 9, sd: 14, em: 11, ed: 16, cap: 5, capNote: 'Autumn / Early Winter' },
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
const short = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
const DAY = 86400000;

function blockWindow(b: Block, by: number) {
  const start = new Date(by, b.sm - 1, b.sd);
  const end = new Date(b.em < b.sm ? by + 1 : by, b.em - 1, b.ed);
  return { start, end };
}
// Which block (and block year) a leave start date belongs to; null when outside all blocks (blackouts).
function assign(start: Date): { idx: number; year: number } | null {
  for (let i = 0; i < BLOCKS.length; i++) {
    for (const by of [start.getFullYear(), start.getFullYear() - 1]) {
      const w = blockWindow(BLOCKS[i], by);
      if (start >= w.start && start <= w.end) return { idx: i, year: by };
    }
  }
  return null;
}

interface Item {
  r: LeaveRequest; start: Date; end: Date; days: number;
  block: { idx: number; year: number } | null; year: number;
  overCap: boolean; docIssue: string | null;
}

function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

function build(r: LeaveRequest): Item {
  const start = parse(r.startDate), end = parse(r.endDate);
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const block = assign(start);
  const deadline = addMonths(end, DOC_MONTHS);
  let docIssue: string | null = null;
  for (const [label, v] of [['Passport', r.passportExpiry], ['Work permit', r.workPermitExpiry], ['Contract', r.contractExpiry]] as const) {
    if (v && parse(v) < deadline) { docIssue = `${label} expires ${short(parse(v))} (<4 months after return)`; break; }
  }
  return { r, start, end, days, block, year: block ? block.year : start.getFullYear(), overCap: days > MAX_DAYS, docIssue };
}

// Highest number of simultaneous leaves at any point.
function peak(items: Item[]): number {
  let max = 0;
  for (const a of items) {
    const n = items.filter(b => b.start <= a.start && b.end >= a.start).length;
    if (n > max) max = n;
  }
  return max;
}

const monthSpan = (s: Date, e: Date) => s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear() ? MON[s.getMonth()] : `${MON[s.getMonth()]} – ${MON[e.getMonth()]}`;

function Ring({ used, cap }: { used: number; cap: number }) {
  const over = used > cap, full = used === cap && cap > 0;
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${over ? 'bg-red-100 text-red-700 border-red-200' : full ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
      {used} / {cap} Cap
    </span>
  );
}

export default function BlockCapacity({ requests, onRefresh, updatedAt }: { requests: LeaveRequest[]; onRefresh?: () => void; updatedAt?: Date }) {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const all = useMemo(() => requests.filter(r => r.status !== 'DENIED').map(build), [requests]);
  const years = useMemo(() => Array.from(new Set(all.map(i => i.year))).sort(), [all]);

  const [year, setYear] = useState<'ALL' | number>(() => (years.includes(new Date().getFullYear()) ? new Date().getFullYear() : 'ALL'));
  const [status, setStatus] = useState<'ALL' | 'APPROVED' | 'PENDING'>('ALL');
  const currentBlock = assign(today)?.idx ?? 2;
  const [sel, setSel] = useState<number>(currentBlock);
  const [blockOnly, setBlockOnly] = useState(true);
  const [warnOnly, setWarnOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  const scoped = useMemo(() => all.filter(i =>
    (year === 'ALL' || i.year === year) && (status === 'ALL' || i.r.status === status)), [all, year, status]);
  const bad = (i: Item) => i.overCap || !!i.docIssue;

  const overCount = scoped.filter(i => i.overCap).length;
  const docCount = scoped.filter(i => i.docIssue).length;
  const warnCount = scoped.filter(bad).length;
  const awayNow = all.filter(i => i.r.status === 'APPROVED' && i.start <= today && i.end >= today).length;

  const byBlock = BLOCKS.map((b, idx) => {
    const items = scoped.filter(i => i.block?.idx === idx);
    return { b, idx, items, used: peak(items), away: items.filter(i => i.r.status === 'APPROVED' && i.start <= today && i.end >= today).length, flags: items.filter(bad).length };
  });

  const cur = byBlock[sel];
  const tableItems = scoped
    .filter(i => (!blockOnly || i.block?.idx === sel) && (!warnOnly || bad(i)))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const flagged = cur.items.filter(bad);
  const yearLabel = year === 'ALL' ? 'All years' : String(year);

  const deptRows = Object.keys(DEPT_CAPS).map(d => ({ d, used: peak(cur.items.filter(i => i.r.department === d)), cap: DEPT_CAPS[d] }));
  const seasonOk = cur.used <= cur.b.cap;

  const pill = (active: boolean) => `px-2.5 py-1 rounded text-xs font-medium ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className='space-y-6 mt-8'>
      {/* 1. Compliance banner */}
      <div className='rounded-xl border border-amber-200 bg-amber-50/60 p-4 md:p-5'>
        <div className='flex flex-wrap items-start gap-4'>
          <div className='p-2.5 rounded-xl bg-amber-500 text-white'><AlertTriangle size={22} /></div>
          <div className='flex-1 min-w-[16rem]'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='font-bold text-gray-900 text-lg md:text-xl'>Hollandia Leave Criteria Compliance &amp; Real-Time Capacity</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${warnCount ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>{warnCount} Policy Warning{warnCount !== 1 ? 's' : ''}</span>
              <span className='text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700'>Year: {yearLabel}</span>
            </div>
            <p className='text-xs text-gray-600 mt-1'>Monitoring maximum 75-day duration, 4-month post-return document validity, departmental limits (Greenhouse: 5, Warehouse: 4, Office: 1–2) and company-wide seasonal allowances.</p>
            <div className='flex flex-wrap items-center gap-2 mt-2 text-[11px]'>
              <span className='px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700'>{overCount} request{overCount !== 1 ? 's' : ''} exceed 75 days cap</span>
              <span className='px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700'>{docCount} permit{docCount !== 1 ? 's' : ''} violate 4-month rule</span>
              <span className='text-gray-500'>Active on leave: <b className='text-gray-800'>{awayNow}</b> approved company-wide</span>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button className='btn-secondary !text-red-700 !border-red-200' onClick={() => { setWarnOnly(true); setBlockOnly(false); }}><ShieldAlert size={14} /> Filter Policy Warnings</button>
            <button className='btn-primary' onClick={() => blocksRef.current?.scrollIntoView({ behavior: 'smooth' })}><Calendar size={14} /> Review Block Capacity</button>
          </div>
        </div>
      </div>

      {/* 2. Criteria and blocks */}
      <div ref={blocksRef} className='card p-4 md:p-5 border-t-4 border-t-emerald-500'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h2 className='font-bold text-gray-900 flex items-center gap-2 text-xl'><CalendarClock size={18} className='text-blue-600' /> Criteria for Leave Available Blocks &amp; Operational Rules</h2>
            <p className='text-xs text-gray-500'>Live tracking of rotational capacity, departmental caps and mandatory travel rules. Denied requests are excluded.</p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1 text-xs'>
              <Calendar size={12} className='text-gray-400 mx-1' /><span className='text-gray-500 mr-1'>Year:</span>
              <button className={pill(year === 'ALL')} onClick={() => setYear('ALL')}>All</button>
              {years.map(y => <button key={y} className={pill(year === y)} onClick={() => setYear(y)}>{y}</button>)}
            </div>
            <div className='flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1 text-xs'>
              <Filter size={12} className='text-gray-400 mx-1' /><span className='text-gray-500 mr-1'>Status:</span>
              {(['ALL', 'APPROVED', 'PENDING'] as const).map(s => <button key={s} className={pill(status === s)} onClick={() => setStatus(s)}>{s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}</button>)}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4'>
          <div className='rounded-lg border border-gray-200 bg-blue-50 !border-blue-200 p-3 text-xs text-gray-600'><p className='font-bold text-blue-900 text-sm flex items-center gap-1.5 mb-1'><Clock size={14} className='text-blue-600' /> 1. 75-Day Max Duration</p>Travel to home country cannot exceed <b>75 days</b>. Any overlap with mandatory blackout periods will reduce allowed duration.</div>
          <div className='rounded-lg border border-gray-200 bg-purple-50 !border-purple-200 p-3 text-xs text-gray-600'><p className='font-bold text-purple-900 text-sm flex items-center gap-1.5 mb-1'><ShieldAlert size={14} className='text-purple-600' /> 2. 4-Month Document Rule</p>Passports and work permits must be valid for at least <b>4 months beyond return date</b> (6 months recommended for airlines).</div>
          <div className='rounded-lg border border-gray-200 bg-green-50 !border-green-200 p-3 text-xs text-gray-600'><p className='font-bold text-green-900 text-sm flex items-center gap-1.5 mb-1'><Building2 size={14} className='text-green-600' /> 3. Departmental Coverage Limits</p>Greenhouse: <b>Max 5</b> away<br />Warehouse: <b>Max 4</b> away<br />Office: <b>Max 1–2</b> · Water Bucket Station: <b>Max 1</b> · Shipping: <b>Max 1</b> · Maintenance: <b>Max 2</b></div>
          <div className='rounded-lg border border-gray-200 bg-orange-50 !border-orange-200 p-3 text-xs text-gray-600'><p className='font-bold text-orange-900 text-sm flex items-center gap-1.5 mb-1'><Calendar size={14} className='text-orange-500' /> 4. Seasonal Allowances</p>Winter (Block 1): <b>10 max</b> · Autumn (Block 5): <b>5 max</b><br />Spring: <b>2 max</b> · Summer: <b>5–6 max</b> · Peak: <b>1</b></div>
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4'>
          {byBlock.map(x => {
            const pct = Math.min(100, (x.used / x.b.cap) * 100); const over = x.used > x.b.cap; const full = x.used === x.b.cap;
            const bar = over ? 'bg-red-500' : full ? 'bg-amber-500' : 'bg-green-600';
            return (
              <button key={x.idx} onClick={() => { setSel(x.idx); setBlockOnly(true); }}
                className={`text-left rounded-xl border p-3 transition ${sel === x.idx ? 'border-blue-500 ring-2 ring-blue-200 bg-white' : over ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className='flex items-center justify-between'><span className='font-bold text-sm text-gray-900'>{x.b.name}</span><Ring used={x.used} cap={x.b.cap} /></div>
                <p className='text-xs font-medium text-blue-700 mt-2 leading-snug'>{x.b.label}</p>
                <p className='text-[11px] text-gray-500'>{x.b.season}</p>
                <div className='h-1.5 bg-gray-200 rounded-full mt-3'><div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
                <div className='flex justify-between mt-2 text-[11px]'>
                  <span className='text-gray-600'>Now on leave: <b>{x.away}</b></span>
                  {x.flags > 0 && <span className='text-red-600 font-medium flex items-center gap-0.5'><Flag size={10} /> {x.flags} flag{x.flags !== 1 ? 's' : ''}</span>}
                </div>
                <p className='text-[10px] text-gray-400 mt-1'>{x.items.length} request{x.items.length !== 1 ? 's' : ''} · peak {x.used} at once</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Detailed schedule */}
      <div className='card p-4 md:p-5 border-t-4 border-t-sky-500'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h2 className='font-bold text-gray-900 flex flex-wrap items-center gap-2 text-xl'>
              <span className='w-2.5 h-2.5 rounded-full bg-orange-400' /> {cur.b.name} Detailed Schedule
              <span className='text-xs font-normal border border-gray-200 rounded px-2 py-0.5'>{cur.b.label}</span>
              <span className='text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700'>Year: {yearLabel}</span>
            </h2>
            <p className='text-xs text-gray-500 mt-1'>{cur.items.length} leave request{cur.items.length !== 1 ? 's' : ''} in {yearLabel} {cur.items.length === 1 ? 'is' : 'are'} aligned within this block window ({cur.b.season}).</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button className='btn-secondary' onClick={() => { setBlockOnly(false); setWarnOnly(false); }}>Clear Filters</button>
            <button className={blockOnly ? 'btn-primary' : 'btn-secondary'} onClick={() => setBlockOnly(true)}>Filter Schedule Grid by {cur.b.name}</button>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4'>
          <div className={`rounded-lg border p-3 ${seasonOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className='flex items-center justify-between text-xs'>
              <span className={`font-bold flex items-center gap-1.5 ${seasonOk ? 'text-green-800' : 'text-red-800'}`}>{seasonOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} Seasonal Allowance: {cur.b.capNote}</span>
              <span className='font-mono font-bold text-gray-800'>{cur.used} / {cur.b.cap} Max</span>
            </div>
            <p className='text-[11px] text-gray-600 mt-1'>{seasonOk ? `WITHIN ALLOWANCE: peak of ${cur.used} of ${cur.b.cap} company-wide spots used.` : `OVER ALLOWANCE: peak of ${cur.used} at once exceeds the ${cur.b.cap} company-wide limit.`}</p>
          </div>
          <div className='rounded-lg border border-gray-200 bg-gray-50 p-3'>
            <p className='text-xs font-bold text-gray-800 mb-2'>Departmental Coverage in {cur.b.name} (peak at once):</p>
            <div className='flex flex-wrap gap-2'>
              {deptRows.map(x => (
                <span key={x.d} className={`text-[11px] px-2 py-1 rounded border bg-white ${x.used > x.cap ? 'border-red-300 text-red-700 font-semibold' : 'border-gray-200 text-gray-700'}`}>
                  {DEPARTMENT_LABELS[x.d as keyof typeof DEPARTMENT_LABELS] || x.d}: {x.used}/{x.cap}
                </span>
              ))}
            </div>
          </div>
        </div>

        {flagged.length > 0 && (
          <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 mt-4 text-xs'>
            <p className='font-bold text-amber-900 flex items-center gap-1.5 mb-1'><AlertTriangle size={14} /> Criteria Non-Compliance Notifications in {cur.b.name} ({flagged.length} request{flagged.length !== 1 ? 's' : ''} flagged):</p>
            <ul className='list-disc pl-5 space-y-0.5 text-amber-900'>
              {flagged.map(i => (
                <li key={i.r.id}><b>{i.r.employeeName}</b> ({DEPARTMENT_LABELS[i.r.department]}): {[i.overCap && `Leave duration (${i.days} days) exceeds the Hollandia ${MAX_DAYS}-day maximum allowable limit.`, i.docIssue && `${i.docIssue}.`].filter(Boolean).join(' ')}</li>
              ))}
            </ul>
          </div>
        )}

        <div className='overflow-x-auto mt-4 -mx-4 md:-mx-5'>
          <table className='w-full text-sm min-w-[860px]'>
            <thead className='bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500'>
              <tr>{['#', 'Employee Name', 'Department', 'Status', 'Scheduled Dates', 'Days', 'Months', 'Criteria Status', 'Comments', 'Action'].map(h => <th key={h} className='text-left px-4 py-2.5 font-semibold whitespace-nowrap'>{h}</th>)}</tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {tableItems.length === 0 && <tr><td colSpan={10} className='px-4 py-8 text-center text-gray-400 text-sm'>No leave requests match the current filters.</td></tr>}
              {tableItems.map(i => (
                <React.Fragment key={i.r.id}>
                  <tr className={bad(i) ? 'bg-amber-50/40' : ''}>
                    <td className='px-4 py-2.5 text-gray-500 font-mono text-xs'>{i.r.queuePosition}</td>
                    <td className='px-4 py-2.5 font-medium text-gray-900'>{i.r.employeeName}</td>
                    <td className='px-4 py-2.5'><span className='text-[11px] px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-800'>{DEPARTMENT_LABELS[i.r.department]}</span></td>
                    <td className='px-4 py-2.5'><span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${i.r.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>{i.r.status === 'APPROVED' ? 'Approved' : 'Pending'}</span></td>
                    <td className='px-4 py-2.5 whitespace-nowrap text-gray-700'>{short(i.start)} → {short(i.end)}</td>
                    <td className='px-4 py-2.5 font-bold'>{i.days}d</td>
                    <td className='px-4 py-2.5 text-gray-600 whitespace-nowrap'>{monthSpan(i.start, i.end)}</td>
                    <td className='px-4 py-2.5'>
                      {bad(i) ? (
                        <div className='flex flex-col gap-1'>
                          {i.overCap && <span className='text-[11px] px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 whitespace-nowrap'>&gt;75d: {i.days} days</span>}
                          {i.docIssue && <span className='text-[11px] px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 whitespace-nowrap'>Doc &lt;4 months</span>}
                        </div>
                      ) : <span className='text-[11px] px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700'>✓ Compliant</span>}
                    </td>
                    <td className='px-4 py-2.5 text-xs text-gray-600 max-w-[14rem] truncate'>{i.r.decisionNote || '—'}</td>
                    <td className='px-4 py-2.5'>
                      <button className='text-blue-600 text-xs font-medium hover:underline inline-flex items-center gap-0.5' onClick={() => setOpen(open === i.r.id ? null : i.r.id)}>
                        Details {open === i.r.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </td>
                  </tr>
                  {open === i.r.id && (
                    <tr className='bg-gray-50'>
                      <td colSpan={10} className='px-6 py-3 text-xs text-gray-700 space-y-1'>
                        {i.r.purpose && <p><b>Details:</b> {i.r.purpose}</p>}
                        {i.r.denialReasons.length > 0 && <p className='text-red-700'><b>Policy flags:</b> {i.r.denialReasons.join(' · ')}</p>}
                        {i.r.warnings.length > 0 && <p className='text-amber-700'><b>Advisories:</b> {i.r.warnings.join(' · ')}</p>}
                        {i.docIssue && <p className='text-purple-700'><b>Document:</b> {i.docIssue}</p>}
                        {i.r.decisionNote && <p><b>HR note:</b> {i.r.decisionNote}</p>}
                        <p className='text-gray-400'>Submitted {new Date(i.r.submittedAt).toLocaleString('en-US')}</p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex items-center justify-between text-[11px] text-gray-400 mt-3'>
          <span>{tableItems.length} shown · counts update automatically{updatedAt ? ` (last updated ${updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})` : ''}</span>
          {onRefresh && <button className='text-blue-600 hover:underline' onClick={onRefresh}>Refresh now</button>}
        </div>
      </div>
    </div>
  );
}
