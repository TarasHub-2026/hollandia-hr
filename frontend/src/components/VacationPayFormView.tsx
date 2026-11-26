import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { VacationPayRequest } from '../api/vacationPay';
import { shownAmount } from '../api/vacationPay';
import { DEPARTMENT_LABELS } from '../types';
import { SignatureView } from './VacationPayWorkflow';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDay = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('en-CA', { dateStyle: 'long' });

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 border-b border-gray-300 pb-0.5 whitespace-pre-wrap break-words">{children || '\u00a0'}</p>
    </div>
  );
}
const Box = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <p className="flex items-start gap-2 text-sm text-gray-900"><span className="inline-flex w-4 h-4 mt-0.5 border border-gray-700 items-center justify-center text-xs font-bold shrink-0">{on ? '\u2713' : ''}</span>{children}</p>
);

/** The completed Request Form: Vacation Pay, with the answer and signatures, ready to print. */
export default function VacationPayFormView({ req, onClose }: { req: VacationPayRequest; onClose: () => void }) {
  // Only the form is printed while this dialog is open (same print rules as the loan form); Esc closes it.
  useEffect(() => {
    document.body.classList.add('printing-loan');
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.classList.remove('printing-loan'); window.removeEventListener('keydown', key); };
  }, [onClose]);

  const approved = req.status === 'APPROVED', denied = req.status === 'DENIED';
  const statusText = approved ? 'APPROVED' : denied ? 'DENIED' : req.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING APPROVAL';
  const statusCls = approved ? 'text-green-700 border-green-700' : denied ? 'text-red-700 border-red-700' : req.status === 'CANCELLED' ? 'text-gray-600 border-gray-600' : 'text-yellow-700 border-yellow-700';
  const amt = shownAmount(req);

  return createPortal(
    <div className="loan-print-backdrop fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 md:p-8" onClick={onClose}>
      <div className="loan-print-area max-w-3xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="print-hide flex items-center justify-between gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">Vacation pay request form</span>
          <div className="flex items-center gap-2">
            <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => window.print()}><Printer size={13} /> Print</button>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 md:p-10 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700">Hollandia Greenhouses Ltd.</p>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 uppercase">Request Form: Vacation Pay<span className="block text-base text-gray-600">Formulario de solicitud: pago de vacaciones</span></h1>
            <span className={`inline-block mt-1 px-3 py-0.5 border-2 rounded text-xs font-bold tracking-widest ${statusCls}`}>{statusText}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Today's date / Fecha">{longDay(req.requestDate)}</Field>
            <Field label="Employee number">{req.employeeNumber}</Field>
            <Field label="Name / Nombre">{req.employeeName}</Field>
            <Field label="Department">{DEPARTMENT_LABELS[req.department as keyof typeof DEPARTMENT_LABELS] || req.department}</Field>
            <Field label="Email" wide>{req.email}</Field>
          </div>

          <div className="space-y-2" style={{ breakInside: 'avoid' }}>
            <h2 className="text-base font-bold text-gray-900 uppercase">What is your request / Cu&aacute;l es su solicitud</h2>
            <Box on={req.retain}>Retain my vacation pay <span className="text-gray-500">(Retener mi paga de vacaciones)</span></Box>
            <Box on={req.withdraw}>Withdraw my vacation pay <span className="text-gray-500">(Retirar el pago de mis vacaciones)</span></Box>
            <Box on={req.terminate}>Terminate my retention of vacation pay <span className="text-gray-500">(Terminar mi retenci&oacute;n de pago de vacaciones)</span></Box>
          </div>

          {req.withdraw && (
            <div className="space-y-2" style={{ breakInside: 'avoid' }}>
              <h2 className="text-base font-bold text-gray-900">Withdrawal of Vacation Pay / Retiro del pago de vacaciones</h2>
              <Field label="How much would you like to withdraw? / ¿Cuánto le gustaría retirar?">{req.withdrawAmount !== null ? money(req.withdrawAmount) : ''}</Field>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 pt-1">Is the amount:</p>
              <Box on={req.withdrawBasis === 'BEFORE'}>Before CPP, EI and Tax? <span className="text-gray-500">(&iquest;Antes de CPP, EI e impuestos?)</span></Box>
              <Box on={req.withdrawBasis === 'AFTER'}>After CPP, EI and Tax? <span className="text-gray-500">(&iquest;Despu&eacute;s de CPP, EI e impuestos?)</span></Box>
            </div>
          )}

          <div className="space-y-3" style={{ breakInside: 'avoid' }}>
            <h2 className="text-base font-bold text-gray-900">Response to your Request</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Amount available for withdrawal before tax">{(approved || denied) && amt !== null ? money(amt) : ''}</Field>
              <Field label="Pay out date">{(approved || denied) && req.payoutDate ? longDay(req.payoutDate) : ''}</Field>
              <Field label="Notes from Accounting and Payroll Office" wide>{approved || denied ? [req.accountingNotes, req.decisionNote ? `Note from HR: ${req.decisionNote}` : ''].filter(Boolean).join('\n') : ''}</Field>
            </div>
          </div>

          {approved && req.withdraw && (
            <div className="space-y-2" style={{ breakInside: 'avoid' }}>
              <h2 className="text-base font-bold text-gray-900">Receipt of Cheque</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Cheque number (Accounting)">{req.chequeNumber || ''}</Field>
                <Field label="Cheque date">{req.chequeDate ? longDay(req.chequeDate) : ''}</Field>
                <Field label="Ready for pick up at the accounting office">{req.chequeReadyAt ? longDay(req.chequeReadyAt) : ''}</Field>
                <Field label="Date cheque received">{req.chequeReceivedOn ? longDay(req.chequeReceivedOn) : ''}</Field>
                <Field label="Cheque reference number">{req.chequeReference || ''}</Field>
              </div>
              {req.receiptByHr && req.chequeReceivedOn && <p className="text-[11px] text-gray-500">Receipt details entered by HR on the employee&apos;s behalf.</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 pt-2" style={{ breakInside: 'avoid' }}>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Employee Signature / Firma del empleado</p>
              <div className="border-b border-gray-400 pb-1 min-h-[3rem] flex items-end">
                <SignatureView type={req.signatureType} value={req.signature} alt="Employee signature" className="h-14" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Requested {longDay(req.submittedAt)}</p>
              {req.employeeSignature && (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Employee signature on receipt of the cheque</p>
                  <div className="border-b border-gray-400 pb-1 min-h-[3rem] flex items-end"><SignatureView type={req.employeeSignatureType} value={req.employeeSignature} alt="Employee signature on receipt" className="h-14" /></div>
                  {req.employeeSignedAt && <p className="text-[11px] text-gray-500 mt-1">Signed {longDay(req.employeeSignedAt)}</p>}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Signature of Management</p>
              <div className="border-b border-gray-400 pb-1 min-h-[3rem] flex items-end">
                {approved && req.mgmtSignature
                  ? <SignatureView type={req.mgmtSignatureType} value={req.mgmtSignature} alt="Management signature" className="h-14" />
                  : <span className="text-xs text-gray-400">{approved ? 'Signature not on file' : denied ? 'Not signed (denied)' : 'Awaiting management signature'}</span>}
              </div>
              {(approved || denied) && req.decidedAt && <p className="text-[11px] text-gray-500 mt-1">{req.decidedBy ? `${req.decidedBy} \u00b7 ` : ''}{approved ? 'Approved' : 'Denied'} {longDay(req.decidedAt)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
