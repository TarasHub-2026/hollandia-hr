import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { loansApi } from '../api/loans';
import type { PayrollImportResult } from '../types';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** HR posts the loan deductions payroll took (from the payroll app's report), previewing before anything is saved. */
export default function PayrollImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<PayrollImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setResult(null);
    try { setText(await f.text()); setFileName(f.name); } catch { setErr('Could not read that file.'); }
  };
  const run = async (commit: boolean) => {
    setErr(''); setBusy(true);
    try { const r = await loansApi.importPayments(text, commit); setResult(r); if (commit) onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The import failed'); }
    finally { setBusy(false); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob(['Employee Number,Pay Date,Loan Deduction\n61,2026-11-20,150.00\n'], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'loan-deductions-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const tone = (s: string) => s === 'OK' ? 'text-green-700' : s === 'DUPLICATE' ? 'text-gray-500' : 'text-red-700';
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 md:p-8" onClick={onClose}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Import payroll loan deductions</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-gray-600">
            Export the loan deductions from your payroll app as a CSV with three columns: <strong>employee number</strong>, <strong>pay date</strong> (2026-11-20 or 11/20/2026) and <strong>amount</strong>.
            Each deduction lowers that employee&apos;s loan (oldest loan first). A row that was already posted is skipped, so importing the same file twice is safe.{' '}
            <button className="text-brand-700 font-semibold hover:underline" onClick={template}>Download a template</button>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary cursor-pointer"><Upload size={14} /> Choose CSV file
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {fileName && <span className="text-gray-700 font-medium">{fileName}</span>}
          </div>
          <textarea className="form-input font-mono text-xs min-h-[110px]" placeholder="…or paste the rows here" value={text} onChange={e => { setText(e.target.value); setResult(null); setFileName(''); }} />
          {err && <p className="text-red-600">{err}</p>}

          {result && (
            <div className="space-y-2">
              <div className={`flex items-start gap-2 rounded-lg p-3 ${result.committed ? 'bg-green-50 text-green-900' : 'bg-blue-50 text-blue-900'}`}>
                {result.committed ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
                <p>
                  {result.committed ? 'Posted' : 'Ready to post'} <strong>{result.summary.ok}</strong> payment{result.summary.ok === 1 ? '' : 's'} totalling <strong>{money(result.summary.total)}</strong>.
                  {result.summary.duplicate > 0 && <> {result.summary.duplicate} already posted (skipped).</>}
                  {result.summary.error > 0 && <> <strong>{result.summary.error}</strong> row{result.summary.error === 1 ? '' : 's'} with a problem {result.committed ? 'were not posted' : 'will not be posted'}.</>}
                </p>
              </div>
              <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-500">
                    <th className="p-2">Row</th><th className="p-2">Employee</th><th className="p-2">Date</th><th className="p-2 text-right">Amount</th><th className="p-2">Result</th>
                  </tr></thead>
                  <tbody>
                    {result.rows.map(r => (
                      <tr key={r.line} className="border-t border-gray-100">
                        <td className="p-2">{r.line}</td>
                        <td className="p-2">{r.employeeName ? `${r.employeeName} (#${r.employeeNumber})` : `#${r.employeeNumber}`}</td>
                        <td className="p-2">{r.date}</td>
                        <td className="p-2 text-right tabular-nums">{r.amount !== null ? money(r.amount) : ''}</td>
                        <td className={`p-2 ${tone(r.status)}`}>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button className="btn-secondary" onClick={onClose}>{result?.committed ? 'Close' : 'Cancel'}</button>
            {!result?.committed && <button className="btn-secondary" disabled={busy || !text.trim()} onClick={() => run(false)}>{busy ? 'Checking…' : 'Preview'}</button>}
            {!result?.committed && <button className="btn-primary" disabled={busy || !result || result.summary.ok === 0} onClick={() => run(true)}>Post {result ? result.summary.ok : ''} payment{result && result.summary.ok === 1 ? '' : 's'}</button>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}