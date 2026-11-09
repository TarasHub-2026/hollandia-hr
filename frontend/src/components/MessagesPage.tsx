import React, { useState } from 'react';
import { Megaphone, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCommsSummary } from '../api/comms';
import AnnouncementsPanel from './AnnouncementsPanel';
import ThreadsPanel from './ThreadsPanel';

export default function MessagesPage() {
  const { isAdmin } = useAuth();
  const s = useCommsSummary(true);
  const [tab, setTab] = useState<'announcements' | 'messages'>(() => (!isAdmin && s.unreadMessages > 0 ? 'messages' : 'announcements'));

  const tabBtn = (id: 'announcements' | 'messages', label: string, Icon: typeof Megaphone, count: number) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
      <Icon size={16} /> {label}
      {count > 0 && <span className="text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5">{count}</span>}
    </button>
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={26} /> Announcements & Messages</h1>
        <p className="text-gray-500 text-sm mt-1">
          {isAdmin
            ? 'Post important announcements for all employees and write private messages to particular employees. Employees can reply to your messages.'
            : 'Important announcements from HR, and your private messages with HR.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabBtn('announcements', 'Important Announcements', Megaphone, isAdmin ? 0 : s.newAnnouncements)}
        {tabBtn('messages', isAdmin ? 'Messages' : 'My Messages', MessageSquare, s.unreadMessages)}
      </div>
      {tab === 'announcements' ? <AnnouncementsPanel /> : <ThreadsPanel />}
    </div>
  );
}
