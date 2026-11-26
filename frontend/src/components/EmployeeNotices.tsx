import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCircle2, XCircle, Ban, CalendarDays, Megaphone, MessageSquare, Cake, Award, Banknote } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { EmployeeNotice } from '../types';

const POLL_MS = 15000;
const SHOW_MS = 20000;
// Loan decisions stay on screen until the employee closes them.
const isSticky = (kind: string) => kind === 'LOAN_APPROVED' || kind === 'LOAN_DENIED';

/** Which part of the employee's app an update from HR belongs to. */
export type NoticeArea = 'leave' | 'loan' | 'vacation' | 'messages' | 'greeting';
export const areaOf = (kind: string): NoticeArea =>
  kind.startsWith('LOAN_') ? 'loan'
  : kind.startsWith('VACATION_PAY') ? 'vacation'
  : kind === 'ANNOUNCEMENT' || kind === 'MESSAGE' ? 'messages'
  : kind === 'BIRTHDAY' || kind === 'ANNIVERSARY' ? 'greeting'
  : 'leave';   // leave decisions, date changes and HR changing the dates

export const kindStyle = (kind: string) =>
  kind === 'APPROVED' || kind === 'DATE_CHANGE_APPROVED' || kind === 'LOAN_APPROVED' ? { bar: 'border-l-green-500', icon: 'bg-green-100 text-green-700', Icon: CheckCircle2 }
  : kind === 'DENIED' || kind === 'DATE_CHANGE_DENIED' || kind === 'LOAN_DENIED' ? { bar: 'border-l-red-500', icon: 'bg-red-100 text-red-700', Icon: XCircle }
  : kind === 'CANCELLED' ? { bar: 'border-l-gray-400', icon: 'bg-gray-200 text-gray-600', Icon: Ban }
  : kind === 'ANNOUNCEMENT' ? { bar: 'border-l-orange-500', icon: 'bg-orange-100 text-orange-600', Icon: Megaphone }
  : kind === 'MESSAGE' ? { bar: 'border-l-blue-500', icon: 'bg-blue-100 text-blue-700', Icon: MessageSquare }
  : kind === 'BIRTHDAY' ? { bar: 'border-l-pink-500', icon: 'bg-pink-100 text-pink-600', Icon: Cake }
  : kind === 'VACATION_PAY_DENIED' ? { bar: 'border-l-red-500', icon: 'bg-red-100 text-red-700', Icon: XCircle }
  : kind === 'VACATION_PAY' || kind === 'VACATION_PAY_APPROVED' ? { bar: 'border-l-green-500', icon: 'bg-green-100 text-green-700', Icon: Banknote }
  : kind === 'ANNIVERSARY' ? { bar: 'border-l-amber-500', icon: 'bg-amber-100 text-amber-600', Icon: Award }
  : { bar: 'border-l-blue-500', icon: 'bg-blue-100 text-blue-700', Icon: CalendarDays };

const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The latest notices fetched by the polling hook, shared with the dashboard cards so the app asks the server only once.
let latestNotices: EmployeeNotice[] = [];
const UPDATED = 'hr-notices-updated';

/** Unread updates per area, for the dashboard card badges. */
export function unreadByArea(notices: EmployeeNotice[]): Record<NoticeArea, number> {
  const out: Record<NoticeArea, number> = { leave: 0, loan: 0, vacation: 0, messages: 0, greeting: 0 };
  notices.forEach(n => { if (!n.read) out[areaOf(n.kind)]++; });
  return out;
}

/** Marks the unread updates of one area as read (for example when the employee opens My Leave). */
export async function markAreaRead(area: NoticeArea, notices: EmployeeNotice[] = latestNotices): Promise<void> {
  const kinds = Array.from(new Set(notices.filter(n => !n.read && areaOf(n.kind) === area).map(n => n.kind)));
  if (!kinds.length) return;
  try { await leaveRequestsApi.markNoticesRead(kinds); } catch { return; }
  window.dispatchEvent(new Event('hr-notices-changed'));
}

