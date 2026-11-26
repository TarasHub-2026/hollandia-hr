import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, Wrench, Clock } from 'lucide-react';
import { loansApi } from '../api/loans';
import type { LoanVerifyReport } from '../api/loans';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Checks every loan record against the approved loans and posted payments, and lets HR correct a record that does not match. */
export default function LoanVerifyModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [report, setReport] = useState<LoanVerifyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const run = useCallback(() => {
    setLoading(true); setError('');
    loansApi.verify().then(setReport).catch(e => setError(e instanceof Error ? e.message : 'Could not check the loans')).finally(() => setLoading(false));
  }, []);
  useEffect(run, [run]);

  const fix = async (ids: string[], label: string) => {
    if (!window.confirm(`Correct the loan record for ${label}? It will be set to the figures worked out from the approved loans and posted payments. This is recorded in the audit log.`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const res = await loansApi.fixRecords(ids);
      setReport(res.report);
      setMsg(res.changed.length ? `Corrected ${res.changed.length} loan record${res.changed.length === 1 ? '' : 's'}: ${res.changed.map(c => c.name).join(', ')}.` : 'Nothing needed changing.');
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not correct the record'); }
    finally { setBusy(false); }
  };

  const fixable = report?.rows.filter(r => r.fixable) ?? [];
  const stat = (n: number, label: string, cls: string) => <div className={`rounded-lg p-3 text-center ${cls}`}><p className="text-2xl font-bold">{n}</p><p className="text-xs">{label}</p></div>;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 md:p-8" onClick={onClose}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-900 text-xl flex items-center gap-2"><ShieldCheck size={18} /> Verify all loans</h2>
          <div className="flex items-center gap-2">
            <button className="btn-secondary !py-1 !px-2 text-xs" onClick={run} disabled={loading || busy}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Check again</button>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-gray-600">Compares each employee&apos;s loan record (the figures used for the 50% repayment rule on leave) with the loans HR approved and the payments posted against them. Nothing is changed until you choose to correct a record.</p>
          {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</p>}
          {msg && <p className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs">{msg}</p>}
          {loading && !report && <p className="text-gray-400">Checking...</p>}
          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {stat(report.employeesWithLoans, 'Employees with a loan', 'bg-gray-50 text-gray-800')}
                {stat(report.ok, 'Records that match', 'bg-green-50 text-green-800')}
                {stat(report.withProblems, 'Need attention', report.withProblems ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-500')}
                {stat(report.withFollowUps, 'Follow-ups open', report.withFollowUps ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500')}
              </div>
              <p className="text-xs text-gray-500">{report.loansChecked} approved loan{report.loansChecked === 1 ? '' : 's'} and {report.paymentsChecked} posted payment{report.paymentsChecked === 1 ? '' : 's'} checked.
                {report.recordOnly > 0 ? ` ${report.recordOnly} employee${report.recordOnly === 1 ? ' has' : 's have'} a loan record with no approved application in the app (for example a loan from before the app), so that record cannot be checked.` : ''}</p>

              {report.rows.length === 0 && <p className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex items-center gap-2"><CheckCircle2 size={16} /> Every loan record matches the approved loans and payments.</p>}
              {fixable.length > 1 && <button className="btn-primary" disabled={busy} onClick={() => fix(fixable.map(r => r.employeeId), `all ${fixable.length} employees listed as fixable`)}><Wrench size={14} /> Correct all {fixable.length} records</button>}

              {report.rows.map(r => (
                <div key={r.employeeId} className={`border rounded-lg p-3 space-y-2 ${r.problems.length ? 'border-red-200' : 'border-amber-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-bold text-gray-900">{r.name} <span className="text-gray-400 font-normal text-xs">#{r.employeeNumber || '\u2014'}</span></p>
                    {r.fixable && <button className="btn-secondary !py-1 !px-2 text-xs" disabled={busy} onClick={() => fix([r.employeeId], r.name)}><Wrench size={13} /> Correct the record</button>}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded p-2"><p className="text-gray-400">Loan record now</p><p className="font-semibold">{money(r.recordRemaining)} left of {money(r.recordOriginal)} ({r.recordRepaidPercent}% repaid)</p></div>
                    {r.expectedRemaining !== null && r.expectedOriginal !== null && (
                      <div className="bg-green-50 rounded p-2"><p className="text-gray-400">From approved loans and payments</p><p className="font-semibold">{money(r.expectedRemaining)} left of {money(r.expectedOriginal)} ({r.expectedRepaidPercent}% repaid)</p></div>
                    )}
                  </div>
                  {r.problems.map((p, i) => <p key={i} className="text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {p}</p>)}
                  {r.followUps.map((p, i) => <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5"><Clock size={13} className="shrink-0 mt-0.5" /> {p}</p>)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
