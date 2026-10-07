import React from 'react';
import { UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ProfileForm from './ProfileForm';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  if (!user) return null;

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <UserCog size={22} className="text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        </div>
        <p className="text-sm text-gray-500">
          This information is used to automatically fill in your leave applications. Keep your document expiry dates up to date.
        </p>
      </div>
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
