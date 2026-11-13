import React, { useState } from 'react';
import { Pencil, CheckCircle2, Bell, AlertTriangle } from 'lucide-react';
import { loansApi } from '../api/loans';
import type { LoanApplication } from '../types';
import SignaturePad, { SignatureValue } from './SignaturePad';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayOf = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const sameRef = (a: string | null, b: string | null) => !!a && !!b && a.replace(/\s|^0+/g, '').toLowerCase() === b.replace(/\s|^0+/g, '').toLowerCase();
const fail = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** HR/Accounting comment when an application is received. Internal: the employee never sees it. */
export function ReviewComment({ loan, onChanged }: { loan: LoanApplication; onChanged: () => void }) {
  const [text, setText] = useState(loan.reviewComment || '');
  const [editing, setEditing] = useState(!loan.reviewComment && loan.status === 'PENDING');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try { await loansApi.saveReview(loan.id, text); setEditing(false); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save the comment')); }
    finally { setBusy(false); }
  };
  if (!editing) {
    return (
      <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-gray-400">HR / Accounting comment (internal, not shown to the employee)</p>
          {loan.reviewComment
            ? <><p className="text-gray-800 whitespace-pre-wrap break-words">{loan.reviewComment}</p><p className="text-gray-400 mt-0.5">{loan.reviewBy}{loan.reviewAt ? ` · ${dayOf(loan.reviewAt)}` : ''}</p></>
            : <p className="text-gray-500">No comment.</p>}
        </div>
        <button className="shrink-0 font-semibold text-brand-700 hover:underline" onClick={() => { setText(loan.reviewComment || ''); setEditing(true); }}><Pencil size={11} className="inline -mt-0.5" /> {loan.reviewComment ? 'Edit' : 'Add comment'}</button>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-xs">
      <label className="block font-semibold text-gray-700">HR / Accounting comment on receiving this application <span className="font-normal text-gray-400">(internal, not shown to the employee)</span></label>
      <textarea className="form-input text-sm min-h-[70px]" maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="For example: documents checked, employee contacted, anything management should know" />
      <div className="flex items-center gap-2">
        <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy || text.trim() === (loan.reviewComment || '')} onClick={save}>Save comment</button>
        {loan.reviewComment && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>}
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </div>
  );
}

/** Accounting enters the cheque once the loan is approved; the first save tells the employee it is ready for pick up. */
export function ChequePanel({ loan, onChanged }: { loan: LoanApplication; onChanged: () => void }) {
  const ready = !!loan.chequeReadyAt;
  const [number, setNumber] = useState(loan.chequeNumber || '');
  const [date, setDate] = useState(loan.chequeDate || today());
  const [note, setNote] = useState(loan.chequeNote || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const save = async (notify?: boolean) => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      await loansApi.saveCheque(loan.id, { chequeNumber: number.trim(), chequeDate: date || undefined, note: note.trim() || undefined, notify });
      setMsg(!ready ? 'Saved. The employee was told the cheque is ready for pick up.' : notify ? 'The employee was notified again.' : 'Saved.');
      onChanged();
    } catch (e) { setErr(fail(e, 'Could not save the cheque')); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">
      <p className="text-sm font-bold text-gray-900">Cheque (Accounting) <span className="text-xs font-normal text-gray-500">for {money(loan.amount)}</span></p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <div><label className="block text-gray-500 mb-0.5">Cheque number</label><input className="form-input !py-1 !w-36" maxLength={40} value={number} onChange={e => setNumber(e.target.value)} /></div>
        <div><label className="block text-gray-500 mb-0.5">Cheque date</label><input type="date" className="form-input !py-1 !w-40" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="flex-1 min-w-[180px]"><label className="block text-gray-500 mb-0.5">Note (internal)</label><input className="form-input !py-1" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy || !number.trim()} onClick={() => save()}>
          <Bell size={13} /> {ready ? 'Save changes' : 'Save and notify employee: cheque ready for pick up'}
        </button>
        {ready && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy || !number.trim()} onClick={() => save(true)}>Notify the employee again</button>}
        {err && <span className="text-red-600">{err}</span>}
        {msg && <span className="text-green-700">{msg}</span>}
      </div>
      {ready && <p className="text-xs text-gray-500">Ready for pick up since {dayOf(loan.chequeReadyAt!)}{loan.chequeReadyBy ? ` (entered by ${loan.chequeReadyBy})` : ''}. The employee collects it from the accounting office.</p>}
      <ReceiptStatus loan={loan} hr onChanged={onChanged} />
    </div>
  );
}

