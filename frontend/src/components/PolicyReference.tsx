import React from 'react';
import { Shield, Calendar, Users, Clock, AlertTriangle } from 'lucide-react';

const BLOCKS = [
  { name:'Block 1',  dates:'Nov 15 – Jan 25', type:'approved', notes:'Covers the Winter Holidays' },
  { name:'Blackout', dates:'Jan 26 – Feb 14', type:'blackout', notes:"Valentine's Day production & shipping" },
  { name:'Block 2',  dates:'Feb 15 – Apr 19', type:'approved', notes:"After Valentine's Day rush" },
  { name:'Blackout', dates:'Apr 20 – May 10', type:'blackout', notes:"Mother's Day preparation, production & shipping" },
  { name:'Block 3',  dates:'May 11 – Jul 12', type:'approved', notes:'Late spring and early summer' },
  { name:'Block 4',  dates:'Jul 13 – Sep 13', type:'approved', notes:'Peak summer months' },
  { name:'Block 5',  dates:'Sep 14 – Nov 16', type:'approved', notes:'Fall and Thanksgiving bridge' },
];
const SEASONAL = [
  { season:"Peak Holidays (Valentine's & Mother's Day weeks)", cap:'Max 1 company-wide',  color:'bg-red-100 text-red-800' },
  { season:'Spring (Mid-Feb → Mid-May, excl. peak weeks)',    cap:'Max 2 company-wide',  color:'bg-orange-100 text-orange-800' },
  { season:"Post-Mother's Day (Mid-May → Aug)",               cap:'Max 6 company-wide',  color:'bg-yellow-100 text-yellow-800' },
  { season:'Autumn (September → October)',                     cap:'Max 5 company-wide',  color:'bg-blue-100 text-blue-800' },
  { season:'Winter (November → January)',                      cap:'Max 10 company-wide', color:'bg-brand-100 text-brand-800' },
];
const DEPT_CAPS = [
  { dept:'Greenhouse', cap:'Max 5' }, { dept:'Warehouse', cap:'Max 4' },
  { dept:'Office', cap:'Max 2' }, { dept:'Packing & Water Bucket Station', cap:'Max 1' }, { dept:'Logistics', cap:'Max 1 (driver)' },
];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className='card overflow-hidden'>
      <div className='px-5 py-4 border-b border-gray-100 flex items-center gap-2'>
        <div className='text-brand-600'>{icon}</div>
        <h2 className='font-semibold text-gray-800 text-sm'>{title}</h2>
      </div>
      <div className='px-5 py-4'>{children}</div>
    </div>
  );
}

export default function PolicyReference() {
  return (
    <div className='p-8 max-w-4xl space-y-6'>
      <div><h1 className='text-2xl font-bold text-gray-900'>Policy Reference</h1><p className='text-gray-500 text-sm'>Hollandia Leave of Absence &amp; Vacation Policy</p></div>

      <Section icon={<Calendar size={16} />} title='Annual Leave Scheduling Blocks'>
        <div className='space-y-2'>
          {BLOCKS.map((b, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${b.type === 'approved' ? 'bg-green-50' : 'bg-red-50'}`}>
              <span>{b.type === 'approved' ? '✅' : '🚫'}</span>
              <div>
                <p className={`text-sm font-semibold ${b.type === 'approved' ? 'text-green-800' : 'text-red-800'}`}>{b.name} — {b.dates}</p>
                <p className={`text-xs mt-0.5 ${b.type === 'approved' ? 'text-green-600' : 'text-red-600'}`}>{b.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Shield size={16} />} title='§1 — Eligibility & Financial Requirements'>
        <div className='space-y-3 text-sm text-gray-700'>
          <div className='flex gap-3'><span className='text-brand-600 font-bold'>•</span><div><span className='font-medium'>Minimum Tenure:</span> At least <strong>1 year</strong> of continuous employment.</div></div>
          <div className='flex gap-3'><span className='text-brand-600 font-bold'>•</span><div><span className='font-medium'>Loan Repayment:</span> Any employee loan must be at least <strong>50% repaid</strong> before a request can be considered.</div></div>
        </div>
      </Section>

      <Section icon={<AlertTriangle size={16} />} title='§2 — Travel & Documentation'>
        <div className='space-y-3 text-sm text-gray-700'>
          <div className='flex gap-3'><span className='text-brand-600 font-bold'>•</span><div><span className='font-medium'>Maximum Duration:</span> Home country travel cannot exceed <strong>75 days</strong>. Requests overlapping a Blackout will have the end date trimmed to the last valid day.</div></div>
          <div className='p-3 bg-amber-50 border border-amber-200 rounded-lg'><p className='text-xs font-semibold text-amber-800 mb-1'>📋 4-Month Document Validity Rule</p><p className='text-xs text-amber-700'>Passport, work permit, and employment contract must be valid for at least <strong>4 months</strong> beyond the scheduled return date. Leave will be denied if any document expires within this timeframe.</p></div>
          <div className='p-3 bg-blue-50 border border-blue-200 rounded-lg'><p className='text-xs font-semibold text-blue-800 mb-1'>✈️ 6-Month Airline Advisory</p><p className='text-xs text-blue-700'>Many airlines and customs agencies enforce a strict <strong>6-month passport validity rule</strong>. We strongly recommend checking your airline and destination country requirements.</p></div>
        </div>
      </Section>

      <Section icon={<Users size={16} />} title='§3 — Departmental Coverage Limits'>
        <div className='space-y-2'>
          {DEPT_CAPS.map(d => (
            <div key={d.dept} className='flex items-center justify-between py-2 border-b border-gray-50 last:border-0'>
              <span className='text-sm text-gray-700'>{d.dept}</span>
              <span className='text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-0.5 rounded-full'>{d.cap}</span>
            </div>
          ))}
        </div>
        <p className='text-xs text-gray-500 mt-3'>⚠️ Company-wide seasonal allowances (§4) supersede individual departmental caps.</p>
      </Section>

      <Section icon={<Clock size={16} />} title='§4 — Seasonal Company-Wide Allowances'>
        <div className='space-y-2'>
          {SEASONAL.map(s => (
            <div key={s.season} className='flex items-center justify-between py-2 border-b border-gray-50 last:border-0'>
              <span className='text-sm text-gray-700'>{s.season}</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.color}`}>{s.cap}</span>
            </div>
          ))}
        </div>
        <p className='text-xs text-gray-500 mt-3'>Employees on leave must be distributed across different departments. Minor overlapping in Spring is permitted if employees are in different departments.</p>
      </Section>

      <Section icon={<Clock size={16} />} title='§5 — Approval Process'>
        <div className='space-y-3 text-sm text-gray-700'>
          <div className='flex gap-3'><span className='text-brand-600 font-bold'>•</span><div><span className='font-medium'>First-Come, First-Served:</span> All leave requests are processed in the order received.</div></div>
          <div className='flex gap-3'><span className='text-brand-600 font-bold'>•</span><div>Requests meeting all eligibility, documentation, and departmental criteria will be prioritized for approval.</div></div>
        </div>
      </Section>
    </div>
  );
}