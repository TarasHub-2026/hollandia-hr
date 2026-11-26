import React, { useState } from 'react';
import { Pencil, CheckCircle2, Bell, AlertTriangle, XCircle, Mail, Save } from 'lucide-react';
import { vacationPayApi, shownAmount } from '../api/vacationPay';
import type { VacationPayRequest, EmailStatus } from '../api/vacationPay';
import SignaturePad from './SignaturePad';
import type { SignatureValue } from './SignaturePad';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dayOf = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
const sameRef = (a: string | null, b: string | null) => !!a && !!b && a.replace(/\s|^0+/g, '').toLowerCase() === b.replace(/\s|^0+/g, '').toLowerCase();
const fail = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const SCRIPT = { fontFamily: '"Brush Script MT", "Segoe Script", cursive' };

/** A drawn or typed signature. */
export function SignatureView({ type, value, alt, className }: { type: 'DRAWN' | 'TYPED' | null; value: string | null; alt: string; className?: string }) {
  if (!value) return null;
  return type === 'DRAWN'
    ? <img src={value} alt={alt} className={className || 'h-12 bg-white border border-gray-200 rounded'} />
    : <span className="text-xl italic text-gray-800" style={SCRIPT}>{value}</span>;
}

export const EMAIL_MSG: Record<EmailStatus, { ok: boolean; text: string }> = {
  sent: { ok: true, text: 'Saved. The employee was told in the app and emailed.' },
  skipped: { ok: true, text: 'Saved.' },
  not_configured: { ok: false, text: 'Saved and the employee was told in the app, but email is not set up on the server, so no email was sent.' },
  no_email: { ok: false, text: 'Saved and the employee was told in the app, but there is no valid email address for this employee.' },
  failed: { ok: false, text: 'Saved and the employee was told in the app, but the email could not be sent.' },
};

