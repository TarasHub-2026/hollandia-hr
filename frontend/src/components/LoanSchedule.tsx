import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { loansApi } from '../api/loans';
import type { LoanApplication } from '../types';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const STATUS: Record<string, { text: string; cls: string }> = {
  PAID: { text: 'Paid', cls: 'text-green-700' },
  PARTIAL: { text: 'Part paid', cls: 'text-amber-700' },
  DUE: { text: 'Due', cls: 'text-gray-500' },
  OVERDUE: { text: 'Overdue', cls: 'text-red-700 font-bold' },
};

/** The repayment table for one loan (it prints with the form), and for HR the payments posted so far. */
export default function LoanSchedule({ loan, isAdmin, onUpdated }: { loan: LoanApplication; isAdmin: boolean; onUpdated: (l: LoanApplication) => void }) {
  const [paidOn, setPaidOn] = useState(today());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rows = loan.schedule;
  if (!rows || !rows.length) return null;
  const approved = loan.status === 'APPROVED';
  const hasDates = rows.some(r => r.dueDate);
  const bal = loan.balance;

  const add = async () => {
    setErr(''); setBusy(true);
    try { onUpdated(await loansApi.addPayment(loan.id, { paidOn, amount: parseFloat(amount), note: note.trim() || undefined })); setAmount(''); setNote(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not post the payment'); }
    finally { setBusy(false); }
  };
  const remove = async (pid: string) => {
    if (!window.confirm('Remove this payment? The loan balance will go back up.')) return;
    setErr(''); setBusy(true);
    try { onUpdated(await loansApi.deletePayment(loan.id, pid)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove the payment'); }
    finally { setBusy(false); }
  };

  const th = 'text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold py-1 pr-3';
  const td = 'py-0.5 pr-3 tabular-nums';
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Repayment Schedule (Amortization Table)</h2>
      <p className="text-xs text-gray-600">
        {approved ? 'Deducted from each regular paycheque. ' : 'Projected schedule if approved as applied. '}
        Interest is spread evenly over the payments.{approved && bal ? ` Paid so far ${money(bal.paid)}; still owing ${money(bal.outstanding)}.` : ''}
      </p>
      {approved && isAdmin && !hasDates && (
        <p className="print-hide text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">Paydays are not set. On the Loan Applications page, enter one known payday under &quot;Payday for repayment tables&quot; to date this table.</p>
      )}
      <table className="w-full text-xs border-t border-gray-300">
        <thead><tr className="border-b border-gray-300">
          <th className={th}>#</th>{hasDates && <th className={th}>Payday</th>}<th className={`${th} text-right`}>Payment</th><th className={`${th} text-right`}>Interest</th>
          <th className={`${th} text-right`}>Principal</th><th className={`${th} text-right`}>Balance</th>{approved && <th className={th}>Status</th>}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.n} className="border-b border-gray-100" style={{ breakInside: 'avoid' }}>
              <td className={td}>{r.n}</td>{hasDates && <td className={td}>{r.dueDate ? day(r.dueDate) : ''}</td>}
              <td className={`${td} text-right`}>{money(r.payment)}</td><td className={`${td} text-right`}>{money(r.interest)}</td>
              <td className={`${td} text-right`}>{money(r.principal)}</td><td className={`${td} text-right`}>{money(r.balance)}</td>
              {approved && <td className={`${td} ${r.status ? STATUS[r.status].cls : ''}`}>{r.status ? STATUS[r.status].text : ''}</td>}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={hasDates ? 2 : 1}>Total</td>
            <td className={`${td} text-right`}>{money(rows.reduce((s, r) => s + r.payment, 0))}</td>
            <td className={`${td} text-right`}>{money(rows.reduce((s, r) => s + r.interest, 0))}</td>
            <td className={`${td} text-right`}>{money(rows.reduce((s, r) => s + r.principal, 0))}</td>
            <td className={td} colSpan={approved ? 2 : 1}></td>
          </tr>
        </tbody>
      </table>

      {approved && isAdmin && (
        <div className="print-hide border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <p className="text-sm font-bold text-gray-900">Payments deducted by payroll</p>
          {loan.paymentLog && loan.paymentLog.length > 0 ? (
            <ul className="text-xs divide-y divide-gray-200">
              {loan.paymentLog.map(p => (
                <li key={p.id} className="py-1 flex items-center justify-between gap-2">
                  <span>{day(p.paidOn)} · <strong>{money(p.amount)}</strong> <span className="text-gray-500">(principal {money(p.principal)}, interest {money(p.interest)})</span> · {p.source === 'IMPORT' ? 'imported' : 'entered by hand'}{p.note ? ` · ${p.note}` : ''}</span>
                  <button className="text-gray-400 hover:text-red-600" disabled={busy} onClick={() => remove(p.id)} aria-label="Remove payment"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-gray-500">No payments posted yet.</p>}
          {bal && bal.outstanding > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div><label className="block text-[11px] text-gray-500">Payday</label><input type="date" className="form-input !py-1 !w-40" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></div>
              <div><label className="block text-[11px] text-gray-500">Amount</label><input type="number" min={0.01} step="0.01" className="form-input !py-1 !w-28" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(Math.min(loan.biweekly, bal.outstanding))} /></div>
              <div className="flex-1 min-w-[140px]"><label className="block text-[11px] text-gray-500">Note (optional)</label><input className="form-input !py-1" maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></div>
              <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy || !(parseFloat(amount) > 0) || !paidOn} onClick={add}>Post payment</button>
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}