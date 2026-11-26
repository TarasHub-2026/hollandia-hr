import React, { useState } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle2, Cake } from 'lucide-react';
import { employeesApi } from '../api/employees';
import type { BirthdateImportResult } from '../api/employees';
import { parseCsv } from './ImportEmployeesModal';

interface Props { onClose: () => void; onImported: () => void; }

// Accepted header names (case, spacing and punctuation are ignored) -> API field
const ALIASES: Record<string, string> = {
  name: 'name', fullname: 'name', employeename: 'name', employee: 'name', staff: 'name', staffname: 'name',
  employeenumber: 'employeeNumber', employeeno: 'employeeNumber', employeeid: 'employeeNumber', empno: 'employeeNumber', empnumber: 'employeeNumber', number: 'employeeNumber', emp: 'employeeNumber',
  dateofbirth: 'dateOfBirth', dob: 'dateOfBirth', birthdate: 'dateOfBirth', birthday: 'dateOfBirth', birth: 'dateOfBirth', born: 'dateOfBirth',
};

const TEMPLATE = 'Full name,Date of birth\r\nMaria Santos,1990-03-24\r\nJohn Smith,1985-11-02\r\n';

function downloadTemplate() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv' }));
  a.download = 'birthdate-import-template.csv';
  a.click();
}

/** HR uploads a CSV of employee numbers and dates of birth. Rows are matched to the roster; nothing else changes. */
export default function ImportBirthdatesModal({ onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<BirthdateImportResult | null>(null);
  const [done, setDone] = useState<BirthdateImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (f: File | undefined) => {
    setError(''); setPreview(null); setRows([]); setDone(null);
    if (!f) return;
    setFileName(f.name);
    setBusy(true);
    try {
      const parsed = parseCsv(await f.text());
      if (parsed.length < 2) throw new Error('The file has no data rows.');
      const header = parsed[0].map(h => ALIASES[h.toLowerCase().replace(/[^a-z0-9]/g, '')] || '');
      if (!header.includes('dateOfBirth') || (!header.includes('name') && !header.includes('employeeNumber'))) {
        throw new Error('The file needs two columns: "Full name" and "Date of birth". Download the template to see the format.');
      }
      const data = parsed.slice(1).map(r => {
        const o: Record<string, string> = {};
        header.forEach((k, i) => { if (k) o[k] = (r[i] ?? '').trim(); });
        return o;
      });
      setRows(data);
      setPreview(await employeesApi.importBirthdates(data, true));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try { setDone(await employeesApi.importBirthdates(rows, false)); onImported(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  const hasErrors = !!preview && preview.errors.length > 0;
  const changes = preview ? preview.toSet + preview.toChange : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-xl"><Cake size={18} /> Import Dates of Birth</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          {!done && (
            <>
              <p className="text-gray-600">Upload a CSV with two columns, <strong>Full name</strong> and <strong>Date of birth</strong> (you can save an Excel sheet as CSV). Each person is matched to the roster by full name, and only their date of birth is set; nothing else changes. Nothing is saved until you confirm.</p>
              <p className="text-xs text-gray-500">Write dates as <strong>YYYY-MM-DD</strong> (1990-03-24) or <strong>MM/DD/YYYY</strong> (03/24/1990, month first). Capitals, accents and word order in names don't matter. If two employees share a name, add an <strong>employee_number</strong> column. Dates of birth are visible to HR administrators only.</p>
              <button type="button" className="btn-secondary" onClick={downloadTemplate}><Download size={14} /> Download template</button>
              <div>
                <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} className="block text-sm" />
                {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
              </div>
            </>
          )}

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}</div>}
          {busy && <p className="text-xs text-gray-500">Working...</p>}

          {preview && !done && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-green-50 p-3"><p className="text-2xl font-bold text-green-700">{preview.toSet}</p><p className="text-xs text-gray-600">Dates to add</p></div>
                <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-bold text-amber-700">{preview.toChange}</p><p className="text-xs text-gray-600">Dates to change</p></div>
                <div className="rounded-lg bg-gray-50 p-3"><p className="text-2xl font-bold text-gray-600">{preview.unchanged}</p><p className="text-xs text-gray-600">Already correct</p></div>
              </div>
              {!hasErrors && (preview.skipped?.length ?? 0) > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg">
                  <p className="px-3 py-2 text-xs font-semibold text-amber-900">{preview.skipped!.length} row{preview.skipped!.length === 1 ? '' : 's'} will be skipped (no matching employee). Fix them in your file and upload again, or confirm to import the rest.</p>
                  <div className="max-h-40 overflow-y-auto border-t border-amber-200">
                    {preview.skipped!.map((er, i) => (
                      <p key={i} className="px-3 py-1.5 text-xs border-b border-amber-100 last:border-0"><strong>Row {er.row}:</strong> {er.message}</p>
                    ))}
                  </div>
                </div>
              )}
              {hasErrors && (
                <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto">
                  {preview.errors.map((er, i) => (
                    <p key={i} className="px-3 py-1.5 text-xs border-b border-red-100 last:border-0"><strong>Row {er.row}:</strong> {er.message}</p>
                  ))}
                </div>
              )}
              {hasErrors
                ? <p className="text-xs text-red-700">Fix these rows in your file and upload it again. Nothing has been imported.</p>
                : <button className="btn-primary" disabled={busy || changes === 0} onClick={confirm}>{changes === 0 ? 'Nothing to change' : 'Confirm import'}</button>}
            </div>
          )}

          {done && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div><p className="font-semibold">Import complete</p><p className="text-xs">{done.toSet} date{done.toSet === 1 ? '' : 's'} added, {done.toChange} changed{(done.skipped?.length ?? 0) > 0 ? `, ${done.skipped!.length} row${done.skipped!.length === 1 ? '' : 's'} skipped` : ''}.</p></div>
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end"><button className="btn-secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button></div>
      </div>
    </div>
  );
}
