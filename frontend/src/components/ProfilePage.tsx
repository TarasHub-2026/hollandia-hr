import React, { useState } from 'react';
import { UserCog, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ProfileForm from './ProfileForm';
import PhotoCapture from './PhotoCapture';

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

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  if (!user) return null;

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <UserCog size={22} className="text-brand-600" />
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">My Profile</h1>
        </div>
        <p className="text-sm text-gray-500">
          This information is used to automatically fill in your leave applications. Keep your document expiry dates up to date.
        </p>
      </div>
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
    </div>
  );
}
