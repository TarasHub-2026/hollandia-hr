import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, RefreshCw, Send, ArrowRight, ArrowLeft,
  ChevronRight, Flag, Info,
} from 'lucide-react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, Department, EligibilityResult, LeaveRequest, CreateLeaveRequestPayload } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import EligibilityResultCard from './EligibilityResult';
import { useAuth } from '../context/AuthContext';

interface Props {
  onSuccess?: (request: LeaveRequest) => void;
  onNavigateRequests?: () => void;
}

const LEAVE_TYPES: { id: string; label: string }[] = [
  { id: 'PAID_SICK',   label: 'Paid Sick Leave for PERSONAL Illness or Injury (annual max is 5 days)' },
  { id: 'SICK',        label: "Sick Leave (use this type of leave if you are sick and you've reached the maximum limit of your sick leave entitlement)" },
  { id: 'MATERNITY',   label: 'Maternity and parental leave' },
  { id: 'FAMILY_RESP', label: 'Family responsibility leave' },
  { id: 'CRITICAL',    label: 'Critical illness or injury leave' },
  { id: 'COMPASSION',  label: 'Compassionate care leave' },
  { id: 'BEREAVEMENT', label: 'Bereavement leave' },
  { id: 'DISAPPEAR',   label: 'Leave respecting the disappearance of child' },
  { id: 'DEATH_CHILD', label: 'Leave respecting the death of a child' },
  { id: 'DOMESTIC',    label: 'Leave respecting domestic or sexual violence' },
  { id: 'RESERVIST',   label: "Reservists' leave" },
  { id: 'JURY',        label: 'Jury duty leave' },
  { id: 'ANNUAL',      label: 'Annual Vacation Entitlement' },
  { id: 'OTHER_PERSONAL', label: 'Other | Personal' },
];

// Types governed by Hollandia's home-country / vacation scheduling policy.
const POLICY_TYPES = ['ANNUAL', 'OTHER_PERSONAL', 'OTHER_TEXT'];

const BC_LINK_SICK = 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/paid-sick-leave';
const BC_LINK_VACATION = 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/vacation-pay';

const STEPS = ['Step 1 Read the Guidelines', 'Step 2 Enter your Information', 'Step 3 Type of Leave'];

const todayISO = () => new Date().toISOString().split('T')[0];

