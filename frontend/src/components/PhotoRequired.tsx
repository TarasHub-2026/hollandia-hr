import React, { useState } from 'react';
import { Camera, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PhotoCapture from './PhotoCapture';

/** Shown to an employee who has no profile picture yet. They cannot use the app until they add one. */
export default function PhotoRequired() {
  const { user, savePhoto, logout } = useAuth();
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!photo) { setError('Take a photo or upload a picture first.'); return; }
    setError(''); setSaving(true);
    try { await savePhoto(photo); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your picture. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center"><Camera size={22} /></div>
          <h1 className="text-2xl font-bold text-gray-900">Add your profile picture</h1>
          <p className="text-sm text-gray-500">Hi {user?.firstName || 'there'}, every employee profile needs a picture. Take a photo with your camera or upload one. You only have to do this once.</p>
        </div>
        <PhotoCapture value={photo} onChange={p => { setPhoto(p); setError(''); }} disabled={saving} />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button type="button" className="btn-primary w-full justify-center py-2.5" disabled={saving || !photo} onClick={save}>{saving ? 'Saving...' : 'Save and continue'}</button>
        <button type="button" onClick={logout} className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"><LogOut size={12} /> Sign out</button>
      </div>
    </div>
  );
}
