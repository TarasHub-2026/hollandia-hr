import { localDate, leaveDays } from '../utils/dates';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Calendar, CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Ban, Printer,
  UserCog, CalendarDays, HandCoins, Banknote, X, ChevronDown, PartyPopper,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leaveRequestsApi } from '../api/leaveRequests';
import { vacationPayApi } from '../api/vacationPay';
import type { VacationPayRequest } from '../api/vacationPay';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { EmployeeDateChange, latestByLeave } from './DateChange';
import { AreaUpdates, useNoticeList, unreadByArea, areaOf, markAreaRead } from './EmployeeNotices';
import PaidSickBalanceCard from './PaidSickBalanceCard';
import AnnouncementBanner from './AnnouncementBanner';
import LoanProgressCard from './LoanProgressCard';
import { documentAlert } from './DocumentExpiryCard';
import LeaveFormView from './LeaveFormView';
import ProfilePage from './ProfilePage';
import LoanPage from './LoanPage';
import VacationPayPage from './VacationPayPage';
import type { DateChange } from '../types';

/** The four cards on My Dashboard. */
export type PortalSection = 'profile' | 'leave' | 'loan' | 'vacation';
export type FormKind = 'leave' | 'loan' | 'vacation';

interface Props {
  /** The card that is open (its details show under the cards), or null. */
  open: PortalSection | null;
  onOpen: (section: PortalSection | null) => void;
  /** Opens a form on the Forms page. */
  onOpenForm: (form: FormKind) => void;
}

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const VP_STATUS: Record<string, string> = { PENDING: 'Waiting for approval', APPROVED: 'Approved', DENIED: 'Denied', CANCELLED: 'Cancelled' };

