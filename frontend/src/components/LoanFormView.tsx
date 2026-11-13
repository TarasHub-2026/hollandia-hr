import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, CheckSquare } from 'lucide-react';
import { loansApi } from '../api/loans';
import type { LoanApplication } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { LOAN_AGREEMENT, AGREEMENT_TITLE, AGREE_CHECKBOX } from '../data/loanAgreement';
import { useAuth } from '../context/AuthContext';
import LoanSchedule from './LoanSchedule';
import { previewLoan, repayment } from '../utils/loanCalc';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDay = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'long' });

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 border-b border-gray-300 pb-0.5 whitespace-pre-wrap break-words">{children || '\u00a0'}</p>
    </div>
  );
}

/** The completed Employee Loan Application as it was applied for and signed by management, ready to print. */
export default function LoanFormView({ loan: summary, onClose, onChanged }: { loan: LoanApplication; onClose: () => void; onChanged?: () => void }) {
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [loan, setLoan] = useState<LoanApplication>(summary);   // the list has no drawn signature for employees, so load the full record
  const [error, setError] = useState('');
  const [proofErr, setProofErr] = useState('');

  useEffect(() => {
    let live = true;
    loansApi.get(summary.id).then(l => { if (live) setLoan(l); }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not load the full form'); });
    return () => { live = false; };
  }, [summary.id]);

  // Only the form is printed while this dialog is open; Esc closes it.
  useEffect(() => {
    document.body.classList.add('printing-loan');
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.classList.remove('printing-loan'); window.removeEventListener('keydown', key); };
  }, [onClose]);

  const startEdit = () => { setText(String(loan.biweekly)); setSaveErr(''); setEditing(true); };
  const saveAmort = async () => {
    setSaveErr(''); setBusy(true);
    try { setLoan(await loansApi.setAmortization(loan.id, parseFloat(text))); setEditing(false); onChanged?.(); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  const preview = editing ? previewLoan(loan.amount, parseFloat(text)) : null;
  const rep = repayment(loan.amount, loan.estimatedInterest, loan.biweekly, loan.payments);

  const approved = loan.status === 'APPROVED';
  const statusText = loan.status === 'APPROVED' ? 'APPROVED' : loan.status === 'DENIED' ? 'DENIED' : 'PENDING REVIEW';
  const statusCls = loan.status === 'APPROVED' ? 'text-green-700 border-green-700' : loan.status === 'DENIED' ? 'text-red-700 border-red-700' : 'text-yellow-700 border-yellow-700';

  return createPortal(
    <div className="loan-print-backdrop fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 md:p-8" onClick={onClose}>
      <div className="loan-print-area max-w-3xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="print-hide flex items-center justify-between gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">Loan application form</span>
          <div className="flex items-center gap-2">
            {loan.hasProof && (
              <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => { setProofErr(''); loansApi.openProof(loan.id).catch(e => setProofErr(e instanceof Error ? e.message : 'Could not open the file')); }}>
                <FileText size={13} /> View proof
              </button>
            )}
            <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => window.print()}><Printer size={13} /> Print</button>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
          </div>
        </div>
        {(error || proofErr) && <p className="print-hide px-4 py-2 text-xs text-red-700 bg-red-50">{error || proofErr}</p>}

        <div className="p-6 md:p-10 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700">Hollandia Greenhouses Ltd.</p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Loan Application</h1>
            <span className={`inline-block mt-1 px-3 py-0.5 border-2 rounded text-xs font-bold tracking-widest ${statusCls}`}>{statusText}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Reference">{loan.id.slice(0, 8)}</Field>
            <Field label="Date of application">{longDay(loan.submittedAt)}{loan.onBehalf ? ' (entered by HR)' : ''}</Field>
            <Field label="Employee name">{loan.employeeName}</Field>
            <Field label="Employee number">{loan.employeeNumber}</Field>
            <Field label="Department">{DEPARTMENT_LABELS[loan.department] || loan.department}</Field>
            <Field label="Email">{loan.email}</Field>
          </div>

          <p className="text-sm font-semibold">I would like to apply for an employee loan from my employer Hollandia Greenhouses Ltd.</p>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Details of Loan</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Amount">{money(loan.amount)}</Field>
              <Field label="Interest">{`${(loan.interestRate * 100).toFixed(0)}% per annum`}</Field>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Bi-weekly amortization</p>
                {editing ? (
                  <div className="print-hide space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">$</span>
                      <input type="number" min={0.01} step="0.01" autoFocus className="form-input !w-32 !py-1" value={text} onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveAmort(); }} />
                      <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy || !preview} onClick={saveAmort}>Save</button>
                      <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                    {preview
                      ? <p className="text-xs text-gray-600">{preview.payments} payments (last {money(preview.lastPayment)}) · interest {money(preview.interest)} · total {money(preview.total)}</p>
                      : <p className="text-xs text-red-600">Enter an amount greater than 0.</p>}
                    {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-gray-900 border-b border-gray-300 pb-0.5">
                    {money(loan.biweekly)} x {loan.payments} payments
                    {isAdmin && <button className="print-hide ml-3 text-xs font-semibold text-brand-700 hover:underline" onClick={startEdit}>Change</button>}
                  </p>
                )}
              </div>
              <Field label="Estimated interest">{money(loan.estimatedInterest)}</Field>
              <Field label="Total to repay (principal + interest)">{money(rep.total)}</Field>
              <Field label="Final payment">{money(rep.lastPayment)}</Field>
              <Field label="Purpose of loan" wide>{loan.purpose}</Field>
              <Field label="Proof of medical emergency" wide>{loan.hasProof ? `Attached (${loan.proofName || 'file'})` : 'None uploaded'}</Field>
            </div>
          </div>

          <LoanSchedule loan={loan} isAdmin={isAdmin} onUpdated={l => { setLoan(l); onChanged?.(); }} />

          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">{AGREEMENT_TITLE}</h2>
            {LOAN_AGREEMENT.map(sec => (
              <div key={sec.title} className="space-y-1 text-[13px] leading-snug">
                <p className="font-bold text-gray-900">{sec.title}</p>
                {sec.paras.map((t, i) => <p key={i} className="text-gray-800">{t}</p>)}
              </div>
            ))}
            <p className="flex items-start gap-2 text-sm"><CheckSquare size={15} className="shrink-0 mt-0.5 text-gray-800" /><span>{AGREE_CHECKBOX}</span></p>            <p className="text-xs text-gray-600">Agreed to by {loan.employeeName} ({loan.employeeNumber}) when applying on {longDay(loan.submittedAt)}.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 pt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Applicant</p>
              <p className="border-b border-gray-400 pb-1 text-sm font-semibold min-h-[3rem] flex items-end">{loan.employeeName}</p>
              <p className="text-[11px] text-gray-500 mt-1">Applied {longDay(loan.submittedAt)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Signature of Management</p>
              <div className="border-b border-gray-400 pb-1 min-h-[3rem] flex items-end">
                {approved && loan.signature ? (
                  loan.signatureType === 'DRAWN'
                    ? <img src={loan.signature} alt="Management signature" className="h-14" />
                    : <span className="text-2xl italic text-gray-900" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>{loan.signature}</span>
                ) : <span className="text-xs text-gray-400">{approved ? 'Signature not on file' : loan.status === 'DENIED' ? 'Not signed (denied)' : 'Awaiting management signature'}</span>}
              </div>
              {approved && loan.decidedAt && <p className="text-[11px] text-gray-500 mt-1">{loan.signatureName ? `${loan.signatureName} · ` : ''}Approved {longDay(loan.decidedAt)}</p>}
              {loan.status === 'DENIED' && loan.decidedAt && <p className="text-[11px] text-gray-500 mt-1">Denied {longDay(loan.decidedAt)}</p>}
            </div>
          </div>
          {loan.decisionNote && <p className="text-xs text-gray-700"><strong>Note from HR:</strong> {loan.decisionNote}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
