import React, { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { api } from '../api/client';

type State = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on';

const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Lets the HR admin turn phone/desktop alerts on or off for this device (Web Push). */
export default function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported) { setState('unsupported'); return; }
    (async () => {
      try {
        if (Notification.permission === 'denied') { setState('blocked'); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Make sure the server still knows this device.
          await api.post('/api/push/subscribe', { subscription: sub.toJSON() }).catch(() => {});
          setState('on');
        } else setState('off');
      } catch { setState('off'); }
    })();
  }, [supported]);

  const enable = async () => {
    setBusy(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const { data } = await api.get<{ publicKey: string }>('/api/push/public-key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) as unknown as BufferSource });
      await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
      setState('on');
      setMsg('Alerts are on for this device.');
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      const text = e instanceof Error ? e.message : 'Could not turn on alerts.';
      // AbortError = the browser could not reach its push service (Google/Apple), not a problem with this app.
      setMsg(name === 'AbortError'
        ? `Your browser could not reach its push service (${text}). Open the app in Chrome (not inside another app), update Chrome and Google Play services, turn off VPN/data saver, then try again.`
        : `${name ? name + ': ' : ''}${text}`);
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setMsg('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setState('off');
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setMsg('');
    try { await api.post('/api/push/test'); setMsg('Test sent. It should arrive in a few seconds.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send the test.'); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return null;

  return (
    <div className='px-3 pb-3'>
      {state === 'unsupported' && (
        <p className='text-[11px] text-brand-300 leading-snug'>
          {isIos && !isStandalone ? 'iPhone: tap Share, then "Add to Home Screen", and open the app from there to get alerts.' : 'This browser cannot show alerts when the app is closed.'}
        </p>
      )}
      {state === 'blocked' && <p className='text-[11px] text-brand-300 leading-snug'>Alerts are blocked. Allow notifications for this site in your browser settings, then reload.</p>}
      {state === 'off' && (
        <button onClick={enable} disabled={busy} className='w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-700 hover:bg-brand-600 text-white transition-colors'>
          <BellRing size={14} /> Turn on phone alerts
        </button>
      )}
      {state === 'on' && (
        <div className='flex items-center gap-2'>
          <button onClick={test} disabled={busy} className='flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-700 hover:bg-brand-600 text-white transition-colors' title='Send a test alert'>
            <BellRing size={14} className='text-orange-300' /> Alerts on. Send test
          </button>
          <button onClick={disable} disabled={busy} title='Turn off alerts on this device' aria-label='Turn off alerts' className='p-2 rounded-lg text-brand-300 hover:text-white hover:bg-brand-700'>
            <BellOff size={14} />
          </button>
        </div>
      )}
      {msg && <p className='text-[11px] text-brand-200 mt-1.5 leading-snug'>{msg}</p>}
    </div>
  );
}