/** Leave records with HR's decisions, date changes and printable forms (inside the My Leave card). */
function MyLeaveRecords() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'DENIED'>('ALL');
  const [changes, setChanges] = useState<DateChange[]>([]);
  const [printing, setPrinting] = useState<LeaveRequest | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    leaveRequestsApi.getDateChanges().then(setChanges).catch(() => {});
    setLoading(true);
    leaveRequestsApi.getByEmployee(user.id).then(setRequests).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [user]);
  useEffect(() => { load(); }, [load]);
  if (!user) return null;

  const approved = requests.filter(r => r.status === 'APPROVED');
  const pending = requests.filter(r => r.status === 'PENDING');
  const denied = requests.filter(r => r.status === 'DENIED' || r.status === 'CANCELLED');
  const shown = tab === 'ALL' ? requests : tab === 'APPROVED' ? approved : tab === 'PENDING' ? pending : denied;
  const chip = (id: typeof tab, label: string, n: number, cls: string) => (
    <button onClick={() => setTab(id)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${tab === id ? cls : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label} ({n})</button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900">My leave requests</h3>
        <button onClick={load} className="text-xs text-gray-500 hover:text-brand-700 flex items-center gap-1"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {chip('ALL', 'All', requests.length, 'bg-brand-600 text-white border-brand-600')}
        {chip('APPROVED', 'Approved', approved.length, 'bg-emerald-600 text-white border-emerald-600')}
        {chip('PENDING', 'Pending', pending.length, 'bg-yellow-500 text-white border-yellow-500')}
        {chip('DENIED', 'Denied / cancelled', denied.length, 'bg-red-600 text-white border-red-600')}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading && !requests.length ? (
        <p className="text-sm text-gray-400">Loading your leave requests...</p>
      ) : shown.length === 0 ? (
        <div className="card p-6 text-center text-sm text-gray-500">
          {tab === 'ALL' ? 'You have not applied for leave yet. To apply, open Forms in the menu and choose Leave Form.' : 'No requests in this group.'}
        </div>
      ) : shown.map(req => {
        const start = localDate(req.startDate), end = localDate(req.endDate);
        const isApproved = req.status === 'APPROVED', isPending = req.status === 'PENDING', isCancelled = req.status === 'CANCELLED';
        return (
          <div key={req.id} className="card p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${isApproved ? 'bg-emerald-100 text-emerald-700' : req.isFlagged ? 'bg-red-100 text-red-700' : isPending ? 'bg-yellow-100 text-yellow-700' : isCancelled ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-700'}`}>
                  {isApproved ? <CheckCircle2 size={18} /> : req.isFlagged ? <AlertTriangle size={18} /> : isPending ? <Clock size={18} /> : isCancelled ? <Ban size={18} /> : <XCircle size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} &mdash; {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isApproved ? 'bg-emerald-100 text-emerald-800' : isPending ? 'bg-yellow-100 text-yellow-800' : isCancelled ? 'bg-gray-200 text-gray-700' : 'bg-red-100 text-red-800'}`}>{req.status}</span>
                    {req.isFlagged && <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full border border-red-300">Red-Flagged</span>}
                    {isPending && <span className="text-xs bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 rounded-full border border-brand-200">Queue position #{req.queuePosition}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1"><strong>{leaveDays(req.startDate, req.endDate)} calendar days</strong> &bull; submitted {new Date(req.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
              <button onClick={() => setPrinting(req)} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1 shrink-0"><Printer size={13} /> Print form</button>
            </div>
            {req.adjustedEndDate && <p className="text-xs bg-amber-50 border border-amber-200 p-2 rounded-lg text-amber-900"><strong>Adjusted end date:</strong> {localDate(req.adjustedEndDate).toLocaleDateString()} (blackout window limit)</p>}
            {req.decisionNote && (
              <div className={`rounded-lg p-2.5 text-xs border ${isCancelled ? 'bg-gray-50 border-gray-200 text-gray-800' : req.status === 'DENIED' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
                <span className="font-semibold">Note from HR: </span>{req.decisionNote}
              </div>
            )}
            {req.purpose && <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-700"><span className="font-semibold text-gray-600">Details: </span>{req.purpose}</div>}
            <EmployeeDateChange req={req} change={latestByLeave(changes)[req.id]} onChanged={load} />
            {req.denialReasons && req.denialReasons.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1">
                <p className="font-semibold text-red-800">Policy reasons:</p>
                <ul className="list-disc list-inside space-y-0.5">{req.denialReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
            {req.warnings && req.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                <div>{req.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
              </div>
            )}
          </div>
        );
      })}
      {printing && <LeaveFormView request={printing} employeeNumber={user.employeeNumber} onClose={() => setPrinting(null)} />}
    </div>
  );
}

export default function EmployeePortal({ open, onOpen, onOpenForm }: Props) {
  const { user } = useAuth();
  const notices = useNoticeList();
  const badges = unreadByArea(notices);
  const [leaveSummary, setLeaveSummary] = useState<{ pending: number; approved: number; total: number } | null>(null);
  const [vacation, setVacation] = useState<VacationPayRequest | null | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  // Short status lines for the cards.
  useEffect(() => {
    if (!user) return;
    leaveRequestsApi.getByEmployee(user.id)
      .then(list => setLeaveSummary({ pending: list.filter(r => r.status === 'PENDING').length, approved: list.filter(r => r.status === 'APPROVED').length, total: list.length }))
      .catch(() => {});
    vacationPayApi.mine().then(list => setVacation(list[0] ?? null)).catch(() => setVacation(null));
  }, [user, open]);

  // A birthday or work anniversary greeting from today shows in the welcome card.
  const todayKey = new Date().toDateString();
  const greetings = notices.filter(n => areaOf(n.kind) === 'greeting' && new Date(n.createdAt).toDateString() === todayKey);
  useEffect(() => { if (greetings.some(g => !g.read)) markAreaRead('greeting', notices); }, [greetings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [open]);

  if (!user) return null;

  const tenureYears = ((Date.now() - new Date(user.hireDate).getTime()) / (365.25 * 86400000)).toFixed(1);
  const docTone = documentAlert(user);
  const loanPct = user.loanOriginal > 0 ? Math.round(((user.loanOriginal - user.loanRemaining) / user.loanOriginal) * 100) : 100;

  const cards: { id: PortalSection; title: string; Icon: typeof UserCog; tone: string; status: string; badge: number; alert?: 'red' | 'amber' | null }[] = [
    { id: 'profile', title: 'My Profile', Icon: UserCog, tone: 'bg-sky-100 text-sky-700', badge: 0, alert: docTone,
      status: docTone === 'red' ? 'A document needs renewal' : docTone === 'amber' ? 'Check your document dates' : 'Your details, photo and PIN' },
    { id: 'leave', title: 'My Leave', Icon: CalendarDays, tone: 'bg-emerald-100 text-emerald-700', badge: badges.leave,
      status: !leaveSummary ? '' : leaveSummary.total === 0 ? 'No leave requests yet' : `${leaveSummary.pending} pending \u00b7 ${leaveSummary.approved} approved` },
    { id: 'loan', title: 'My Loan', Icon: HandCoins, tone: 'bg-amber-100 text-amber-700', badge: badges.loan,
      status: user.loanRemaining > 0 ? `${money(user.loanRemaining)} left (${loanPct}% repaid)` : 'No active loan' },
    { id: 'vacation', title: 'My Vacation Pay', Icon: Banknote, tone: 'bg-indigo-100 text-indigo-700', badge: badges.vacation,
      status: vacation === undefined ? '' : vacation === null ? 'No requests yet' : `Latest request: ${VP_STATUS[vacation.status] || vacation.status}` },
  ];
  const current = cards.find(c => c.id === open) || null;

  return (
    <div className="p-4 md:p-10 max-w-5xl mx-auto space-y-6">
      <AnnouncementBanner />

      {/* Welcome */}
      <div className="card p-5 md:p-7 bg-gradient-to-r from-brand-800 to-brand-900 text-white shadow-lg">
        <div className="flex items-center gap-4">
          {user.photo && <img src={user.photo} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover border-2 border-white/40 shrink-0" />}
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-brand-100">{DEPARTMENT_LABELS[user.department]}</span>
              <span className="text-xs text-brand-200">Hired {new Date(user.hireDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} ({tenureYears} yrs)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
            <p className="text-xs md:text-sm text-brand-200">Open a card below to see your profile, leave, loan and vacation pay, and the latest updates from HR. To apply for something, use <strong className="text-white">Forms</strong> in the menu.</p>
          </div>
        </div>
        {greetings.map(g => (
          <div key={g.id} className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm flex items-start gap-2">
            <PartyPopper size={16} className="shrink-0 mt-0.5 text-yellow-300" />
            <p><strong>{g.title}</strong> {g.message}</p>
          </div>
        ))}
      </div>

      {/* The four cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map(c => {
          const active = open === c.id;
          return (
            <button key={c.id} type="button" onClick={() => onOpen(active ? null : c.id)} aria-expanded={active}
              className={`card relative p-4 md:p-5 text-left transition-all hover:shadow-md ${active ? 'ring-2 ring-brand-500 bg-brand-50/40' : 'hover:border-brand-300'}`}>
              {c.badge > 0 && <span className="absolute top-2.5 right-2.5 min-w-[1.4rem] h-[1.4rem] px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center" title="New updates from HR">{c.badge}</span>}
              {c.alert && !c.badge && <span className={`absolute top-2.5 right-2.5 w-[1.4rem] h-[1.4rem] rounded-full text-white text-xs font-bold flex items-center justify-center ${c.alert === 'red' ? 'bg-red-600' : 'bg-amber-500'}`} title="Document alert">!</span>}
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${c.tone}`}><c.Icon size={22} /></div>
              <p className="font-bold text-gray-900 flex items-center gap-1">{c.title} <ChevronDown size={14} className={`text-gray-400 transition-transform ${active ? 'rotate-180' : ''}`} /></p>
              <p className="text-[11px] md:text-xs text-gray-500 mt-0.5 min-h-[1rem]">{c.status}</p>
            </button>
          );
        })}
      </div>

      {/* The open card's details */}
      {current && (
        <div ref={panelRef} className="card p-4 md:p-6 space-y-5 scroll-mt-4 border-t-4 border-t-brand-600">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2"><span className={`w-9 h-9 rounded-lg flex items-center justify-center ${current.tone}`}><current.Icon size={18} /></span> {current.title}</h2>
            <button onClick={() => onOpen(null)} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>

          {open === 'profile' && <ProfilePage embedded />}

          {open === 'leave' && (
            <>
              <AreaUpdates area="leave" />
              <PaidSickBalanceCard employeeId={user.id} />
              <MyLeaveRecords />
            </>
          )}

          {open === 'loan' && (
            <>
              <AreaUpdates area="loan" />
              <div className={`rounded-lg border px-4 py-3 text-sm ${user.loanRemaining > 0 ? (loanPct >= 50 ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900') : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                {user.loanRemaining > 0
                  ? <>Loan record: <strong>{money(user.loanRemaining)}</strong> left of {money(user.loanOriginal)} ({loanPct}% repaid). {loanPct >= 50 ? 'This meets the 50% repayment rule for leave.' : 'At least 50% must be repaid before leave can be approved.'}</>
                  : 'You have no active company loan.'}
              </div>
              <LoanProgressCard embedded onOpenLoan={() => onOpenForm('loan')} />
              <LoanPage mode="records" embedded />
            </>
          )}

          {open === 'vacation' && (
            <>
              <AreaUpdates area="vacation" />
              <VacationPayPage mode="records" embedded />
            </>
          )}
        </div>
      )}
    </div>
  );
}
