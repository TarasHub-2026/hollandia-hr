import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  Building2, Users, Network, MessageSquare, CalendarDays, ClipboardList, BarChart3, HeartPulse, Gauge, Plane,
  CalendarRange, UserX, HandCoins, Banknote, FileText, CalendarCheck, BookOpen, ShieldCheck, ScrollText,
  DatabaseBackup, ArrowLeft, UserCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AccessArea } from '../types';
import type { Tab } from './Layout';

/**
 * HR Administrator portal: the dashboard is a set of cards (Company Profile, Announcements & Messages, Leaves, Loans,
 * Vacation Pay, Forms, Policy Rules, Admin Access). Cards with several parts open a page of smaller cards.
 */

/** The area of access each admin screen belongs to, and the level needed to open it. Screens not listed are open to every administrator. */
export const TAB_AREA: Partial<Record<Tab, { area: AccessArea; level: 'view' | 'edit' }>> = {
  requests:         { area: 'leave',       level: 'view' },
  'leave-summary':  { area: 'leave',       level: 'view' },
  'paid-sick':      { area: 'leave',       level: 'view' },
  'block-capacity': { area: 'leave',       level: 'view' },
  'away-today':     { area: 'leave',       level: 'view' },
  'season-blocks':  { area: 'leave',       level: 'view' },
  'no-leave':       { area: 'leave',       level: 'view' },
  'leave-form':     { area: 'leave',       level: 'edit' },
  'new-request':    { area: 'leave',       level: 'edit' },
  messages:         { area: 'messages',    level: 'view' },
  loan:             { area: 'loans',       level: 'view' },
  'loan-form':      { area: 'loans',       level: 'edit' },
  'vacation-pay':   { area: 'vacationPay', level: 'view' },
  employees:        { area: 'employees',   level: 'view' },
  departments:      { area: 'employees',   level: 'view' },
  'admin-access':   { area: 'adminAccess', level: 'view' },
  'audit-log':      { area: 'audit',       level: 'view' },
  backups:          { area: 'backups',     level: 'view' },
};

/** Counts for the badges, worked out once in the Layout. */
export interface AdminCounts { pending: number; adminRequests: number; loans: number; vacationPay: number; unreadMessages: number }
const CountsContext = createContext<AdminCounts>({ pending: 0, adminRequests: 0, loans: 0, vacationPay: 0, unreadMessages: 0 });
export const AdminCountsProvider = CountsContext.Provider;
export const useAdminCounts = () => useContext(CountsContext);

