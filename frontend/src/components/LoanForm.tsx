import React, { useState } from 'react';
import { CheckCircle2, FileUp, Printer, X, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { loansApi } from '../api/loans';
import type { LoanApplication, LookupEmployee, LoanProofUpload } from '../types';

// The five terms the employee must agree to.
const AGREEMENTS = [
  'I agree to pay the principal amount and the 5% interest per annum based on the required bi-weekly amortization',
  'I authorized Hollandia Greenhouses Ltd. to deduct my loan amortization until such loan is fully paid',
  'My first loan amortization shall commence on the payday following the approval of my loan application',
  'In the event of resignation or termination of my contract between my employer, Hollandia Greenhouses Ltd., I agree to deduct any outstanding balance in full from last paycheque',
  'My signature is sufficient enough to prove my agreement to abide in the terms and conditions set forth in this application',
];
const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const MAX_PDF_BYTES = 4 * 1024 * 1024;

const readAsDataURL = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the file.'));
  r.readAsDataURL(f);
});

/** Photos from a phone are large, so shrink them to a readable size before uploading. PDFs are sent as they are. */
async function prepareProof(file: File): Promise<LoanProofUpload> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is too large (4 MB maximum). Take a photo of the document instead.');
    return { name: file.name, data: await readAsDataURL(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG) or a PDF.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That photo could not be opened. Save it as a JPG or PNG and try again.'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', data: c.toDataURL('image/jpeg', 0.82) };
  } finally { URL.revokeObjectURL(url); }
}

interface Props { onDone?: () => void; onCancel?: () => void }

