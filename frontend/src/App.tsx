import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { Tab } from './components/Layout';
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
import { Flower2 } from 'lucide-react';

function MainApp() {
  const { user, isAdmin, loading } = useAuth();

  const [tab, setTab] = useState<Tab>(() => {
    if (window.location.hash === '#apply' || window.location.hash === '#leave-form') {
      return 'leave-form';
    }
    return 'dashboard';
  });

  // When user logs in or role is resolved, ensure default tab matches role
  useEffect(() => {
    if (user && !isAdmin && tab === 'dashboard') {
      setTab('employee-portal');
    }
  }, [user, isAdmin]);

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
          <p className="text-sm font-medium text-brand-200">Loading Hollandia HR...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === 'employee-portal' && (
        <EmployeePortal onApplyLeave={() => setTab('leave-form')} />
      )}
      {tab === 'dashboard' && (
        isAdmin ? <Dashboard /> : <EmployeePortal onApplyLeave={() => setTab('leave-form')} />
      )}
      {tab === 'leave-form' && (
        <IntegratedLeaveForm onNavigateRequests={() => setTab(isAdmin ? 'requests' : 'employee-portal')} />
      )}
      {tab === 'profile' && <ProfilePage />}
      {tab === 'leave-summary' && <LeaveSummary />}
      {tab === 'requests'    && <RequestQueue />}
      {tab === 'new-request' && <LeaveRequestForm />}
      {tab === 'employees'   && <EmployeeList />}
      {tab === 'policy'      && <PolicyReference />}
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