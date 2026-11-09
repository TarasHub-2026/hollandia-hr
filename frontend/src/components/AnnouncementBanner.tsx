import React, { useCallback, useEffect, useState } from 'react';
import { commsApi } from '../api/comms';
import type { Announcement } from '../types';
import { AnnouncementCard } from './AnnouncementsPanel';

/** Important announcements the employee has not acknowledged yet, shown at the top of My Dashboard. */
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);

  const load = useCallback(() => {
    commsApi.announcements().then(list => setItems(list.filter(a => !a.acknowledged))).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('hr-comms-changed', load);
    return () => window.removeEventListener('hr-comms-changed', load);
  }, [load]);

  if (!items.length) return null;
  return (
    <div className="space-y-3" role="region" aria-label="Important announcements">
      {items.map(a => <AnnouncementCard key={a.id} a={a} onAck={load} />)}
    </div>
  );
}