type IconType = typeof Users;
interface Part { tab: Tab; title: string; desc: string; Icon: IconType; tone: string; badge?: (c: AdminCounts) => number }
interface Area extends Part { parts?: Part[]; status: (c: AdminCounts) => string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const AREAS: Area[] = [
  {
    tab: 'company', title: 'Company Profile', desc: 'The employee roster and the departments.', Icon: Building2, tone: 'bg-sky-100 text-sky-700',
    status: () => 'Employee roster and departments',
    parts: [
      { tab: 'employees', title: 'Employee Roster', desc: 'Employees, profiles, documents, age and tenure', Icon: Users, tone: 'bg-sky-100 text-sky-700' },
      { tab: 'departments', title: 'Department Overview', desc: 'Employees per department and who is away today', Icon: Network, tone: 'bg-blue-100 text-blue-700' },
    ],
  },
  {
    tab: 'messages', title: 'Announcements & Messages', desc: 'Announcements for employees and private messages.', Icon: MessageSquare, tone: 'bg-rose-100 text-rose-700',
    badge: c => c.unreadMessages,
    status: c => c.unreadMessages ? plural(c.unreadMessages, 'unread reply', 'unread replies') : 'Post announcements, message employees',
  },
  {
    tab: 'leaves', title: 'Leaves', desc: 'Leave requests, the leave summary, paid sick leave and block capacity.', Icon: CalendarDays, tone: 'bg-emerald-100 text-emerald-700',
    badge: c => c.pending,
    status: c => c.pending ? `${plural(c.pending, 'request')} waiting for review` : 'No requests waiting for review',
    parts: [
      { tab: 'requests', title: 'All Requests', desc: 'Review, approve or deny leave requests', Icon: ClipboardList, tone: 'bg-emerald-100 text-emerald-700', badge: c => c.pending },
      { tab: 'leave-summary', title: 'Leave Summary', desc: 'Who is leaving, when they return, types of leave', Icon: BarChart3, tone: 'bg-cyan-100 text-cyan-700' },
      { tab: 'paid-sick', title: 'Paid Sick Leave Tracker', desc: 'Paid sick days used and remaining (from 2027)', Icon: HeartPulse, tone: 'bg-teal-100 text-teal-700' },
      { tab: 'block-capacity', title: 'Block Capacity & Criteria', desc: 'Real-time capacity of each block and the rules', Icon: Gauge, tone: 'bg-blue-100 text-blue-700' },
      { tab: 'away-today', title: 'Currently Away Today', desc: 'Employees on approved leave today', Icon: Plane, tone: 'bg-orange-100 text-orange-700' },
      { tab: 'season-blocks', title: 'Season & Block Summary', desc: 'Leaving and returning by season, block and month', Icon: CalendarRange, tone: 'bg-violet-100 text-violet-700' },
      { tab: 'no-leave', title: 'Employees With No Leave', desc: 'Employees who have not taken leave this year', Icon: UserX, tone: 'bg-gray-200 text-gray-700' },
    ],
  },
  {
    tab: 'loan', title: 'Loans', desc: 'Loan applications, cheques, repayments and amortization.', Icon: HandCoins, tone: 'bg-amber-100 text-amber-700',
    badge: c => c.loans,
    status: c => c.loans ? `${plural(c.loans, 'application')} waiting for review` : 'No applications waiting',
  },
  {
    tab: 'vacation-pay', title: 'Vacation Pay', desc: 'Vacation pay requests.', Icon: Banknote, tone: 'bg-indigo-100 text-indigo-700',
    badge: c => c.vacationPay,
    status: c => c.vacationPay ? `${plural(c.vacationPay, 'request')} waiting for an answer` : 'No requests waiting',
  },
  {
    tab: 'forms', title: 'Forms', desc: 'Every form in one place.', Icon: FileText, tone: 'bg-teal-100 text-teal-700',
    status: () => 'Leave, eligibility check and loan forms',
    parts: [
      { tab: 'leave-form', title: 'Leave Form', desc: 'Apply for leave for an employee', Icon: FileText, tone: 'bg-emerald-100 text-emerald-700' },
      { tab: 'new-request', title: 'HR Eligibility Check', desc: 'Check a leave request against the policy', Icon: CalendarCheck, tone: 'bg-blue-100 text-blue-700' },
      { tab: 'loan-form', title: 'Loan Application Form', desc: 'Enter a loan application for an employee', Icon: HandCoins, tone: 'bg-amber-100 text-amber-700' },
    ],
  },
  {
    tab: 'policy', title: 'Policy Rules', desc: 'Leave, vacation and loan rules.', Icon: BookOpen, tone: 'bg-slate-200 text-slate-700',
    status: () => 'Leave, vacation and loan rules',
  },
  {
    tab: 'admin', title: 'Admin Access', desc: 'Administrator access, the audit log and data backups.', Icon: ShieldCheck, tone: 'bg-red-100 text-red-700',
    badge: c => c.adminRequests,
    status: c => c.adminRequests ? `${plural(c.adminRequests, 'access request')} waiting` : 'Access, audit log and backups',
    parts: [
      { tab: 'admin-access', title: 'Administrator Access', desc: 'Approve access requests and set permissions', Icon: UserCog, tone: 'bg-red-100 text-red-700', badge: c => c.adminRequests },
      { tab: 'audit-log', title: 'Audit Log', desc: 'Every change made in the app, and by whom', Icon: ScrollText, tone: 'bg-slate-200 text-slate-700' },
      { tab: 'backups', title: 'Data & Backups', desc: 'Download and restore backups of the data', Icon: DatabaseBackup, tone: 'bg-gray-200 text-gray-700' },
    ],
  },
];

/** The dashboard card (menu item) each screen belongs to. */
export const HUB_OF: Partial<Record<Tab, Tab>> = Object.fromEntries(
  AREAS.flatMap(a => (a.parts || []).map(p => [p.tab, a.tab])),
);

type Can = (area: AccessArea, level: 'view' | 'edit') => boolean;
/** Whether an administrator may open a screen; a card with parts is shown when at least one part is. */
export function tabAllowed(tab: Tab, can: Can): boolean {
  const area = AREAS.find(a => a.tab === tab);
  if (area?.parts) return area.parts.some(p => tabAllowed(p.tab, can));
  const need = TAB_AREA[tab];
  return !need || can(need.area, need.level);
}

const Badge = ({ n, title }: { n: number; title: string }) => n > 0
  ? <span className="absolute top-2.5 right-2.5 min-w-[1.4rem] h-[1.4rem] px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center" title={title}>{n}</span>
  : null;

/** HR dashboard: one card per area. */
export function AdminHome({ onGo }: { onGo: (t: Tab) => void }) {
  const { user, can } = useAuth();
  const counts = useAdminCounts();
  if (!user) return null;
  const areas = AREAS.filter(a => tabAllowed(a.tab, can));
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="card p-5 md:p-7 bg-gradient-to-r from-brand-800 to-brand-900 text-white shadow-lg">
        <div className="flex items-center gap-4">
          {user.photo && <img src={user.photo} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover border-2 border-white/40 shrink-0" />}
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-brand-200">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
            <p className="text-xs md:text-sm text-brand-200">Hollandia Greenhouses HR Administrator. Choose a card below; the orange numbers are items waiting for you.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {areas.map(a => (
          <button key={a.tab} type="button" onClick={() => onGo(a.tab)}
            className="card relative p-4 md:p-5 text-left transition-all hover:shadow-md hover:border-brand-300">
            <Badge n={a.badge?.(counts) || 0} title="Waiting for you" />
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${a.tone}`}><a.Icon size={22} /></div>
            <p className="font-bold text-gray-900">{a.title}</p>
            <p className="text-[11px] md:text-xs text-gray-500 mt-0.5">{a.status(counts)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A dashboard card with several parts: its smaller cards at the top, and the chosen part below. */
export function HubPage({ hub, active, onGo, header, children }: {
  hub: Tab; active: Tab | null; onGo: (t: Tab) => void; header?: React.ReactNode; children?: React.ReactNode;
}) {
  const { can } = useAuth();
  const counts = useAdminCounts();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [active]);
  const area = AREAS.find(a => a.tab === hub);
  if (!area) return null;
  const parts = (area.parts || []).filter(p => tabAllowed(p.tab, can));

  return (
    <div>
      <div className="p-4 md:p-8 !pb-0 space-y-4">
        <button type="button" onClick={() => onGo('dashboard')} className="text-xs text-gray-500 hover:text-brand-700 inline-flex items-center gap-1"><ArrowLeft size={13} /> Dashboard</button>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${area.tone}`}><area.Icon size={22} /></span>{area.title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{area.desc}</p>
        </div>
        {header}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {parts.map(p => {
            const on = active === p.tab;
            return (
              <button key={p.tab} type="button" onClick={() => onGo(on ? hub : p.tab)} aria-pressed={on}
                className={`card relative p-3 md:p-4 text-left flex items-start gap-3 transition-all hover:shadow-md ${on ? 'ring-2 ring-brand-500 bg-brand-50/40' : 'hover:border-brand-300'}`}>
                <Badge n={p.badge?.(counts) || 0} title="Waiting for you" />
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.tone}`}><p.Icon size={18} /></span>
                <span className="min-w-0 pr-5">
                  <span className="block font-semibold text-gray-900 text-sm">{p.title}</span>
                  <span className="block text-[11px] md:text-xs text-gray-500 mt-0.5">{p.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        {!active && <p className="text-sm text-gray-400 pb-6">Choose a card to open it.</p>}
      </div>
      {active && <div ref={ref} className="scroll-mt-2">{children}</div>}
    </div>
  );
}
