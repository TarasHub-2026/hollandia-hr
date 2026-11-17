import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, XCircle, PlusCircle, Calendar, Info } from 'lucide-react';
import { leaveRequestsApi, type BlockAvailability } from '../api/leaveRequests';
import { localDate } from '../utils/dates';

const fmt = (s: string) => localDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const STATE = {
  OPEN:    { badge: 'bg-green-100 text-green-800 border-green-200',  bar: 'bg-green-600', card: 'border-green-300 bg-green-50/40', label: 'Open' },
  LIMITED: { badge: 'bg-amber-100 text-amber-800 border-amber-200',  bar: 'bg-amber-500', card: 'border-amber-300 bg-amber-50/40', label: 'Almost full' },
  FULL:    { badge: 'bg-red-100 text-red-700 border-red-200',        bar: 'bg-red-500',   card: 'border-gray-200 bg-white',        label: 'Full' },
  ENDED:   { badge: 'bg-gray-100 text-gray-500 border-gray-200',     bar: 'bg-gray-300',  card: 'border-gray-200 bg-gray-50',      label: 'Ended' },
} as const;

/** Shows the employee which scheduling blocks still have room for a new leave request. Anonymous: counts only, no names. */
export default function BlockAvailabilityCard({ onApplyLeave }: { onApplyLeave: () => void }) {
  const [blocks, setBlocks] = useState<BlockAvailability[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | undefined>(undefined); // undefined = next open window of each block
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    leaveRequestsApi.blockAvailability(year)
      .then(r => { setBlocks(r.blocks); setYears(r.years); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  if (!blocks) return null; // the rest of the portal still works without this card

  const open = blocks.filter(b => b.available);

  return (
    <div className="card p-5 md:p-6 space-y-4 border-t-4 border-t-emerald-500">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 text-xl flex items-center gap-2">
            <CalendarClock size={18} className="text-emerald-600" /> Blocks Available to Apply
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Annual Leave Entitlement</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Annual leave must start and finish inside one block. Spots are limited company-wide and by department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600">
            <Calendar size={12} className="text-gray-400" /> Year
            <select
              className="form-select !py-0.5 !text-xs"
              value={year ?? 'UPCOMING'}
              onChange={e => setYear(e.target.value === 'UPCOMING' ? undefined : Number(e.target.value))}
            >
              <option value="UPCOMING">Next open blocks</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${open.length ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
            {open.length ? `${open.length} block${open.length === 1 ? '' : 's'} open` : 'No blocks open'}
          </span>
        </div>
      </div>

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-sm text-amber-900">
          <Info size={18} className="shrink-0 mt-0.5 text-amber-600" />
          <p>
            <b>These blocks apply to Annual Leave Entitlement only.</b>{' '}
            For any other type of leave (sick, bereavement, emergency, etc.), use the <b>Apply for Leave</b> button instead.
          </p>
        </div>
        <button onClick={onApplyLeave} className="btn-secondary text-xs whitespace-nowrap !border-amber-400">
          <PlusCircle size={14} /> Apply for Leave (other leave types)
        </button>
      </div>

      {error && <p className="text-xs text-red-600">Could not load that year: {error}</p>}

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {blocks.map(b => {
          const s = STATE[b.state];
          const ended = b.state === 'ENDED';
          const pct = ended ? 0 : Math.min(100, (b.used / b.cap) * 100);
          return (
            <div key={b.name} className={`rounded-xl border p-3 flex flex-col ${s.card}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-gray-900">{b.name}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${s.badge}`}>{s.label}</span>
              </div>
              <p className="text-xs font-medium text-blue-700 mt-2 leading-snug">{fmt(b.startDate)} – {fmt(b.endDate)}</p>
              <p className="text-[11px] text-gray-500">{b.season}{b.inProgress ? ' · in progress' : ''}</p>
              <div className="h-1.5 bg-gray-200 rounded-full mt-3"><div className={`h-1.5 rounded-full ${s.bar}`} style={{ width: `${pct}%` }} /></div>
              {!ended && (
                <>
                  <p className="text-[11px] text-gray-600 mt-2">
                    <b>{b.spotsLeft}</b> of {b.cap} company spots open
                  </p>
                  <p className="text-[11px] text-gray-600">
                    <b>{b.deptSpotsLeft}</b> of {b.deptCap} in your department
                  </p>
                </>
              )}
              <div className="mt-3 pt-2 border-t border-black/5 flex-1 flex flex-col justify-end">
                {b.available ? (
                  <button onClick={onApplyLeave} className="btn-primary text-xs !py-1.5 w-full justify-center">
                    <PlusCircle size={13} /> Apply (Annual Leave)
                  </button>
                ) : (
                  <p className={`text-[11px] flex items-start gap-1 ${ended ? 'text-gray-500' : 'text-red-700'}`}><XCircle size={12} className="shrink-0 mt-0.5" /> {b.reason}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <CheckCircle2 size={11} /> Counts include approved and pending requests. A final decision is made when you submit.
      </p>
    </div>
  );
}
