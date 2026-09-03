import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { syncApi } from '../api/sync';
import type { SyncResult, SyncStatus } from '../api/sync';

interface Props { onSyncComplete?: () => void; }

export default function SyncPanel({ onSyncComplete }: Props) {
  const [status,   setStatus]   = useState<SyncStatus | null>(null);
  const [result,   setResult]   = useState<SyncResult | null>(null);
  const [syncing,  setSyncing]  = useState(false);
  const [error,    setError]    = useState('');

  const loadStatus = useCallback(() => {
    syncApi.getStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSync = async () => {
    setSyncing(true); setError(''); setResult(null);
    try {
      const res = await syncApi.triggerSync();
      setResult(res);
      loadStatus();
      onSyncComplete?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const errorList = result?.errors && result.errors.length > 0 ? result.errors : [];
  const hasApiKey = true; // Checked server-side; shown in error message if missing

  return (
    <div className='card overflow-hidden mb-6'>
      {/* Header */}
      <div className='px-5 py-4 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3'>
        <div className='flex-1'>
          <p className='font-semibold text-brand-800 text-sm'>Cognito Forms Entry Sync</p>
          <p className='text-xs text-brand-600 mt-0.5'>
            Pulls all entries from your Cognito form, applies eligibility criteria, and adds them to the queue.
          </p>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <a
            href='https://www.cognitoforms.com/hollandiagreenhousesltd/employeeleaveofabsenceform/1-all-entries'
            target='_blank' rel='noopener noreferrer'
            className='btn-secondary text-xs'
          >
            <ExternalLink size={13} /> View in Cognito
          </a>
          <button
            className='btn-primary text-xs'
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className='px-5 py-4 space-y-4'>
        {/* Last sync status */}
        {status?.synced && !result && (
          <div className='flex flex-wrap items-center gap-4 text-xs text-gray-600'>
            <div className='flex items-center gap-1.5'><CheckCircle2 size={13} className='text-green-500' /> Last sync: <span className='font-medium'>{status.synced_at ? new Date(status.synced_at).toLocaleString('en-US') : 'Unknown'}</span></div>
            <span className='text-gray-300'>|</span>
            <span>{status.entries_found ?? 0} found</span>
            <span className='text-green-600 font-medium'>{status.entries_synced ?? 0} synced</span>
            {(status.entries_skipped ?? 0) > 0 && <span className='text-amber-600'>{status.entries_skipped} skipped</span>}
          </div>
        )}

        {!status?.synced && !result && !syncing && (
          <p className='text-xs text-gray-500'>No sync has been run yet. Click <strong>Sync Now</strong> to import all Cognito entries.</p>
        )}

        {/* Current sync result */}
        {result && (
          <div className='space-y-3'>
            <div className='flex flex-wrap gap-4 text-xs'>
              <div className='flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg text-blue-700 font-medium'>
                {result.entriesFound} entries found
              </div>
              <div className='flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg text-green-700 font-medium'>
                <CheckCircle2 size={12} /> {result.entriesSynced} synced / updated
              </div>
              {result.entriesSkipped > 0 && (
                <div className='flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg text-amber-700 font-medium'>
                  <AlertTriangle size={12} /> {result.entriesSkipped} skipped
                </div>
              )}
            </div>

            {errorList.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>Skipped entries</p>
                <div className='max-h-40 overflow-y-auto space-y-1'>
                  {errorList.map((e, i) => (
                    <div key={i} className='flex gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded'>
                      <AlertTriangle size={12} className='shrink-0 mt-0.5' />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
                <p className='text-xs text-gray-400'>Skipped entries usually mean the employee name doesn't match the HR system. Add the employee via the Employees tab, then sync again.</p>
              </div>
            )}
          </div>
        )}

        {/* API error */}
        {error && (
          <div className='flex gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700'>
            <XCircle size={14} className='shrink-0 mt-0.5' />
            <div>
              <p className='font-semibold'>{error}</p>
              {error.includes('COGNITO_API_KEY') && (
                <p className='mt-1 text-red-600'>Set <code className='bg-red-100 px-1 rounded'>COGNITO_API_KEY</code> in your Railway environment variables. Get it from Cognito Forms → Organization Settings → Integrations → New API Key.</p>
              )}
            </div>
          </div>
        )}

        {/* API key setup hint */}
        <div className='p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 flex gap-2'>
          <span>🔑</span>
          <span>
            Requires <code className='bg-gray-200 px-1 rounded'>COGNITO_API_KEY</code> in Railway env vars.
            Get it from <strong>Cognito Forms → Organization → Settings → Integrations → New API Key</strong>.
            Also set <code className='bg-gray-200 px-1 rounded'>COGNITO_FORM_ID=6</code>.
          </span>
        </div>
      </div>
    </div>
  );
}