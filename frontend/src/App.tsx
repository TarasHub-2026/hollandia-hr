import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import EmployeeList from './components/EmployeeList';
import LeaveRequestForm from './components/LeaveRequestForm';
import RequestQueue from './components/RequestQueue';
import PolicyReference from './components/PolicyReference';
import IntegratedLeaveForm from './components/IntegratedLeaveForm';

type Tab = 'dashboard' | 'new-request' | 'leave-form' | 'employees' | 'requests' | 'policy';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    if (window.location.hash === '#apply' || window.location.hash === '#leave-form') {
      return 'leave-form';
    }
    return 'dashboard';
  });

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#apply' || window.location.hash === '#leave-form') {
        setTab('leave-form');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === 'dashboard'   && <Dashboard />}
      {tab === 'new-request' && <LeaveRequestForm />}
      {tab === 'leave-form'  && <IntegratedLeaveForm onNavigateRequests={() => setTab('requests')} />}
      {tab === 'employees'   && <EmployeeList />}
      {tab === 'requests'    && <RequestQueue />}
      {tab === 'policy'      && <PolicyReference />}
    </Layout>
  );
}