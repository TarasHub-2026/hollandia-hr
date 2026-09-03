import React, { useEffect, useRef, useState } from 'react';
import { FileText, Link2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

export default function CognitoLeaveForm() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSetup, setShowSetup] = useState(false);

  // The Cognito script is injected dynamically so it survives React re-renders
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const existing = document.getElementById('cognito-seamless-script');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'cognito-seamless-script';
    script.src = 'https://www.cognitoforms.com/f/seamless.js';
    script.setAttribute('data-key',  'R--CyANc1EeIXCefbH82WA');
    script.setAttribute('data-form', '6');
    script.async = true;
    container.appendChild(script);
    return () => { script.remove(); };
  }, []);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const webhookUrl = `${apiBase}/api/webhook/cognito`;

  return (
    <div className='p-8 max-w-4xl space-y-6'>
      {/* Header */}
      <div>
        <div className='flex items-center gap-2 mb-1'>
          <FileText size={20} className='text-brand-600' />
          <h1 className='text-2xl font-bold text-gray-900'>Employee Leave Request Form</h1>
        </div>
        <p className='text-gray-500 text-sm'>
          Employees fill out this form. Submissions automatically sync to the <strong>All Requests</strong> tab via webhook.
        </p>
      </div>

      {/* Webhook Setup Banner */}
      <div className='card overflow-hidden border-brand-200'>
        <button
          onClick={() => setShowSetup(s => !s)}
          className='w-full px-5 py-3.5 bg-brand-50 flex items-center justify-between hover:bg-brand-100 transition-colors'
        >
          <div className='flex items-center gap-2'>
            <Link2 size={16} className='text-brand-600' />
            <span className='text-sm font-semibold text-brand-800'>Cognito Forms → HR App Sync Setup</span>
            <span className='text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full'>Required once</span>
          </div>
          {showSetup ? <ChevronUp size={16} className='text-brand-600' /> : <ChevronDown size={16} className='text-brand-600' />}
        </button>

        {showSetup && (
          <div className='px-5 py-5 space-y-5 text-sm text-gray-700'>
            <p className='text-gray-600'>
              To sync form submissions into the HR database, configure a webhook in Cognito Forms pointing to your Railway backend.
            </p>

            {/* Webhook URL */}
            <div>
              <p className='form-label'>Your Webhook URL</p>
              <div className='flex items-center gap-2'>
                <code className='flex-1 block bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 break-all'>
                  {webhookUrl}
                </code>
                <button
                  className='btn-secondary text-xs shrink-0'
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                >
                  Copy
                </button>
              </div>
              <p className='text-xs text-gray-400 mt-1'>
                Once deployed to Railway, replace <code className='bg-gray-100 px-1 rounded'>localhost:3001</code> with your Railway URL.
              </p>
            </div>

            {/* Steps */}
            <div className='space-y-3'>
              <p className='font-semibold text-gray-800'>Steps in Cognito Forms:</p>
              {[
                { n: 1, text: 'Open your form → Settings → Post JSON Data to a Website' },
                { n: 2, text: 'Under "Submit Entry", paste the Webhook URL above' },
                { n: 3, text: 'Optional: Append ?secret=YOUR_SECRET to the URL and set COGNITO_WEBHOOK_SECRET in Railway' },
                { n: 4, text: 'Save, then submit a test entry' },
                { n: 5, text: `Verify sync: open ${apiBase}/api/webhook/cognito/last-payload to see the raw payload` },
              ].map(s => (
                <div key={s.n} className='flex gap-3'>
                  <span className='w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5'>{s.n}</span>
                  <p className='text-gray-700'>{s.text}</p>
                </div>
              ))}
            </div>

            {/* Field name guide */}
            <div className='p-4 bg-amber-50 border border-amber-200 rounded-lg'>
              <p className='font-semibold text-amber-800 mb-2'>📋 Recommended field names in your Cognito form</p>
              <p className='text-xs text-amber-700 mb-3'>
                The webhook auto-detects common variations, but using these exact names guarantees a match:
              </p>
              <div className='grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono'>
                {[
                  ['EmployeeName', 'required'],
                  ['StartDate', 'required'],
                  ['EndDate', 'required'],
                  ['Department', 'optional'],
                  ['Purpose', 'optional'],
                  ['PassportExpiry', 'optional'],
                  ['WorkPermitExpiry', 'optional'],
                  ['ContractExpiry', 'optional'],
                ].map(([name, req]) => (
                  <div key={name} className='flex items-center gap-2'>
                    <CheckCircle2 size={12} className={req === 'required' ? 'text-green-600' : 'text-gray-400'} />
                    <span className='text-gray-800'>{name}</span>
                    <span className={`text-xs ${req === 'required' ? 'text-green-600' : 'text-gray-400'}`}>({req})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The Cognito Form itself */}
      <div className='card overflow-hidden'>
        <div className='px-5 py-3 bg-brand-50 border-b border-brand-100 flex items-center gap-2'>
          <FileText size={14} className='text-brand-600' />
          <span className='text-xs font-medium text-brand-700'>Cognito Forms — Submit your leave request below</span>
        </div>
        <div ref={containerRef} className='px-2 py-2 min-h-96' />
      </div>
    </div>
  );
}