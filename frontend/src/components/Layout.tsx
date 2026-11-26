import React, { useState } from 'react';
import { Flower2, Users, CalendarDays, ClipboardList, BookOpen, FileText, LogOut, ShieldCheck, User, UserCog, BarChart3, ScrollText, DatabaseBackup, Menu, X, HandCoins, MessageSquare, Eye, Banknote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_LABELS, ACCESS_AREAS } from '../types';
import type { AccessArea } from '../types';
import { useAdminNotifications, ToastStack } from './AdminNotifications';
import { useEmployeeNotices, NoticeToasts, areaOf } from './EmployeeNotices';
import PushToggle from './PushToggle';
import AppFooter from './AppFooter';
import { useCommsSummary } from '../api/comms';

export type Tab = 'dashboard' | 'employee-portal' | 'new-request' | 'leave-form' | 'employees' | 'requests' | 'policy' | 'profile' | 'leave-summary' | 'audit-log' | 'backups' | 'admin-access' | 'loan' | 'vacation-pay' | 'messages' | 'forms' | 'my-leave';

interface LayoutProps { 
  activeTab: Tab; 
  onTabChange: (tab: Tab) => void; 
  children: React.ReactNode; 
}

// Employees: four menu items. My Profile, My Leave, My Loan and My Vacation Pay are cards on My Dashboard, and every form is under Forms.
const EMPLOYEE_NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'employee-portal', label: 'My Dashboard', icon: <Flower2 size={18} /> },
  { id: 'messages',        label: 'Announcements & Messages', icon: <MessageSquare size={18} /> },
  { id: 'forms',           label: 'Forms',               icon: <ClipboardList size={18} /> },
  { id: 'policy',          label: 'Policy Rules',        icon: <BookOpen size={18} /> },
];
/** The employee menu item that is lit for a given screen (the dashboard cards light My Dashboard, the leave form lights Forms). */
const EMPLOYEE_MENU_OF: Partial<Record<Tab, Tab>> = { dashboard: 'employee-portal', profile: 'employee-portal', 'my-leave': 'employee-portal', loan: 'employee-portal', 'vacation-pay': 'employee-portal', 'leave-form': 'forms' };

const ADMIN_NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard',       label: 'Company Dashboard',   icon: <Flower2 size={18} /> },
  { id: 'messages',        label: 'Announcements & Messages', icon: <MessageSquare size={18} /> },
  { id: 'requests',        label: 'All Requests',        icon: <ClipboardList size={18} /> },
  { id: 'leave-summary',   label: 'Leave Summary',       icon: <BarChart3 size={18} /> },
  { id: 'leave-form',      label: 'Apply for Leave',    icon: <FileText size={18} /> },
  { id: 'new-request',     label: 'HR Eligibility Check', icon: <CalendarDays size={18} /> },
  { id: 'loan',            label: 'Loan Applications',   icon: <HandCoins size={18} /> },
  { id: 'vacation-pay',    label: 'Vacation Pay Requests', icon: <Banknote size={18} /> },
  { id: 'employees',       label: 'Employees Roster',    icon: <Users size={18} /> },
  { id: 'policy',          label: 'Policy Rules',        icon: <BookOpen size={18} /> },
  { id: 'admin-access',    label: 'Admin Access',        icon: <ShieldCheck size={18} /> },
  { id: 'audit-log',       label: 'Audit Log',           icon: <ScrollText size={18} /> },
  { id: 'backups',         label: 'Data & Backups',      icon: <DatabaseBackup size={18} /> },
];

