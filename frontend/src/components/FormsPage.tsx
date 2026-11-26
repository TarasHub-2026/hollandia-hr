import React, { useEffect, useRef, useState } from 'react';
import { FileText, HandCoins, Banknote, ChevronDown, CalendarClock, X } from 'lucide-react';
import IntegratedLeaveForm from './IntegratedLeaveForm';
import BlockAvailabilityCard from './BlockAvailabilityCard';
import LoanPage from './LoanPage';
import VacationPayPage from './VacationPayPage';
import type { ApplyBlock } from '../types';
import type { FormKind } from './EmployeePortal';

const FORMS: { id: FormKind; title: string; sub: string; Icon: typeof FileText; tone: string }[] = [
  { id: 'leave', title: 'Leave Form', sub: 'Apply for annual leave or any other type of leave', Icon: FileText, tone: 'bg-emerald-100 text-emerald-700' },
  { id: 'loan', title: 'Loan Application Form', sub: 'Apply for an employee loan (emergency or medical)', Icon: HandCoins, tone: 'bg-amber-100 text-amber-700' },
  { id: 'vacation', title: 'Vacation Pay Request Form', sub: 'Retain, withdraw or end the retention of vacation pay', Icon: Banknote, tone: 'bg-indigo-100 text-indigo-700' },
];

/** Employees: every form in one place. Choosing a card opens that form below the cards.
 *  `embedded`: shown inside the Forms card on My Dashboard (no page heading or padding). */
export default function FormsPage({ initial, onLeaveSubmitted, embedded = false }: { initial?: FormKind | null; onLeaveSubmitted: () => void; embedded?: boolean }) {
  const [form, setForm] = useState<FormKind | null>(initial ?? null);
  const [block, setBlock] = useState<ApplyBlock | null>(null);
  const [blocksOpen, setBlocksOpen] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (form) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [form]);

  const pick = (f: FormKind) => {
    setForm(f);
    if (f === 'leave') { setBlocksOpen(true); setBlock(null); }
  };
  // Choosing a block (or "other leave types") fills in the leave form and folds the block information away.
  const startLeave = (b: ApplyBlock | null) => {
    setBlock(b);
    setBlocksOpen(false);
    setTimeout(() => leaveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const current = FORMS.find(f => f.id === form);

  return (
    <div className={embedded ? 'space-y-5' : 'p-4 md:p-10 max-w-5xl mx-auto space-y-6'}>
      {!embedded && <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-2"><FileText size={26} /> Forms</h1>
        <p className="text-gray-500 text-sm mt-1">Choose the form you need. You can follow what happens to it, and see HR&apos;s answer, on My Dashboard.</p>
      </div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {FORMS.map(f => {
          const active = form === f.id;
          return (
            <button key={f.id} type="button" onClick={() => pick(f.id)} aria-pressed={active}
              className={`card p-4 md:p-5 text-left transition-all hover:shadow-md ${active ? 'ring-2 ring-brand-500 bg-brand-50/40' : 'hover:border-brand-300'}`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${f.tone}`}><f.Icon size={22} /></div>
              <p className="font-bold text-gray-900">{f.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{f.sub}</p>
            </button>
          );
        })}
      </div>

      {current && (
        <div ref={formRef} className="space-y-4 scroll-mt-4">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2"><span className={`w-9 h-9 rounded-lg flex items-center justify-center ${current.tone}`}><current.Icon size={18} /></span> {current.title}</h2>
            <button onClick={() => setForm(null)} aria-label="Close the form" className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>

          {form === 'leave' && (
            <>
              {/* Which blocks still have room: open when the leave form is chosen, folds away once a block is picked */}
              <div className="card overflow-hidden">
                <button type="button" onClick={() => setBlocksOpen(o => !o)} aria-expanded={blocksOpen}
                  className="w-full px-4 py-3 flex items-center gap-2 text-left bg-emerald-50 hover:bg-emerald-100/70">
                  <CalendarClock size={16} className="text-emerald-700" />
                  <span className="font-semibold text-emerald-900">Blocks available to apply</span>
                  <span className="text-xs text-emerald-800">(Annual Leave Entitlement)</span>
                  {block && !blocksOpen && <span className="text-xs text-gray-600 ml-2">Applying in <strong>{block.name}</strong></span>}
                  <ChevronDown size={16} className={`ml-auto text-emerald-700 transition-transform ${blocksOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${blocksOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="p-3">
                      <BlockAvailabilityCard onApplyLeave={() => startLeave(null)} onApplyBlock={b => startLeave(b)} />
                    </div>
                  </div>
                </div>
              </div>
              <div ref={leaveRef} className={`scroll-mt-4 ${embedded ? '-mx-4 md:-mx-6' : '-mx-4 md:-mx-8'}`}>
                <IntegratedLeaveForm key={block ? `${block.name}-${block.startDate}` : 'open'} block={block} onNavigateRequests={onLeaveSubmitted} />
              </div>
            </>
          )}

          {form === 'loan' && <LoanPage mode="form" embedded />}
          {form === 'vacation' && <VacationPayPage mode="form" embedded />}
        </div>
      )}
    </div>
  );
}
