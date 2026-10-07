import React, { useEffect, useState } from 'react';
import { 
  FileText, CheckCircle2, AlertTriangle, Calendar, Plane, 
  User, Phone, ShieldCheck, Send, Eye, RefreshCw, 
  HelpCircle, Clock, Info, Check, ArrowRight
} from 'lucide-react';
import { employeesApi } from '../api/employees';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { Employee, Department, EligibilityResult, LeaveRequest, CreateLeaveRequestPayload } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';
import EligibilityResultCard from './EligibilityResult';

interface Props {
  onSuccess?: (request: LeaveRequest) => void;
  onNavigateRequests?: () => void;
}

type LeaveCategory = 'HOME_COUNTRY' | 'VACATION' | 'MEDICAL' | 'FAMILY' | 'OTHER';

const CATEGORIES: { id: LeaveCategory; label: string; icon: string; desc: string }[] = [
  { id: 'HOME_COUNTRY', label: 'Travel to Home Country', icon: '✈️', desc: 'Subject to 75-day cap & travel document rules' },
  { id: 'VACATION',     label: 'Personal Vacation',       icon: '🏖️', desc: 'Standard annual paid/unpaid vacation' },
  { id: 'MEDICAL',      label: 'Medical / Sick Leave',    icon: '🏥', desc: 'Health or medical recovery' },
  { id: 'FAMILY',       label: 'Family / Compassionate',  icon: '👨‍👩‍👧', desc: 'Family emergencies or bereavement' },
  { id: 'OTHER',        label: 'Other Reason',            icon: '📝', desc: 'General personal leave request' },
];