/** The area of access each admin screen belongs to, and the level needed to open it. Screens not listed are open to every administrator. */
export const TAB_AREA: Partial<Record<Tab, { area: AccessArea; level: 'view' | 'edit' }>> = {
  dashboard:       { area: 'leave',       level: 'view' },
  requests:        { area: 'leave',       level: 'view' },
  'leave-summary': { area: 'leave',       level: 'view' },
  'leave-form':    { area: 'leave',       level: 'edit' },
  'new-request':   { area: 'leave',       level: 'edit' },
  messages:        { area: 'messages',    level: 'view' },
  loan:            { area: 'loans',       level: 'view' },
  'vacation-pay':  { area: 'vacationPay', level: 'view' },
  employees:       { area: 'employees',   level: 'view' },
  'admin-access':  { area: 'adminAccess', level: 'view' },
  'audit-log':     { area: 'audit',       level: 'view' },
  backups:         { area: 'backups',     level: 'view' },
};

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const { user, isAdmin, can, logout } = useAuth();
  const navItems = isAdmin ? ADMIN_NAV.filter(i => !TAB_AREA[i.id] || can(TAB_AREA[i.id]!.area, TAB_AREA[i.id]!.level)) : EMPLOYEE_NAV;
  // An administrator with limited access sees what that means, so a disabled action is never a surprise.
  const limited = isAdmin && ACCESS_AREAS.some(a => !can(a.id, 'edit'));
  const viewOnly = ACCESS_AREAS.filter(a => can(a.id, 'view') && !can(a.id, 'edit')).map(a => a.label);
  const [open, setOpen] = useState(false);

  const go = (id: Tab) => { onTabChange(id); setOpen(false); };
  const { pending, adminRequests, loans, vacationPay, toasts, dismiss } = useAdminNotifications(isAdmin);
  const { unread, toasts: noticeToasts, dismiss: dismissNotice } = useEmployeeNotices(!isAdmin);
  const comms = useCommsSummary(true);
  const commsBadge = isAdmin ? comms.unreadMessages : comms.unreadMessages + comms.newAnnouncements;

  return (
    <div className='min-h-screen md:flex bg-gray-50'>
      {/* Mobile top bar */}
      <header className='md:hidden sticky top-0 z-30 bg-brand-800 text-white flex items-center justify-between px-4 h-14 shadow'>
        <div className='flex items-center gap-2'>
          <Flower2 size={22} className='text-brand-300' />
          <span className='font-semibold text-sm truncate'>Hollandia Greenhouses HR Management</span>
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
            <p className='font-semibold text-sm leading-tight'>Hollandia Greenhouses</p>
            <p className='text-brand-300 text-xs'>HR Management</p>
          </div>
        </div>

        <nav className='flex-1 px-3 py-4 space-y-1 overflow-y-auto'>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                (isAdmin ? activeTab : (EMPLOYEE_MENU_OF[activeTab] ?? activeTab)) === item.id ? 'bg-brand-600 text-white shadow-sm' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'employee-portal' && !isAdmin && unread > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='New updates from HR on your dashboard cards'>{unread}</span>}
              {item.id === 'admin-access' && isAdmin && adminRequests > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='Waiting for approval'>{adminRequests}</span>}
              {item.id === 'messages' && commsBadge > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title={isAdmin ? 'Unread replies' : 'New announcements or messages'}>{commsBadge}</span>}
              {item.id === 'vacation-pay' && isAdmin && vacationPay > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='Waiting for an answer'>{vacationPay}</span>}
              {item.id === 'loan' && isAdmin && loans > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='Waiting for review'>{loans}</span>}
              {item.id === 'requests' && isAdmin && pending > 0 && <span className='ml-auto text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5' title='Waiting for review'>{pending}</span>}
            </button>
          ))}
        </nav>

        <PushToggle />

        {user && (
          <div className='p-4 border-t border-brand-700 bg-brand-900/60 flex items-center justify-between gap-3'>
            <div className='min-w-0 flex items-center gap-2.5'>
              <div className='w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-brand-200 text-xs font-bold shrink-0 overflow-hidden'>
                {user.photo ? <img src={user.photo} alt='' className='w-full h-full object-cover' /> : isAdmin ? <ShieldCheck size={16} /> : <User size={16} />}
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
      {isAdmin && <ToastStack toasts={toasts} dismiss={dismiss} onReview={(action) => go(action === 'LOAN_APPLICATION' || action === 'LOAN_EDIT' ? 'loan' : action === 'VACATION_PAY_REQUEST' ? 'vacation-pay' : action === 'MESSAGE_REPLY' || action === 'LEAVE_START_REMINDER' || action === 'HR_ANNOUNCEMENT' ? 'messages' : 'requests')} />}
      {!isAdmin && <NoticeToasts toasts={noticeToasts} dismiss={dismissNotice} onView={(kind) => { const a = areaOf(kind); go(a === 'messages' ? 'messages' : a === 'loan' ? 'loan' : a === 'vacation' ? 'vacation-pay' : a === 'leave' ? 'my-leave' : 'employee-portal'); }} />}
      <main className='flex-1 min-w-0 overflow-x-hidden flex flex-col'>
        {limited && (
          <div className='bg-blue-50 border-b border-blue-200 text-blue-900 text-xs px-4 py-2 flex items-start gap-2'>
            <Eye size={14} className='shrink-0 mt-0.5' />
            <p><b>Limited administrator access.</b>{viewOnly.length ? ` You can view but not change: ${viewOnly.join(', ')}.` : ''} Anything you cannot change is blocked, and hidden sections are not available to you.</p>
          </div>
        )}
        <div className='flex-1'>{children}</div><AppFooter />
      </main>
    </div>
  );
}
