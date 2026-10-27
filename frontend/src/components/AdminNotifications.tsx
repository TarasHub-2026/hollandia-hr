import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { LeaveNotice } from '../api/leaveRequests';

const POLL_MS = 30000;
const SHOW_MS = 20000;

export interface Toast extends LeaveNotice { key: string }

/** Polls for newly submitted leave applications (admins only) and tracks the pending count. */
export function useAdminNotifications(enabled: boolean) {
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const since = useRef<string>('');

  const dismiss = useCallback((key: string) => setToasts(t => t.filter(x => x.key !== key)), []);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await leaveRequestsApi.notifications(since.current || undefined);
        if (stop) return;
        since.current = r.now;
        setPending(r.pending);
        if (r.items.length) {
          const fresh = r.items.map(i => ({ ...i, key: `${i.id}-${i.ts}` }));
          setToasts(t => [...t, ...fresh.filter(f => !t.some(x => x.key === f.key))].slice(-4));
          fresh.forEach(f => setTimeout(() => dismiss(f.key), SHOW_MS));
        }
      } catch { /* offline or signed out: try again next time */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, dismiss]);

  return { pending, toasts, dismiss };
}

export function ToastStack({ toasts, dismiss, onReview }: { toasts: Toast[]; dismiss: (key: string) => void; onReview: () => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[60] w-[calc(100vw-2rem)] sm:w-96 space-y-3" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.key} className="bg-white rounded-xl shadow-xl border border-gray-200 border-l-4 border-l-orange-500 p-4 flex gap-3">
          <div className="p-2 rounded-lg bg-orange-100 text-orange-600 h-fit"><Bell size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-gray-900">New leave application</p>
            <p className="text-sm text-gray-800 truncate">{t.name || 'An employee'}</p>
            {t.details && <p className="text-xs text-gray-500 mt-0.5">{t.details}</p>}
            <button className="btn-primary !py-1 !px-3 text-xs mt-2" onClick={() => { dismiss(t.key); onReview(); }}>Review</button>
          </div>
          <button onClick={() => dismiss(t.key)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 h-fit"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
