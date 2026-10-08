import React, { useState } from 'react';
import { Flower2, Lock, User, ShieldCheck, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ProfileForm from './ProfileForm';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'employee' | 'admin' | 'signup'>('employee');

  // Form state
  const [customIdent, setCustomIdent]     = useState('');
  const [pin, setPin]                     = useState('');
  const [error, setError]                 = useState('');
  const [submitting, setSubmitting]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const identifier = mode === 'admin' 
      ? (customIdent.trim() || 'admin')
      : customIdent.trim();

    if (!identifier) {
      setError('Please select or enter your name/ID');
      setSubmitting(false);
      return;
    }

    if (!pin) {
      setError('Please enter your 4-digit PIN');
      setSubmitting(false);
      return;
    }

    try {
      await login(identifier, pin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-emerald-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center px-4">
        <div className="inline-flex p-3 bg-white/10 backdrop-blur rounded-2xl border border-white/20 mb-4 shadow-xl">
          <Flower2 size={40} className="text-brand-300" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Hollandia Greenhouses</h1>
        <p className="mt-1.5 text-sm text-brand-200">Leave Management & Attendance Portal</p>
      </div>

      <div className={"mt-8 sm:mx-auto sm:w-full px-4 " + (mode === 'signup' ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-gray-100">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6 text-sm font-semibold">
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                mode === 'employee' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
              onClick={() => {
                setMode('employee');
                setError('');
                setPin('');
              }}
            >
              <User size={16} /> Employee Portal
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                mode === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
              onClick={() => {
                setMode('admin');
                setError('');
                setPin('');
                setCustomIdent('admin');
              }}
            >
              <ShieldCheck size={16} /> HR Admin
            </button>
            <button type="button" className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`} onClick={() => { setMode('signup'); setError(''); setPin(''); }}>Create Profile</button>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <div>
                <p className="font-semibold">Authentication Error</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {mode === 'signup' && <ProfileForm withPin submitLabel="Create Profile" onSubmit={async (data, p) => { await register({ ...data, pin: p }); }} />}
          <form onSubmit={handleSubmit} className="space-y-5" style={mode === 'signup' ? { display: 'none' } : undefined}>
            {mode === 'employee' ? (
              <div>
                <label className="form-label text-xs uppercase tracking-wider text-gray-500 font-bold">Username</label>
                <input type="text" className="form-input text-sm mt-1" placeholder="Your username, employee number or email" autoComplete="username" value={customIdent} onChange={e => setCustomIdent(e.target.value)} required />
                <p className="mt-1.5 text-[11px] text-gray-400">New here? Use the Create Profile tab to choose your username.</p>
              </div>
            ) : (
              <div>
                <label className="form-label text-xs uppercase tracking-wider text-gray-500 font-bold">
                  Administrator Username
                </label>
                <input
                  type="text"
                  className="form-input text-sm mt-1"
                  placeholder="admin"
                  value={customIdent}
                  onChange={e => setCustomIdent(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label className="form-label text-xs uppercase tracking-wider text-gray-500 font-bold">
                  Security PIN
                </label>
                <span className="text-[11px] text-gray-400">
                  {mode === 'admin' ? 'Default: 8888' : 'Default: 1234'}
                </span>
              </div>
              <div className="relative mt-1">
                <input
                  type="password"
                  maxLength={6}
                  className="form-input text-sm pl-9 tracking-widest"
                  placeholder="••••"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  required
                />
                <KeyRound size={16} className="absolute left-3 top-2.5 text-gray-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary justify-center py-2.5 text-sm font-semibold shadow-md mt-2"
            >
              {submitting ? 'Authenticating...' : mode === 'admin' ? 'Sign In as Administrator' : 'Sign In to My Portal'}
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Quick Help Footer */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              {mode === 'employee' ? (
                <>Sign in with the username and PIN you created. You can change your PIN once logged in.</>
              ) : (
                <>Admin account PIN is <code className="bg-gray-100 px-1 py-0.5 rounded font-mono font-semibold text-gray-700">8888</code>.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}