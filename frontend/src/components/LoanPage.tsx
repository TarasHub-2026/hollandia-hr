import React, { useCallback, useEffect, useState } from 'react';
import { HandCoins, RefreshCw, PlusCircle, FileText, CheckCircle2, XCircle, Clock, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loansApi } from '../api/loans';
import type { LoanApplication } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import LoanForm from './LoanForm';
import SignaturePad, { SignatureValue } from './SignaturePad';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const STATUS: Record<string, { cls: string; Icon: typeof Clock; text: string }> = {
  PENDING: { cls: 'bg-yellow-100 text-yellow-800', Icon: Clock, text: 'Pending review' },
  APPROVED: { cls: 'bg-green-100 text-green-800', Icon: CheckCircle2, text: 'Approved' },
  DENIED: { cls: 'bg-red-100 text-red-800', Icon: XCircle, text: 'Denied' },
};

function StatusBadge({ s }: { s: string }) {
  const m = STATUS[s] || STATUS.PENDING;
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.cls}`}><m.Icon size={12} /> {m.text}</span>;
}

function ProofButton({ loan }: { loan: LoanApplication }) {
  const [err, setErr] = useState('');
  if (!loan.hasProof) return <span className="text-xs text-gray-400">No proof uploaded</span>;
  return (
    <span>
      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => { setErr(''); loansApi.openProof(loan.id).catch(e => setErr(e instanceof Error ? e.message : 'Could not open the file')); }}>
        <FileText size={13} /> View proof
      </button>
      {err && <span className="text-xs text-red-600 ml-2">{err}</span>}
    </span>
  );
}

function Summary({ loan, hr }: { loan: LoanApplication; hr?: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div><p className="text-gray-400">Amount</p><p className="font-bold text-gray-900 text-sm">{money(loan.amount)}</p></div>
      <div><p className="text-gray-400">Applied</p><p className="font-semibold text-gray-800 text-sm">{day(loan.submittedAt)}{loan.onBehalf ? ' (by HR)' : ''}</p>{loan.edited && <p className="text-[11px] text-orange-700 font-semibold">Changed by the employee {day(loan.updatedAt)}</p>}</div>
      <div className="col-span-2 md:col-span-4"><p className="text-gray-400">Purpose</p><p className="text-gray-800 whitespace-pre-wrap">{loan.purpose}</p></div>
      {hr && (
        <div className="col-span-2 md:col-span-4 bg-gray-50 rounded-lg px-3 py-2 text-gray-700">
          Loan record now: {loan.currentLoan.original > 0
            ? <><strong>{money(loan.currentLoan.remaining)}</strong> left of {money(loan.currentLoan.original)} ({loan.currentLoan.repaidPercent}% repaid)</>
            : <strong>no loan on record</strong>}
          {loan.status === 'PENDING' && loan.currentLoan.remaining > 0 && <span className="text-yellow-800"> · this employee still owes on an earlier loan; an approved loan is added to it.</span>}
        </div>
      )}
      {loan.status !== 'PENDING' && (
        <div className="col-span-2 md:col-span-4 border-t border-gray-100 pt-2 space-y-1">
          <p className="text-gray-600">{loan.status === 'APPROVED' ? 'Approved' : 'Denied'} on {loan.decidedAt ? day(loan.decidedAt) : ''}{loan.decisionNote ? ` · Note: ${loan.decisionNote}` : ''}</p>
          {loan.status === 'APPROVED' && loan.signature && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Signature of Management:</span>
              {loan.signatureType === 'DRAWN'
                ? <img src={loan.signature} alt="Management signature" className="h-12 bg-white border border-gray-200 rounded" />
                : <span className="text-xl italic text-gray-800" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>{loan.signature}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ loan, onDone }: { loan: LoanApplication; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (status: 'APPROVED' | 'DENIED') => {
    setError('');
    if (status === 'APPROVED' && !sig) { setError('Sign (draw or type) as management to approve.'); return; }
    if (status === 'APPROVED' && !window.confirm(`Approve ${money(loan.amount)} for ${loan.employeeName}? It will be added to their loan record.`)) return;
    setBusy(true);
    try {
      await loansApi.decide(loan.id, { status, note: note.trim() || undefined, signatureType: sig?.type, signature: sig?.value, updatedAt: loan.updatedAt });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the decision'); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-gray-900 mb-1">Signature of Management <span className="text-xs font-normal text-gray-500">(required to approve)</span></p>
        <SignaturePad onChange={setSig} />
      </div>
      <input className="form-input" placeholder="Note to the employee (optional)" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => decide('APPROVED')}><CheckCircle2 size={15} /> Approve</button>
        <button className="btn-danger" disabled={busy} onClick={() => decide('DENIED')}><XCircle size={15} /> Deny</button>
      </div>
    </div>
  );
}

export default function LoanPage() {
  const { isAdmin, refreshUser } = useAuth();
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [editingPending, setEditingPending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    loansApi.list().then(setLoans).catch(e => setError(e instanceof Error ? e.message : 'Could not load loans')).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const pending = loans.filter(l => l.status === 'PENDING');
  const shown = isAdmin && filter === 'PENDING' ? pending : loans;
  const afterChange = () => { load(); refreshUser().catch(() => {}); };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-2"><HandCoins size={26} /> {isAdmin ? 'Loan Applications' : 'Employee Loan'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAdmin
              ? 'Review employee loan applications. An approved loan is added to the employee\u2019s loan record, which is used for the 50% repayment rule on leave.'
              : 'Loans are extended for emergency or medical purposes only. Any loan must be at least 50% repaid before a leave request can be approved.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={load}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          {isAdmin && !showForm && <button className="btn-primary" onClick={() => setShowForm(true)}><PlusCircle size={15} /> New application for an employee</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* Employees: form unless one is already waiting. HR: only when they choose to enter one. */}
      {isAdmin ? (
        showForm && <LoanForm onDone={afterChange} onCancel={() => setShowForm(false)} />
      ) : pending.length ? (
        editingPending ? (
          <LoanForm editing={pending[0]} onDone={load} onCancel={() => { setEditingPending(false); afterChange(); }} />
        ) : (
          <div className="card p-4 text-sm bg-yellow-50 border-yellow-300 text-yellow-900 flex flex-wrap items-center justify-between gap-3">
            <p>You already have a loan application waiting for HR review. You can change it until HR decides.</p>
            <button className="btn-primary" onClick={() => setEditingPending(true)}><Pencil size={14} /> Change my application</button>
          </div>
        )
      ) : (
        <LoanForm onDone={afterChange} />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{isAdmin ? 'Applications' : 'My loan applications'}</h2>
          {isAdmin && (
            <div className="flex gap-1 text-xs">
              <button className={`px-3 py-1 rounded-full font-semibold ${filter === 'PENDING' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`} onClick={() => setFilter('PENDING')}>Pending ({pending.length})</button>
              <button className={`px-3 py-1 rounded-full font-semibold ${filter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`} onClick={() => setFilter('ALL')}>All ({loans.length})</button>
            </div>
          )}
        </div>
        {!loading && shown.length === 0 && (
          <div className="card p-8 text-center text-gray-400 text-sm">{isAdmin ? (filter === 'PENDING' ? 'No loan applications waiting for review.' : 'No loan applications yet.') : 'You have not applied for a loan.'}</div>
        )}
        {shown.map(l => (
          <div key={l.id} className="card p-4 md:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {isAdmin && <p className="font-bold text-gray-900">{l.employeeName} <span className="text-xs font-normal text-gray-500">#{l.employeeNumber} · {DEPARTMENT_LABELS[l.department] || l.department}</span></p>}
                {!isAdmin && <p className="font-bold text-gray-900">{money(l.amount)} loan</p>}
              </div>
              <div className="flex items-center gap-3"><ProofButton loan={l} /><StatusBadge s={l.status} /></div>
            </div>
            <Summary loan={l} hr={isAdmin} />
            {isAdmin && l.status === 'PENDING' && <ReviewPanel loan={l} onDone={afterChange} />}
          </div>
        ))}
      </div>
    </div>
  );
}
