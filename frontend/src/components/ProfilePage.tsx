import React, { useState } from 'react';
import { UserCog, CheckCircle2, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import ProfileForm from './ProfileForm';
import PhotoCapture from './PhotoCapture';
import DocumentExpiryCard from './DocumentExpiryCard';

function ProfilePhotoCard() {
  const { user, savePhoto } = useAuth();
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setSaving(true); setMsg(null);
    try { await savePhoto(photo); setPhoto(''); setMsg({ ok: true, text: 'Profile picture updated.' }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save your picture.' }); }
    finally { setSaving(false); }
  };
  return (
    <div className="card p-6 space-y-3">
      <h2 className="font-semibold text-gray-900">Profile picture</h2>
      <PhotoCapture value={photo || user?.photo || ''} onChange={setPhoto} disabled={saving} />
      {photo && <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save new picture'}</button>}
      {msg && <p className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.ok && <CheckCircle2 size={13} />} {msg.text}</p>}
    </div>
  );
}

/** The signed-in person changes their own PIN (it used to be a button on the dashboard). */
function ChangePinCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (newPin.length < 4) { setMsg({ ok: false, text: 'Choose a new PIN of at least 4 digits.' }); return; }
    if (newPin !== newPin2) { setMsg({ ok: false, text: 'The two new PIN entries do not match.' }); return; }
    setBusy(true);
    try {
      await authApi.changePin(user.id, oldPin, newPin);
      setOldPin(''); setNewPin(''); setNewPin2(''); setOpen(false);
      setMsg({ ok: true, text: 'Your PIN was changed.' });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change your PIN.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="card p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><KeyRound size={16} className="text-brand-600" /> Security PIN</h2>
        {!open && <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => { setOpen(true); setMsg(null); }}><KeyRound size={13} /> Change PIN</button>}
      </div>
      {open && (
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 items-end">
          <div><label className="form-label">Current PIN</label><input type="password" inputMode="numeric" maxLength={6} className="form-input tracking-widest" value={oldPin} onChange={e => setOldPin(e.target.value)} required /></div>
          <div><label className="form-label">New PIN (4-6 digits)</label><input type="password" inputMode="numeric" maxLength={6} className="form-input tracking-widest" value={newPin} onChange={e => setNewPin(e.target.value)} required /></div>
          <div><label className="form-label">Confirm new PIN</label><input type="password" inputMode="numeric" maxLength={6} className="form-input tracking-widest" value={newPin2} onChange={e => setNewPin2(e.target.value)} required /></div>
          <div className="sm:col-span-3 flex gap-2">
            <button className="btn-primary text-xs" disabled={busy}>{busy ? 'Saving...' : 'Save new PIN'}</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}

/** My Profile: picture, personal and document details, document expiry alerts and the PIN. `embedded` drops the page heading. */
export default function ProfilePage({ embedded }: { embedded?: boolean } = {}) {
  const { user, updateProfile } = useAuth();
  if (!user) return null;

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 md:p-10 max-w-2xl mx-auto space-y-6'}>
      {!embedded && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCog size={22} className="text-brand-600" />
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">My Profile</h1>
          </div>
          <p className="text-sm text-gray-500">
            This information is used to automatically fill in your leave applications. Keep your document expiry dates up to date.
          </p>
        </div>
      )}
      {user.role !== 'ADMIN' && <DocumentExpiryCard />}
      <ProfilePhotoCard />
      <div className="card p-6">
        <ProfileForm
          key={user.id + (user.immigrationStatus || '')}
          initial={user}
          submitLabel="Save Profile"
          successMessage="Profile saved. Your leave applications will use these details."
          onSubmit={async data => { await updateProfile(data); }}
        />
      </div>
      <ChangePinCard />
    </div>
  );
}
