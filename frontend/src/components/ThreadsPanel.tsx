import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, ArrowLeft, PlusCircle, X, Search, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { commsApi, commsChanged } from '../api/comms';
import { employeesApi } from '../api/employees';
import type { MessageThread, ThreadDetail, Employee } from '../types';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../types';

const when = (s: string) => new Date(s).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ───────────── HR: write a new message to chosen employees or a department ─────────────

function NewMessage({ onSent, onCancel }: { onSent: (n: number) => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [chosen, setChosen] = useState<Employee[]>([]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { employeesApi.getAll().then(list => setPeople(list.filter(e => e.role !== 'ADMIN' && e.active !== false))).catch(() => {}); }, []);

  const term = q.trim().toLowerCase();
  const matches = useMemo(() => term
    ? people.filter(e => !chosen.some(c => c.id === e.id) && (e.name.toLowerCase().includes(term) || (e.employeeNumber || '').toLowerCase().includes(term))).slice(0, 8)
    : [], [term, people, chosen]);

  const deptPeople = dept ? people.filter(e => e.department === dept) : [];
  const total = new Set([...chosen.map(c => c.id), ...deptPeople.map(p => p.id)]).size;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!total) { setErr('Choose at least one employee or a department.'); return; }
    if (total > 1 && !window.confirm(`Send this message to ${total} employees? Each one gets their own private conversation.`)) return;
    setBusy(true);
    try {
      const r = await commsApi.startThreads({ subject, body, recipientIds: chosen.map(c => c.id), department: dept || undefined });
      commsChanged();
      onSent(r.created);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not send'); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={send} className="card p-4 md:p-5 space-y-3 border-t-4 border-t-blue-500">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-blue-600" /> New message</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      <div>
        <label className="form-label">To</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chosen.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
              {c.name}<button type="button" onClick={() => setChosen(x => x.filter(y => y.id !== c.id))} aria-label={`Remove ${c.name}`}><X size={12} /></button>
            </span>
          ))}
          {dept && <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
            Whole {DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS]} department ({deptPeople.length})
            <button type="button" onClick={() => setDept('')} aria-label="Remove department"><X size={12} /></button></span>}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-gray-400" />
          <input className="form-input pl-9" placeholder="Search employee name or number" value={q} onChange={e => setQ(e.target.value)} />
          {matches.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {matches.map(m => (
                <li key={m.id}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setChosen(c => [...c, m]); setQ(''); }}>
                  {m.name} <span className="text-xs text-gray-400">#{m.employeeNumber || '—'} · {DEPARTMENT_LABELS[m.department]}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <select className="form-select mt-2 !w-auto" value={dept} onChange={e => setDept(e.target.value)} aria-label="Whole department">
          <option value="">Or add a whole department…</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
        </select>
        {total > 0 && <p className="text-xs text-gray-500 mt-1">{total} recipient{total === 1 ? '' : 's'}. Each gets a private conversation, so replies come back to you one by one.</p>}
      </div>

      <input className="form-input" placeholder="Subject" maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea className="form-input min-h-[110px]" placeholder="Message" maxLength={2000} value={body} onChange={e => setBody(e.target.value)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={busy || !subject.trim() || !body.trim() || !total}><Send size={15} /> {busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}

// ───────────── One conversation ─────────────

function Conversation({ id, isAdmin, onBack, onChanged }: { id: string; isAdmin: boolean; onBack: () => void; onChanged: () => void }) {
  const [t, setT] = useState<ThreadDetail | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { commsApi.thread(id).then(setT).catch(e => setErr(e instanceof Error ? e.message : 'Could not open the conversation')); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [t?.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try { await commsApi.reply(id, text); setText(''); load(); onChanged(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not send'); }
    finally { setBusy(false); }
  };

  // The newest HR message the employee has opened is marked "Seen" for HR.
  const lastSeenHr = t ? [...t.messages].reverse().find(m => m.from === 'HR' && m.readAt)?.id : undefined;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 bg-blue-600 text-white flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="p-1 rounded hover:bg-white/20"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <p className="font-bold truncate">{t?.subject || 'Conversation'}</p>
          {isAdmin && t && <p className="text-xs text-blue-100">{t.employeeName} · #{t.employeeNumber}</p>}
        </div>
      </div>
      <div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto bg-gray-50">
        {t?.messages.map(m => {
          const mine = isAdmin ? m.from === 'HR' : m.from === 'EMPLOYEE';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'}`}>
                <p className={`text-[11px] mb-0.5 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>{m.from === 'HR' ? m.senderName : (isAdmin ? m.senderName : 'You')} · {when(m.createdAt)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {isAdmin && m.id === lastSeenHr && <p className="text-[11px] text-blue-100 mt-1 flex items-center gap-1"><CheckCheck size={12} /> Seen {when(m.readAt!)}</p>}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-gray-200 space-y-2">
        <textarea className="form-input min-h-[70px]" placeholder={isAdmin ? 'Write a reply' : 'Write a reply to HR'} maxLength={2000} value={text} onChange={e => setText(e.target.value)} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary" disabled={busy || !text.trim()}><Send size={15} /> {busy ? 'Sending…' : 'Send'}</button>
      </form>
    </div>
  );
}

// ───────────── Conversation list ─────────────

export default function ThreadsPanel() {
  const { isAdmin } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [sentNote, setSentNote] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    commsApi.threads().then(setThreads).catch(e => setError(e instanceof Error ? e.message : 'Could not load messages')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); window.addEventListener('hr-comms-changed', load); return () => window.removeEventListener('hr-comms-changed', load); }, [load]);

  if (openId) return <Conversation id={openId} isAdmin={isAdmin} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  const term = filter.trim().toLowerCase();
  const shown = term ? threads.filter(t => t.employeeName.toLowerCase().includes(term) || t.employeeNumber.toLowerCase().includes(term) || t.subject.toLowerCase().includes(term)) : threads;

  return (
    <div className="space-y-4">
      {isAdmin && !composing && <div><button className="btn-primary" onClick={() => { setComposing(true); setSentNote(''); }}><PlusCircle size={15} /> New message</button></div>}
      {isAdmin && composing && <NewMessage onCancel={() => setComposing(false)} onSent={n => { setComposing(false); setSentNote(`Sent to ${n} employee${n === 1 ? '' : 's'}.`); load(); }} />}
      {sentNote && <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{sentNote}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
      {isAdmin && threads.length > 4 && (
        <div className="relative"><Search size={14} className="absolute left-3 top-3 text-gray-400" />
          <input className="form-input pl-9" placeholder="Search by employee or subject" value={filter} onChange={e => setFilter(e.target.value)} /></div>
      )}
      {!loading && shown.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">{isAdmin ? 'No conversations yet. Use New message to write to an employee.' : 'You have no messages from HR.'}</div>}
      <div className="card divide-y divide-gray-100 overflow-hidden">
        {shown.map(t => (
          <button key={t.id} onClick={() => setOpenId(t.id)} className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 ${t.unread ? 'bg-blue-50/60' : ''}`}>
            <div className={`p-2 rounded-lg h-fit ${t.unread ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}><MessageSquare size={16} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm truncate ${t.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
                  {isAdmin ? <>{t.employeeName} <span className="text-xs font-normal text-gray-400">#{t.employeeNumber} · {DEPARTMENT_LABELS[t.department]}</span></> : t.subject}
                </p>
                <span className="text-[11px] text-gray-400 shrink-0">{when(t.lastMessageAt)}</span>
              </div>
              {isAdmin && <p className="text-xs text-gray-700 truncate">{t.subject}</p>}
              <p className="text-xs text-gray-500 truncate">{t.lastSender === 'HR' ? `${t.lastSenderName}: ` : (isAdmin ? '' : 'You: ')}{t.lastBody}</p>
            </div>
            {t.unread > 0 && <span className="text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5 shrink-0">{t.unread} new</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