/** Polls for updates from HR for the signed-in employee. Shows a pop-up for each new one. */
export function useEmployeeNotices(enabled: boolean) {
  const [notices, setNotices] = useState<EmployeeNotice[]>(latestNotices);
  const [toasts, setToasts] = useState<EmployeeNotice[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const dismiss = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await leaveRequestsApi.myNotices();
        if (stop) return;
        latestNotices = r.notices;
        setNotices(r.notices);
        window.dispatchEvent(new Event(UPDATED));
        const fresh = r.notices.filter(n => !n.read && !seen.current.has(n.id));
        fresh.forEach(n => seen.current.add(n.id));
        if (fresh.length) {
          setToasts(t => [...t, ...fresh].slice(-3));
          fresh.forEach(n => { if (!isSticky(n.kind)) setTimeout(() => dismiss(n.id), SHOW_MS); });
        }
      } catch { /* offline or signed out: try again next time */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('hr-notices-changed', tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('hr-notices-changed', tick); };
  }, [enabled, dismiss]);

  const byArea = unreadByArea(notices);
  // The My Dashboard menu badge counts the updates that belong on its cards (leave, loan and vacation pay).
  return { unread: byArea.leave + byArea.loan + byArea.vacation, byArea, notices, toasts, dismiss };
}

/** The shared list of notices, kept up to date by the polling hook in the layout. */
export function useNoticeList(): EmployeeNotice[] {
  const [list, setList] = useState<EmployeeNotice[]>(latestNotices);
  useEffect(() => {
    const on = () => setList(latestNotices);
    window.addEventListener(UPDATED, on);
    if (!latestNotices.length) leaveRequestsApi.myNotices().then(r => { latestNotices = r.notices; setList(r.notices); }).catch(() => {});
    return () => window.removeEventListener(UPDATED, on);
  }, []);
  return list;
}

export function NoticeToasts({ toasts, dismiss, onView }: { toasts: EmployeeNotice[]; dismiss: (id: string) => void; onView: (kind: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[60] w-[calc(100vw-2rem)] sm:w-96 space-y-3" role="status" aria-live="polite">
      {toasts.map(t => {
        const s = kindStyle(t.kind);
        return (
          <div key={t.id} className={`bg-white rounded-xl shadow-xl border border-gray-200 border-l-4 ${s.bar} p-4 flex gap-3`}>
            <div className={`p-2 rounded-lg h-fit ${s.icon}`}><s.Icon size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-gray-900">{t.title}</p>
              <p className="text-sm text-gray-700 mt-0.5">{t.message}</p>
              <button className="btn-primary !py-1 !px-3 text-xs mt-2" onClick={() => { dismiss(t.id); onView(t.kind); }}>View</button>
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 h-fit"><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Updates from HR" for one area (leave, loan or vacation pay), shown inside that card on My Dashboard.
 * Opening it marks those updates as read; the ones that were new stay highlighted until the card is closed.
 */
export function AreaUpdates({ area }: { area: Exclude<NoticeArea, 'messages' | 'greeting'> }) {
  const all = useNoticeList();
  const notices = all.filter(n => areaOf(n.kind) === area);
  const [newIds] = useState<Set<string>>(() => new Set(notices.filter(n => !n.read).map(n => n.id)));
  const [showAll, setShowAll] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || !notices.some(n => !n.read)) return;
    marked.current = true;
    markAreaRead(area, all);
  }, [notices, all, area]);

  if (!notices.length) return null;
  const shown = showAll ? notices : notices.slice(0, 3);
  const fresh = notices.filter(n => !n.read || newIds.has(n.id)).length;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-brand-700 text-white font-semibold text-sm flex items-center gap-2">
        <Bell size={14} /> Updates from HR
        {fresh > 0 && <span className="text-[11px] bg-orange-500 text-white px-2 py-0.5 rounded-full">{fresh} new</span>}
      </div>
      <div className="divide-y divide-gray-100">
        {shown.map(n => {
          const s = kindStyle(n.kind);
          const isNew = !n.read || newIds.has(n.id);
          return (
            <div key={n.id} className={`px-4 py-3 flex gap-3 ${isNew ? 'bg-green-50/70' : ''}`}>
              <div className={`p-1.5 rounded-lg h-fit ${s.icon}`}><s.Icon size={15} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{n.title} <span className="text-[11px] font-normal text-gray-400 ml-1">{when(n.createdAt)}</span>{isNew && <span className="ml-1 text-[10px] font-bold text-orange-600">NEW</span>}</p>
                <p className="text-xs text-gray-700 mt-0.5">{n.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      {notices.length > 3 && (
        <button className="w-full px-4 py-2 text-xs text-brand-700 hover:underline border-t border-gray-100" onClick={() => setShowAll(a => !a)}>
          {showAll ? 'Show fewer' : `Show all ${notices.length}`}
        </button>
      )}
    </div>
  );
}
