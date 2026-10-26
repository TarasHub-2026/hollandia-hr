import React, { useCallback, useEffect, useState } from 'react';
import { ScrollText, Download, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

interface AuditEntry {
  id: string; timestamp: string; actorId: string | null; actorName: string | null; actorRole: string | null;
  action: string; targetType: string | null; targetId: string | null; targetName: string | null;
  details: string | null; ip: string | null;
}

const ACTIONS: Record<string, { label: string; tone: string }> = {
  LOGIN_SUCCESS:   { label: 'Sign in', tone: 'bg-green-100 text-green-800' },
  LOGIN_FAILED:    { label: 'Failed sign in', tone: 'bg-red-100 text-red-800' },
  LOGIN_LOCKED:    { label: 'Sign in blocked', tone: 'bg-red-100 text-red-800' },
  REGISTER:        { label: 'Profile created', tone: 'bg-blue-100 text-blue-800' },
  PROFILE_UPDATE:  { label: 'Profile updated', tone: 'bg-blue-100 text-blue-800' },
  PIN_CHANGE:      { label: 'PIN changed', tone: 'bg-amber-100 text-amber-800' },
  LEAVE_SUBMIT:    { label: 'Leave submitted', tone: 'bg-indigo-100 text-indigo-800' },
  STATUS_CHANGE:   { label: 'Status changed', tone: 'bg-purple-100 text-purple-800' },
  LEAVE_DELETE:    { label: 'Leave deleted', tone: 'bg-red-100 text-red-800' },
  EMPLOYEE_CREATE: { label: 'Employee added', tone: 'bg-blue-100 text-blue-800' },
  EMPLOYEE_UPDATE: { label: 'Employee edited', tone: 'bg-blue-100 text-blue-800' },
  EMPLOYEE_DELETE: { label: 'Employee deleted', tone: 'bg-red-100 text-red-800' },
  REGISTER_FAILED: { label: 'Failed sign-up', tone: 'bg-red-100 text-red-800' },
  EMPLOYEE_IMPORT: { label: 'Roster imported', tone: 'bg-blue-100 text-blue-800' },
  EMPLOYEE_ACTIVATE: { label: 'Employee reactivated', tone: 'bg-green-100 text-green-800' },
  EMPLOYEE_DEACTIVATE: { label: 'Employee deactivated', tone: 'bg-amber-100 text-amber-800' },
  EXPORT_DATA:     { label: 'Data exported', tone: 'bg-amber-100 text-amber-800' },
  VIEW_ROSTER:     { label: 'Viewed roster', tone: 'bg-gray-100 text-gray-700' },
  VIEW_ALL_REQUESTS: { label: 'Viewed all requests', tone: 'bg-gray-100 text-gray-700' },
  VIEW_AUDIT_LOG:  { label: 'Viewed audit log', tone: 'bg-gray-100 text-gray-700' },
};

export default function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<AuditEntry[]>('/api/audit', { params: { limit: 1000, action: action || undefined, q: q || undefined } })
      .then(r => setRows(r.data))
      .catch(e => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [action, q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Time', 'Who', 'Role', 'Action', 'Target', 'Details', 'IP'];
    const lines = rows.map(r => [new Date(r.timestamp).toLocaleString(), r.actorName || '(unknown)', r.actorRole || '', r.action, r.targetName || '', r.details || '', r.ip || ''].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-2"><ScrollText size={22} /> Audit Log</h1>
          <p className="text-gray-500 text-sm">A permanent record of sign-ins, changes and access to personal data. Entries cannot be edited or deleted.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select className="form-select py-1.5" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className="form-input py-1.5" placeholder="Search name or details" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
          <button className="btn-secondary flex items-center gap-1" onClick={exportCsv}><Download size={14} /> CSV</button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr><th className="text-left px-4 py-2">Time</th><th className="text-left px-3 py-2">Who</th><th className="text-left px-3 py-2">Action</th><th className="text-left px-3 py-2">Target</th><th className="text-left px-3 py-2">Details</th><th className="text-left px-3 py-2">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No entries</td></tr>}
            {!loading && rows.map(r => {
              const a = ACTIONS[r.action] || { label: r.action, tone: 'bg-gray-100 text-gray-700' };
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actorName || <span className="text-gray-400">(not signed in)</span>}{r.actorRole === 'ADMIN' && <span className="ml-1 text-[10px] bg-gray-800 text-white px-1.5 py-0.5 rounded">ADMIN</span>}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.tone}`}>{a.label}</span></td>
                  <td className="px-3 py-2 text-gray-700">{r.targetName || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-md">{r.details || ''}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{r.ip || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
