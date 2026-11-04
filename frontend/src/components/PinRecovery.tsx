import React, { useState } from 'react';
import { KeyRound, Copy, Check, ArrowLeft, Flower2 } from 'lucide-react';
import { authApi } from '../api/auth';
import { employeesApi } from '../api/employees';
import { useAuth } from '../context/AuthContext';
import type { Employee } from '../types';

const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : fb);

/** Sign-in screen panel: "Forgot your username or PIN?" */
export function ForgotPinPanel({ onBack }: { onBack: () => void }) {
  const [empNo, setEmpNo] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await authApi.forgotPin(empNo.trim(), email.trim()); setDone(r.message); }
    catch (ex) { setErr(errMsg(ex, 'Could not send the request')); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs text-brand-700 hover:underline flex items-center gap-1"><ArrowLeft size={12} /> Back to sign in</button>
      <h2 className="text-xl font-bold text-gray-900">Forgot your username or PIN?</h2>
      <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-900">
        <b>Forgot your username?</b> You do not need it. On the sign-in screen you can type your <b>employee number</b>, your <b>email</b> or your <b>full name</b> instead.
      </div>
      {done ? (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">{done}</div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-gray-600"><b>Forgot your PIN?</b> Enter your employee number and the email HR has on file, and we will email you a link to choose a new PIN.</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div><label className="form-label">Employee number</label><input className="form-input" required value={empNo} onChange={e => setEmpNo(e.target.value)} /></div>
          <div><label className="form-label">Email</label><input type="email" className="form-input" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Email me a reset link'}</button>
        </form>
      )}
      <p className="text-[11px] text-gray-400">No email, or nothing arrives? Ask HR to reset your PIN. They will give you a temporary PIN to sign in with.</p>
    </div>
  );
}

/** Opened from the emailed link (?reset=token): choose a new PIN. */
export function ResetPinPanel({ token, onDone }: { token: string; onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pin.length < 4) { setErr('Choose a PIN of at least 4 characters.'); return; }
    if (pin !== pin2) { setErr('The two PINs do not match.'); return; }
    setBusy(true);
    try { await authApi.resetPin(token, pin); setOk(true); }
    catch (ex) { setErr(errMsg(ex, 'Could not reset the PIN')); }
    finally { setBusy(false); }
  };

  if (ok) {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900">Your PIN was changed. You can sign in now.</div>
        <button className="btn-primary w-full justify-center" onClick={onDone}>Go to sign in</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Choose a new PIN</h2>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div><label className="form-label">New PIN</label><input type="password" className="form-input" maxLength={64} autoComplete="new-password" required value={pin} onChange={e => setPin(e.target.value)} /></div>
      <div><label className="form-label">Confirm new PIN</label><input type="password" className="form-input" maxLength={64} autoComplete="new-password" required value={pin2} onChange={e => setPin2(e.target.value)} /></div>
      <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Saving…' : 'Save new PIN'}</button>
      <button type="button" onClick={onDone} className="w-full text-xs text-gray-500 hover:underline">Cancel</button>
    </form>
  );
}

/** Full-screen gate shown after signing in with a temporary PIN from HR. */
export function ForcePinChange() {
  const { refreshUser, logout, user } = useAuth();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pin.length < 4) { setErr('Choose a PIN of at least 4 characters.'); return; }
    if (pin !== pin2) { setErr('The two PINs do not match.'); return; }
    setBusy(true);
    try { await authApi.setNewPin(pin); await refreshUser(); }
    catch (ex) { setErr(errMsg(ex, 'Could not save the PIN')); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-emerald-950 flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md text-center mb-6">
        <div className="inline-flex p-3 bg-white/10 rounded-2xl border border-white/20 mb-3"><Flower2 size={36} className="text-brand-300" /></div>
        <h1 className="text-2xl font-extrabold text-white">Hollandia Greenhouses</h1>
      </div>
      <form onSubmit={submit} className="mx-auto w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2"><KeyRound size={18} className="text-brand-700" /><h2 className="text-xl font-bold text-gray-900">Choose a new PIN</h2></div>
        <p className="text-xs text-gray-600">Hi {user?.firstName || 'there'}, you signed in with a temporary PIN from HR. Choose your own PIN to continue.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div><label className="form-label">New PIN</label><input type="password" className="form-input" maxLength={64} autoComplete="new-password" required autoFocus value={pin} onChange={e => setPin(e.target.value)} /></div>
        <div><label className="form-label">Confirm new PIN</label><input type="password" className="form-input" maxLength={64} autoComplete="new-password" required value={pin2} onChange={e => setPin2(e.target.value)} /></div>
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button type="button" onClick={logout} className="w-full text-xs text-gray-500 hover:underline">Sign out</button>
      </form>
    </div>
  );
}

/** Roster: HR issues a one-time temporary PIN for an employee. */
export function ResetPinModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ pin: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true); setErr('');
    try { setRes(await employeesApi.resetPin(emp.id)); }
    catch (e) { setErr(errMsg(e, 'Could not reset the PIN')); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(res!.pin); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 text-xl">Reset PIN</h3>
        <p className="text-xs text-gray-500 mt-1">{emp.name}{emp.employeeNumber ? ` · #${emp.employeeNumber}` : ''}</p>
        {!res ? (
          <>
            <p className="text-sm text-gray-700 mt-4">This replaces their PIN with a temporary one. They sign in with it and must choose a new PIN straight away. Their old PIN stops working now.</p>
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" disabled={busy} onClick={onClose}>Close</button>
              <button className="btn-primary" disabled={busy} onClick={run}>{busy ? 'Working…' : 'Create temporary PIN'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600 mt-4">Give this PIN to the employee in person or by phone. It is shown <b>only once</b> and works until {new Date(res.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</p>
            <div className="mt-3 flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="font-mono text-3xl font-bold tracking-widest text-green-900">{res.pin}</span>
              <button className="btn-secondary !py-1.5 text-xs" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">They sign in with their employee number (or username) and this PIN.</p>
            <div className="flex justify-end mt-4"><button className="btn-primary" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}