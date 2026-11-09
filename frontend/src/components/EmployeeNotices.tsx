import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCircle2, XCircle, Ban, CalendarDays } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { EmployeeNotice } from '../types';

const POLL_MS = 30000;
const SHOW_MS = 20000;

const kindStyle = (kind: string) =>
  kind === 'APPROVED' || kind === 'DATE_CHANGE_APPROVED' || kind === 'LOAN_APPROVED' ? { bar: 'border-l-green-500', icon: 'bg-green-100 text-green-700', Icon: CheckCircle2 }
  : kind === 'DENIED' || kind === 'DATE_CHANGE_DENIED' || kind === 'LOAN_DENIED' ? { bar: 'border-l-red-500', icon: 'bg-red-100 text-red-700', Icon: XCircle }
  : kind === 'CANCELLED' ? { bar: 'border-l-gray-400', icon: 'bg-gray-200 text-gray-600', Icon: Ban }
  : { bar: 'border-l-blue-500', icon: 'bg-blue-100 text-blue-700', Icon: CalendarDays };

const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Polls for HR decisions on the signed-in employee's leave. Shows a pop-up for each new one and tracks the unread count. */
export function useEmployeeNotices(enabled: boolean) {
  const [unread, setUnread] = useState(0);
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
        setUnread(r.unread);
        const fresh = r.notices.filter(n => !n.read && !seen.current.has(n.id));
        fresh.forEach(n => seen.current.add(n.id));
        if (fresh.length) {
          setToasts(t => [...t, ...fresh].slice(-3));
          fresh.forEach(n => setTimeout(() => dismiss(n.id), SHOW_MS));
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

  return { unread, toasts, dismiss };
}

export function NoticeToasts({ toasts, dismiss, onView }: { toasts: EmployeeNotice[]; dismiss: (id: string) => void; onView: () => void }) {
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
              <button className="btn-primary !py-1 !px-3 text-xs mt-2" onClick={() => { dismiss(t.id); onView(); }}>View</button>
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 h-fit"><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

/** "Updates from HR" list at the top of the employee's dashboard. Opening it marks everything as read. */
export function NoticesCard() {
  const [notices, setNotices] = useState<EmployeeNotice[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    leaveRequestsApi.myNotices().then(r => {
      if (!live) return;
      setNotices(r.notices);
      if (r.unread > 0) leaveRequestsApi.markNoticesRead().then(() => window.dispatchEvent(new Event('hr-notices-changed'))).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!notices.length) return null;
  const shown = all ? notices : notices.slice(0, 5);
  const fresh = notices.filter(n => !n.read).length;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 bg-brand-700 text-white font-bold text-lg flex items-center gap-2">
        <Bell size={16} /> Updates from HR
        {fresh > 0 && <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">{fresh} new</span>}
      </div>
      <div className="divide-y divide-gray-100">
        {shown.map(n => {
          const s = kindStyle(n.kind);
          return (
            <div key={n.id} className={`px-5 py-3 flex gap-3 ${n.read ? '' : 'bg-green-50/60'}`}>
              <div className={`p-1.5 rounded-lg h-fit ${s.icon}`}><s.Icon size={15} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{n.title} <span className="text-[11px] font-normal text-gray-400 ml-1">{when(n.createdAt)}</span></p>
                <p className="text-xs text-gray-700 mt-0.5">{n.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      {notices.length > 5 && (
        <button className="w-full px-5 py-2 text-xs text-brand-700 hover:underline border-t border-gray-100" onClick={() => setAll(a => !a)}>
          {all ? 'Show fewer' : `Show all ${notices.length}`}
        </button>
      )}
    </div>
  );
}