export default function IntegratedLeaveForm({ onSuccess, onNavigateRequests }: Props) {
  const { user, isAdmin } = useAuth();
  const isEmployee = !!user && !isAdmin;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [step, setStep] = useState(1);

  // Step 1
  const [entryMode, setEntryMode] = useState<'registered' | 'manual'>('registered');
  const [employeeId, setEmployeeId] = useState(() => (isEmployee ? user!.id : ''));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [manualDept, setManualDept] = useState<Department>('GREENHOUSE');
  const [guidelinesRead, setGuidelinesRead] = useState(false);

  // Step 2
  const [immigration, setImmigration] = useState<'TFW' | 'NON_TFW' | ''>(() => (isEmployee && user?.immigrationStatus) || '');
  const [employeeNumber, setEmployeeNumber] = useState(() => (isEmployee && user?.employeeNumber) || '');
  const [email, setEmail] = useState(() => user?.email || '');
  const [lastDayOfWork, setLastDayOfWork] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [leaveTime, setLeaveTime]   = useState('');
  const [returnTime, setReturnTime] = useState('');

  // Step 3
  const [types, setTypes] = useState<string[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [sickAck1, setSickAck1] = useState(false);
  const [sickAck2, setSickAck2] = useState(false);
  const [sickAck3, setSickAck3] = useState(false);
  const [proofNow, setProofNow] = useState('');
  const [sickDays, setSickDays] = useState('');
  const [hireDate, setHireDate] = useState(() => (isEmployee && user?.hireDate ? user.hireDate.split('T')[0] : ''));
  const [destination, setDestination]           = useState('');
  const [passportExpiry, setPassportExpiry]     = useState(() => (isEmployee && user?.passportExpiry ? user.passportExpiry.split('T')[0] : ''));
  const [workPermitExpiry, setWorkPermitExpiry] = useState(() => (isEmployee && user?.workPermitExpiry ? user.workPermitExpiry.split('T')[0] : ''));
  const [contractExpiry, setContractExpiry]     = useState('');

  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [eligResult, setEligResult] = useState<EligibilityResult | null>(null);
  const [submittedReq, setSubmittedReq] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    employeesApi.getAll().then(setEmployees).catch(() => {});
  }, []);

  const selectedEmp = isEmployee ? undefined : employees.find(e => e.id === employeeId);

  const displayName = isEmployee
    ? user!.name
    : entryMode === 'registered'
      ? (selectedEmp?.name || '')
      : `${firstName} ${lastName}`.trim();
  const knownHireDate = isEmployee ? user!.hireDate : (entryMode === 'registered' ? selectedEmp?.hireDate : undefined);

  useEffect(() => {
    if (knownHireDate) setHireDate(knownHireDate.split('T')[0]);
  }, [knownHireDate]);

  const paidSick = types.includes('PAID_SICK');
  const hasAnyType = types.length > 0 || (otherChecked && otherText.trim().length > 0);
  const policyApplies = types.some(t => POLICY_TYPES.includes(t)) || otherChecked;
  const statutory = hasAnyType && !policyApplies;
  const showTravel = policyApplies && immigration === 'TFW';

  const days = startDate && endDate
    ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 0;
  const weeks = (days / 7).toFixed(2);

  const toggleType = (id: string) => {
    setTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const typeLabels = (): string[] => [
    ...types.map(t => LEAVE_TYPES.find(l => l.id === t)!.label.replace(/ \(.*\)$/, '')),
    ...(otherChecked ? ['Other'] : []),
  ];

  const extraFlags = useMemo(() => {
    const flags: string[] = [];
    if (paidSick) {
      const n = parseInt(sickDays || '0', 10);
      if (n > 5) flags.push(`Paid sick leave requested (${n} days) exceeds the annual maximum of 5 days.`);
      if (hireDate && startDate) {
        const worked = Math.round((new Date(startDate).getTime() - new Date(hireDate).getTime()) / 86400000);
        if (worked < 90) flags.push(`Paid sick leave requires at least 90 days of employment (${Math.max(worked, 0)} days completed by start date).`);
      }
    }
    return flags;
  }, [paidSick, sickDays, hireDate, startDate]);

  const buildPurpose = () => {
    const parts = [
      `Immigration: ${immigration === 'TFW' ? 'TFW' : 'Non-TFW'}`,
      `Emp#: ${employeeNumber}`,
      `Email: ${email}`,
    ];
    if (lastDayOfWork) parts.push(`Last day of work: ${lastDayOfWork}`);
    parts.push(`${days} day(s) / ${weeks} week(s)`);
    if (leaveTime) parts.push(`Leaves at ${leaveTime}`);
    if (returnTime) parts.push(`Returns at ${returnTime}`);
    if (otherChecked && otherText.trim()) parts.push(`Other reason: ${otherText.trim()}`);
    if (paidSick) parts.push(`Paid sick days: ${sickDays}; proof of illness: ${proofNow || 'n/a'}`);
    return parts.join(' | ');
  };

  const buildPayload = (): CreateLeaveRequestPayload => ({
    ...(isEmployee || (entryMode === 'registered' && employeeId)
      ? { employeeId: isEmployee ? user!.id : employeeId }
      : { employeeName: displayName, department: manualDept, hireDate: hireDate || undefined }),
    startDate,
    endDate,
    category: typeLabels().join(', '),
    destination: showTravel && destination ? destination : undefined,
    purpose: buildPurpose(),
    statutory,
    extraFlags,
    passportExpiry: immigration === 'TFW' && passportExpiry ? passportExpiry : null,
    workPermitExpiry: immigration === 'TFW' && workPermitExpiry ? workPermitExpiry : null,
    contractExpiry: showTravel && contractExpiry ? contractExpiry : null,
  });

  const hasEmployee = isEmployee || (entryMode === 'registered' ? !!employeeId : !!(firstName.trim() && lastName.trim()));

  // Live policy assessment on step 3
  useEffect(() => {
    if (step !== 3 || !hasEmployee || !startDate || !endDate || !hasAnyType || new Date(startDate) > new Date(endDate)) {
      setEligResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await leaveRequestsApi.preview(buildPayload());
        setEligResult(res.eligibility);
      } catch { /* silent */ } finally { setPreviewing(false); }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, employeeId, firstName, lastName, entryMode, startDate, endDate, types, otherChecked, otherText,
      passportExpiry, workPermitExpiry, contractExpiry, sickDays, hireDate]);

  // Step validation
  const step1Valid = hasEmployee && guidelinesRead;
  const step2Valid = !!immigration && !!employeeNumber.trim() && /\S+@\S+\.\S+/.test(email) && !!startDate && !!endDate
    && new Date(startDate) <= new Date(endDate);
  const sickValid = !paidSick || (sickAck1 && sickAck2 && sickAck3 && !!proofNow && !!sickDays && !!hireDate);
  const step3Valid = hasAnyType && (!otherChecked || !!otherText.trim()) && sickValid;

  const goNext = () => {
    setError('');
    if (step === 1 && !step1Valid) { setError('Please enter your name and confirm you have read the guidelines.'); return; }
    if (step === 2 && !step2Valid) { setError('Please complete all required fields (*) with valid dates and email.'); return; }
    setStep(s => Math.min(3, s + 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!step3Valid) { setError('Please select a leave type and complete all required fields.'); return; }
    setSubmitting(true);
    try {
      const res = await leaveRequestsApi.submit(buildPayload());
      setSubmittedReq(res.request);
      setEligResult(res.eligibility);
      onSuccess?.(res.request);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally { setSubmitting(false); }
  };

  const handleReset = () => {
    setStep(1);
    if (!isEmployee) { setEmployeeId(''); setFirstName(''); setLastName(''); }
    setGuidelinesRead(false); setImmigration(''); setEmployeeNumber(''); setLastDayOfWork('');
    setStartDate(''); setEndDate(''); setLeaveTime(''); setReturnTime('');
    setTypes([]); setOtherChecked(false); setOtherText('');
    setSickAck1(false); setSickAck2(false); setSickAck3(false); setProofNow(''); setSickDays('');
    setDestination(''); setPassportExpiry(''); setWorkPermitExpiry(''); setContractExpiry('');
    setEligResult(null); setSubmittedReq(null); setError('');
  };

  // ---------- Receipt ----------
  if (submittedReq && eligResult) {
    const flagged = Boolean(submittedReq.isFlagged || eligResult.failures.length > 0);
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
        <div className={`card p-8 text-center space-y-4 border-2 ${flagged ? 'border-red-200' : 'border-brand-100'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${flagged ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
            {flagged ? <AlertTriangle size={36} /> : <CheckCircle2 size={36} />}
          </div>
          <div>
            <span className={`text-xs uppercase font-bold tracking-widest ${flagged ? 'text-red-600' : 'text-brand-600'}`}>
              {flagged ? 'Red-Flagged Submission' : 'Application Submitted'}
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">
              {flagged ? 'Application Submitted with Red Flag' : 'Leave Request Received'}
            </h1>
            <p className="text-gray-500 text-sm mt-1 max-w-lg mx-auto">
              {flagged
                ? 'Your application was submitted with a Red Flag due to policy conflicts. It is queued for HR managerial review.'
                : 'Your application meets policy rules and has been saved to the Hollandia HR queue for final review.'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 text-left grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div><p className="text-gray-400 font-medium">Request ID</p><p className="font-mono font-semibold text-gray-800 text-sm mt-0.5">{submittedReq.id.slice(0, 8)}...</p></div>
            <div><p className="text-gray-400 font-medium">Employee</p><p className="font-semibold text-gray-800 text-sm mt-0.5">{submittedReq.employeeName}</p></div>
            <div><p className="text-gray-400 font-medium">Status</p>
              <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${submittedReq.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : submittedReq.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{submittedReq.status}</span>
            </div>
            <div><p className="text-gray-400 font-medium">Queue Position</p><p className="font-semibold text-brand-700 text-sm mt-0.5">#{submittedReq.queuePosition}</p></div>
            <div className="col-span-2 md:col-span-4 pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><p className="text-gray-400 font-medium">Dates</p><p className="text-gray-800 font-medium mt-0.5">{new Date(submittedReq.startDate).toLocaleDateString()} - {new Date(submittedReq.endDate).toLocaleDateString()}</p></div>
              <div><p className="text-gray-400 font-medium">Duration</p><p className="text-gray-800 font-medium mt-0.5">{days} day(s)</p></div>
              <div><p className="text-gray-400 font-medium">Department</p><p className="text-gray-800 font-medium mt-0.5">{DEPARTMENT_LABELS[submittedReq.department]}</p></div>
            </div>
          </div>
          <div className="text-left"><EligibilityResultCard result={eligResult} /></div>
          <div className="flex flex-wrap gap-3 justify-center pt-4">
            <button className="btn-secondary" onClick={handleReset}><RefreshCw size={15} /> Submit Another Application</button>
            {onNavigateRequests && (
              <button className="btn-primary" onClick={onNavigateRequests}>View My Requests <ArrowRight size={15} /></button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Wizard ----------
  const label = 'block text-sm font-bold text-gray-900 mb-1';
  const req = <span className="text-red-600"> *</span>;
  const yellowBtn = 'inline-flex items-center gap-1 px-6 py-2 rounded text-sm font-semibold bg-[#f1c232] text-white hover:bg-[#d9ac1e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const outlineBtn = 'inline-flex items-center gap-1 px-5 py-2 rounded text-sm font-semibold bg-white text-[#f1c232] border border-[#f1c232] hover:bg-yellow-50 transition-colors';

  return (
    <div className="p-4 md:p-8">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto bg-[#d9ead3] rounded-xl shadow p-6 md:p-10 space-y-6">
        <h1 className="text-center text-2xl md:text-3xl font-extrabold tracking-tight text-[#3d85c6] uppercase">
          Employee Leave of Absence Form
        </h1>

        {/* Stepper */}
        <div className="grid grid-cols-3 gap-3">
          {STEPS.map((s, i) => (
            <div key={s}>
              <div className={`h-1 rounded ${i + 1 === step ? 'bg-[#1a9cff]' : 'bg-[#b6d7a8]'}`} />
              <p className="text-xs md:text-sm text-gray-900 mt-2">{s}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* ---------------- STEP 1 ---------------- */}
        {step === 1 && (
          <div className="space-y-6 text-sm text-gray-900">
            <div>
              <label className={label}>Name{req}</label>
              {isEmployee ? (
                <div className="grid grid-cols-2 gap-3">
                  <input className="form-input bg-white" readOnly value={user!.name.split(' ')[0] || ''} />
                  <input className="form-input bg-white" readOnly value={user!.name.split(' ').slice(1).join(' ')} />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setEntryMode('registered')} className={`px-3 py-1 rounded ${entryMode === 'registered' ? 'bg-white shadow font-semibold' : 'bg-white/50'}`}>Registered employee</button>
                    <button type="button" onClick={() => setEntryMode('manual')} className={`px-3 py-1 rounded ${entryMode === 'manual' ? 'bg-white shadow font-semibold' : 'bg-white/50'}`}>New / manual entry</button>
                  </div>
                  {entryMode === 'registered' ? (
                    <select className="form-select" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                      <option value="">Select employee...</option>
                      {employees.filter(e => e.role !== 'ADMIN').map(e => (
                        <option key={e.id} value={e.id}>{e.name} - {DEPARTMENT_LABELS[e.department]}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input className="form-input" placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} />
                      <input className="form-input" placeholder="Last" value={lastName} onChange={e => setLastName(e.target.value)} />
                      <select className="form-select" value={manualDept} onChange={e => setManualDept(e.target.value as Department)}>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-extrabold text-gray-900">Basic Guidelines</h2>
              <div className="inline-block bg-[#2b5f8a] text-white text-[11px] font-bold tracking-wider px-3 py-1.5 rounded">BRITISH COLUMBIA</div>
              <hr className="border-[#b6d7a8]" />
              <p className="text-center font-bold text-base">In compliance with the Employment Standard, an employee tells their employer when they need to take a leave</p>
              <hr className="border-[#b6d7a8]" />
              <p>An employee needs to let their employer know:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>When they need to take their leave</strong> – it's best to give advance notice in writing; though, this isn't a requirement</li>
                <li><strong>Why they need to take the leave</strong> – employers can ask for proof that the leave is one of the types that are allowed</li>
              </ul>
              <p>Some leaves, like compassionate care leave, are taken a week at a time – a week starts on Sunday. If an employee takes two days of leave in a week, it counts as a full week of leave.</p>
              <p><a className="text-blue-600 underline" href={BC_LINK_VACATION} target="_blank" rel="noreferrer">Entitlement to Annual Vacation - Act Part 7, Section 57</a></p>
              <p>The basic entitlement is 2 weeks of vacation for every completed "year of employment". After 5 consecutive years of employment with the same employer, the entitlement increases to 3 weeks of vacation.</p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer max-w-sm">
              <input type="checkbox" className="mt-1" checked={guidelinesRead} onChange={e => setGuidelinesRead(e.target.checked)} />
              <span>I have read and understand the basic guidelines as stated above</span>
            </label>

            <button type="button" className={yellowBtn} onClick={goNext}>Next <ChevronRight size={14} /></button>
          </div>
        )}

        {/* ---------------- STEP 2 ---------------- */}
        {step === 2 && (
          <div className="space-y-6 text-sm text-gray-900">
            <div>
              <label className={label}>Immigration Status{req}</label>
              <div className="flex gap-5">
                <label className="flex items-center gap-1.5"><input type="radio" name="imm" checked={immigration === 'TFW'} onChange={() => setImmigration('TFW')} /> TFW</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="imm" checked={immigration === 'NON_TFW'} onChange={() => setImmigration('NON_TFW')} /> Non-TFW</label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={label}>DATE TODAY{req}</label><input type="date" className="form-input" value={todayISO()} readOnly /></div>
              <div><label className={label}>Employee Number{req}</label><input className="form-input" value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={label}>When was your last day of work?</label><input type="date" className="form-input" value={lastDayOfWork} onChange={e => setLastDayOfWork(e.target.value)} /></div>
              <div><label className={label}>Email Address{req}</label><input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div><label className={label}>Start Date{req}</label><input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><label className={label}>Date of return to work{req}</label><input type="date" className="form-input" min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
              <div><label className={label}>Number of Days Leave</label><input className="form-input" readOnly value={days} /></div>
              <div><p className={label}>Equivalent Weeks of Leave</p><p className="text-sm py-2">{weeks}</p></div>
            </div>

            <p className="uppercase text-xs tracking-wide">If applicable, please fill out the time below.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={label}>What time will you leave from work?</label><input type="time" className="form-input" value={leaveTime} onChange={e => setLeaveTime(e.target.value)} /></div>
              <div><label className={label}>Will you come back to work? If yes, what time? otherwise leave it blank</label><input type="time" className="form-input" value={returnTime} onChange={e => setReturnTime(e.target.value)} /></div>
            </div>

            <div className="flex gap-3">
              <button type="button" className={outlineBtn} onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</button>
              <button type="button" className={yellowBtn} onClick={goNext}>Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {/* ---------------- STEP 3 ---------------- */}
        {step === 3 && (
          <div className="space-y-6 text-sm text-gray-900">
            <div>
              <h2 className="text-xl font-extrabold">Type of</h2>
              <label className={label}>Leave of Absence{req}</label>
              <div className="space-y-2.5 mt-2">
                {LEAVE_TYPES.map(t => (
                  <label key={t.id} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={types.includes(t.id)} onChange={() => toggleType(t.id)} />
                    <span>{t.label}</span>
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={otherChecked} onChange={e => setOtherChecked(e.target.checked)} />
                  <input className="form-input" placeholder="Other" value={otherText} onChange={e => { setOtherText(e.target.value); if (e.target.value) setOtherChecked(true); }} />
                </div>
                <p className="text-xs font-bold">Please state your reason on the space provided if you selected "Other | Personal".</p>
              </div>
            </div>

            {/* Paid sick leave section (shown only when Paid Sick Leave is selected) */}
            {paidSick && (
              <div className="space-y-5 pt-2 border-t border-[#b6d7a8]">
                <p>
                  As per <a className="text-blue-600 underline" href={BC_LINK_SICK} target="_blank" rel="noreferrer">Employment standards and workplace safety | Paid Sick Leave</a> the Act DOES NOT PROHIBIT the employer from requesting reasonably sufficient proof of illness.
                </p>
                <div className="bg-white p-4 space-y-3">
                  <h3 className="text-xl font-bold">I'm a worker</h3>
                  <p>You can take up to 5 days of paid leave per year for any personal illness or injury. <span className="bg-yellow-200 underline decoration-red-600 decoration-2">Your employer may request reasonably sufficient proof of illness.</span></p>
                  <p>This entitlement is in addition to the <span className="underline">3 days of <strong>unpaid</strong> sick leave</span> currently provided by the Employment Standards Act.</p>
                  <p>You must have worked with your employer for at least 90 days to be <span className="underline">eligible</span> for the paid sick days.</p>
                </div>

                <div>
                  <label className={label}>Agreement (Please read and ticked mark all the boxes to proceed){req}</label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={sickAck1} onChange={e => setSickAck1(e.target.checked)} /><span>Yes, I understand that As per Employment standards and workplace safety | Paid Sick Leave the Act DOES NOT PROHIBIT the employer from requesting reasonably sufficient proof of illness.</span></label>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={sickAck2} onChange={e => setSickAck2(e.target.checked)} /><span>Yes, I understand that as per Employment standards and workplace safety | Paid Sick Leave, my employer may request Reasonably Sufficient Proof of Illness.</span></label>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={sickAck3} onChange={e => setSickAck3(e.target.checked)} /><span>Yes, I understand that my paid sick leave will be processed after I submitted my proof of illess and will be paid on the suceeding pay period.</span></label>
                  </div>
                </div>

                <div>
                  <label className={label}>Would you like to upload your Proof of Illness now?{req}</label>
                  <select className="form-select" value={proofNow} onChange={e => setProofNow(e.target.value)}>
                    <option value=""></option>
                    <option value="Yes - uploading now">Yes - uploading now</option>
                    <option value="No - will submit later">No - will submit later</option>
                  </select>
                  {proofNow.startsWith('Yes') && (
                    <input type="file" className="mt-2 block text-xs" accept="image/*,.pdf" />
                  )}
                </div>

                <div>
                  <label className={label}>How many days of Paid Sick Leave would you like to avail for the pay period?{req}</label>
                  <input type="number" min={1} className="form-input" value={sickDays} onChange={e => setSickDays(e.target.value)} />
                </div>

                <div>
                  <label className={label}>Hire Date{req}</label>
                  <input type="date" className="form-input max-w-[200px]" value={hireDate} readOnly={!!knownHireDate} onChange={e => setHireDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Optional travel documents for policy-governed leave */}
            {showTravel && (
              <div className="space-y-3 pt-2 border-t border-[#b6d7a8]">
                <p className="font-bold flex items-center gap-1.5"><Info size={15} /> Travel documents (if travelling outside Canada)</p>
                <p className="text-xs">Documents must stay valid for at least 4 months after your return date.</p>
                <input className="form-input" placeholder="Destination country" value={destination} onChange={e => setDestination(e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-xs font-semibold">Passport expiry</label><input type="date" className="form-input" value={passportExpiry} onChange={e => setPassportExpiry(e.target.value)} /></div>
                  <div><label className="text-xs font-semibold">Work permit expiry</label><input type="date" className="form-input" value={workPermitExpiry} onChange={e => setWorkPermitExpiry(e.target.value)} /></div>
                  <div><label className="text-xs font-semibold">Contract expiry</label><input type="date" className="form-input" value={contractExpiry} onChange={e => setContractExpiry(e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* Live policy assessment */}
            {previewing && (
              <div className="p-3 rounded-lg bg-white/70 text-xs flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Assessing against Hollandia leave policy...</div>
            )}
            {eligResult && !previewing && (
              eligResult.failures.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex items-start gap-3">
                  <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-950">Application may be eligible for submission for final review</p>
                    <p className="text-xs text-emerald-800 mt-1">Based on Hollandia's policy rules, your request meets the requirements. You may submit it for final HR review.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 space-y-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={26} className="text-red-600 shrink-0" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-red-950">Policy conflict - not eligible under standard rules</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full"><Flag size={10} /> Red-flagged</span>
                      </div>
                      <ul className="list-disc pl-5 mt-1 text-xs text-red-900 space-y-0.5">
                        {eligResult.failures.map((f, i) => <li key={i}><strong>{f.rule}:</strong> {f.message}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs bg-red-100 border border-red-200 rounded p-2 text-red-900">You may still submit. The application will be red-flagged for HR exception review.</p>
                </div>
              )
            )}

            <div className="flex flex-wrap gap-3">
              <button type="button" className={outlineBtn} onClick={() => setStep(2)}><ArrowLeft size={14} /> Back</button>
              <button
                type="submit"
                disabled={submitting || !step3Valid}
                className={`inline-flex items-center gap-2 px-6 py-2 rounded text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  eligResult && eligResult.failures.length > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-[#f1c232] hover:bg-[#d9ac1e]'
                }`}
              >
                {submitting ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                {submitting ? 'Submitting...' : eligResult && eligResult.failures.length > 0 ? 'Submit (Red Flag)' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
