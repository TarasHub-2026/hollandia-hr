import { api } from './client';
import type { LoanApplication, LoanApplyPayload } from '../types';

export interface LoanDecisionPayload {
  status: 'APPROVED' | 'DENIED'; note?: string;
  signatureType?: 'DRAWN' | 'TYPED'; signature?: string;
  updatedAt?: string;   // the version HR is looking at; the server refuses if the employee changed it since
}

export const loansApi = {
  list:   () => api.get<LoanApplication[]>('/api/loans').then(r => r.data),
  get:    (id: string) => api.get<LoanApplication>(`/api/loans/${id}`).then(r => r.data),
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
