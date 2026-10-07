import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';
import type { AuthUser, Department, ProfileInput } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';

interface Props {
  initial?: AuthUser | null;
  /** When true, shows a PIN field (used on sign-up). */
  withPin?: boolean;
  submitLabel: string;
  onSubmit: (data: ProfileInput, pin: string) => Promise<void>;
  successMessage?: string;
}

const toDateInput = (v?: string) => (v ? v.split('T')[0] : '');

export default function ProfileForm({ initial, withPin, submitLabel, onSubmit, successMessage }: Props) {
  const [firstName, setFirstName] = useState(initial?.firstName || '');
  const [lastName, setLastName] = useState(initial?.lastName || '');
  const [employeeNumber, setEmployeeNumber] = useState(initial?.employeeNumber || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [hireDate, setHireDate] = useState(toDateInput(initial?.hireDate));
  const [department, setDepartment] = useState<Department>(initial?.department || 'GREENHOUSE');
  const [immigration, setImmigration] = useState<'TFW' | 'NON_TFW' | ''>(initial?.immigrationStatus || '');
  const [workPermitExpiry, setWorkPermitExpiry] = useState(toDateInput(initial?.workPermitExpiry));
  const [passportExpiry, setPassportExpiry] = useState(toDateInput(initial?.passportExpiry));
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const isTfw = immigration === 'TFW';
  const req = <span className="text-red-600"> *</span>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (isTfw && (!workPermitExpiry || !passportExpiry)) {
      setError('TFW employees must enter both their work permit expiry date and passport expiry date.');
      return;
    }
    if (withPin) {
      if (pin.length < 4) { setError('Choose a PIN of at least 4 digits.'); return; }
      if (pin !== pin2) { setError('The two PIN entries do not match.'); return; }
    }

    setSaving(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        employeeNumber: employeeNumber.trim(),
        email: email.trim(),
        hireDate,
        department,
        immigrationStatus: immigration,
        // Non-TFW employees never need to provide these
        passportExpiry: isTfw ? passportExpiry : undefined,
        workPermitExpiry: isTfw ? workPermitExpiry : undefined,
      }, pin);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {saved && successMessage && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs flex items-start gap-2">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">First Name{req}</label><input className="form-input" required value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><label className="form-label">Last Name{req}</label><input className="form-input" required value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">Employee Number{req}</label><input className="form-input" required value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} /></div>
        <div><label className="form-label">Email Address{req}</label><input type="email" className="form-input" required value={email} onChange={e => setEmail(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">Hire Date{req}</label><input type="date" className="form-input" required value={hireDate} onChange={e => setHireDate(e.target.value)} /></div>
        <div>
          <label className="form-label">Department{req}</label>
          <select className="form-select" value={department} onChange={e => setDepartment(e.target.value as Department)}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Immigration Status{req}</label>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="imm-status" required checked={immigration === 'TFW'} onChange={() => setImmigration('TFW')} /> TFW</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="imm-status" required checked={immigration === 'NON_TFW'} onChange={() => setImmigration('NON_TFW')} /> Non-TFW</label>
        </div>
      </div>

      {isTfw && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
          <p className="text-xs text-amber-900">Temporary Foreign Workers must provide their document expiry dates. These are used to check the 4-month validity rule when you apply for leave.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="form-label">Work Permit Expiry Date{req}</label><input type="date" className="form-input" required value={workPermitExpiry} onChange={e => setWorkPermitExpiry(e.target.value)} /></div>
            <div><label className="form-label">Passport Expiry Date{req}</label><input type="date" className="form-input" required value={passportExpiry} onChange={e => setPassportExpiry(e.target.value)} /></div>
          </div>
        </div>
      )}

      {withPin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="form-label flex items-center gap-1"><KeyRound size={13} /> Choose a PIN (4-6 digits){req}</label>
            <input type="password" inputMode="numeric" maxLength={6} className="form-input tracking-widest" value={pin} onChange={e => setPin(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Confirm PIN{req}</label>
            <input type="password" inputMode="numeric" maxLength={6} className="form-input tracking-widest" value={pin2} onChange={e => setPin2(e.target.value)} />
          </div>
        </div>
      )}

      <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-2.5">
        {saving ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
