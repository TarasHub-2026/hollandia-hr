import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, CheckCircle2, Pencil, Trash2, ChevronDown, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { commsApi, commsChanged } from '../api/comms';
import type { Announcement } from '../types';

const day = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const endText = (a: Announcement) => a.endsOn ? `${a.expired ? 'Ended' : 'Shown until'} ${day(a.endsOn + 'T12:00:00')}` : 'No end date';

/** A single announcement as employees see it. */
export function AnnouncementCard({ a, onAck }: { a: Announcement; onAck?: () => void }) {
  const [busy, setBusy] = useState(false);
  const ack = async () => { setBusy(true); try { await commsApi.acknowledge(a.id); onAck?.(); } finally { setBusy(false); } };
  return (
    <div className={`card p-4 md:p-5 border-l-4 ${a.acknowledged ? 'border-l-gray-300' : 'border-l-orange-500 bg-orange-50/50'}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg h-fit ${a.acknowledged ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-600'}`}><Megaphone size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900">{a.title}</p>
          <p className="text-[11px] text-gray-400 mb-1.5">Posted {day(a.createdAt)} by {a.postedBy}{a.endsOn ? ` · ${endText(a)}` : ''}</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.body}</p>
          {onAck && (a.acknowledged
            ? <p className="text-xs text-green-700 mt-2 flex items-center gap-1"><CheckCircle2 size={13} /> You acknowledged this</p>
            : <button className="btn-primary !py-1.5 mt-3" disabled={busy} onClick={ack}><CheckCircle2 size={15} /> Got it</button>)}
        </div>
      </div>
    </div>
  );
}

function HrAnnouncement({ a, onChanged }: { a: Announcement; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [endsOn, setEndsOn] = useState(a.endsOn || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(''); setBusy(true);
    try { await commsApi.editAnnouncement(a.id, { title, body, endsOn: endsOn || null }); setEditing(false); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove "${a.title}"? It disappears from every employee's screen.`)) return;
    try { await commsApi.removeAnnouncement(a.id); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove'); }
  };

  const pct = a.total ? Math.round(((a.readCount || 0) / a.total) * 100) : 0;
  return (
    <div className="card p-4 md:p-5 space-y-3">
      {editing ? (
        <div className="space-y-2">
          <input className="form-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className="form-input min-h-[90px]" maxLength={2000} value={body} onChange={e => setBody(e.target.value)} />
          <label className="text-xs text-gray-600 flex items-center gap-2">Shown until (optional)
            <input type="date" className="form-input !w-auto !py-1" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
            {endsOn && <button type="button" className="underline" onClick={() => setEndsOn('')}>No end date</button>}
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={save}>Save</button><button className="btn-secondary" onClick={() => { setEditing(false); setErr(''); }}>Cancel</button></div>
          <p className="text-[11px] text-gray-400">Editing does not send a new alert.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 flex flex-wrap items-center gap-2">{a.title}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${a.expired ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'}`}>{a.expired ? 'Ended' : 'Active'}</span>
              </p>
              <p className="text-[11px] text-gray-400">Posted {day(a.createdAt)} by {a.postedBy} · {endText(a)}</p>
            </div>
            <div className="flex gap-1">
              <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditing(true)}><Pencil size={12} /> Edit</button>
              <button className="btn-secondary !py-1 !px-2 text-xs !text-red-600" onClick={remove}><Trash2 size={12} /> Remove</button>
            </div>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.body}</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div>
            <button className="flex items-center gap-2 text-xs text-gray-600 w-full" onClick={() => setOpen(o => !o)} aria-expanded={open}>
              <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
              <span className="font-semibold">{a.readCount} of {a.total} acknowledged</span>
              <span className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[12rem]"><span className="block h-full bg-green-500" style={{ width: `${pct}%` }} /></span>
            </button>
            {open && (
              <div className="grid md:grid-cols-2 gap-4 mt-3 text-xs">
                <div>
                  <p className="font-semibold text-orange-700 mb-1">Not yet acknowledged ({a.notRead?.length || 0})</p>
                  <ul className="space-y-0.5 max-h-48 overflow-y-auto">{(a.notRead || []).map(p => <li key={p.id} className="text-gray-700">{p.name} <span className="text-gray-400">#{p.employeeNumber}</span></li>)}
                    {!a.notRead?.length && <li className="text-gray-400">Everyone has acknowledged.</li>}</ul>
                </div>
                <div>
                  <p className="font-semibold text-green-700 mb-1">Acknowledged ({a.readBy?.length || 0})</p>
                  <ul className="space-y-0.5 max-h-48 overflow-y-auto">{(a.readBy || []).map(p => <li key={p.id} className="text-gray-700">{p.name} <span className="text-gray-400">· {day(p.readAt)}</span></li>)}
                    {!a.readBy?.length && <li className="text-gray-400">No one yet.</li>}</ul>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Composer({ onPosted }: { onPosted: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setDone('');
    if (!window.confirm('Send this announcement to every employee now? They get a pop-up and a phone alert.')) return;
    setBusy(true);
    try {
      const r = await commsApi.postAnnouncement({ title, body, endsOn: endsOn || null });
      setTitle(''); setBody(''); setEndsOn('');
      setDone(`Posted. ${r.notified} employee${r.notified === 1 ? '' : 's'} notified.`);
      onPosted();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not post'); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={post} className="card p-4 md:p-5 space-y-3 border-t-4 border-t-orange-500">
      <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2"><Megaphone size={18} className="text-orange-600" /> New important announcement</h2>
      <p className="text-xs text-gray-500">Shown at the top of every employee's My Dashboard until they tap Got it. All employees are alerted.</p>
      <input className="form-input" placeholder="Title" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="form-input min-h-[100px]" placeholder="Announcement message" maxLength={2000} value={body} onChange={e => setBody(e.target.value)} />
      <label className="text-xs text-gray-600 flex flex-wrap items-center gap-2">Hide it after (optional)
        <input type="date" className="form-input !w-auto !py-1" value={endsOn} min={new Date().toISOString().slice(0, 10)} onChange={e => setEndsOn(e.target.value)} />
        {endsOn && <button type="button" className="underline" onClick={() => setEndsOn('')}><X size={12} className="inline" /> clear</button>}
      </label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {done && <p className="text-sm text-green-700">{done}</p>}
      <button className="btn-primary" disabled={busy || !title.trim() || !body.trim()}><Send size={15} /> {busy ? 'Posting…' : 'Post announcement'}</button>
    </form>
  );
}

export default function AnnouncementsPanel() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    commsApi.announcements().then(setItems).catch(e => setError(e instanceof Error ? e.message : 'Could not load announcements')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); window.addEventListener('hr-comms-changed', load); return () => window.removeEventListener('hr-comms-changed', load); }, [load]);

  return (
    <div className="space-y-4">
      {isAdmin && <Composer onPosted={() => { load(); commsChanged(); }} />}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
      {!loading && items.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">{isAdmin ? 'No announcements yet.' : 'There are no announcements right now.'}</div>}
      {items.map(a => isAdmin
        ? <HrAnnouncement key={a.id} a={a} onChanged={() => { load(); commsChanged(); }} />
        : <AnnouncementCard key={a.id} a={a} onAck={load} />)}
    </div>
  );
}
