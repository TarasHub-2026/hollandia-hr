import React, { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

export default function CognitoLeaveForm() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Remove any previously injected script (e.g. on hot-reload)
    const existing = document.getElementById('cognito-seamless-script');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id   = 'cognito-seamless-script';
    script.src  = 'https://www.cognitoforms.com/f/seamless.js';
    script.setAttribute('data-key',  'R--CyANc1EeIXCefbH82WA');
    script.setAttribute('data-form', '6');
    script.async = true;

    container.appendChild(script);

    return () => {
      // Cleanup on unmount
      script.remove();
    };
  }, []);

  return (
    <div className='p-8 max-w-4xl'>
      <div className='mb-6'>
        <div className='flex items-center gap-2 mb-1'>
          <FileText size={20} className='text-brand-600' />
          <h1 className='text-2xl font-bold text-gray-900'>Employee Leave Request Form</h1>
        </div>
        <p className='text-gray-500 text-sm'>
          Employees can fill out and submit this form. Submissions are recorded by Cognito Forms and can also be reviewed in the All Requests tab.
        </p>
      </div>

      <div className='card overflow-hidden'>
        <div className='px-5 py-3 bg-brand-50 border-b border-brand-100 flex items-center gap-2'>
          <span className='text-xs font-medium text-brand-700'>Powered by Cognito Forms</span>
        </div>
        {/* Cognito Forms injects the iframe into this div */}
        <div ref={containerRef} className='px-2 py-2 min-h-96' />
      </div>
    </div>
  );
}