/** HR / Accounting comment when a request is received. Internal: the employee never sees it. */
export function ReviewComment({ req, canEdit, onChanged }: { req: VacationPayRequest; canEdit: boolean; onChanged: () => void }) {
  const [text, setText] = useState(req.reviewComment || '');
  const [editing, setEditing] = useState(!req.reviewComment && req.status === 'PENDING' && canEdit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try { await vacationPayApi.saveReview(req.id, text); setEditing(false); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save the comment')); }
    finally { setBusy(false); }
  };
  if (!editing) {
    return (
      <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-gray-400">HR / Accounting comment (internal, not shown to the employee)</p>
          {req.reviewComment
            ? <><p className="text-gray-800 whitespace-pre-wrap break-words">{req.reviewComment}</p><p className="text-gray-400 mt-0.5">{req.reviewBy}{req.reviewAt ? ` \u00b7 ${dayOf(req.reviewAt)}` : ''}</p></>
            : <p className="text-gray-500">No comment.</p>}
        </div>
        {canEdit && <button className="shrink-0 font-semibold text-brand-700 hover:underline" onClick={() => { setText(req.reviewComment || ''); setEditing(true); }}><Pencil size={11} className="inline -mt-0.5" /> {req.reviewComment ? 'Edit' : 'Add comment'}</button>}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-xs">
      <label className="block font-semibold text-gray-700">HR / Accounting comment on receiving this request <span className="font-normal text-gray-400">(internal, not shown to the employee)</span></label>
      <textarea className="form-input text-sm min-h-[70px]" maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="For example: vacation pay balance checked, employee contacted, anything management should know" />
      <div className="flex items-center gap-2">
        <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy || text.trim() === (req.reviewComment || '')} onClick={save}>Save comment</button>
        {req.reviewComment && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>}
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </div>
  );
}

/** HR / Accounting prepare the response: amount available before tax, pay out date and notes. After approval it can be updated and the employee told. */
export function DetailsPanel({ req, canEdit, onChanged }: { req: VacationPayRequest; canEdit: boolean; onChanged: () => void }) {
  const approved = req.status === 'APPROVED';
  const [amount, setAmount] = useState(req.amountAvailable !== null ? String(req.amountAvailable) : '');
  const [payout, setPayout] = useState(req.payoutDate ? req.payoutDate.split('T')[0] : '');
  const [notes, setNotes] = useState(req.accountingNotes || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (notify?: boolean, email?: boolean) => {
    setBusy(true); setMsg(null);
    try {
      const res = await vacationPayApi.saveDetails(req.id, { amountAvailable: amount, notes, payoutDate: payout, notify, email });
      setMsg(notify || email ? EMAIL_MSG[res.emailStatus] : { ok: true, text: approved ? 'Saved.' : 'Saved. The employee is told when management decides.' });
      onChanged();
    } catch (e) { setMsg({ ok: false, text: fail(e, 'Could not save') }); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">
      <p className="text-sm font-bold text-gray-900">Response to the request <span className="text-xs font-normal text-gray-500">{approved ? '(approved: changes can be sent to the employee)' : '(prepared by HR / Accounting; the employee sees it once management decides)'}</span></p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="form-label">Amount available for withdrawal before tax ($)</label><input type="number" min="0" step="0.01" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} disabled={!canEdit} /></div>
        <div><label className="form-label">Pay out date</label><input type="date" className="form-input" value={payout} onChange={e => setPayout(e.target.value)} disabled={!canEdit} /></div>
      </div>
      <div><label className="form-label">Notes from Accounting and Payroll Office</label><textarea className="form-input min-h-[70px]" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit} /></div>
      {msg && <p className={`text-xs flex items-start gap-1 ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />} {msg.text}</p>}
      {approved && req.respondedAt && <p className="text-[11px] text-gray-500">Last updated {dayOf(req.respondedAt)}{req.respondedBy ? ` by ${req.respondedBy}` : ''}{req.emailedAt ? ` \u00b7 emailed ${dayOf(req.emailedAt)}` : ''}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => save()}><Save size={13} /> Save details</button>
          {approved && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => save(true, false)}><Bell size={13} /> Save and tell the employee</button>}
          {approved && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => save(true, true)}><Mail size={13} /> Email response to employee</button>}
        </div>
      )}
    </div>
  );
}

/** Management decision. Only the main administrator account sees the Approve and Deny buttons. */
export function DecisionPanel({ req, isMain, onChanged }: { req: VacationPayRequest; isMain: boolean; onChanged: () => void }) {
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [full, setFull] = useState(true);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isMain) {
    return <div className="border-t border-gray-100 pt-3 text-xs text-gray-600">Waiting for the main administrator account (HR Administrator) to approve or deny this request. HR / Accounting can add a comment and prepare the response above.</div>;
  }
  const available = req.amountAvailable;
  const approvedAmount = full ? available : Math.round(parseFloat(amountText) * 100) / 100;
  const decide = async (status: 'APPROVED' | 'DENIED') => {
    setError('');
    if (status === 'APPROVED') {
      if (req.withdraw && !(approvedAmount && approvedAmount > 0)) { setError('Enter the amount to approve. Prepare the amount available above, or approve a different amount.'); return; }
      if (!full && available !== null && approvedAmount !== null && approvedAmount > available) { setError(`The approved amount cannot be more than the ${money(available)} available before tax.`); return; }
      if (!sig) { setError('Sign (draw or type) as management to approve.'); return; }
      if (!window.confirm(`Approve this vacation pay request for ${req.employeeName}${approvedAmount ? ` (${money(approvedAmount)} before tax)` : ''}? The employee will be told.`)) return;
    } else if (!window.confirm(`Deny this vacation pay request from ${req.employeeName}? The employee will be told.`)) return;
    setBusy(true);
    try {
      await vacationPayApi.decide(req.id, { status, note: note.trim() || undefined, signatureType: sig?.type, signature: sig?.value, approvedAmount: status === 'APPROVED' && approvedAmount ? String(approvedAmount) : undefined });
      onChanged();
    } catch (e) { setError(fail(e, 'Could not save the decision')); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-3 space-y-3 text-sm" onClick={e => e.stopPropagation()}>
      <p className="font-bold text-gray-900">Management decision</p>
      {req.withdraw && (
        <div className="space-y-1">
          <label className="flex items-center gap-2"><input type="radio" name={`amt-${req.id}`} checked={full} onChange={() => setFull(true)} /> Approve the amount available before tax{available !== null ? <strong>{money(available)}</strong> : <span className="text-amber-700"> (not prepared yet: enter it above, or approve a different amount)</span>}</label>
          <label className="flex items-center gap-2"><input type="radio" name={`amt-${req.id}`} checked={!full} onChange={() => setFull(false)} /> Approve a different amount
            {!full && <input type="number" min="0" step="0.01" className="form-input !py-1 !w-32" value={amountText} onChange={e => setAmountText(e.target.value)} />}</label>
        </div>
      )}
      <div>
        <p className="text-sm font-bold text-gray-900 mb-1">Signature of Management <span className="text-xs font-normal text-gray-500">(required to approve)</span></p>
        <SignaturePad onChange={setSig} />
      </div>
      <div><label className="form-label">Note to the employee (optional)</label><input className="form-input" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => decide('APPROVED')}><CheckCircle2 size={15} /> Approve</button>
        <button className="btn-secondary !text-red-700" disabled={busy} onClick={() => decide('DENIED')}><XCircle size={15} /> Deny</button>
      </div>
    </div>
  );
}

/** Accounting enters the cheque once a withdrawal is approved; the first save tells the employee it is ready for pick up. */
export function ChequePanel({ req, canEdit, onChanged }: { req: VacationPayRequest; canEdit: boolean; onChanged: () => void }) {
  const ready = !!req.chequeReadyAt;
  const [number, setNumber] = useState(req.chequeNumber || '');
  const [date, setDate] = useState(req.chequeDate || today());
  const [note, setNote] = useState(req.chequeNote || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const locked = ready && !editing;

  const save = async (notify?: boolean) => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      await vacationPayApi.saveCheque(req.id, { chequeNumber: number.trim(), chequeDate: date || undefined, note: note.trim() || undefined, notify });
      setMsg(!ready ? 'Saved. The employee was told the cheque is ready for pick up.' : notify ? 'The employee was notified again.' : 'Saved.');
      setEditing(false); onChanged();
    } catch (e) { setErr(fail(e, 'Could not save the cheque')); }
    finally { setBusy(false); }
  };
  const cancel = () => { setNumber(req.chequeNumber || ''); setDate(req.chequeDate || today()); setNote(req.chequeNote || ''); setErr(''); setMsg(''); setEditing(false); };
  const amt = shownAmount(req);
  const lockCls = locked ? ' bg-gray-100 text-gray-600 cursor-not-allowed' : '';
  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">
      <p className="text-sm font-bold text-gray-900">Cheque (Accounting) {amt !== null && <span className="text-xs font-normal text-gray-500">for {money(amt)} before tax</span>}</p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <div><label className="block text-gray-500 mb-0.5">Cheque number</label><input className={`form-input !py-1 !w-36${lockCls}`} maxLength={40} value={number} disabled={locked || !canEdit} onChange={e => setNumber(e.target.value)} /></div>
        <div><label className="block text-gray-500 mb-0.5">Cheque date</label><input type="date" className={`form-input !py-1 !w-40${lockCls}`} value={date} disabled={locked || !canEdit} onChange={e => setDate(e.target.value)} /></div>
        <div className="flex-1 min-w-[180px]"><label className="block text-gray-500 mb-0.5">Note (internal)</label><input className={`form-input !py-1${lockCls}`} maxLength={500} value={note} disabled={locked || !canEdit} onChange={e => setNote(e.target.value)} /></div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {locked ? (
            <>
              <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => { setMsg(''); setErr(''); setEditing(true); }}><Pencil size={12} /> Modify</button>
              <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy || !number.trim()} onClick={() => save(true)}><Bell size={13} /> Notify the employee again</button>
            </>
          ) : (
            <>
              <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy || !number.trim()} onClick={() => save()}><Bell size={13} /> {ready ? 'Save changes' : 'Save and notify employee: cheque ready for pick up'}</button>
              {ready && <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={cancel}>Cancel</button>}
            </>
          )}
          {err && <span className="text-red-600">{err}</span>}
          {msg && <span className="text-green-700">{msg}</span>}
        </div>
      )}
      {ready && <p className="text-xs text-gray-500">Ready for pick up since {dayOf(req.chequeReadyAt!)}{req.chequeReadyBy ? ` (entered by ${req.chequeReadyBy})` : ''}. The employee collects it from the accounting office.</p>}
      <ReceiptStatus req={req} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

/** What the employee confirmed about the cheque, for HR; HR can record it for an employee who does not use the app. */
function ReceiptStatus({ req, canEdit, onChanged }: { req: VacationPayRequest; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(req.chequeReceivedOn || today());
  const [ref, setRef] = useState(req.chequeReference || req.chequeNumber || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!req.chequeReadyAt) return <p className="text-xs text-gray-500">Enter the cheque to tell the employee it is ready. The employee then signs and confirms when they receive it.</p>;
  const save = async () => {
    setErr(''); setBusy(true);
    try { await vacationPayApi.saveReceipt(req.id, { receivedOn: on, reference: ref.trim() }); setOpen(false); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  const got = !!req.chequeReceivedOn;
  return (
    <div className="text-xs space-y-1">
      {got ? (
        <p className="text-green-800 flex items-start gap-1.5"><CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <span>{req.employeeSignedAt ? 'Signed by the employee' : `Recorded by ${req.receiptByHr ? 'HR' : 'the employee'}`}: cheque received {dayOf(req.chequeReceivedOn!)}, reference <strong>{req.chequeReference}</strong>.</span></p>
      ) : <p className="text-amber-800">Waiting for the employee to collect the cheque, sign, and enter the date received and reference number.</p>}
      {got && req.chequeNumber && !sameRef(req.chequeNumber, req.chequeReference) && (
        <p className="text-amber-800 flex items-start gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>The reference number ({req.chequeReference}) does not match the cheque number Accounting entered ({req.chequeNumber}). Please check.</span></p>
      )}
      {canEdit && !req.employeeSignedAt && !open && <button className="font-semibold text-brand-700 hover:underline" onClick={() => setOpen(true)}>{got ? 'Change the received details' : 'Record receipt for the employee'}</button>}
      {canEdit && open && (
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

/** The employee's side of an approved withdrawal: wait for the cheque, collect it, then sign and record the date and reference number. */
export function EmployeeReceipt({ req, onChanged }: { req: VacationPayRequest; onChanged: () => void }) {
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [on, setOn] = useState(today());
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = shownAmount(req);

  if (req.employeeSignedAt) {
    return (
      <div className="border-t border-gray-100 pt-3 text-xs text-green-800 flex items-start gap-1.5">
        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
        <span>You confirmed receiving the cheque on {dayOf(req.chequeReceivedOn || req.employeeSignedAt)} (reference {req.chequeReference}). Open the form to print it.</span>
      </div>
    );
  }
  if (req.chequeReceivedOn) {
    return <div className="border-t border-gray-100 pt-3 text-xs text-green-800 flex items-start gap-1.5"><CheckCircle2 size={14} className="shrink-0 mt-0.5" /><span>HR recorded that you received the cheque on {dayOf(req.chequeReceivedOn)} (reference {req.chequeReference}).</span></div>;
  }
  if (!req.chequeReadyAt) {
    return <div className="border-t border-gray-100 pt-3 text-xs text-gray-600">Your request was approved. Accounting is preparing your cheque; you will get a notice here when it is ready for pick up at the accounting office.</div>;
  }
  const submit = async () => {
    setErr('');
    if (!sig) { setErr('Sign (draw or type) to confirm.'); return; }
    if (!ref.trim()) { setErr('Enter the cheque reference number.'); return; }
    setBusy(true);
    try { await vacationPayApi.saveReceipt(req.id, { receivedOn: on, reference: ref.trim(), signatureType: sig.type, signature: sig.value }); onChanged(); }
    catch (e) { setErr(fail(e, 'Could not save')); }
    finally { setBusy(false); }
  };
  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">
      <div className="flex items-start gap-2 bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-900">
        <Bell size={16} className="shrink-0 mt-0.5" />
        <p>Your vacation pay cheque{amt !== null ? <> for <strong>{money(amt)}</strong> before tax</> : ''} (cheque no. <strong>{req.chequeNumber}</strong>) is <strong>ready for pick up at the accounting office</strong>. After you collect it, confirm below.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div><label className="block font-bold text-gray-900 mb-1">Date cheque received</label><input type="date" className="form-input" max={today()} value={on} onChange={e => setOn(e.target.value)} /></div>
        <div><label className="block font-bold text-gray-900 mb-1">Cheque reference number</label><input className="form-input" maxLength={60} value={ref} onChange={e => setRef(e.target.value)} placeholder="As shown on the cheque" /></div>
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900 mb-1">Your signature <span className="text-xs font-normal text-gray-500">(confirms you received the cheque)</span></p>
        <SignaturePad onChange={setSig} />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={busy} onClick={submit}><CheckCircle2 size={15} /> Confirm I received the cheque</button>
    </div>
  );
}
