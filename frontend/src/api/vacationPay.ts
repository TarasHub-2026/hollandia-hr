import { api } from './client';

export interface VacationPayRequest {
  id: string; employeeId: string; employeeName: string; employeeNumber: string; department: string; email: string;
  requestDate: string; retain: boolean; withdraw: boolean; terminate: boolean;
  /** What the employee asked to withdraw, and whether that amount is before or after CPP, EI and tax. */
  withdrawAmount: number | null; withdrawBasis: 'BEFORE' | 'AFTER' | null;
  signatureType: 'DRAWN' | 'TYPED'; signature: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'; submittedAt: string;
  // Prepared by HR / Accounting (hidden from the employee until management decides)
  amountAvailable: number | null; accountingNotes: string; payoutDate: string | null;
  respondedAt: string | null; respondedBy: string | null; emailedAt: string | null;
  // Internal HR / Accounting comment (HR only)
  reviewComment: string | null; reviewBy: string | null; reviewAt: string | null;
  // Management decision (the main administrator account)
  approvedAmount: number | null; decisionNote: string | null; decidedAt: string | null; decidedBy: string | null;
  mgmtSignatureType: 'DRAWN' | 'TYPED' | null; mgmtSignature: string | null;
  // Cheque for a withdrawal, and the employee's signed receipt
  chequeNumber: string | null; chequeDate: string | null; chequeNote: string | null; chequeReadyAt: string | null; chequeReadyBy: string | null;
  employeeSignatureType: 'DRAWN' | 'TYPED' | null; employeeSignature: string | null; employeeSignedAt: string | null;
  chequeReceivedOn: string | null; chequeReference: string | null; receiptByHr: boolean;
}

export interface VacationPayInput {
  retain: boolean; withdraw: boolean; terminate: boolean; email?: string;
  withdrawAmount?: string; withdrawBasis?: 'BEFORE' | 'AFTER';
  signatureType: 'DRAWN' | 'TYPED'; signature: string;
}

export type EmailStatus = 'sent' | 'failed' | 'not_configured' | 'no_email' | 'skipped';

export const vacationPayApi = {
  create:  (d: VacationPayInput) => api.post<VacationPayRequest>('/api/vacation-pay', d).then(r => r.data),
  mine:    () => api.get<VacationPayRequest[]>('/api/vacation-pay/mine').then(r => r.data),
  cancel:  (id: string) => api.post(`/api/vacation-pay/${id}/cancel`).then(r => r.data),
  all:     () => api.get<VacationPayRequest[]>('/api/vacation-pay').then(r => r.data),
  saveReview: (id: string, comment: string) => api.put<VacationPayRequest>(`/api/vacation-pay/${id}/review`, { comment }).then(r => r.data),
  saveDetails: (id: string, d: { amountAvailable: string; notes: string; payoutDate: string; notify?: boolean; email?: boolean }) =>
    api.put<{ request: VacationPayRequest; emailStatus: EmailStatus }>(`/api/vacation-pay/${id}/details`, d).then(r => r.data),
  decide: (id: string, d: { status: 'APPROVED' | 'DENIED'; note?: string; approvedAmount?: string; signatureType?: string; signature?: string }) =>
    api.put<VacationPayRequest>(`/api/vacation-pay/${id}/decision`, d).then(r => r.data),
  saveCheque: (id: string, d: { chequeNumber: string; chequeDate?: string; note?: string; notify?: boolean }) =>
    api.put<VacationPayRequest>(`/api/vacation-pay/${id}/cheque`, d).then(r => r.data),
  saveReceipt: (id: string, d: { receivedOn: string; reference: string; signatureType?: string; signature?: string }) =>
    api.put<VacationPayRequest>(`/api/vacation-pay/${id}/receipt`, d).then(r => r.data),
};

export const requestLabels = (r: Pick<VacationPayRequest, 'retain' | 'withdraw' | 'terminate'>): string[] => [
  r.retain ? 'Retain my vacation pay' : '',
  r.withdraw ? 'Withdraw my vacation pay' : '',
  r.terminate ? 'Terminate my retention of vacation pay' : '',
].filter(Boolean);

/** "$500.00 before CPP, EI and tax" for a withdrawal request, or '' if there is none. */
export const withdrawText = (r: Pick<VacationPayRequest, 'withdraw' | 'withdrawAmount' | 'withdrawBasis'>): string =>
  r.withdraw && r.withdrawAmount !== null
    ? `$${r.withdrawAmount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.withdrawBasis === 'AFTER' ? 'after' : 'before'} CPP, EI and tax`
    : '';

/** The amount management approved, or what HR prepared if nothing was approved yet. */
export const shownAmount = (r: Pick<VacationPayRequest, 'approvedAmount' | 'amountAvailable'>): number | null => r.approvedAmount ?? r.amountAvailable;
