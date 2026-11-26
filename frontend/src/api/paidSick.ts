import { api } from './client';
import type { PaidSickBalance, PaidSickOverview, PaidSickAdjustment } from '../types';

export const paidSickApi = {
  forEmployee: (employeeId: string, year?: number) =>
    api.get<PaidSickBalance>(`/api/paid-sick/employee/${employeeId}`, { params: year ? { year } : {} }).then(r => r.data),
  overview: (year?: number) =>
    api.get<PaidSickOverview>('/api/paid-sick', { params: year ? { year } : {} }).then(r => r.data),
  /** HR: record days taken outside the app (positive) or give days back (negative). */
  addAdjustment: (employeeId: string, d: { takenOn: string; days: number; note?: string }) =>
    api.post<{ adjustment: PaidSickAdjustment; balance: PaidSickBalance; overLimit: boolean }>(`/api/paid-sick/employee/${employeeId}/adjustments`, d).then(r => r.data),
  removeAdjustment: (id: string) =>
    api.delete<{ balance: PaidSickBalance }>(`/api/paid-sick/adjustments/${id}`).then(r => r.data),
  /** HR: how many days of a leave request count as paid sick leave (0 = none). */
  setRequestDays: (requestId: string, days: number) =>
    api.put<{ balance: PaidSickBalance }>(`/api/paid-sick/requests/${requestId}`, { days }).then(r => r.data),
};
