import React from 'react';
import { Flower2, Users, CalendarDays, ClipboardList, BookOpen } from 'lucide-react';

type Tab = 'dashboard' | 'new-request' | 'employees' | 'requests' | 'policy';
interface LayoutProps { activeTab: Tab; onTabChange: (tab: Tab) => void; children: React.ReactNode; }
const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard',   label: 'Dashboard',       icon: <Flower2 size={18} /> },
  { id: 'new-request', label: 'New Request',      icon: <CalendarDays size={18} /> },
  { id: 'employees',   label: 'Employees',        icon: <Users size={18} /> },
  { id: 'requests',    label: 'All Requests',     icon: <ClipboardList size={18} /> },
  { id: 'policy',      label: 'Policy Reference', icon: <BookOpen size={18} /> },
];
export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  return (
    <div className='min-h-screen flex'>
      <aside className='w-60 bg-brand-800 text-white flex flex-col shrink-0'>
        <div className='px-5 py-5 border-b border-brand-700'>
          <div className='flex items-center gap-2.5'>
            <Flower2 size={24} className='text-brand-300' />
            <div><p className='font-semibold text-sm leading-tight'>Hollandia</p><p className='text-brand-300 text-xs'>Leave Management</p></div>
          </div>
        </div>
        <nav className='flex-1 px-3 py-4 space-y-1'>
          {NAV.map(item => (
            <button key={item.id} onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id ? 'bg-brand-600 text-white' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
              }`}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
        <div className='px-5 py-4 border-t border-brand-700 text-xs text-brand-400'>HR Admin Portal</div>
      </aside>
      <main className='flex-1 overflow-auto'>{children}</main>
    </div>
  );
}