import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { Employee } from '../types';

// Workforce age and tenure overview for HR, built from the dates of birth and hire dates on the roster.
// Only active employees with a date of birth are counted. Everything is calculated in the browser.

const BRACKETS = [
  { label: 'Under 25', min: 0, max: 24 },
  { label: '25\u201334', min: 25, max: 34 },
  { label: '35\u201344', min: 35, max: 44 },
  { label: '45\u201354', min: 45, max: 54 },
  { label: '55\u201364', min: 55, max: 64 },
  { label: '65+', min: 65, max: 200 },
];

// Generations by birth year (Pew Research cut-offs).
const GENERATIONS = [
  { label: 'Gen Z', from: 1997, to: 2012, color: '#ea4335' },
  { label: 'Millennials', from: 1981, to: 1996, color: '#fbbc04' },
  { label: 'Gen X', from: 1965, to: 1980, color: '#34a853' },
  { label: 'Baby Boomers', from: 1946, to: 1964, color: '#ff6d01' },
  { label: 'Silent Generation', from: 1900, to: 1945, color: '#9aa0a6' },
];

const BAR = '#355f8c';
const DAY = 86400000;
const toDate = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
const years = (from: Date, to: Date) => (to.getTime() - from.getTime()) / (365.25 * DAY);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0.0%');

/** "20 years 1 month 28 days" between two dates. */
function lengthOfService(from: Date, to: Date): string {
  let y = to.getFullYear() - from.getFullYear();
  let m = to.getMonth() - from.getMonth();
  let d = to.getDate() - from.getDate();
  if (d < 0) { m -= 1; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
  if (m < 0) { y -= 1; m += 12; }
  const part = (n: number, w: string) => (n > 0 ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
  return [part(y, 'year'), part(m, 'month'), part(d, 'day')].filter(Boolean).join(' ') || '0 days';
}

interface Person { name: string; age: number; tenure: number; hire: Date; born: Date }

function Kpi({ title, sub, value }: { title: string; sub: string; value: string }) {
  return (
    <div className="border border-gray-300 rounded-md bg-slate-50 px-3 py-3 text-center">
      <p className="text-xs font-bold text-gray-700">{title}</p>
      <p className="text-[10px] text-gray-500">{sub}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: BAR }}>{value}</p>
    </div>
  );
}

