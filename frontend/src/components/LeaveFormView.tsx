import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { LeaveRequest } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { localDate, leaveDays } from '../utils/dates';

const longDay = (s: string) => localDate(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const filedOn = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** Pulls the answers the employee gave on the leave form back out of the request details text. */
export function parseLeaveDetails(purpose: string) {
  const type = (/^\[([^\]]*)\]/.exec(purpose) || [])[1] || '';
  let rest = purpose.replace(/^\[[^\]]*\]\s*/, '');
  const dest = /\(Dest:\s*([^)]*)\)/.exec(rest)?.[1] || '';
  rest = rest.replace(/\s*\(Dest:[^)]*\)/, '');
  const get = (re: RegExp) => (re.exec(rest) || [])[1]?.trim() || '';
  // Each answer runs up to the next " | " (or the end).
  const field = (label: string) => get(new RegExp(`${label}:\\s*([^|]*)`));
  return {
    type,
    immigration: field('Immigration'),
    employeeNumber: field('Emp#'),
    email: field('Email'),
    lastDayOfWork: field('Last day of work'),
    leavesAt: get(/Leaves at\s*([^|]*)/),
    returnsAt: get(/Returns at\s*([^|]*)/),
    otherReason: field('Other reason'),
    paidSick: get(/Paid sick days:\s*([^|]*)/),
    destination: dest,
  };
}

function Field({ label, children, wide }: { label: string; children?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 border-b border-gray-300 pb-0.5 whitespace-pre-wrap break-words">{children || '\u00a0'}</p>
    </div>
  );
}

/** One leave request laid out as the Employee Leave of Absence Form, ready to print. */
export default function LeaveFormView({ request: r, employeeNumber, onClose }: { request: LeaveRequest; employeeNumber?: string; onClose: () => void }) {
  // Only the form is printed while this dialog is open (shares the print rules used by the loan form); Esc closes it.
  useEffect(() => {
    document.body.classList.add('printing-loan');
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.classList.remove('printing-loan'); window.removeEventListener('keydown', key); };
  }, [onClose]);

  const d = parseLeaveDetails(r.purpose || '');
  const days = leaveDays(r.startDate, r.endDate);
  const statusCls = r.status === 'APPROVED' ? 'text-green-700 border-green-700' : r.status === 'DENIED' ? 'text-red-700 border-red-700' : r.status === 'CANCELLED' ? 'text-gray-600 border-gray-600' : 'text-yellow-700 border-yellow-700';
  const statusText = r.status === 'PENDING' ? 'PENDING REVIEW' : r.status;
  const hrNote = [r.decisionNote, ...(r.status === 'DENIED' ? (r.denialReasons || []) : [])].filter(Boolean).join('\n');

  return createPortal(
    <div className="loan-print-backdrop fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 md:p-8" onClick={onClose}>
      <div className="loan-print-area max-w-3xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="print-hide flex items-center justify-between gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">Leave of absence form</span>
          <div className="flex items-center gap-2">
            <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => window.print()}><Printer size={13} /> Print</button>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 md:p-10 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700">Hollandia Greenhouses Ltd.</p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Leave of Absence Form</h1>
            <span className={`inline-block mt-1 px-3 py-0.5 border-2 rounded text-xs font-bold tracking-widest ${statusCls}`}>{statusText}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Reference">{r.id.slice(0, 8)}</Field>
            <Field label="Date filed">{filedOn(r.submittedAt)}</Field>
            <Field label="Employee name">{r.employeeName}</Field>
            <Field label="Employee number">{d.employeeNumber || employeeNumber}</Field>
            <Field label="Department">{DEPARTMENT_LABELS[r.department] || r.department}</Field>
            <Field label="Email">{d.email}</Field>
            <Field label="Immigration status">{d.immigration}</Field>
            <Field label="Last day of work">{d.lastDayOfWork && longDay(d.lastDayOfWork)}</Field>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Type of leave</p>
            <p className="text-base font-bold text-gray-900 border-b border-gray-300 pb-0.5">{d.type || '\u00a0'}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Start date">{longDay(r.startDate)}</Field>
            <Field label="Date of return to work">{longDay(r.endDate)}</Field>
            <Field label="Number of days leave">{days} day{days === 1 ? '' : 's'} ({(days / 7).toFixed(2)} weeks)</Field>
            <Field label="Times (if applicable)">{[d.leavesAt && `Leaves at ${d.leavesAt}`, d.returnsAt && `Returns at ${d.returnsAt}`].filter(Boolean).join('   ')}</Field>
            {d.paidSick && <Field label="Paid sick leave (days requested; proof of illness)" wide>{d.paidSick}</Field>}
            {d.otherReason && <Field label="Other reason" wide>{d.otherReason}</Field>}
            {d.destination && <Field label="Destination" wide>{d.destination}</Field>}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">HR decision</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Status">{statusText}</Field>
              <Field label="Decided on">{r.decidedAt ? filedOn(r.decidedAt) : ''}</Field>
              <Field label="Note" wide>{hrNote}</Field>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-10 pt-10">
            <div><div className="border-b border-gray-700 h-8" /><p className="text-[11px] text-gray-500 mt-1">Employee signature and date</p></div>
            <div><div className="border-b border-gray-700 h-8" /><p className="text-[11px] text-gray-500 mt-1">Supervisor / HR signature and date</p></div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
