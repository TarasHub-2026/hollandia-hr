import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { authApi } from '../api/auth';

/** Request administrator access. Nothing is created until an existing administrator approves it. */
export default function AdminSignupForm() {
  const [f, setF] = useState({ name: '', email: '', username: '', pin: '', pin2: '', reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (f.pin.length < 6) { setErr('An administrator PIN must be at least 6 characters.'); return; }
    if (f.pin !== f.pin2) { setErr('The two PINs do not match.'); return; }
    setBusy(true);
    try { const r = await authApi.registerAdmin({ name: f.name, email: f.email, username: f.username, pin: f.pin, reason: f.reason }); setDone(r.message); }
    catch (ex) { setErr((ex as { response?: { data?: { error?: string } } })?.response?.data?.error || (ex instanceof Error ? ex.message : 'Could not send the request')); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-start gap-3">
        <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
        <div><p className="font-semibold">Request sent</p><p className="mt-1">{done} Until then, you cannot sign in as an administrator.</p></div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        Administrator access needs approval from an existing administrator. You will not be able to sign in until it is approved.
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">Full name</label><input className="form-input" required maxLength={80} value={f.name} onChange={set('name')} /></div>
        <div><label className="form-label">Email</label><input type="email" className="form-input" required maxLength={120} value={f.email} onChange={set('email')} /></div>
        <div><label className="form-label">Username</label><input className="form-input" required maxLength={30} autoCapitalize="none" value={f.username} onChange={set('username')} /></div>
        <div />
        <div><label className="form-label">PIN (6 or more characters)</label><input type="password" className="form-input" required minLength={6} maxLength={32} autoComplete="new-password" value={f.pin} onChange={set('pin')} /></div>
        <div><label className="form-label">Confirm PIN</label><input type="password" className="form-input" required maxLength={32} autoComplete="new-password" value={f.pin2} onChange={set('pin2')} /></div>
      </div>
      <div><label className="form-label">Why do you need administrator access? (optional)</label><textarea className="form-input" rows={2} maxLength={300} value={f.reason} onChange={set('reason')} /></div>
      <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Request Administrator Access'}</button>
    </form>
  );
}