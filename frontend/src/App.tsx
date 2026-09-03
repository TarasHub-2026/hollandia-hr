import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import EmployeeList from './components/EmployeeList';
import LeaveRequestForm from './components/LeaveRequestForm';
import RequestQueue from './components/RequestQueue';
import PolicyReference from './components/PolicyReference';

type Tab = 'dashboard' | 'new-request' | 'employees' | 'requests' | 'policy';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === 'dashboard'   && <Dashboard />}
      {tab === 'new-request' && <LeaveRequestForm />}
      {tab === 'employees'   && <EmployeeList />}
      {tab === 'requests'    && <RequestQueue />}
      {tab === 'policy'      && <PolicyReference />}
    </Layout>
  );
}