export default function IntegratedLeaveForm({ onSuccess, onNavigateRequests }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);

  const [entryMode, setEntryMode] = useState<'registered' | 'manual'>('registered');

  const [employeeId, setEmployeeId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualDept, setManualDept] = useState<Department>('GREENHOUSE');
  const [category, setCategory]     = useState<LeaveCategory>('HOME_COUNTRY');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [purpose, setPurpose]       = useState('');
  
  const [isTravelingAbroad, setIsTravelingAbroad] = useState(true);
  const [destination, setDestination]             = useState('');
  const [passportExpiry, setPassportExpiry]       = useState('');
  const [workPermitExpiry, setWorkPermitExpiry]   = useState('');
  const [contractExpiry, setContractExpiry]       = useState('');

  const [emergencyName, setEmergencyName]   = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRel, setEmergencyRel]     = useState('');

  const [acknowledged, setAcknowledged] = useState(false);
  const [previewing, setPreviewing]     = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');
  const [eligResult, setEligResult]     = useState<EligibilityResult | null>(null);
  const [submittedReq, setSubmittedReq] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    employeesApi.getAll()
      .then(setEmployees)
      .catch(() => {})
      .finally(() => setLoadingEmps(false));
  }, []);

  useEffect(() => {
    if (category === 'HOME_COUNTRY') {
      setIsTravelingAbroad(true);
    }
  }, [category]);

  const selectedEmp = employees.find(e => e.id === employeeId);

  const durationDays = startDate && endDate
    ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 0;

  const buildPayload = (): CreateLeaveRequestPayload => {
    return {
      ...(entryMode === 'registered' ? { employeeId } : { employeeName: manualName.trim(), department: manualDept }),
      startDate,
      endDate,
      category,
      destination: isTravelingAbroad ? destination : undefined,
      emergencyContactName: emergencyName ? `${emergencyName} (${emergencyRel || 'Contact'})` : undefined,
      emergencyContactPhone: emergencyPhone || undefined,
      purpose,
      passportExpiry: isTravelingAbroad && passportExpiry ? passportExpiry : null,
      workPermitExpiry: isTravelingAbroad && workPermitExpiry ? workPermitExpiry : null,
      contractExpiry: isTravelingAbroad && contractExpiry ? contractExpiry : null,
    };
  };

  const handlePreview = async () => {
    setError('');
    setPreviewing(true);
    try {
      const res = await leaveRequestsApi.preview(buildPayload());
      setEligResult(res.eligibility);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview eligibility');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!acknowledged) {
      setError('Please acknowledge understanding of Hollandia leave policies before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await leaveRequestsApi.submit(buildPayload());
      setSubmittedReq(res.request);
      setEligResult(res.eligibility);
      if (onSuccess) onSuccess(res.request);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setEmployeeId('');
    setManualName('');
    setStartDate('');
    setEndDate('');
    setPurpose('');
    setDestination('');
    setPassportExpiry('');
    setWorkPermitExpiry('');
    setContractExpiry('');
    setEmergencyName('');
    setEmergencyPhone('');
    setEmergencyRel('');
    setAcknowledged(false);
    setEligResult(null);
    setSubmittedReq(null);
    setError('');
  };

  const canSubmit = (entryMode === 'registered' ? !!employeeId : !!manualName.trim()) && !!startDate && !!endDate && acknowledged;

  if (submittedReq && eligResult) {
    const isApproved = submittedReq.status === 'APPROVED';
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
        <div className="card p-8 text-center space-y-4 border-2 border-brand-100">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-brand-600">Application Submitted</span>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">Leave Request Received</h1>
            <p className="text-gray-500 text-sm mt-1">
              Your leave of absence application has been saved to the Hollandia HR queue.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 text-left grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-gray-400 font-medium">Request ID</p>
              <p className="font-mono font-semibold text-gray-800 text-sm mt-0.5 truncate">{submittedReq.id.slice(0, 8)}...</p>
            </div>
            <div>
              <p className="text-gray-400 font-medium">Employee</p>
              <p className="font-semibold text-gray-800 text-sm mt-0.5">{submittedReq.employeeName}</p>
            </div>
            <div>
              <p className="text-gray-400 font-medium">Initial Status</p>
              <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isApproved ? 'bg-green-100 text-green-800' :
                submittedReq.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
              }`}>
                {submittedReq.status}
              </span>
            </div>
            <div>
              <p className="text-gray-400 font-medium">Queue Position</p>
              <p className="font-semibold text-brand-700 text-sm mt-0.5">#{submittedReq.queuePosition}</p>
            </div>

            <div className="col-span-2 md:col-span-4 pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <p className="text-gray-400 font-medium">Requested Dates</p>
                <p className="text-gray-800 font-medium mt-0.5">
                  {new Date(submittedReq.startDate).toLocaleDateString()} — {new Date(submittedReq.endDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Duration</p>
                <p className="text-gray-800 font-medium mt-0.5">{durationDays} day(s)</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Department</p>
                <p className="text-gray-800 font-medium mt-0.5">{DEPARTMENT_LABELS[submittedReq.department]}</p>
              </div>
            </div>
          </div>

          <div className="text-left">
            <EligibilityResultCard result={eligResult} />
          </div>

          <div className="flex flex-wrap gap-3 justify-center pt-4">
            <button className="btn-secondary" onClick={handleReset}>
              <RefreshCw size={15} /> Submit Another Application
            </button>
            {onNavigateRequests && (
              <button className="btn-primary" onClick={onNavigateRequests}>
                View in All Requests Queue <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <FileText size={22} className="text-brand-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Leave Application</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Complete this form to apply for leave of absence or vacation. Submissions are instantly evaluated against Hollandia company policies.
        </p>

        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-800 font-medium rounded-full border border-brand-200">
            <Plane size={13} /> 75-Day Max for Home Country
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 font-medium rounded-full border border-amber-200">
            <Clock size={13} /> 4-Month Document Validity
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 font-medium rounded-full border border-blue-200">
            <ShieldCheck size={13} /> 50% Loan Repayment Rule
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="font-semibold">Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <User size={18} className="text-brand-600" />
              <h2 className="font-bold text-gray-800 text-base">1. Employee Information</h2>
            </div>
            <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs font-medium">
              <button
                type="button"
                className={`px-3 py-1 rounded-md transition-all ${entryMode === 'registered' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                onClick={() => setEntryMode('registered')}
              >
                Registered List
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-md transition-all ${entryMode === 'manual' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                onClick={() => setEntryMode('manual')}
              >
                Manual Entry
              </button>
            </div>
          </div>

          {entryMode === 'registered' ? (
            <div>
              <label className="form-label">Select Your Name *</label>
              {loadingEmps ? (
                <p className="text-sm text-gray-400 py-2">Loading employee roster...</p>
              ) : (
                <select
                  className="form-select"
                  value={employeeId}
                  onChange={e => {
                    setEmployeeId(e.target.value);
                    setEligResult(null);
                  }}
                  required
                >
                  <option value="">Select your name from the Hollandia roster...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {DEPARTMENT_LABELS[emp.department]}
                    </option>
                  ))}
                </select>
              )}

              {selectedEmp && (
                <div className="mt-3 p-3.5 bg-brand-50/60 rounded-xl border border-brand-100 text-xs text-brand-900 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block">Department</span>
                    <span className="font-semibold text-gray-800 text-sm">{DEPARTMENT_LABELS[selectedEmp.department]}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Hire Date</span>
                    <span className="font-semibold text-gray-800 text-sm">
                      {new Date(selectedEmp.hireDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-gray-500 block">Company Loan Status</span>
                    {selectedEmp.loanOriginal > 0 ? (
                      <span className={`font-semibold text-sm ${
                        (selectedEmp.loanRemaining / selectedEmp.loanOriginal) <= 0.5 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        ${selectedEmp.loanRemaining.toFixed(2)} left of ${selectedEmp.loanOriginal.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-green-700 font-semibold text-sm">No Active Loans</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Maria Gonzalez"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="form-label">Department *</label>
                <select
                  className="form-select"
                  value={manualDept}
                  onChange={e => setManualDept(e.target.value as Department)}
                  required
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Calendar size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-800 text-base">2. Leave Category & Dates</h2>
          </div>

          <div>
            <label className="form-label">Reason for Leave *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1.5">
              {CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    category === cat.id
                      ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl leading-none">{cat.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${category === cat.id ? 'text-brand-900' : 'text-gray-800'}`}>
                      {cat.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="form-label">Departure / Start Date *</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setEligResult(null);
                }}
                required
              />
            </div>
            <div>
              <label className="form-label">Return to Work Date *</label>
              <input
                type="date"
                className="form-input"
                min={startDate}
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setEligResult(null);
                }}
                required
              />
            </div>
          </div>

          {durationDays > 0 && (
            <div className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              durationDays > 75 && category === 'HOME_COUNTRY'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-gray-50 text-gray-700 border border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <Clock size={15} />
                <span>Requested Duration: <strong>{durationDays} calendar days</strong></span>
              </div>
              {durationDays > 75 && category === 'HOME_COUNTRY' && (
                <span className="font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  ⚠️ Exceeds 75-Day Policy Cap
                </span>
              )}
            </div>
          )}

          <div>
            <label className="form-label">Purpose / Additional Details</label>
            <textarea
              className="form-input resize-none"
              rows={2}
              placeholder="e.g. Travel to Jalisco to visit family, personal wedding, medical recovery..."
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
            />
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Plane size={18} className="text-brand-600" />
              <h2 className="font-bold text-gray-800 text-base">3. Travel & Documentation Validity</h2>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                checked={isTravelingAbroad}
                onChange={e => setIsTravelingAbroad(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Traveling internationally?</span>
            </label>
          </div>

          {isTravelingAbroad ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>4-Month Rule:</strong> All travel and employment documents (passport, work permit, contract) must remain valid for at least <strong>4 months</strong> beyond your scheduled return date. Many airlines also recommend at least <strong>6 months</strong> validity.
                </p>
              </div>

              <div>
                <label className="form-label">Destination Country</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Mexico, Philippines, Jamaica, Guatemala..."
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Passport Expiry Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={passportExpiry}
                    onChange={e => setPassportExpiry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Work Permit Expiry</label>
                  <input
                    type="date"
                    className="form-input"
                    value={workPermitExpiry}
                    onChange={e => setWorkPermitExpiry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Contract Expiry</label>
                  <input
                    type="date"
                    className="form-input"
                    value={contractExpiry}
                    onChange={e => setContractExpiry(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-1 italic">
              International travel documentation is not required for domestic leave. Check the box above if traveling abroad.
            </p>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Phone size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-800 text-base">4. Emergency Contact While on Leave</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Contact Person Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Full name"
                value={emergencyName}
                onChange={e => setEmergencyName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Relationship</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Spouse, Parent, Brother"
                value={emergencyRel}
                onChange={e => setEmergencyRel(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+1 (555) 000-0000"
                value={emergencyPhone}
                onChange={e => setEmergencyPhone(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4 border-brand-100">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <ShieldCheck size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-800 text-base">5. Hollandia Policy Acknowledgment</h2>
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100/70 transition-colors border border-gray-200">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 mt-1 h-4 w-4"
              required
            />
            <span className="text-xs text-gray-700 leading-relaxed">
              I acknowledge that I have read and agree to Hollandia Greenhouses' Leave of Absence policies. I understand that:
              <br />• 75-day maximum leaves to home countries must fall within approved scheduling blocks and non-blackout periods.
              <br />• Passports, work permits, and contracts must remain valid for at least 4 months past return.
              <br />• Outstanding company loans must be at least 50% repaid prior to leave departure.
            </span>
          </label>
        </div>

        {eligResult && (
          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-gray-500 tracking-wider">Live Policy Analysis</span>
              <button type="button" onClick={() => setEligResult(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
            </div>
            <EligibilityResultCard result={eligResult} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePreview}
            disabled={previewing || (!employeeId && !manualName.trim()) || !startDate || !endDate}
          >
            {previewing ? <RefreshCw size={15} className="animate-spin" /> : <Eye size={15} />}
            {previewing ? 'Evaluating Rules...' : 'Preview Policy Checks'}
          </button>

          <button
            type="submit"
            className="btn-primary px-6 py-2.5 text-base shadow-sm"
            disabled={submitting || !canSubmit}
          >
            {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
            {submitting ? 'Submitting Application...' : 'Submit Leave Application'}
          </button>
        </div>
      </form>
    </div>
  );
}