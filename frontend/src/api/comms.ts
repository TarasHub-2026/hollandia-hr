import { useEffect, useState } from 'react';
import { api } from './client';
import type { Announcement, MessageThread, ThreadDetail, CommsSummary } from '../types';

export interface AnnouncementInput { title: string; body: string; endsOn?: string | null }
export interface NewThreadInput { subject: string; body: string; recipientIds: string[]; department?: string }

// Anything that changes what the menu badges or the dashboard banner show tells the rest of the app.
export const commsChanged = () => window.dispatchEvent(new Event('hr-comms-changed'));

export const commsApi = {
  announcements:      () => api.get<Announcement[]>('/api/comms/announcements').then(r => r.data),
  postAnnouncement:   (d: AnnouncementInput) => api.post<{ id: string; notified: number }>('/api/comms/announcements', d).then(r => r.data),
  editAnnouncement:   (id: string, d: AnnouncementInput) => api.put(`/api/comms/announcements/${id}`, d).then(r => r.data),
  removeAnnouncement: (id: string) => api.delete(`/api/comms/announcements/${id}`).then(r => r.data),
  acknowledge:        (id: string) => api.post(`/api/comms/announcements/${id}/ack`).then(r => { commsChanged(); return r.data; }),
  threads:            () => api.get<MessageThread[]>('/api/comms/threads').then(r => r.data),
  thread:             (id: string) => api.get<ThreadDetail>(`/api/comms/threads/${id}`).then(r => { commsChanged(); return r.data; }),
  startThreads:       (d: NewThreadInput) => api.post<{ created: number }>('/api/comms/threads', d).then(r => r.data),
  reply:              (id: string, body: string) => api.post(`/api/comms/threads/${id}/messages`, { body }).then(r => r.data),
  summary:            () => api.get<CommsSummary>('/api/comms/summary').then(r => r.data),
};

/** Unread message and new announcement counts for the menu badges. Refreshes every 30 seconds. */
export function useCommsSummary(enabled: boolean): CommsSummary {
  const [s, setS] = useState<CommsSummary>({ unreadMessages: 0, newAnnouncements: 0 });
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = () => commsApi.summary().then(r => { if (!stop) setS(r); }).catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('hr-comms-changed', tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('hr-comms-changed', tick); };
  }, [enabled]);
  return s;
}
