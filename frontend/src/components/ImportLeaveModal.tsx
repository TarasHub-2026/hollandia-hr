import React, { useState } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { leaveRequestsApi } from '../api/leaveRequests';
import type { LeaveImportResult, LeaveImportOptions } from '../api/leaveRequests';
import { parseCsv } from './ImportEmployeesModal';

interface Props { onClose: () => void; onImported: () => void; }

// Accepted header names (case/spacing/punctuation insensitive) -> API field
const ALIASES: Record<string, string> = {
  year: 'year',
  entry: 'entryNumber', entrynumber: 'entryNumber', entryno: 'entryNumber', entryid: 'entryNumber',
  status: 'status', decision: 'status',
  department: 'department', dept: 'department',
  employeenumber: 'employeeNumber', employeeno: 'employeeNumber', employeeid: 'employeeNumber', empno: 'employeeNumber', empnumber: 'employeeNumber', number: 'employeeNumber',
  employeenamerosterformat: 'employeeName', employeename: 'employeeName', name: 'employeeName', employee: 'employeeName', fullname: 'employeeName',
  startdate: 'startDate', start: 'startDate', from: 'startDate', leavestart: 'startDate', leavefrom: 'startDate',
  enddate: 'endDate', end: 'endDate', to: 'endDate', until: 'endDate', leaveend: 'endDate', leaveto: 'endDate',
  leavetype: 'leaveType', type: 'leaveType', category: 'leaveType',
  note: 'note', notes: 'note', reason: 'note', purpose: 'note', comments: 'note', comment: 'note',
};

const TEMPLATE =
  'Year,Entry #,Status,Employee Number,Employee Name (Roster Format),Start Date,End Date,Leave Type,Note\r\n' +
  '2026,101,Approved,1001,"Santos, Maria",2026-06-03,2026-06-17,Annual leave,Block 2\r\n';

function downloadTemplate() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv' }));
  a.download = 'leave-import-template.csv';
  a.click();
}