export default function LoanForm({ onDone, onCancel }: Props) {
  const { user, isAdmin } = useAuth();

  // Employees apply for themselves (details come from their profile); HR looks the employee up by number.
  const [numberInput, setNumberInput] = useState('');
  const [lookup, setLookup] = useState<LookupEmployee | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);

  const [purpose, setPurpose] = useState('');
  const [amountText, setAmountText] = useState('');
  const [proof, setProof] = useState<LoanProofUpload | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [agree, setAgree] = useState<boolean[]>(AGREEMENTS.map(() => false));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<LoanApplication | null>(null);

  const who = isAdmin
    ? (lookup && { id: lookup.id, number: lookup.employeeNumber, first: lookup.firstName, last: lookup.lastName, name: lookup.name, email: lookup.email })
    : (user && { id: user.id, number: user.employeeNumber || '', first: user.firstName || '', last: user.lastName || '', name: user.name, email: user.email || '' });

  const amount = parseFloat(amountText);
  const allAgreed = agree.every(Boolean);

  const doLookup = async () => {
    const n = numberInput.trim();
    if (!n) return;
    setLooking(true); setLookupError(''); setLookup(null);
    try { setLookup(await authApi.lookup(n)); }
    catch (e) { setLookupError(e instanceof Error ? e.message : 'Lookup failed'); }
    finally { setLooking(false); }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setProofBusy(true);
    try { setProof(await prepareProof(f)); }
    catch (e) { setProof(null); setError(e instanceof Error ? e.message : 'Could not use that file.'); }
    finally { setProofBusy(false); }
  };

  // What is still needed, in the order the form shows it. The button stays clickable and says so.
  const missing = [
    !who && (isAdmin ? 'find the employee by number' : 'your profile details'),
    purpose.trim().length < 5 && 'the purpose of the loan',
    !isAdmin && !proof && 'the proof of medical emergency',
    !(amount > 0) && 'the amount',
    !allAgreed && `all ${AGREEMENTS.length} loan agreement boxes (${agree.filter(Boolean).length} of ${AGREEMENTS.length} ticked)`,
  ].filter(Boolean) as string[];
  const valid = missing.length === 0 && !proofBusy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !who) { setError(missing.length ? `Still needed: ${missing.join('; ')}.` : 'Please wait for the file to finish preparing.'); return; }
    setError(''); setSubmitting(true);
    try {
      const r = await loansApi.apply({ employeeId: isAdmin ? who.id : undefined, amount, purpose: purpose.trim(), agreements: agree, proof: proof || undefined });
      setReceipt(r);
      onDone?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit the application.'); }
    finally { setSubmitting(false); }
  };

  const label = 'block text-sm font-bold text-gray-900 mb-1';
  const req = <span className="text-red-600"> *</span>;
  const ro = 'form-input bg-white/70 text-gray-700';

  // ---------- Acknowledgement receipt ----------
  if (receipt) {
    return (
      <div className="max-w-3xl mx-auto rounded-xl shadow overflow-hidden border border-blue-200 print:shadow-none">
        <div className="bg-[#1e96ff] py-5 text-center"><h1 className="text-2xl font-bold text-gray-900">Loan Application Acknowledgement Receipt</h1></div>
        <div className="bg-[#c3e1ff] p-6 space-y-5">
          <div className="flex items-center gap-3 text-green-800"><CheckCircle2 size={28} /><p className="font-semibold">Your application was received and is waiting for HR review.</p></div>
          <dl className="bg-white rounded-lg p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-gray-500 text-xs">Reference</dt><dd className="font-mono font-semibold">{receipt.id.slice(0, 8)}</dd></div>
            <div><dt className="text-gray-500 text-xs">Date of application</dt><dd className="font-semibold">{new Date(receipt.submittedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })}</dd></div>
            <div><dt className="text-gray-500 text-xs">Employee</dt><dd className="font-semibold">{receipt.employeeName} ({receipt.employeeNumber})</dd></div>
            <div><dt className="text-gray-500 text-xs">Loan amount</dt><dd className="font-semibold">{money(receipt.amount)}</dd></div>
            <div className="col-span-2"><dt className="text-gray-500 text-xs">Purpose</dt><dd>{receipt.purpose}</dd></div>
          </dl>
          <p className="text-xs text-gray-700">You will get a notice in the app when HR decides. If approved, the loan is added to your loan record and the first amortization starts on the payday following the approval.</p>
          <div className="flex gap-3 print:hidden">
            <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /> Print receipt</button>
            {onCancel && <button className="btn-primary" onClick={onCancel}>Done</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto rounded-xl shadow overflow-hidden border border-blue-200">
      <div className="bg-[#1e96ff] py-5 text-center relative">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Loan Application</h1>
        {onCancel && <button type="button" onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 text-gray-800/70 hover:text-gray-900"><X size={20} /></button>}
      </div>

      <div className="bg-[#c3e1ff] p-5 md:p-8 space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Date of Application</label>
            <input type="date" className={ro} value={today()} readOnly />
          </div>
          <div>
            <label className={label}>Employee Number{req}</label>
            {isAdmin ? (
              <div className="flex gap-2">
                <input className="form-input" value={numberInput} onChange={e => { setNumberInput(e.target.value); setLookup(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } }} placeholder="Employee number" />
                <button type="button" className="btn-primary whitespace-nowrap" onClick={doLookup} disabled={looking || !numberInput.trim()}>{looking ? 'Finding…' : 'Find'}</button>
              </div>
            ) : <input className={ro} value={who?.number || ''} readOnly />}
            {lookupError && <p className="text-xs text-red-700 mt-1">{lookupError}</p>}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div><label className={label}>First Name</label><input className={ro} value={who?.first || ''} readOnly /></div>
          <div><label className={label}>Last Name</label><input className={ro} value={who?.last || ''} readOnly /></div>
          <div><label className={label}>Email</label><input className={ro} value={who?.email || ''} readOnly /></div>
        </div>

        <p className="text-sm font-semibold">I would like to apply for an employee loan from my employer Hollandia Greenhouses Ltd.</p>

        {!isAdmin && user && user.loanRemaining > 0 && (
          <div className="flex gap-2 bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-xs text-yellow-900">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>You currently owe {money(user.loanRemaining)} of a {money(user.loanOriginal)} loan. A new loan is added to what you owe, and at least 50% of your loan must be repaid before a leave request can be approved.</p>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Details of Loan</h2>
          <p className="font-bold text-gray-900">Please be aware that loans are extended for Emergency | Medical purposes only.</p>

          <div>
            <label className={label}>Purpose of Loan{req}</label>
            <textarea className="form-input min-h-[100px]" value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={2000} />
          </div>

          <div>
            <label className={label}>Proof of Medical Emergency{isAdmin ? '' : req}</label>
            <div className="bg-blue-100/80 border border-blue-200 rounded-lg p-4 flex flex-wrap items-center gap-3 text-sm">
              <label className="btn-secondary cursor-pointer !text-red-700 !border-red-300"><FileUp size={15} /> {proofBusy ? 'Preparing…' : 'Upload'}
                <input type="file" className="hidden" accept="image/*,.pdf,application/pdf" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {proof ? (
                <span className="flex items-center gap-2 font-medium text-gray-800">{proof.name}
                  <button type="button" className="text-gray-500 hover:text-red-600" onClick={() => setProof(null)} aria-label="Remove file"><X size={14} /></button></span>
              ) : <span className="text-gray-600">Photo (JPG or PNG) or PDF of your medical document</span>}
            </div>
          </div>

          <div className="max-w-xs">
            <label className={label}>Amount{req}</label>
            <input type="number" min={1} step="0.01" className="form-input" value={amountText} onChange={e => setAmountText(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={label}>Loan Agreement | Terms and Condition{req}</label>
          <div className="space-y-2 text-sm">
            {AGREEMENTS.map((t, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={agree[i]} onChange={e => setAgree(a => a.map((v, j) => j === i ? e.target.checked : v))} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Signature of Management</label>
          <div className="bg-white/80 border border-dashed border-gray-400 rounded-lg p-4 text-xs text-gray-600 max-w-[480px]">
            Management signs when HR approves the application.
          </div>
        </div>

        {error && !error.startsWith('Still needed') && <div className="bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-sm">{error}</div>}

        <div className="space-y-2">
          <button type="submit" disabled={submitting}
            className="px-5 py-2 rounded text-sm font-semibold text-white bg-[#c0451c] hover:bg-[#a33a17] disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
          {missing.length > 0 && (
            <p className={`text-xs ${error.startsWith('Still needed') ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>Still needed: {missing.join('; ')}.</p>
          )}
        </div>
      </div>
    </form>
  );
}
