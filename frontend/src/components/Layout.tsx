import React, { useState } from 'react';
import { Flower2, Users, CalendarDays, ClipboardList, BookOpen, FileText, LogOut, ShieldCheck, User, UserCog, BarChart3, ScrollText, DatabaseBackup, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_LABELS } from '../types';
import { useAdminNotifications, ToastStack } from './AdminNotifications';

export type Tab = 'dashboard' | 'employee-portal' | 'new-request' | 'leave-form' | 'employees' | 'requests' | 'policy' | 'profile' | 'leave-summary' | 'audit-log' | 'backups';

interface LayoutProps { 
  activeTab: Tab; 
  onTabChange: (tab: Tab) => void; 
  children: React.ReactNode; 
}

const EMPLOYEE_NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'employee-portal', label: 'My Leave Dashboard', icon: <Flower2 size={18} /> },
  { id: 'profile', label: 'My Profile', icon: <UserCog size={18} /> },
  { id: 'leave-form',      label: 'Apply for Leave',    icon: <FileText size={18} /> },
  { id: 'policy',          label: 'Policy Rules',        icon: <BookOpen size={18} /> },
];

const ADMIN_NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard',       label: 'Company Dashboard',   icon: <Flower2 size={18} /> },
  { id: 'requests',        label: 'All Requests',        icon: <ClipboardList size={18} /> },
  { id: 'leave-summary',   label: 'Leave Summary',       icon: <BarChart3 size={18} /> },
  { id: 'leave-form',      label: 'Apply for Leave',    icon: <FileText size={18} /> },
  { id: 'new-request',     label: 'HR Eligibility Check', icon: <CalendarDays size={18} /> },
  { id: 'employees',       label: 'Employees Roster',    icon: <Users size={18} /> },
  { id: 'policy',          label: 'Policy Rules',        icon: <BookOpen size={18} /> },
  { id: 'audit-log',       label: 'Audit Log',           icon: <ScrollText size={18} /> },
  { id: 'backups',         label: 'Data & Backups',      icon: <DatabaseBackup size={18} /> },
];

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const { user, isAdmin, logout } = useAuth();
  const navItems = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  const [open, setOpen] = useState(false);

  const go = (id: Tab) => { onTabChange(id); setOpen(false); };
  const { pending, toasts, dismiss } = useAdminNotifications(isAdmin);

  return (
    <div className='min-h-screen md:flex bg-gray-50'>
      {/* Mobile top bar */}
      <header className='md:hidden sticky top-0 z-30 bg-brand-800 text-white flex items-center justify-between px-4 h-14 shadow'>
        <div className='flex items-center gap-2'>
          <Flower2 size={22} className='text-brand-300' />
          <span className='font-semibold text-sm'>Hollandia Leave</span>
        </div>
        <button onClick={() => setOpen(o => !o)} aria-label='Menu' className='p-2 -mr-2 rounded-lg hover:bg-brand-700'>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {open && <div className='md:hidden fixed inset-0 z-30 bg-black/40' onClick={() => setOpen(false)} />}

      <aside className={`fixed md:sticky top-0 left-0 z-40 h-screen w-72 max-w-[85vw] md:w-64 bg-brand-800 text-white flex flex-col shrink-0 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className='px-5 py-5 border-b border-brand-700 flex items-center gap-2.5'>
          <Flower2 size={24} className='text-brand-300 shrink-0' />
          <div>
            <p className='font-semibold text-sm leading-tight'>Hollandia</p>
            <p className='text-brand-300 text-xs'>Leave Management</p>
          </div>
        </div>

        <nav className='flex-1 px-3 py-4 space-y-1 overflow-y-auto'>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id ? 'bg-brand-600 text-white shadow-sm' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'requests' && isAdmin && pending > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='Waiting for review'>{pending}</span>}
            </button>
          ))}
        </nav>

        {user && (
          <div className='p-4 border-t border-brand-700 bg-brand-900/60 flex items-center justify-between gap-3'>
            <div className='min-w-0 flex items-center gap-2.5'>
              <div className='w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-brand-200 text-xs font-bold shrink-0'>
                {isAdmin ? <ShieldCheck size={16} /> : <User size={16} />}
              </div>
              <div className='min-w-0'>
                <p className='text-xs font-semibold text-white truncate'>{user.name}</p>
                <p className='text-[10px] text-brand-300 truncate'>
                  {isAdmin ? 'HR Administrator' : DEPARTMENT_LABELS[user.department]}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title='Sign Out'
              className='p-2 rounded-lg text-brand-300 hover:text-white hover:bg-brand-700 transition-colors shrink-0'
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>
      {isAdmin && <ToastStack toasts={toasts} dismiss={dismiss} onReview={() => go('requests')} />}
      <main className='flex-1 min-w-0 overflow-x-hidden'>{children}</main>
    </div>
  );
}
