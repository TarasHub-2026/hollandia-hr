import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock, Printer, Search, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { vacationPayApi, requestLabels, shownAmount } from '../api/vacationPay';
import type { VacationPayRequest } from '../api/vacationPay';
import { DEPARTMENT_LABELS } from '../types';
import SignaturePad from './SignaturePad';
import type { SignatureValue } from './SignaturePad';
import { ReviewComment, DetailsPanel, DecisionPanel, ChequePanel, EmployeeReceipt, SignatureView } from './VacationPayWorkflow';
import VacationPayFormView from './VacationPayFormView';

const day = (s?: string | null) => (s ? new Date(s.split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Waiting for approval', cls: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
  DENIED: { label: 'Denied', cls: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-200 text-gray-700' },
};
const StatusBadge = ({ s }: { s: string }) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS[s]?.cls || 'bg-gray-100 text-gray-700'}`}>{STATUS[s]?.label || s}</span>;

/** What management decided, and what HR / Accounting prepared, as the employee (and HR) see it. */
function Decision({ r }: { r: VacationPayRequest }) {
  if (r.status === 'DENIED') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm space-y-1">
        <p className="font-semibold text-red-900 flex items-center gap-1.5"><XCircle size={15} /> Request denied</p>
        {r.decisionNote && <p className="text-gray-800 whitespace-pre-wrap">Note: {r.decisionNote}</p>}
        {r.decidedAt && <p className="text-[11px] text-gray-500">Denied {when(r.decidedAt)}{r.decidedBy ? ` by ${r.decidedBy}` : ''}</p>}
      </div>
    );
  }
  if (r.status !== 'APPROVED') return null;
  const amt = shownAmount(r);
  return (
    <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-2">
      <p className="font-semibold text-green-900 flex items-center gap-1.5"><CheckCircle2 size={15} /> Approved</p>
      <div className="grid sm:grid-cols-3 gap-2 text-gray-800">
        <div><p className="text-[11px] text-gray-500">Amount available for withdrawal before tax</p><p className="font-semibold">{amt !== null ? money(amt) : '\u2014'}</p></div>
        <div><p className="text-[11px] text-gray-500">Pay out date</p><p className="font-semibold">{r.payoutDate ? day(r.payoutDate) : '\u2014'}</p></div>
        <div><p className="text-[11px] text-gray-500">Notes from Accounting and Payroll Office</p><p className="whitespace-pre-wrap">{[r.accountingNotes, r.decisionNote ? `Note: ${r.decisionNote}` : ''].filter(Boolean).join('\n') || '\u2014'}</p></div>
      </div>
      {r.mgmtSignature && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Signature of Management:</span><SignatureView type={r.mgmtSignatureType} value={r.mgmtSignature} alt="Management signature" /></div>}
      {r.decidedAt && <p className="text-[11px] text-gray-500">Approved {when(r.decidedAt)}{r.decidedBy ? ` by ${r.decidedBy}` : ''}</p>}
    </div>
  );
}

// ───────────────────────── Employee ─────────────────────────

function EmployeeView() {
  const { user } = useAuth();
  const [mine, setMine] = useState<VacationPayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [retain, setRetain] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [terminate, setTerminate] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [printing, setPrinting] = useState<VacationPayRequest | null>(null);

  const load = useCallback(() => { vacationPayApi.mine().then(setMine).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);
  const pending = mine.find(m => m.status === 'PENDING');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setDone('');
    if (!retain && !withdraw && !terminate) { setError('Select what you are asking for. / Seleccione lo que solicita.'); return; }
    if (retain && terminate) { setError('You cannot retain your vacation pay and terminate the retention at the same time. / No puede retener y terminar la retenci\u00f3n a la vez.'); return; }
    if (!sig) { setError('Please sign the request. / Por favor firme la solicitud.'); return; }
    setBusy(true);
    try {
      await vacationPayApi.create({ retain, withdraw, terminate, email: email.trim(), signatureType: sig.type, signature: sig.value });
      setRetain(false); setWithdraw(false); setTerminate(false); setSig(null); setPadKey(k => k + 1);
      setDone('Your request was sent to Accounting and Payroll. / Su solicitud fue enviada.');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the request.'); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this request?')) return;
    try { await vacationPayApi.cancel(id); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel.'); }
  };

  const box = 'flex items-start gap-2 text-sm';
  return (
    <div className="space-y-6">
      {pending ? (
        <div className="card p-5 space-y-3 border-l-4 border-l-yellow-400">
          <p className="font-semibold text-gray-900 flex items-center gap-2"><Clock size={16} className="text-yellow-600" /> Your request is waiting for approval / Su solicitud espera aprobaci&oacute;n</p>
          <p className="text-sm text-gray-700">{requestLabels(pending).join(' \u00b7 ')}</p>
          <p className="text-xs text-gray-500">Sent {when(pending.submittedAt)}. You can send a new request once this one is decided, or cancel it.</p>
          <button className="btn-secondary !py-1 text-xs" onClick={() => cancel(pending.id)}><XCircle size={13} /> Cancel request</button>
        </div>
      ) : (
        <form onSubmit={submit} className="card p-5 md:p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900 uppercase leading-snug">Request form: Vacation pay <span className="block md:inline text-gray-600">/ Formulario de solicitud: pago de vacaciones</span></h2>

          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="form-label">TODAY'S DATE / FECHA</label><input className="form-input bg-gray-50" readOnly value={today()} /></div>
            <div className="sm:col-span-2"><label className="form-label">Name / Nombre</label><input className="form-input bg-gray-50" readOnly value={user?.name || ''} /></div>
          </div>
          <div className="max-w-md">
            <label className="form-label">Email</label>
            <input type="email" className={`form-input ${user?.email ? 'bg-gray-50' : ''}`} readOnly={!!user?.email} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            {user?.email && <p className="text-[11px] text-gray-400 mt-1">The answer is sent to the email HR has on file for you.</p>}
          </div>

          <fieldset className="space-y-2">
            <legend className="font-bold text-gray-900 uppercase text-sm mb-1">What is your request / Cu&aacute;l es su solicitud</legend>
            <p className="text-xs text-gray-600">Select applicable to you. / Seleccione aplicable a usted.</p>
            <label className={box}><input type="checkbox" className="mt-0.5" checked={retain} onChange={e => setRetain(e.target.checked)} /> Retain my vacation pay <span className="text-gray-500">(Retener mi paga de vacaciones)</span></label>
            <label className={box}><input type="checkbox" className="mt-0.5" checked={withdraw} onChange={e => setWithdraw(e.target.checked)} /> Withdraw my vacation pay <span className="text-gray-500">(Retirar el pago de mis vacaciones)</span></label>
            <label className={box}><input type="checkbox" className="mt-0.5" checked={terminate} onChange={e => setTerminate(e.target.checked)} /> Terminate my retention of vacation pay <span className="text-gray-500">(Terminar mi retenci&oacute;n de pago de vacaciones)</span></label>
          </fieldset>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">Employee Signature <span className="text-gray-600 font-semibold">/ Firma del empleado</span></h3>
            <label className="form-label">Signature / Firma</label>
            <SignaturePad key={padKey} onChange={setSig} />
          </div>

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}</div>}
          {done && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {done}</div>}
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Submit / Enviar'}</button>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="font-bold text-gray-900">My requests / Mis solicitudes</h2>
        {loading && <p className="text-sm text-gray-400">Loading...</p>}
        {!loading && mine.length === 0 && <div className="card p-6 text-center text-sm text-gray-400">You have not sent a vacation pay request yet.</div>}
        {mine.map(r => (
          <div key={r.id} className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">{requestLabels(r).join(' \u00b7 ')}</p>
              <div className="flex items-center gap-2">
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setPrinting(r)}><Printer size={13} /> View / print form</button>
                <StatusBadge s={r.status} />
              </div>
            </div>
            <p className="text-xs text-gray-500">Request date {day(r.requestDate)}</p>
            <Decision r={r} />
            {r.status === 'APPROVED' && r.withdraw && <EmployeeReceipt key={`${r.id}-${r.chequeReadyAt || ''}-${r.employeeSignedAt || ''}-${r.chequeReceivedOn || ''}`} req={r} onChanged={load} />}
          </div>
        ))}
      </div>
      {printing && <VacationPayFormView req={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

// ───────────────────────── HR / Accounting / management ─────────────────────────

function AdminCard({ r, canEdit, isMain, onChanged }: { r: VacationPayRequest; canEdit: boolean; isMain: boolean; onChanged: () => void }) {
  const [printing, setPrinting] = useState(false);
  const bar = r.status === 'PENDING' ? 'border-l-yellow-400' : r.status === 'APPROVED' ? 'border-l-green-500' : r.status === 'DENIED' ? 'border-l-red-400' : 'border-l-gray-300';
  return (
    <div className={`card p-4 md:p-5 space-y-3 border-l-4 ${bar}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{r.employeeName} <span className="text-gray-400 font-normal text-sm">#{r.employeeNumber || '\u2014'} &middot; {DEPARTMENT_LABELS[r.department as keyof typeof DEPARTMENT_LABELS] || r.department}</span></p>
          <p className="text-xs text-gray-500">Request date {day(r.requestDate)} &middot; sent {when(r.submittedAt)}{r.email ? ` \u00b7 ${r.email}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setPrinting(true)}><Printer size={13} /> View / print form</button>
          <StatusBadge s={r.status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{requestLabels(r).map(l => <span key={l} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-800 font-medium">{l}</span>)}</div>
      <div><p className="text-[11px] text-gray-500 mb-1">Employee signature</p><SignatureView type={r.signatureType} value={r.signature} alt={`Signature of ${r.employeeName}`} className="h-16 bg-white border border-gray-200 rounded" /></div>

      {r.status === 'CANCELLED' ? <p className="text-xs text-gray-500">The employee cancelled this request.</p> : (
        <>
          <ReviewComment key={`rc-${r.id}-${r.reviewAt || ''}`} req={r} canEdit={canEdit} onChanged={onChanged} />
          {r.status === 'DENIED' && <Decision r={r} />}
          {r.status === 'PENDING' && <DetailsPanel key={`d-${r.id}-${r.respondedAt || ''}`} req={r} canEdit={canEdit} onChanged={onChanged} />}
          {r.status === 'PENDING' && <DecisionPanel req={r} isMain={isMain} onChanged={onChanged} />}
          {r.status === 'APPROVED' && <Decision r={r} />}
          {r.status === 'APPROVED' && <DetailsPanel key={`d-${r.id}-${r.respondedAt || ''}`} req={r} canEdit={canEdit} onChanged={onChanged} />}
          {r.status === 'APPROVED' && r.withdraw && <ChequePanel key={`c-${r.id}-${r.chequeReadyAt || ''}-${r.chequeReceivedOn || ''}`} req={r} canEdit={canEdit} onChanged={onChanged} />}
          {r.status === 'APPROVED' && !r.withdraw && <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">This request does not withdraw any money, so no cheque is needed. Payroll updates the retention of the employee&apos;s vacation pay.</p>}
        </>
      )}
      {!canEdit && <p className="text-xs text-gray-500">Your access to vacation pay requests is view only.</p>}
      {printing && <VacationPayFormView req={r} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function AdminView() {
  const { can, user } = useAuth();
  const [all, setAll] = useState<VacationPayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [q, setQ] = useState('');

  const load = useCallback(() => { vacationPayApi.all().then(setAll).catch(e => setError(e instanceof Error ? e.message : 'Could not load requests')).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);

  const pendingCount = all.filter(r => r.status === 'PENDING').length;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(r => (filter === 'ALL' || r.status === 'PENDING') && (!term || r.employeeName.toLowerCase().includes(term) || r.employeeNumber.toLowerCase().includes(term)));
  }, [all, filter, q]);
  const isMain = !!user?.primary;

  return (
    <div className="space-y-4">
      {!isMain && <p className="text-xs p-2 rounded bg-blue-50 border border-blue-200 text-blue-900">Requests are approved or denied by the main administrator account (HR Administrator). You can add comments, prepare the response and handle the cheque.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
          <button className={`px-3 py-1.5 ${filter === 'PENDING' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'}`} onClick={() => setFilter('PENDING')}>Waiting ({pendingCount})</button>
          <button className={`px-3 py-1.5 ${filter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'}`} onClick={() => setFilter('ALL')}>All requests ({all.length})</button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-gray-400" />
          <input className="form-input pl-9 w-64" placeholder="Search name or employee number" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {!loading && shown.length === 0 && <div className="card p-8 text-center text-sm text-gray-400">{filter === 'PENDING' ? 'No vacation pay requests are waiting for approval.' : 'No vacation pay requests yet.'}</div>}
      {shown.map(r => <AdminCard key={r.id + r.status} r={r} canEdit={can('vacationPay', 'edit')} isMain={isMain} onChanged={load} />)}
    </div>
  );
}

export default function VacationPayPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-2"><Banknote size={26} /> {isAdmin ? 'Vacation Pay Requests' : 'Vacation Pay'}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {isAdmin
            ? 'Employees ask to retain their vacation pay, withdraw it, or end the retention. HR / Accounting prepare the response, the main administrator account approves it with a signature, and Accounting enters the cheque for a withdrawal.'
            : 'Ask Accounting and Payroll to retain your vacation pay, withdraw it, or end the retention. / Solicite retener, retirar o terminar la retenci\u00f3n de su pago de vacaciones.'}
        </p>
      </div>
      {isAdmin ? <AdminView /> : <EmployeeView />}
    </div>
  );
}