/** What the employee confirmed about the cheque, for HR; HR can record it for an employee who does not use the app. */
function ReceiptStatus({ loan, hr, onChanged }: { loan: LoanApplication; hr?: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(loan.chequeReceivedOn || today());
  const [ref, setRef] = useState(loan.chequeReference || loan.chequeNumber || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!loan.chequeReadyAt) return <p className="text-xs text-gray-500">Enter the cheque to tell the employee it is ready. The employee then signs and confirms when they receive it.</p>;
  const save = async () => {
    setErr(''); setBusy(true);
    try { await loansApi.saveReceipt(loan.id, { receivedOn: on, reference: ref.trim() }); setOpen(false); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  const got = !!loan.chequeReceivedOn;
  return (
    <div className="text-xs space-y-1">
      {got ? (
        <p className="text-green-800 flex items-start gap-1.5"><CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <span>{loan.employeeSignedAt ? 'Signed by the employee' : `Recorded by ${loan.receiptByHr ? 'HR' : 'the employee'}`}: cheque received {dayOf(loan.chequeReceivedOn!)}, reference <strong>{loan.chequeReference}</strong>.</span></p>
      ) : <p className="text-amber-800">Waiting for the employee to collect the cheque, sign, and enter the date received and reference number.</p>}
      {got && loan.chequeNumber && !sameRef(loan.chequeNumber, loan.chequeReference) && (
        <p className="text-amber-800 flex items-start gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>The reference number ({loan.chequeReference}) does not match the cheque number Accounting entered ({loan.chequeNumber}). Please check.</span></p>
      )}
      {hr && !loan.employeeSignedAt && !open && (
        <button className="font-semibold text-brand-700 hover:underline" onClick={() => setOpen(true)}>{got ? 'Change the received details' : 'Record receipt for the employee'}</button>
      )}
      {hr && open && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div><label className="block text-gray-500 mb-0.5">Date received</label><input type="date" className="form-input !py-1 !w-40" max={today()} value={on} onChange={e => setOn(e.target.value)} /></div>
          <div><label className="block text-gray-500 mb-0.5">Reference number</label><input className="form-input !py-1 !w-40" maxLength={60} value={ref} onChange={e => setRef(e.target.value)} /></div>
          <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy || !on || !ref.trim()} onClick={save}>Save</button>
          <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          {err && <span className="text-red-600 w-full">{err}</span>}
        </div>
      )}
    </div>
  );
}

/** The employee's side after approval: wait for the cheque, collect it, then sign and record the date and reference number. */
export function EmployeeReceipt({ loan, onChanged }: { loan: LoanApplication; onChanged: () => void }) {
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [on, setOn] = useState(today());
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (loan.employeeSignedAt) {
    return (
      <div className="border-t border-gray-100 pt-3 text-xs text-green-800 flex items-start gap-1.5">
        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
        <span>You confirmed receiving the cheque on {dayOf(loan.chequeReceivedOn || loan.employeeSignedAt)} (reference {loan.chequeReference}). Open the form to print it.</span>
      </div>
    );
  }
  if (!loan.chequeReadyAt) {
    return <div className="border-t border-gray-100 pt-3 text-xs text-gray-600">Your loan was approved. Accounting is preparing your cheque; you will get a notice here when it is ready for pick up at the accounting office.</div>;
  }
  const submit = async () => {
    setErr('');
    if (!sig) { setErr('Sign (draw or type) to confirm.'); return; }
    if (!ref.trim()) { setErr('Enter the cheque reference number.'); return; }
    setBusy(true);
    try { await loansApi.saveReceipt(loan.id, { receivedOn: on, reference: ref.trim(), signatureType: sig.type, signature: sig.value }); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  return (
    <div className="border-t border-gray-100 pt-3 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex items-start gap-2 bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-900">
        <Bell size={16} className="shrink-0 mt-0.5" />
        <p>Your loan cheque for <strong>{money(loan.amount)}</strong> (cheque no. <strong>{loan.chequeNumber}</strong>) is <strong>ready for pick up at the accounting office</strong>. After you collect it, confirm below.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div><label className="block font-bold text-gray-900 mb-1">Date cheque received</label><input type="date" className="form-input" max={today()} value={on} onChange={e => setOn(e.target.value)} /></div>
        <div><label className="block font-bold text-gray-900 mb-1">Cheque reference number</label><input className="form-input" maxLength={60} value={ref} onChange={e => setRef(e.target.value)} placeholder="As shown on the cheque" /></div>
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900 mb-1">Your signature <span className="text-xs font-normal text-gray-500">(confirms you received the cheque and agree to the loan terms)</span></p>
        <SignaturePad onChange={setSig} />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={busy} onClick={submit}><CheckCircle2 size={15} /> Confirm I received the cheque</button>
    </div>
  );
}
