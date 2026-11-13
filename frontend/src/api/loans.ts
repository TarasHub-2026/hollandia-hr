import { api } from './client';
import type { LoanApplication, LoanApplyPayload, PayrollImportResult } from '../types';

export interface LoanDecisionPayload {
  status: 'APPROVED' | 'DENIED'; note?: string;
  signatureType?: 'DRAWN' | 'TYPED'; signature?: string;
  approvedAmount?: number;   // omit to approve the full amount asked for
  updatedAt?: string;   // the version HR is looking at; the server refuses if the employee changed it since
}

export const loansApi = {
  list:   () => api.get<LoanApplication[]>('/api/loans').then(r => r.data),
  get:    (id: string) => api.get<LoanApplication>(`/api/loans/${id}`).then(r => r.data),
  getSettings:  () => api.get<{ biweekly: number; payday: string | null }>('/api/loans/settings').then(r => r.data),
  saveSettings: (s: { biweekly?: number; payday?: string }) => api.put<{ biweekly: number; payday: string | null }>('/api/loans/settings', s).then(r => r.data),
  // A CSV for the payroll deductions import: everyone with a loan balance and the amount due on the next payday (or a blank one).
  downloadTemplate: async (blank = false) => {
    const res = await api.get<Blob>('/api/loans/payments/template', { params: blank ? { blank: 1 } : {}, responseType: 'blob', timeout: 30000 });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a'); link.href = url; link.download = blank ? 'loan-deductions-blank-template.csv' : 'loan-deductions-template.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
  importPayments: (csv: string, commit: boolean) => api.post<PayrollImportResult>('/api/loans/payments/import', { csv, commit }, { timeout: 60000 }).then(r => r.data),
  addPayment: (id: string, data: { paidOn: string; amount: number; note?: string }) => api.post<LoanApplication>(`/api/loans/${id}/payments`, data).then(r => r.data),
  deletePayment: (id: string, pid: string) => api.delete<LoanApplication>(`/api/loans/${id}/payments/${pid}`).then(r => r.data),
  setAmortization: (id: string, biweekly: number) => api.put<LoanApplication>(`/api/loans/${id}/amortization`, { biweekly }).then(r => r.data),
  saveReview: (id: string, comment: string) => api.put<LoanApplication>(`/api/loans/${id}/review`, { comment }).then(r => r.data),
  saveCheque: (id: string, data: { chequeNumber: string; chequeDate?: string; note?: string; notify?: boolean }) => api.put<LoanApplication>(`/api/loans/${id}/cheque`, data).then(r => r.data),
  saveReceipt: (id: string, data: { receivedOn: string; reference: string; signatureType?: 'DRAWN' | 'TYPED'; signature?: string }) => api.put<LoanApplication>(`/api/loans/${id}/receipt`, data, { timeout: 60000 }).then(r => r.data),
  apply:  (data: LoanApplyPayload) => api.post<LoanApplication>('/api/loans', data, { timeout: 90000 }).then(r => r.data),
  update: (id: string, data: LoanApplyPayload) => api.put<LoanApplication>(`/api/loans/${id}`, data, { timeout: 90000 }).then(r => r.data),
  decide: (id: string, data: LoanDecisionPayload) => api.put<LoanApplication>(`/api/loans/${id}/decision`, data).then(r => r.data),
  // The proof needs the sign-in token, so it is fetched as a file and opened from memory.
  openProof: async (id: string) => {
    const res = await api.get<Blob>(`/api/loans/${id}/proof`, { responseType: 'blob', timeout: 60000 });
    const url = URL.createObjectURL(res.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  },
};
