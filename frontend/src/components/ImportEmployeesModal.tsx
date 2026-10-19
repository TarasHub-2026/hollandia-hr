import React, { useState } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { employeesApi } from '../api/employees';
import type { ImportResult } from '../api/employees';

interface Props { onClose: () => void; onImported: () => void; }

// Accepted header names (case/spacing/punctuation insensitive) -> API field
const ALIASES: Record<string, string> = {
  employeenumber: 'employeeNumber', employeeno: 'employeeNumber', employeeid: 'employeeNumber', empno: 'employeeNumber', empnumber: 'employeeNumber', number: 'employeeNumber',
  firstname: 'firstName', first: 'firstName', givenname: 'firstName',
  lastname: 'lastName', last: 'lastName', surname: 'lastName', familyname: 'lastName',
  name: 'name', fullname: 'name',
  email: 'email', emailaddress: 'email', workemail: 'email',
  hiredate: 'hireDate', startdate: 'hireDate', datehired: 'hireDate',
  department: 'department', dept: 'department',
  immigrationstatus: 'immigrationStatus', immigration: 'immigrationStatus', status: 'immigrationStatus',
  passportexpiry: 'passportExpiry', passportexpirydate: 'passportExpiry',
  workpermitexpiry: 'workPermitExpiry', workpermitexpirydate: 'workPermitExpiry', permitexpiry: 'workPermitExpiry',
  nationality: 'nationality', citizenship: 'nationality',
  passportnumber: 'passportNumber', passportno: 'passportNumber', passnumber: 'passportNumber', passno: 'passportNumber',
  lmianumber: 'lmiaNumber', lmiano: 'lmiaNumber', lmia: 'lmiaNumber',
  cowancertificatenumber: 'cowanCertNumber', cowancertificateno: 'cowanCertNumber', cowancertnumber: 'cowanCertNumber', cowancertno: 'cowanCertNumber',
  cowancertificateexpirydate: 'cowanCertExpiry', cowancertificateexpiry: 'cowanCertExpiry', cowancertexpirydate: 'cowanCertExpiry', cowancertexpiry: 'cowanCertExpiry',
  loanoriginal: 'loanOriginal', loanremaining: 'loanRemaining',
  active: 'active',
};

export const CSV_TEMPLATE =
  'employee_number,nationality,first_name,last_name,email,hire_date,department,immigration_status,passport_number,passport_expiry,work_permit_expiry,lmia_number,loan_original,loan_remaining,active,cowan_certificate_number,cowan_certificate_expiry_date\r\n' +
  '1001,Mexican,Maria,Santos,maria.santos@example.com,2022-03-15,GREENHOUSE,TFW,G12345678,2029-05-01,2027-03-14,LMIA-1234567,0,0,yes,CW-001234,2028-06-30\r\n' +
  '1002,Canadian,John,Smith,john.smith@example.com,2019-06-01,OFFICE,NON_TFW,,,,,0,0,yes,,\r\n';

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

export function downloadTemplate() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + CSV_TEMPLATE], { type: 'text/csv' }));
  a.download = 'employee-import-template.csv';
  a.click();
}

export default function ImportEmployeesModal({ onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<ImportResult | null>(null);

  const onFile = async (f: File | undefined) => {
    setError(''); setPreview(null); setRows([]); setDone(null);
    if (!f) return;
    setFileName(f.name);
    try {
      const parsed = parseCsv(await f.text());
      if (parsed.length < 2) throw new Error('The file has no data rows.');
      const header = parsed[0].map(h => ALIASES[h.toLowerCase().replace(/[^a-z0-9]/g, '')] || '');
      if (!header.includes('employeeNumber') || !header.includes('email') || !header.includes('hireDate')) {
        throw new Error('The file needs at least these columns: employee_number, email, hire_date (plus names and department). Download the template to see the format.');
      }
      const data = parsed.slice(1).map(r => {
        const o: Record<string, string> = {};
        header.forEach((k, i) => { if (k) o[k] = (r[i] ?? '').trim(); });
        return o;
      });
      setRows(data);
      setBusy(true);
      setPreview(await employeesApi.importRows(data, true));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const r = await employeesApi.importRows(rows, false);
      setDone(r);
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally { setBusy(false); }
  };

  const hasErrors = !!preview && preview.errors.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Upload size={16} /> Import Employees from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          {!done && (
            <>
              <p className="text-gray-600">Upload a CSV (you can save an Excel sheet as CSV). Employees are matched by <strong>employee number</strong>: existing ones are updated, new ones are added. Nothing is saved until you confirm.</p>
              <button type="button" className="btn-secondary" onClick={downloadTemplate}><Download size={14} /> Download template</button>
              <div>
                <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} className="block text-sm" />
                {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
              </div>
            </>
          )}

          {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}</div>}
          {busy && <p className="text-xs text-gray-500">Working…</p>}

          {preview && !done && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <span className="px-3 py-1.5 rounded-lg bg-green-50 text-green-800 text-xs font-semibold">{preview.toCreate} to add</span>
                <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-semibold">{preview.toUpdate} to update</span>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${hasErrors ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-500'}`}>{preview.errors.length} with errors</span>
              </div>
              {hasErrors && (
                <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto">
                  {preview.errors.map((er, i) => (
                    <p key={i} className="px-3 py-1.5 text-xs border-b border-red-100 last:border-0"><strong>Row {er.row}:</strong> {er.message}</p>
                  ))}
                </div>
              )}
              {hasErrors
                ? <p className="text-xs text-red-700">Fix these rows in your file and upload it again. Nothing has been imported.</p>
                : <button className="btn-primary" disabled={busy || (preview.toCreate + preview.toUpdate === 0)} onClick={confirm}>Confirm import</button>}
            </div>
          )}

          {done && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div><p className="font-semibold">Import complete</p><p className="text-xs">{done.toCreate} employees added, {done.toUpdate} updated.</p></div>
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end"><button className="btn-secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button></div>
      </div>
    </div>
  );
}
