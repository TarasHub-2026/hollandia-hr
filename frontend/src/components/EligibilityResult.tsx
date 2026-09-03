import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { EligibilityResult } from '../types';
interface Props { result: EligibilityResult; onClose?: () => void; compact?: boolean; }
export default function EligibilityResultCard({ result, onClose, compact }: Props) {
  const ok = result.status === 'APPROVED';
  return (
    <div className={`card overflow-hidden ${compact ? '' : 'max-w-2xl w-full'}`}>
      <div className={`px-6 py-5 flex items-start gap-4 ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className={`p-2 rounded-full ${ok ? 'bg-green-100' : 'bg-red-100'}`}>
          {ok ? <CheckCircle2 size={24} className='text-green-600' /> : <XCircle size={24} className='text-red-600' />}
        </div>
        <div className='flex-1'>
          <p className={`text-lg font-bold ${ok ? 'text-green-800' : 'text-red-800'}`}>
            {ok ? '✅ Leave Request Approved' : '🚫 Leave Request Denied'}
          </p>
          {result.adjustedEndDate && (
            <p className='text-sm text-amber-700 mt-1 font-medium'>
              ⚠️ Suggested adjusted end date: {new Date(result.adjustedEndDate).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}
            </p>
          )}
        </div>
        {onClose && <button onClick={onClose} className='text-gray-400 hover:text-gray-600 text-lg leading-none'>&times;</button>}
      </div>
      {result.failures.length > 0 && (
        <div className='px-6 py-4 border-b border-gray-100'>
          <p className='text-xs font-semibold text-red-600 uppercase tracking-wide mb-3'>Denial Reasons</p>
          <div className='space-y-2'>
            {result.failures.map((f, i) => (
              <div key={i} className='flex gap-3 p-3 bg-red-50 rounded-lg'>
                <XCircle size={16} className='text-red-500 mt-0.5 shrink-0' />
                <div><p className='text-xs font-semibold text-red-700'>{f.rule}</p><p className='text-xs text-red-600 mt-0.5'>{f.message}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className='px-6 py-4 border-b border-gray-100'>
          <p className='text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3'>Advisories</p>
          <div className='space-y-2'>
            {result.warnings.map((w, i) => (
              <div key={i} className='flex gap-3 p-3 bg-amber-50 rounded-lg'>
                <AlertTriangle size={16} className='text-amber-500 mt-0.5 shrink-0' />
                <div><p className='text-xs font-semibold text-amber-700'>{w.rule}</p><p className='text-xs text-amber-600 mt-0.5'>{w.message}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {result.passes.length > 0 && (
        <div className='px-6 py-4'>
          <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Checks Passed</p>
          <div className='space-y-1.5'>
            {result.passes.map((p, i) => (
              <div key={i} className='flex gap-3 items-start'>
                <CheckCircle2 size={14} className='text-green-500 mt-0.5 shrink-0' />
                <span className='text-xs text-gray-600'><span className='font-medium text-gray-700'>{p.rule}: </span>{p.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}