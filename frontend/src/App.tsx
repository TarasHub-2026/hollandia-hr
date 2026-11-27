import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { Tab } from './components/Layout';
import { AdminHome, HubPage, HUB_OF, tabAllowed } from './components/AdminHub';
import { useLeaveData, LeaveKpis, LeaveSection, DepartmentOverview } from './components/Dashboard';
import type { LeavePart } from './components/Dashboard';
import PaidSickOverviewCard from './components/PaidSickOverviewCard';
import LoanForm from './components/LoanForm';
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
import FormsPage from './components/FormsPage';
import type { PortalSection, FormKind } from './components/EmployeePortal';

const LEAVE_PARTS: Tab[] = ['block-capacity', 'away-today', 'season-blocks', 'no-leave'];

/** HR: the Leaves card. The leave counts at the top and the dashboard-style leave cards share one load. */
function LeavesHub({ tab, onGo }: { tab: Tab; onGo: (t: Tab) => void }) {
  const data = useLeaveData();
  return (
    <HubPage hub="leaves" active={tab === 'leaves' ? null : tab} onGo={onGo} header={<LeaveKpis data={data} />}>
      {tab === 'requests' && <RequestQueue />}
      {tab === 'leave-summary' && <LeaveSummary />}
      {tab === 'paid-sick' && <div className="p-4 md:p-8"><PaidSickOverviewCard /></div>}
      {LEAVE_PARTS.includes(tab) && <LeaveSection part={tab as LeavePart} data={data} />}
    </HubPage>
  );
}

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
  // Employees: the form chosen on the Forms page when another page sends them there (for example "Change application").
  const [formPick, setFormPick] = useState<FormKind | null>(null);
  const goTab = (t: Tab) => { setApplyBlock(null); if (t === 'forms') setFormPick(null); setTab(t); };
  const openForm = (f: FormKind) => { setFormPick(f); setTab('forms'); };

  // Employees: My Profile, My Leave, My Loan and My Vacation Pay are cards on My Dashboard; each has its own tab so a
  // notification can open the right card.
  const SECTION_OF: Partial<Record<Tab, PortalSection>> = { profile: 'profile', 'my-leave': 'leave', loan: 'loan', 'vacation-pay': 'vacation', 'my-messages': 'messages', 'my-forms': 'forms', 'my-policy': 'policy' };
  const TAB_OF: Record<PortalSection, Tab> = { profile: 'profile', leave: 'my-leave', loan: 'loan', vacation: 'vacation-pay', messages: 'my-messages', forms: 'my-forms', policy: 'my-policy' };

  // When user logs in or role is resolved, ensure default tab matches role
  useEffect(() => {
    if (user && !isAdmin && tab === 'dashboard') {
      setTab('employee-portal');
    }
  }, [user, isAdmin]);

  // An administrator with limited access who lands on a screen they cannot open goes back to the dashboard.
  useEffect(() => {
    if (!isAdmin) return;
    if (!tabAllowed(tab, can)) setTab('dashboard');
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
      {!isAdmin ? (
        <>
          {(tab === 'employee-portal' || tab === 'dashboard' || SECTION_OF[tab]) && (
            <EmployeePortal
              open={SECTION_OF[tab] ?? null}
              onOpen={s => setTab(s ? TAB_OF[s] : 'employee-portal')}
              onOpenForm={openForm}
            />
          )}
          {(tab === 'forms' || tab === 'leave-form') && (
            <FormsPage key={`${tab}-${formPick || ''}`} initial={tab === 'leave-form' ? 'leave' : formPick} onLeaveSubmitted={() => setTab('my-leave')} />
          )}
          {tab === 'messages' && <MessagesPage />}
          {tab === 'policy' && <PolicyReference onApplyLoan={() => openForm('loan')} />}
        </>
      ) : (
      <>
      {tab === 'dashboard' && <AdminHome onGo={goTab} />}
      {(tab === 'company' || HUB_OF[tab] === 'company') && (
        <HubPage hub="company" active={tab === 'company' ? null : tab} onGo={goTab}>
          {tab === 'employees' && <EmployeeList />}
          {tab === 'departments' && <DepartmentOverview />}
        </HubPage>
      )}
      {(tab === 'leaves' || HUB_OF[tab] === 'leaves') && <LeavesHub tab={tab} onGo={goTab} />}
      {(tab === 'forms' || HUB_OF[tab] === 'forms') && (
        <HubPage hub="forms" active={tab === 'forms' ? null : tab} onGo={goTab}>
          {tab === 'leave-form' && (
            <IntegratedLeaveForm key={applyBlock ? `${applyBlock.name}-${applyBlock.startDate}` : 'open'} block={applyBlock} onNavigateRequests={() => setTab('requests')} />
          )}
          {tab === 'new-request' && <LeaveRequestForm />}
          {tab === 'loan-form' && <div className="p-4 md:p-8 max-w-4xl"><LoanForm onDone={() => setTab('loan')} onCancel={() => setTab('forms')} /></div>}
        </HubPage>
      )}
      {(tab === 'admin' || HUB_OF[tab] === 'admin') && (
        <HubPage hub="admin" active={tab === 'admin' ? null : tab} onGo={goTab}>
          {tab === 'admin-access' && <AdminAccessPage />}
          {tab === 'audit-log' && <AuditLog />}
          {tab === 'backups' && <BackupsPage />}
        </HubPage>
      )}
      {tab === 'profile' && <ProfilePage />}
      {tab === 'loan' && <LoanPage />}
      {tab === 'messages' && <MessagesPage />}
      {tab === 'vacation-pay' && <VacationPayPage />}
      {tab === 'policy'      && <PolicyReference onApplyLoan={() => setTab('loan-form')} />}
      </>
      )}
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