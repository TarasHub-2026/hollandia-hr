import { api } from './client';
import type { PaidSickBalance, PaidSickOverview } from '../types';

export const paidSickApi = {
  forEmployee: (employeeId: string, year?: number) =>
    api.get<PaidSickBalance>(`/api/paid-sick/employee/${employeeId}`, { params: year ? { year } : {} }).then(r => r.data),
  overview: (year?: number) =>
    api.get<PaidSickOverview>('/api/paid-sick', { params: year ? { year } : {} }).then(r => r.data),
};
