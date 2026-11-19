import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Trash2, ShieldCheck, RefreshCw, KeyRound } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import type { AdminAccessData, AdminAccessRequest, AccessArea, AccessLevel } from '../types';
import { ACCESS_AREAS } from '../types';

type Perms = Record<AccessArea, AccessLevel>;
const allAreas = (level: AccessLevel): Perms => Object.fromEntries(ACCESS_AREAS.map(a => [a.id, level])) as Perms;

/** The label shown next to an administrator: Full access, View only, or Custom. */
function accessSummary(p: Perms): { text: string; cls: string } {
  const v = ACCESS_AREAS.map(a => p[a.id]);
  if (v.every(l => l === 'edit')) return { text: 'Full access', cls: 'bg-green-50 text-green-700 border-green-200' };
  if (v.every(l => l === 'view')) return { text: 'View only', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  return { text: 'Custom access', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
}

const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : fb);
const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function AdminAccessPage() {
  const { user, can } = useAuth();
  const canEdit = can('adminAccess', 'edit');
  const [accessFor, setAccessFor] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<Perms>(allAreas('edit'));
  const openAccess = (a: { id: string; name: string; permissions: Perms }) => { setDraft({ ...a.permissions }); setAccessFor({ id: a.id, name: a.name }); };
  const saveAccess = async () => {
    if (!accessFor) return;
    setBusy(true);
    try { await authApi.setAdminPermissions(accessFor.id, { permissions: draft }); setAccessFor(null); load(); }
    catch (e) { alert(errMsg(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  const [data, setData] = useState<AdminAccessData>({ requests: [], admins: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState<{ req: AdminAccessRequest; status: 'APPROVED' | 'DENIED' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    authApi.getAdminAccess().then(d => { setData(d); setError(''); }).catch(e => setError(errMsg(e, 'Could not load'))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!deciding) return;
    setBusy(true);
    try { await authApi.decideAdminRequest(deciding.req.id, deciding.status, note); setDeciding(null); setNote(''); load(); }
    catch (e) { alert(errMsg(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove administrator access for ${name}? Their account will be deleted.`)) return;
    try { await authApi.removeAdmin(id); load(); } catch (e) { alert(errMsg(e, 'Could not remove')); }
  };

  const pending = data.requests.filter(r => r.status === 'PENDING');
  const past = data.requests.filter(r => r.status !== 'PENDING');

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div><h1 className="text-3xl md:text-4xl font-bold text-gray-900">Admin Access</h1><p className="text-gray-500 text-sm">Approve or deny requests for administrator access.</p></div>
        <button className="btn-secondary" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div> : (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-brand-600 text-white font-bold text-lg">Waiting for approval ({pending.length})</div>
            {pending.length === 0 ? <p className="p-5 text-sm text-gray-400">No requests waiting.</p> : pending.map(r => (
              <div key={r.id} className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{r.name} <span className="text-gray-400 font-normal">· @{r.username}</span></p>
                  <p className="text-xs text-gray-500">{r.email} · requested {when(r.createdAt)}</p>
                  {r.reason && <p className="text-xs text-gray-700 mt-1">Reason: {r.reason}</p>}
                </div>
                <div className="flex gap-2">
                  {canEdit && <><button className="btn-primary !py-1 !px-3 text-xs" onClick={() => { setNote(''); setDeciding({ req: r, status: 'APPROVED' }); }}><Check size={12} /> Approve</button>
                  <button className="btn-primary !py-1 !px-3 text-xs !bg-red-600 hover:!bg-red-700" onClick={() => { setNote(''); setDeciding({ req: r, status: 'DENIED' }); }}><X size={12} /> Deny</button></>}
                </div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-brand-600 text-white font-bold text-lg">Current administrators ({data.admins.length})</div>
            {data.admins.map(a => (
              <div key={a.id} className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
                <ShieldCheck size={16} className="text-brand-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.name} {a.primary && <span className="ml-1 text-[11px] bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2 py-0.5">Main account</span>}</p>
                  <p className="text-xs text-gray-500">{[a.username && `@${a.username}`, a.email].filter(Boolean).join(' · ') || 'Built-in administrator'}</p>
                </div>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${accessSummary(a.permissions).cls}`}>{accessSummary(a.permissions).text}</span>
                {!a.primary && canEdit && a.id !== user?.id && <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => openAccess(a)}><KeyRound size={12} /> Access</button>}
                {!a.primary && canEdit && <button className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50" title="Remove administrator" onClick={() => remove(a.id, a.name)}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>

          {past.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 bg-brand-600 text-white font-bold text-lg">Past requests</div>
              {past.map(r => (
                <div key={r.id} className="px-5 py-3 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-2 items-center">
                  <span className="font-semibold text-gray-900 text-sm">{r.name}</span> @{r.username}
                  <span className={r.status === 'APPROVED' ? 'badge-approved' : 'badge-denied'}>{r.status}</span>
                  {r.decidedAt && <span>{when(r.decidedAt)}</span>}
                  {r.decisionNote && <span>· {r.decisionNote}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {accessFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setAccessFor(null)}>
          <div className="card w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-xl">Access for {accessFor.name}</h3>
            <p className="text-xs text-gray-500 mt-1">Choose what this administrator can do in each part of the app. Changes apply the next time they use the app.</p>
            <div className="flex gap-2 mt-3">
              <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => setDraft(allAreas('edit'))}>Full access</button>
              <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => setDraft(allAreas('view'))}>View only</button>
              <span className={`ml-auto self-center text-[11px] font-semibold rounded-full px-2 py-0.5 border ${accessSummary(draft).cls}`}>{accessSummary(draft).text}</span>
            </div>
            <table className="w-full text-sm mt-3">
              <thead><tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left py-1.5">Area</th><th className="px-3">No access</th><th className="px-3">View</th><th className="px-3">Edit</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {ACCESS_AREAS.map(area => (
                  <tr key={area.id}>
                    <td className="py-2 pr-2"><p className="font-medium text-gray-900">{area.label}</p><p className="text-[11px] text-gray-500">{area.hint}</p></td>
                    {(['none', 'view', 'edit'] as AccessLevel[]).map(l => (
                      <td key={l} className="text-center px-3">
                        <input type="radio" name={`lvl-${area.id}`} checked={draft[area.id] === l} onChange={() => setDraft(d => ({ ...d, [area.id]: l }))} aria-label={`${area.label}: ${l}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-3">View means they can open and read it but cannot approve, deny, change, delete, import or send anything. Edit includes view.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" disabled={busy} onClick={() => setAccessFor(null)}>Close</button>
              <button className="btn-primary" disabled={busy} onClick={saveAccess}>{busy ? 'Saving...' : 'Save access'}</button>
            </div>
          </div>
        </div>
      )}

      {deciding && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setDeciding(null)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-xl">{deciding.status === 'APPROVED' ? 'Approve' : 'Deny'} administrator access</h3>
            <p className="text-xs text-gray-500 mt-1">{deciding.req.name} · @{deciding.req.username}</p>
            {deciding.status === 'APPROVED' && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">This person will be able to see all employee records, approve leave and change settings. Only approve people you know.</p>}
            <label className="form-label mt-4">Note (optional)</label>
            <textarea className="form-input" rows={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-secondary" disabled={busy} onClick={() => setDeciding(null)}>Close</button>
              <button className={deciding.status === 'DENIED' ? 'btn-primary !bg-red-600 hover:!bg-red-700' : 'btn-primary'} disabled={busy} onClick={save}>{busy ? 'Saving…' : deciding.status === 'APPROVED' ? 'Approve' : 'Deny'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}