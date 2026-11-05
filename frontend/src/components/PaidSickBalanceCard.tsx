import React, { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { paidSickApi } from '../api/paidSick';
import type { PaidSickBalance } from '../types';

const fmt = (s: string) => {
  const [y, m, d] = s.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const STATUS_STYLE: Record<string, string> = { APPROVED: 'bg-green-100 text-green-800', PENDING: 'bg-yellow-100 text-yellow-800' };

/** An employee's paid sick leave balance for one calendar year (5 days a year, no carry-over). */
export default function PaidSickBalanceCard({ employeeId, year, compact }: { employeeId: string; year?: number; compact?: boolean }) {
  const [bal, setBal] = useState<PaidSickBalance | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    setError(false);
    paidSickApi.forEmployee(employeeId, year).then(setBal).catch(() => setError(true));
  }, [employeeId, year]);

  if (error) return null;
  if (!bal) return null;

  if (!bal.tracked) {
    return (
      <div className="card p-4 flex items-start gap-3 text-sm">
        <div className="p-2 rounded-lg bg-teal-50 text-teal-600"><HeartPulse size={18} /></div>
        <div>
          <p className="font-semibold text-gray-900">Paid Sick Leave</p>
          <p className="text-gray-600 text-xs mt-0.5">
            Each employee is entitled to {bal.entitlement} paid sick days a year. Tracking begins January 1, {bal.startYear}.
          </p>
        </div>
      </div>
    );
  }

  const used = bal.approved + bal.pending;
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-teal-50 text-teal-600"><HeartPulse size={18} /></div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Paid Sick Leave {bal.year}</p>
          <p className="text-[11px] text-gray-500">{bal.entitlement} days a year. Unused days do not carry over to the next year.</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${bal.remaining === 0 ? 'text-red-600' : 'text-teal-700'}`}>{bal.remaining}</p>
          <p className="text-[11px] text-gray-500">day{bal.remaining === 1 ? '' : 's'} left</p>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex" aria-hidden>
        <div className="bg-green-500" style={{ width: `${Math.min(100, (bal.approved / bal.entitlement) * 100)}%` }} />
        <div className="bg-yellow-400" style={{ width: `${Math.min(100 - Math.min(100, (bal.approved / bal.entitlement) * 100), (bal.pending / bal.entitlement) * 100)}%` }} />
      </div>
      <p className="text-xs text-gray-600">
        {bal.approved} approved · {bal.pending} pending · {used > bal.entitlement ? `${used - bal.entitlement} over the limit` : `${bal.remaining} remaining`}
      </p>
      {!compact && bal.records.length > 0 && (
        <ul className="divide-y divide-gray-100 text-xs border-t border-gray-100">
          {bal.records.map(r => (
            <li key={r.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-gray-700">{fmt(r.startDate)}{r.endDate.split('T')[0] !== r.startDate.split('T')[0] ? ` – ${fmt(r.endDate)}` : ''}</span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{r.days} day{r.days === 1 ? '' : 's'}</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
