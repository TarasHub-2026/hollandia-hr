import React, { useState } from 'react';
import { DatabaseBackup, FileSpreadsheet, Database, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';

const FILES = [
  { path: '/api/export/employees.csv', title: 'Employees', desc: 'Profiles, employee numbers, immigration status, TFW document dates.', icon: <FileSpreadsheet size={18} /> },
  { path: '/api/export/leave-requests.csv', title: 'Leave requests', desc: 'Every request with dates, status, red flags and denial reasons.', icon: <FileSpreadsheet size={18} /> },
  { path: '/api/export/audit-log.csv', title: 'Audit log', desc: 'Sign-ins, changes and access to personal data.', icon: <FileSpreadsheet size={18} /> },
];

export default function BackupsPage() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const download = async (path: string) => {
    setBusy(path); setError('');
    try {
      const r = await api.get(path, { responseType: 'blob' });
      const cd = String(r.headers['content-disposition'] || '');
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'export';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.response?.status === 403 ? 'Administrator access required.' : (e?.message || 'Download failed'));
    } finally { setBusy(''); }
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><DatabaseBackup size={22} /> Data &amp; Backups</h1>
        <p className="text-gray-500 text-sm">Download your data. CSV files open directly in Excel. Every download is recorded in the audit log.</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="card divide-y divide-gray-100">
        {FILES.map(f => (
          <div key={f.path} className="px-5 py-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-green-50 text-green-700">{f.icon}</div>
            <div className="flex-1"><p className="font-semibold text-sm text-gray-800">{f.title} (Excel / CSV)</p><p className="text-xs text-gray-500">{f.desc}</p></div>
            <button className="btn-secondary" disabled={!!busy} onClick={() => download(f.path)}>{busy === f.path ? 'Preparing…' : 'Download'}</button>
          </div>
        ))}
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700"><Database size={18} /></div>
          <div className="flex-1"><p className="font-semibold text-sm text-gray-800">Full database backup</p><p className="text-xs text-gray-500">A complete snapshot (.db file) of everything, including the audit log. Use it to restore the app.</p></div>
          <button className="btn-primary" disabled={!!busy} onClick={() => download('/api/export/database')}>{busy === '/api/export/database' ? 'Preparing…' : 'Download'}</button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex gap-3">
        <ShieldCheck size={18} className="shrink-0 mt-0.5" />
        <p>These files contain personal information such as passport and work permit dates. Store them securely and delete copies you no longer need. For automatic backups, also enable <strong>Backups</strong> on the volume in Railway.</p>
      </div>
    </div>
  );
}
