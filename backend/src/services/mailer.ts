// Minimal email sender using the Resend HTTP API (https://resend.com).
// Everything here is a no-op until RESEND_API_KEY is set, and a failed email never breaks the app.
//
// Railway variables:
//   RESEND_API_KEY   (required to send)   API key from resend.com
//   MAIL_FROM        e.g. "Hollandia Leave <leave@yourdomain.ca>" (domain must be verified in Resend)
//   HR_NOTIFY_EMAIL  comma-separated address(es) that get "new leave request" emails
//   APP_URL          link used inside emails (defaults to the GitHub Pages address)
//   NOTIFY_EMPLOYEE  set to "false" to stop sending the employee a confirmation

interface Mail { to: string | string[]; subject: string; html: string; text: string }

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function mailEnabled(): boolean {
  return !!(process.env.RESEND_API_KEY || '').trim();
}

export async function sendMail(m: Mail): Promise<void> {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) return;
  const to = (Array.isArray(m.to) ? m.to : [m.to]).map(s => s.trim()).filter(Boolean);
  if (!to.length) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (process.env.MAIL_FROM || 'Hollandia Leave <onboarding@resend.dev>').trim(),
        to, subject: m.subject, html: m.html, text: m.text,
      }),
    });
    if (!res.ok) console.warn(`[mail] Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.warn('[mail] could not send email:', e instanceof Error ? e.message : e);
  }
}

export interface LeaveMailInfo {
  employeeName: string;
  employeeEmail?: string | null;
  department: string;
  startDate: string;
  endDate: string;
  purpose: string;
  flagged: boolean;
  notes: string[];
}

/** Handles both \"First Last\" and \"Last, First\" roster names. */
const firstName = (n: string) => (n.includes(',') ? n.split(',')[1] : n).trim().split(/\s+/)[0] || 'there';

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const dayCount = (a: string, b: string) => {
  const p = (s: string) => { const [y, m, d] = s.split('T')[0].split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000) + 1;
};

function layout(title: string, rows: [string, string][], intro: string, buttonText: string, link: string): { html: string; text: string } {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2937">
  <div style="background:#166534;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0"><strong style="font-size:18px">${esc(title)}</strong></div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 10px 10px">
    <p style="margin:0 0 14px">${esc(intro)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280;width:36%">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>
    <p style="margin:20px 0 0"><a href="${esc(link)}" style="background:#166534;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${esc(buttonText)}</a></p>
  </div>
  <p style="font-size:11px;color:#9ca3af;text-align:center">Hollandia Greenhouses leave system. This is an automatic message.</p>
</div>`;
  const text = `${title}\n\n${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${buttonText}: ${link}`;
  return { html, text };
}

/** Called after a leave request is saved. Never throws, never blocks the request. */
export function notifyLeaveSubmitted(info: LeaveMailInfo, submittedByAdmin: boolean): void {
  if (!mailEnabled()) return;
  const link = (process.env.APP_URL || 'https://tarashub-2026.github.io/hollandia-hr/').trim();
  const days = dayCount(info.startDate, info.endDate);
  const rows: [string, string][] = [
    ['Employee', info.employeeName],
    ['Department', info.department.replace(/_/g, ' ')],
    ['Leave dates', `${fmtDate(info.startDate)} to ${fmtDate(info.endDate)} (${days} day${days === 1 ? '' : 's'})`],
  ];
  if (info.purpose) rows.push(['Details', info.purpose.slice(0, 300)]);

  const hr = (process.env.HR_NOTIFY_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (hr.length && !submittedByAdmin) {
    const hrRows = [...rows];
    if (info.flagged) hrRows.push(['Policy flags', info.notes.length ? info.notes.slice(0, 3).join(' | ') : 'This request was red-flagged.']);
    const m = layout('New leave application submitted', hrRows, `${info.employeeName} has submitted a leave application and it is waiting for your review.`, 'Review in the app', link);
    void sendMail({ to: hr, subject: `Leave application submitted: ${info.employeeName}${info.flagged ? ' (flagged)' : ''}`, ...m });
  }

  if (process.env.NOTIFY_EMPLOYEE !== 'false' && info.employeeEmail && /^\S+@\S+\.\S+$/.test(info.employeeEmail)) {
    const m = layout('We received your leave application', rows, `Hi ${firstName(info.employeeName)}, your leave application has been submitted. HR will review it and you will see the decision in the app.`, 'View my application', link);
    void sendMail({ to: info.employeeEmail, subject: 'Your leave application has been submitted', ...m });
  }
}