export default function ImportLeaveModal({ onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<LeaveImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<LeaveImportResult | null>(null);
  const [defStatus, setDefStatus] = useState('APPROVED');

  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [updateDepts, setUpdateDepts] = useState(false);
  const [skipText, setSkipText] = useState('');
  const optsFor = (o: Partial<{ skipUnmatched: boolean; updateDepts: boolean; skipText: string }> = {}): LeaveImportOptions => ({
    skipUnmatched: o.skipUnmatched ?? skipUnmatched,
    updateDepartments: o.updateDepts ?? updateDepts,
    skipEntries: (o.skipText ?? skipText).split(/[^0-9]+/).filter(Boolean).map(Number),
  });

  const check = async (data: Record<string, string>[], status: string, o: Parameters<typeof optsFor>[0] = {}) => {
    setBusy(true); setError('');
    try { setPreview(await leaveRequestsApi.importRows(data, true, status, optsFor(o))); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not check the file.'); }
    finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    setError(''); setPreview(null); setRows([]); setDone(null);
    if (!f) return;
    setFileName(f.name);
    try {
      const parsed = parseCsv(await f.text());
      const toHeader = (r: string[]) => r.map(h => ALIASES[h.toLowerCase().replace(/[^a-z0-9]/g, '')] || '');
      // Sheets often have a title or totals row above the headings, so look for the real header row.
      const hi = parsed.slice(0, 10).findIndex(r => { const h = toHeader(r); return h.includes('startDate') && (h.includes('employeeNumber') || h.includes('employeeName')); });
      if (hi < 0 || parsed.length < hi + 2) throw new Error('The file needs at least an employee number (or name) column and a start date column, with data rows below. Download the template to see the format.');
      const header = toHeader(parsed[hi]);
      const data = parsed.slice(hi + 1).map(r => {
        const o: Record<string, string> = {};
        header.forEach((k, i) => { if (k) o[k] = (r[i] ?? '').trim(); });
        return o;
      });
      setRows(data);
      await check(data, defStatus);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  };

  const changeStatus = (s: string) => { setDefStatus(s); if (rows.length) check(rows, s); };
  const changeOpt = (o: Parameters<typeof optsFor>[0]) => { if (rows.length) check(rows, defStatus, o); };

  const confirm = async () => {
    setBusy(true); setError('');
    try { setDone(await leaveRequestsApi.importRows(rows, false, defStatus, optsFor())); onImported(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  const hasErrors = !!preview && preview.errors.length > 0;
  const List = ({ items, tone }: { items: { row: number; message: string }[]; tone: 'red' | 'amber' | 'gray' }) => (
    <div className={`border rounded-lg max-h-40 overflow-y-auto ${tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-gray-200'}`}>
      {items.map((er, i) => <p key={i} className="px-3 py-1.5 text-xs border-b last:border-0 border-gray-100"><strong>Row {er.row}:</strong> {er.message}</p>)}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Upload size={16} /> Import Existing Leave List</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          {!done && (
            <>
              <p className="text-gray-600">Upload a CSV (in Google Sheets: File, Download, CSV). Employees are matched by <strong>employee number</strong>, or by name if there is no number. Leave the app already has is skipped. Nothing is saved until you confirm.</p>
              <p className="text-[11px] text-gray-400">Cancelled or withdrawn leave is saved as Denied with a "Cancelled" note. A totals row above the headings is ignored. Columns: Entry #, Status, Employee Number, Employee Name, Start Date, End Date (Year is only needed if dates have no year). Department, Leave Type and Note are optional, and the department always comes from the roster. Imported leave skips the notice and block rules, because it has already been granted.</p>
              <button type="button" className="btn-secondary" onClick={downloadTemplate}><Download size={14} /> Download template</button>
              <label className="block text-xs text-gray-600">
                If a row has no status, save it as:
                <select className="form-select mt-1 w-full sm:w-60" value={defStatus} onChange={e => changeStatus(e.target.value)}>
                  <option value="APPROVED">Approved</option>
                  <option value="PENDING">Pending</option>
                  <option value="DENIED">Denied</option>
                </select>
              </label>
              <div className="space-y-2 text-xs text-gray-600">
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={skipUnmatched} onChange={e => { setSkipUnmatched(e.target.checked); changeOpt({ skipUnmatched: e.target.checked }); }} /><span>Leave out employees who are not on the roster (instead of showing an error)</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={updateDepts} onChange={e => { setUpdateDepts(e.target.checked); changeOpt({ updateDepts: e.target.checked }); }} /><span>If the file's department differs from the roster, change the roster to match the file</span></label>
                <label className="block">Entry numbers to leave out (optional, separated by commas)
                  <input className="form-input mt-1 w-full sm:w-72" placeholder="e.g. 862" value={skipText} onChange={e => setSkipText(e.target.value)} onBlur={() => changeOpt({ skipText })} />
                </label>
              </div>
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
                <span className="px-3 py-1.5 rounded-lg bg-green-50 text-green-800 text-xs font-semibold">{preview.toAdd} to add</span>
                <span className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-xs font-semibold">{preview.skipped.length} skipped</span>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${hasErrors ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-500'}`}>{preview.errors.length} with errors</span>
              </div>
              <p className="text-xs text-gray-500">To add: {preview.byStatus.APPROVED} approved, {preview.byStatus.PENDING} pending, {preview.byStatus.DENIED} denied.</p>
              {hasErrors && <List items={preview.errors} tone="red" />}
              {preview.warnings.length > 0 && (<><p className="text-xs font-semibold text-amber-800">Notes ({preview.warnings.length})</p><List items={preview.warnings} tone="amber" /></>)}
              {preview.skipped.length > 0 && (<><p className="text-xs font-semibold text-gray-600">Skipped ({preview.skipped.length})</p><List items={preview.skipped} tone="gray" /></>)}
              {hasErrors
                ? <p className="text-xs text-red-700">Fix these rows in your file (or add the missing employees to the roster) and upload it again. Nothing has been imported.</p>
                : <button className="btn-primary" disabled={busy || preview.toAdd === 0} onClick={confirm}>Confirm import of {preview.toAdd}{(preview.deptChanges ?? 0) > 0 ? ` and update ${preview.deptChanges} department(s)` : ''}</button>}
            </div>
          )}

          {done && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div><p className="font-semibold">Import complete</p><p className="text-xs">{done.toAdd} leave records added, {done.skipped.length} skipped.</p></div>
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end"><button className="btn-secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button></div>
      </div>
    </div>
  );
}
