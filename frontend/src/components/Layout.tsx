import React from 'react';
import { Flower2, Users, CalendarDays, ClipboardList, BookOpen, FileText, LogOut, ShieldCheck, User, UserCog, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_LABELS } from '../types';

export type Tab = 'dashboard' | 'employee-portal' | 'new-request' | 'leave-form' | 'employees' | 'requests' | 'policy' | 'profile' | 'leave-summary';

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
];

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const { user, isAdmin, logout } = useAuth();
  const navItems = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className='min-h-screen flex flex-col md:flex-row bg-gray-50'>
      <aside className='w-full md:w-64 bg-brand-800 text-white flex flex-col shrink-0'>
        <div className='px-5 py-5 border-b border-brand-700 flex items-center justify-between'>
          <div className='flex items-center gap-2.5'>
            <Flower2 size={24} className='text-brand-300 shrink-0' />
            <div>
              <p className='font-semibold text-sm leading-tight'>Hollandia</p>
              <p className='text-brand-300 text-xs'>Leave Management</p>
            </div>
          </div>
          <span className='md:hidden'>
            <button onClick={logout} className='text-brand-300 hover:text-white p-1'>
              <LogOut size={16} />
            </button>
          </span>
        </div>

        <nav className='flex-1 px-3 py-4 space-y-1 overflow-y-auto'>
          {navItems.map(item => (
            <button 
              key={item.id} 
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id ? 'bg-brand-600 text-white shadow-sm' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Profile & Sign Out Footer */}
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
              className='p-1.5 rounded-lg text-brand-300 hover:text-white hover:bg-brand-700 transition-colors shrink-0'
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>
      <main className='flex-1 overflow-auto'>{children}</main>
    </div>
  );
}