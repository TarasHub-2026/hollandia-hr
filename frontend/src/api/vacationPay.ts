import { api } from './client';

export interface VacationPayRequest {
  id: string; employeeId: string; employeeName: string; employeeNumber: string; department: string; email: string;
  requestDate: string; retain: boolean; withdraw: boolean; terminate: boolean;
  signatureType: 'DRAWN' | 'TYPED'; signature: string;
  status: 'PENDING' | 'RESPONDED' | 'CANCELLED'; submittedAt: string;
  amountAvailable: number | null; accountingNotes: string; payoutDate: string | null;
  respondedAt: string | null; respondedBy: string | null; emailedAt: string | null;
}

export interface VacationPayInput {
  retain: boolean; withdraw: boolean; terminate: boolean; email?: string;
  signatureType: 'DRAWN' | 'TYPED'; signature: string;
}

export type EmailStatus = 'sent' | 'failed' | 'not_configured' | 'no_email' | 'skipped';

export const vacationPayApi = {
  create:  (d: VacationPayInput) => api.post<VacationPayRequest>('/api/vacation-pay', d).then(r => r.data),
  mine:    () => api.get<VacationPayRequest[]>('/api/vacation-pay/mine').then(r => r.data),
  cancel:  (id: string) => api.post(`/api/vacation-pay/${id}/cancel`).then(r => r.data),
  all:     () => api.get<VacationPayRequest[]>('/api/vacation-pay').then(r => r.data),
  respond: (id: string, d: { amountAvailable: string; notes: string; payoutDate: string; email: boolean }) =>
    api.put<{ request: VacationPayRequest; emailStatus: EmailStatus }>(`/api/vacation-pay/${id}/respond`, d).then(r => r.data),
};

export const requestLabels = (r: Pick<VacationPayRequest, 'retain' | 'withdraw' | 'terminate'>): string[] => [
  r.retain ? 'Retain my vacation pay' : '',
  r.withdraw ? 'Withdraw my vacation pay' : '',
  r.terminate ? 'Terminate my retention of vacation pay' : '',
].filter(Boolean);