export default function WorkforceAnalysis({ employees }: { employees: Employee[] }) {
  const [open, setOpen] = useState(false);

  const { people, missing } = useMemo(() => {
    const today = new Date();
    const active = employees.filter(e => e.active !== false);
    const people: Person[] = active.filter(e => e.dateOfBirth && e.hireDate).map(e => {
      const born = toDate(e.dateOfBirth!), hire = toDate(e.hireDate);
      return { name: e.name, age: years(born, today), tenure: Math.max(0, years(hire, today)), hire, born };
    });
    return { people, missing: active.length - people.length };
  }, [employees]);

  const n = people.length;
  const stats = useMemo(() => {
    const today = new Date();
    const brackets = BRACKETS.map(b => {
      const g = people.filter(p => Math.floor(p.age) >= b.min && Math.floor(p.age) <= b.max);
      return { ...b, count: g.length, avgAge: avg(g.map(p => p.age)), avgTenure: avg(g.map(p => p.tenure)) };
    });
    const gens = GENERATIONS.map(g => ({ ...g, count: people.filter(p => p.born.getFullYear() >= g.from && p.born.getFullYear() <= g.to).length }))
      .filter(g => g.count > 0 || g.label !== 'Silent Generation');
    const watch = people.filter(p => Math.floor(p.age) >= 60).sort((a, b) => b.age - a.age)
      .map(p => ({ ...p, service: lengthOfService(p.hire, today), tier: Math.floor(p.age) >= 65 ? '65+ (Immediate)' : '60\u201364 (Near-Term)' }));
    return {
      brackets, gens, watch,
      avgAge: avg(people.map(p => p.age)),
      avgTenure: avg(people.map(p => p.tenure)),
      senior: people.filter(p => Math.floor(p.age) >= 55).length,
    };
  }, [people]);

  const maxCount = Math.max(1, ...stats.brackets.map(b => b.count));
  const maxTenure = Math.max(1, ...stats.brackets.map(b => b.avgTenure));
  // Doughnut: a conic gradient with one slice per generation.
  let acc = 0;
  const slices = stats.gens.filter(g => g.count > 0).map(g => { const from = acc; acc += (g.count / Math.max(1, n)) * 100; return `${g.color} ${from}% ${acc}%`; });

  const th = 'px-3 py-1.5 text-left text-xs font-bold text-white';
  const td = 'px-3 py-1 text-xs text-gray-800';

  return (
    <div className="card overflow-hidden mb-6">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full text-left px-5 py-3 bg-[#355f8c] flex flex-wrap items-center gap-3">
        <ChevronDown size={16} className={`text-white/80 transition-transform ${open ? '' : '-rotate-90'}`} />
        <BarChart3 size={16} className="text-white" />
        <span className="font-semibold text-white text-lg">Workforce Age &amp; Tenure Analysis</span>
        <span className="text-xs text-white/80 ml-auto">{n ? `${n} employees \u00b7 average age ${stats.avgAge.toFixed(1)} \u00b7 ${pct(stats.senior, n)} aged 55+` : 'No dates of birth yet'}</span>
      </button>

      {open && (
        <div className="p-4 md:p-5 space-y-5">
          <p className="text-xs italic text-gray-500">Active workforce demographics, generational mix and retirement risk overview. Counts active employees who have a date of birth.</p>
          {missing > 0 && (
            <p className="text-xs p-2 rounded bg-amber-50 border border-amber-200 text-amber-900">{missing} active employee{missing === 1 ? ' has' : 's have'} no date of birth yet and {missing === 1 ? 'is' : 'are'} not counted. Use <strong>Import birthdates</strong> to add them.</p>
          )}

          {n === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Add dates of birth with <strong>Import birthdates</strong> and this analysis will appear.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi title="Total Employees Analyzed" sub="With valid age data" value={String(n)} />
                <Kpi title="Average Age" sub="Years across workforce" value={stats.avgAge.toFixed(1)} />
                <Kpi title="Average Tenure (Years)" sub="Mean length of service" value={stats.avgTenure.toFixed(1)} />
                <Kpi title="% Aged 55+ (Retirement Risk)" sub="Approaching retirement" value={pct(stats.senior, n)} />
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-5">
                  <div className="border border-gray-300 rounded overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-[#355f8c]"><tr><th className={th}>Age Bracket</th><th className={th}>Headcount</th><th className={th}>% of Workforce</th><th className={th}>Average Age</th><th className={th}>Avg Tenure (Yrs)</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.brackets.map(b => (
                          <tr key={b.label}><td className={td}>{b.label}</td><td className={td}>{b.count}</td><td className={td}>{pct(b.count, n)}</td><td className={td}>{b.count ? b.avgAge.toFixed(1) : '\u2013'}</td><td className={td}>{b.count ? b.avgTenure.toFixed(1) : '\u2013'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="border border-gray-300 rounded overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-[#355f8c]"><tr><th className={th}>Watchlist (Aged 60+)</th><th className={th}>Age</th><th className={th}>Length of Service</th><th className={th}>Tenure (Yrs)</th><th className={th}>Retirement Tier</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.watch.length === 0 && <tr><td colSpan={5} className={`${td} text-center text-gray-400 py-3`}>No active employees aged 60 or over</td></tr>}
                        {stats.watch.map(p => (
                          <tr key={p.name + p.born.getTime()}><td className={td}>{p.name}</td><td className={td}>{Math.floor(p.age)}</td><td className={td}>{p.service}</td><td className={td}>{p.tenure.toFixed(1)}</td>
                            <td className={td}><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${Math.floor(p.age) >= 65 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{p.tier}</span></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="border border-gray-300 rounded overflow-hidden max-w-md">
                    <table className="w-full">
                      <thead className="bg-[#355f8c]"><tr><th className={th}>Generation</th><th className={th}>Headcount</th><th className={th}>% of Workforce</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.gens.map(g => <tr key={g.label}><td className={td}>{g.label}</td><td className={td}>{g.count}</td><td className={td}>{pct(g.count, n)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>

                  <div className="border border-gray-300 rounded p-3">
                    <p className="text-xs font-bold text-gray-800 mb-2">Headcount Distribution by Age Bracket</p>
                    <div className="flex items-end gap-3 h-40 border-b border-l border-gray-300 px-2">
                      {stats.brackets.map(b => (
                        <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className="text-[10px] text-gray-600 mb-0.5">{b.count}</span>
                          <div className="w-full rounded-t" style={{ height: `${(b.count / maxCount) * 85}%`, minHeight: b.count ? 2 : 0, background: BAR }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 px-2 mt-1">{stats.brackets.map(b => <span key={b.label} className="flex-1 text-center text-[10px] text-gray-600">{b.label}</span>)}</div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="border border-gray-300 rounded p-3">
                  <p className="text-xs font-bold text-gray-800 mb-2">Average Tenure (Years) by Age Bracket</p>
                  <div className="space-y-1.5">
                    {stats.brackets.map(b => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="w-16 text-[10px] text-gray-600 text-right shrink-0">{b.label}</span>
                        <div className="flex-1 h-4 bg-gray-50"><div className="h-full rounded-r" style={{ width: `${(b.avgTenure / maxTenure) * 100}%`, background: '#1f4a75' }} /></div>
                        <span className="w-8 text-[10px] text-gray-600">{b.count ? b.avgTenure.toFixed(1) : '\u2013'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-300 rounded p-3">
                  <p className="text-xs font-bold text-gray-800 mb-2">Workforce Share by Generation</p>
                  <div className="flex items-center justify-center gap-6">
                    <div className="relative w-36 h-36 rounded-full" style={{ background: `conic-gradient(${slices.join(', ')})` }} role="img" aria-label="Workforce share by generation">
                      <div className="absolute inset-[22%] rounded-full bg-white" />
                    </div>
                    <ul className="space-y-1">
                      {stats.gens.filter(g => g.count > 0).map(g => (
                        <li key={g.label} className="flex items-center gap-2 text-xs text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />{g.label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
