import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HandCoins, CheckCircle2, XCircle, Clock, Pencil, ChevronRight } from 'lucide-react';
import { loansApi } from '../api/loans';
import { useAuth } from '../context/AuthContext';
import type { LoanApplication } from '../types';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const SHOW_DECIDED_DAYS = 60;

type StepState = 'done' | 'current' | 'todo' | 'bad';
function Step({ state, label, sub }: { state: StepState; label: string; sub?: string }) {
  const dot = state === 'done' ? 'bg-green-600 text-white' : state === 'current' ? 'bg-yellow-400 text-white animate-pulse' : state === 'bad' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-400';
  const Icon = state === 'done' ? CheckCircle2 : state === 'bad' ? XCircle : Clock;
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center text-center gap-1">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${dot}`}><Icon size={18} /></div>
      <p className={`text-xs font-semibold ${state === 'todo' ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
      {sub && <p className="text-[11px] text-gray-500 leading-tight">{sub}</p>}
    </div>
  );
}
const Bar = ({ on }: { on: boolean }) => <div className={`h-1 flex-1 rounded mt-[18px] ${on ? 'bg-green-500' : 'bg-gray-200'}`} />;

/** The employee's latest loan application and where it stands, on My Dashboard. */
export default function LoanProgressCard({ onOpenLoan }: { onOpenLoan: () => void }) {
  const { user, refreshUser } = useAuth();
  const [loan, setLoan] = useState<LoanApplication | null>(null);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(() => {
    loansApi.list().then(list => {
      const latest = list[0] || null;   // newest first
      setLoan(latest);
      // When HR decides while the dashboard is open, the loan figures in the banner above change too.
      if (latest && lastStatus.current && latest.status !== lastStatus.current && latest.status === 'APPROVED') refreshUser().catch(() => {});
      lastStatus.current = latest?.status ?? null;
    }).catch(() => {});
  }, [refreshUser]);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  if (!loan || !user) return null;
  const decidedAgo = loan.decidedAt ? (Date.now() - new Date(loan.decidedAt).getTime()) / 86400000 : 0;
  if (loan.status !== 'PENDING' && decidedAgo > SHOW_DECIDED_DAYS) return null;

  const pending = loan.status === 'PENDING', approved = loan.status === 'APPROVED', denied = loan.status === 'DENIED';
  const tone = pending ? 'border-t-yellow-400' : approved ? 'border-t-green-500' : 'border-t-red-500';

  return (
    <div className={`card p-4 md:p-5 space-y-4 border-t-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><HandCoins size={18} /></div>
          <div>
            <p className="font-bold text-gray-900 text-sm md:text-base">My Loan Application</p>
            <p className="text-xs text-gray-500">{money(loan.amount)} · applied {day(loan.submittedAt)}{loan.edited ? ` · changed ${day(loan.updatedAt)}` : ''}</p>
          </div>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${pending ? 'bg-yellow-100 text-yellow-800' : approved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {pending ? 'Waiting for HR review' : approved ? 'Approved' : 'Denied'}
        </span>
      </div>

      <div className="flex items-start px-1">
        <Step state="done" label="Submitted" sub={day(loan.submittedAt)} />
        <Bar on />
        <Step state={pending ? 'current' : 'done'} label="HR review" sub={pending ? 'In progress' : 'Completed'} />
        <Bar on={!pending} />
        <Step state={pending ? 'todo' : approved ? 'done' : 'bad'} label={pending ? 'Decision' : approved ? 'Approved' : 'Denied'} sub={loan.decidedAt ? day(loan.decidedAt) : 'Not yet'} />
      </div>

      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-900">
          <p>HR has your application. You will get a pop-up here and a phone alert when they decide. You can change it until then.</p>
          <button className="btn-secondary !py-1 !px-2 text-xs" onClick={onOpenLoan}><Pencil size={12} /> Change application</button>
        </div>
      )}
      {approved && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-900 space-y-1">
          <p><strong>Your loan of {money(loan.amount)} was approved.</strong> It was added to your loan record, and repayment starts on the payday following the approval.</p>
          {loan.currentLoan.original > 0 && <p>Loan record now: {money(loan.currentLoan.remaining)} left of {money(loan.currentLoan.original)} ({loan.currentLoan.repaidPercent}% repaid).</p>}
          {loan.decisionNote && <p>Note from HR: {loan.decisionNote}</p>}
        </div>
      )}
      {denied && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-900 space-y-1">
          <p><strong>Your loan application was denied.</strong>{loan.decisionNote ? '' : ' Ask HR if you want to know more.'}</p>
          {loan.decisionNote && <p>Note from HR: {loan.decisionNote}</p>}
        </div>
      )}

      <button className="text-xs text-brand-700 hover:underline flex items-center gap-0.5" onClick={onOpenLoan}>View all my loan applications <ChevronRight size={12} /></button>
    </div>
  );
}
