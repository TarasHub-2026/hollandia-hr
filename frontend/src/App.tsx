import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { Tab, TAB_AREA } from './components/Layout';
import Dashboard from './components/Dashboard';
import EmployeeList from './components/EmployeeList';
import LeaveRequestForm from './components/LeaveRequestForm';
import RequestQueue from './components/RequestQueue';
import PolicyReference from './components/PolicyReference';
import IntegratedLeaveForm from './components/IntegratedLeaveForm';
import EmployeePortal from './components/EmployeePortal';
import LoginScreen from './components/LoginScreen';
import ProfilePage from './components/ProfilePage';
import LeaveSummary from './components/LeaveSummary';
import AuditLog from './components/AuditLog';
import BackupsPage from './components/BackupsPage';
import AdminAccessPage from './components/AdminAccessPage';
import LoanPage from './components/LoanPage';
import MessagesPage from './components/MessagesPage';
import VacationPayPage from './components/VacationPayPage';
import { ForcePinChange } from './components/PinRecovery';
import PhotoRequired from './components/PhotoRequired';
import { Flower2 } from 'lucide-react';
import type { ApplyBlock } from './types';

function MainApp() {
  const { user, isAdmin, can, loading } = useAuth();

  const [tab, setTab] = useState<Tab>(() => {
    if (window.location.hash === '#apply' || window.location.hash === '#leave-form') {
      return 'leave-form';
    }
    return 'dashboard';
  });

  // The block the employee picked on the portal. Any other way into the leave form clears it.
  const [applyBlock, setApplyBlock] = useState<ApplyBlock | null>(null);
  const goTab = (t: Tab) => { setApplyBlock(null); setTab(t); };
  const applyForBlock = (b: ApplyBlock) => { setApplyBlock(b); setTab('leave-form'); };

  // When user logs in or role is resolved, ensure default tab matches role
  useEffect(() => {
    if (user && !isAdmin && tab === 'dashboard') {
      setTab('employee-portal');
    }
  }, [user, isAdmin]);

  // An administrator with limited access who lands on a screen they cannot open is moved to the first one they can.
  useEffect(() => {
    if (!isAdmin) return;
    const need = TAB_AREA[tab];
    if (need && !can(need.area, need.level)) {
      const order: Tab[] = ['dashboard', 'messages', 'requests', 'leave-summary', 'loan', 'vacation-pay', 'employees', 'policy'];
      setTab(order.find(t => { const n = TAB_AREA[t]; return !n || can(n.area, n.level); }) || 'policy');
    }
  }, [tab, isAdmin, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#apply' || window.location.hash === '#leave-form') {
        setTab('leave-form');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <Flower2 size={40} className="animate-spin mx-auto text-brand-300" />
          <p className="text-sm font-medium text-brand-200">Loading Hollandia Greenhouses HR Management...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }
  if (user.mustChangePin) return <ForcePinChange />;
  // Every profile, employees and HR administrators alike, needs a picture; anyone without one adds it before using the app.
  if (!user.photo) return <PhotoRequired />;

  return (
    <Layout activeTab={tab} onTabChange={goTab}>
      {tab === 'employee-portal' && (
        <EmployeePortal onApplyLeave={() => goTab('leave-form')} onApplyBlock={applyForBlock} onOpenLoan={() => goTab('loan')} onOpenProfile={() => goTab('profile')} />
      )}
      {tab === 'dashboard' && (
        isAdmin ? <Dashboard /> : <EmployeePortal onApplyLeave={() => goTab('leave-form')} onApplyBlock={applyForBlock} onOpenLoan={() => goTab('loan')} onOpenProfile={() => goTab('profile')} />
      )}
      {tab === 'leave-form' && (
        <IntegratedLeaveForm key={applyBlock ? `${applyBlock.name}-${applyBlock.startDate}` : 'open'} block={applyBlock} onNavigateRequests={() => setTab(isAdmin ? 'requests' : 'employee-portal')} />
      )}
      {tab === 'profile' && <ProfilePage />}
      {tab === 'loan' && <LoanPage />}
      {tab === 'messages' && <MessagesPage />}
      {tab === 'vacation-pay' && <VacationPayPage />}
      {tab === 'leave-summary' && <LeaveSummary />}
      {tab === 'audit-log' && <AuditLog />}
      {tab === 'backups' && <BackupsPage />}
      {tab === 'admin-access' && <AdminAccessPage />}
      {tab === 'requests'    && <RequestQueue />}
      {tab === 'new-request' && <LeaveRequestForm />}
      {tab === 'employees'   && <EmployeeList />}
      {tab === 'policy'      && <PolicyReference onApplyLoan={() => setTab('loan')} />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}