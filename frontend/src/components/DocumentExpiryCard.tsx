import React from 'react';
import { ShieldAlert, ShieldCheck, FileWarning, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const URGENT_DAYS = 90;     // renew now
const WARNING_DAYS = 180;   // the 6-month advisory used for home-country travel

const toLocal = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return new Date(y, m - 1, d); };
const daysLeft = (s: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((toLocal(s).getTime() - t.getTime()) / 86400000);
};
const fmt = (s: string) => toLocal(s).toLocaleDateString('en-CA', { dateStyle: 'long' });

type Level = 'expired' | 'urgent' | 'warning' | 'ok' | 'missing';
function levelOf(date?: string): { level: Level; days: number } {
  if (!date) return { level: 'missing', days: 0 };
  const days = daysLeft(date);
  return { level: days < 0 ? 'expired' : days <= URGENT_DAYS ? 'urgent' : days <= WARNING_DAYS ? 'warning' : 'ok', days };
}
const when = (days: number) => days < 0 ? `Expired ${-days} day${-days === 1 ? '' : 's'} ago` : days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`;

const STYLE: Record<Level, { box: string; chip: string; label: string }> = {
  expired: { box: 'bg-red-50 border-red-300', chip: 'bg-red-600 text-white', label: 'EXPIRED' },
  urgent:  { box: 'bg-red-50 border-red-200', chip: 'bg-red-100 text-red-800', label: 'RENEW NOW' },
  warning: { box: 'bg-amber-50 border-amber-200', chip: 'bg-amber-100 text-amber-800', label: 'EXPIRING SOON' },
  ok:      { box: 'bg-white border-gray-200', chip: 'bg-green-100 text-green-800', label: 'VALID' },
  missing: { box: 'bg-amber-50 border-amber-300 border-dashed', chip: 'bg-amber-200 text-amber-900', label: 'PLEASE ENTER' },
};

interface Props { onOpenProfile?: () => void }

/** Expiry alerts for the employee's work permit, visa, passport and Cowan health card. Temporary foreign workers only. */
export default function DocumentExpiryCard({ onOpenProfile }: Props) {
  const { user } = useAuth();
  if (!user || user.immigrationStatus !== 'TFW') return null;

  const docs = [
    { key: 'permit',   name: 'Work Permit',       date: user.workPermitExpiry },
    { key: 'visa',     name: 'Visa',              date: user.visaExpiry },
    { key: 'passport', name: 'Passport',          date: user.passportExpiry },
    { key: 'cowan',    name: 'Cowan Health Card', date: user.cowanCertExpiry },
  ].map(d => ({ ...d, ...levelOf(d.date) }));

  const expiring = docs.filter(d => d.level === 'expired' || d.level === 'urgent' || d.level === 'warning');
  const missing = docs.filter(d => d.level === 'missing');
  const urgent = docs.some(d => d.level === 'expired' || d.level === 'urgent');
  const tone = urgent ? 'red' : expiring.length || missing.length ? 'amber' : 'green';
  const head = tone === 'red' ? 'border-t-red-500' : tone === 'amber' ? 'border-t-amber-400' : 'border-t-green-500';

  const names = (list: typeof docs) => list.map(d => d.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const summary = [
    expiring.length ? `${names(expiring)} ${expiring.length === 1 ? 'is' : 'are'} expired or expiring soon.` : '',
    missing.length ? `Please enter the expiry date for your ${names(missing)}.` : '',
  ].filter(Boolean).join(' ') || 'Your documents are up to date.';

  return (
    <div className={`card p-4 md:p-5 space-y-3 border-t-4 ${head}`} role="region" aria-label="Document expiry alerts">
      <div className="flex items-start gap-2">
        <div className={`p-2 rounded-lg ${tone === 'green' ? 'bg-green-50 text-green-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
          {tone === 'green' ? <ShieldCheck size={18} /> : tone === 'amber' ? <FileWarning size={18} /> : <ShieldAlert size={18} />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900 text-sm md:text-base">Document Expiry Alerts</p>
          <p className="text-xs text-gray-600">{summary}</p>
        </div>
        {onOpenProfile && (missing.length > 0 || expiring.length > 0) && (
          <button className="btn-primary !py-1.5 text-xs shrink-0" onClick={onOpenProfile}>Update dates</button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {docs.map(d => {
          const s = STYLE[d.level];
          const needsAction = d.level === 'expired' || d.level === 'urgent' || d.level === 'warning' || d.level === 'missing';
          return (
            <div key={d.key} className={`rounded-lg border p-3 ${s.box}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${s.chip}`}>{s.label}</span>
              </div>
              {d.date ? (
                <>
                  <p className="text-xs text-gray-700 mt-1">{fmt(d.date)}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${d.level === 'expired' || d.level === 'urgent' ? 'text-red-700' : d.level === 'warning' ? 'text-amber-700' : 'text-gray-500'}`}>{when(d.days)}</p>
                </>
              ) : (
                <p className="text-xs text-gray-700 mt-1">No expiry date on file yet.</p>
              )}
              {needsAction && onOpenProfile && (
                <button className="text-xs text-brand-700 hover:underline mt-1.5 flex items-center gap-0.5" onClick={onOpenProfile}>
                  {d.level === 'missing' ? 'Enter the date' : 'Renewed? Update the date'} <ChevronRight size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500">
        Alerts start 6 months before expiry. For home-country leave, your passport and work permit must stay valid at least 4 months after you return. If you do not have a visa, leave it empty in My Profile.
      </p>
    </div>
  );
}
