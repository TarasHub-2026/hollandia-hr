import React, { useEffect, useState, useCallback } from 'react';
import { 
  Calendar, CheckCircle2, Clock, XCircle, AlertTriangle, 
  Plane, PlusCircle, RefreshCw, KeyRound, ShieldCheck, 
  DollarSign, Briefcase, ChevronRight, UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leaveRequestsApi } from '../api/leaveRequests';
import { authApi } from '../api/auth';
import type { LeaveRequest, RequestStatus } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import EligibilityResultCard from './EligibilityResult';

interface Props {
  onApplyLeave: () => void;
}

export default function EmployeePortal({ onApplyLeave }: Props) {
  const { user, refreshUser } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Change PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin]             = useState('');
  const [newPin, setNewPin]             = useState('');
  const [pinMsg, setPinMsg]             = useState('');
  const [pinError, setPinError]         = useState('');
  const [savingPin, setSavingPin]       = useState(false);

  // Active filter tab
  const [activeTab, setActiveTab] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'DENIED'>('APPROVED');

  const loadRequests = useCallback(() => {
    if (!user) return;
    setLoading(true);
    leaveRequestsApi.getByEmployee(user.id)
      .then(setRequests)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  if (!user) return null;

  const approvedReqs = requests.filter(r => r.status === 'APPROVED');
  const pendingReqs  = requests.filter(r => r.status === 'PENDING');
  const deniedReqs   = requests.filter(r => r.status === 'DENIED');

  const filtered = activeTab === 'ALL' ? requests :
                   activeTab === 'APPROVED' ? approvedReqs :
                   activeTab === 'PENDING' ? pendingReqs : deniedReqs;

  // Calculate loan repayment percentage
  const loanPaidPercent = user.loanOriginal > 0 
    ? Math.round(((user.loanOriginal - user.loanRemaining) / user.loanOriginal) * 100)
    : 100;
  const isLoanEligible = loanPaidPercent >= 50;

  // Calculate tenure
  const hireDate = new Date(user.hireDate);
  const tenureYears = ((Date.now() - hireDate.getTime()) / (365.25 * 86400000)).toFixed(1);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg('');
    setPinError('');
    setSavingPin(true);
    try {
      await authApi.changePin(user.id, oldPin, newPin);
      setPinMsg('PIN changed successfully!');
      setOldPin('');
      setNewPin('');
      setTimeout(() => setShowPinModal(false), 1500);
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : 'Failed to update PIN');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      {/* Top Welcome Card */}
      <div className="card p-6 md:p-8 bg-gradient-to-r from-brand-800 to-brand-900 text-white shadow-lg overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-brand-200">
                {DEPARTMENT_LABELS[user.department]}
              </span>
              <span className="text-xs text-brand-300">
                Hired {new Date(user.hireDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} ({tenureYears} yrs)
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
            <p className="text-xs md:text-sm text-brand-200 max-w-xl">
              Track your scheduled vacations, submit leave requests for home country travel, and monitor real-time review status.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              onClick={onApplyLeave}
              className="btn-primary bg-white text-brand-900 hover:bg-brand-50 border-transparent font-semibold shadow-md"
            >
              <PlusCircle size={16} className="text-brand-700" /> Apply for Leave
            </button>
            <button
              onClick={() => {
                setShowPinModal(true);
                setPinMsg('');
                setPinError('');
              }}
              className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs"
            >
              <KeyRound size={14} /> Change PIN
            </button>
          </div>
        </div>

        {/* Loan & Eligibility status banner */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/10 text-brand-200">
              <DollarSign size={16} />
            </div>
            <div>
              <p className="text-brand-300 font-medium">Loan Repayment Status</p>
              {user.loanOriginal > 0 ? (
                <p className="font-semibold text-white mt-0.5">
                  ${user.loanRemaining.toFixed(2)} left of ${user.loanOriginal.toFixed(2)} ({loanPaidPercent}% paid)
                  <span className={`ml-1.5 ${isLoanEligible ? 'text-emerald-400' : 'text-red-300'}`}>
                    {isLoanEligible ? '• Eligible' : '• Under 50%'}
                  </span>
                </p>
              ) : (
                <p className="font-semibold text-emerald-300 mt-0.5">No Active Company Loans</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/10 text-brand-200">
              <Briefcase size={16} />
            </div>
            <div>
              <p className="text-brand-300 font-medium">Continuous Tenure</p>
              <p className="font-semibold text-white mt-0.5">
                {parseFloat(tenureYears) >= 1 ? '✅ Satisfies 1-Year Rule' : '⚠️ Under 1 Year Tenure'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/10 text-brand-200">
              <Plane size={16} />
            </div>
            <div>
              <p className="text-brand-300 font-medium">Home Country Policy</p>
              <p className="font-semibold text-white mt-0.5">Max 75 Days Non-Blackout</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab('APPROVED')}
          className={`card p-4 text-left transition-all ${activeTab === 'APPROVED' ? 'ring-2 ring-emerald-500 bg-emerald-50/30' : 'hover:border-gray-300'}`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Approved Leaves</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{approvedReqs.length}</p>
          <span className="text-[11px] text-emerald-700 font-medium mt-1 block">Scheduled & Confirmed</span>
        </button>

        <button
          onClick={() => setActiveTab('PENDING')}
          className={`card p-4 text-left transition-all ${activeTab === 'PENDING' ? 'ring-2 ring-yellow-500 bg-yellow-50/30' : 'hover:border-gray-300'}`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Pending Review</span>
            <Clock size={16} className="text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{pendingReqs.length}</p>
          <span className="text-[11px] text-yellow-700 font-medium mt-1 block">In HR Queue</span>
        </button>

        <button
          onClick={() => setActiveTab('DENIED')}
          className={`card p-4 text-left transition-all ${activeTab === 'DENIED' ? 'ring-2 ring-red-500 bg-red-50/30' : 'hover:border-gray-300'}`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Denied / Flagged</span>
            <XCircle size={16} className="text-red-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{deniedReqs.length}</p>
          <span className="text-[11px] text-red-700 font-medium mt-1 block">Policy Conflicts</span>
        </button>

        <button
          onClick={() => setActiveTab('ALL')}
          className={`card p-4 text-left transition-all ${activeTab === 'ALL' ? 'ring-2 ring-brand-500 bg-brand-50/30' : 'hover:border-gray-300'}`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>All Requests</span>
            <Calendar size={16} className="text-brand-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
          <span className="text-[11px] text-brand-700 font-medium mt-1 block">Total Submissions</span>
        </button>
      </div>

      {/* Main Leave Records List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {activeTab === 'APPROVED' ? 'Approved Leave Records' :
               activeTab === 'PENDING' ? 'Pending Leave Applications' :
               activeTab === 'DENIED' ? 'Denied / Flagged Requests' : 'All Leave Submissions'}
            </h2>
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
              {filtered.length}
            </span>
          </div>

          <button
            onClick={loadRequests}
            className="text-xs text-gray-500 hover:text-brand-700 flex items-center gap-1"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-brand-600" />
            <p className="text-sm">Loading your leave records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
              <Calendar size={22} />
            </div>
            <p className="text-sm font-semibold text-gray-700">No {activeTab.toLowerCase()} requests found</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {activeTab === 'APPROVED' 
                ? 'You do not have any approved leaves scheduled yet. Submit an application to get started.'
                : 'No records in this category.'}
            </p>
            <button onClick={onApplyLeave} className="btn-primary text-xs mx-auto">
              <PlusCircle size={14} /> Submit a Leave Application
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => {
              const start = new Date(req.startDate);
              const end   = new Date(req.endDate);
              const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
              const isApproved = req.status === 'APPROVED';
              const isPending  = req.status === 'PENDING';

              return (
                <div key={req.id} className="card p-5 space-y-3 hover:border-gray-300 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isApproved ? 'bg-emerald-100 text-emerald-700' :
                        isPending ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {isApproved ? <CheckCircle2 size={20} /> :
                         isPending ? <Clock size={20} /> : <XCircle size={20} />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-base">
                            {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isApproved ? 'bg-emerald-100 text-emerald-800' :
                            isPending ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {req.status}
                          </span>
                          {isPending && (
                            <span className="text-xs bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 rounded-full border border-brand-200">
                              Queue Position #{req.queuePosition}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 mt-1">
                          <strong>{days} calendar days</strong> • Submitted on {new Date(req.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    {req.adjustedEndDate && (
                      <div className="text-right text-xs bg-amber-50 border border-amber-200 p-2 rounded-lg">
                        <span className="text-amber-800 font-semibold block">⚠️ Adjusted End Date:</span>
                        <span className="text-amber-900 font-medium">
                          {new Date(req.adjustedEndDate).toLocaleDateString()} (Blackout window limit)
                        </span>
                      </div>
                    )}
                  </div>

                  {req.purpose && (
                    <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-700">
                      <span className="font-semibold text-gray-600">Details: </span>
                      {req.purpose}
                    </div>
                  )}

                  {/* Denial reasons if denied */}
                  {req.denialReasons && req.denialReasons.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1">
                      <p className="font-semibold text-red-800">Policy Reasons:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {req.denialReasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings / advisories */}
                  {req.warnings && req.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        {req.warnings.map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Change PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-brand-600" />
                <h3 className="font-bold text-gray-900 text-sm">Change Security PIN</h3>
              </div>
              <button
                onClick={() => setShowPinModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {pinMsg && (
              <div className="p-3 rounded-lg bg-green-50 text-green-700 text-xs font-semibold">
                {pinMsg}
              </div>
            )}

            {pinError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                {pinError}
              </div>
            )}

            <form onSubmit={handleSavePin} className="space-y-4">
              <div>
                <label className="form-label text-xs">Current PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  className="form-input text-xs"
                  placeholder="e.g. 1234"
                  value={oldPin}
                  onChange={e => setOldPin(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label text-xs">New 4-Digit PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  className="form-input text-xs"
                  placeholder="Enter 4-6 digits"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setShowPinModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPin}
                  className="btn-primary text-xs"
                >
                  {savingPin ? 'Updating...' : 'Save New PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}