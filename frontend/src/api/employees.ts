import { api } from './client';
import type { Employee } from '../types';

export interface ImportResult {
  dryRun: boolean;
  toCreate: number;
  toUpdate: number;
  errors: { row: number; message: string }[];
}

export const employeesApi = {
  getAll:  ()                                       => api.get<Employee[]>('/api/employees').then(r => r.data),
  getById: (id: string)                             => api.get<Employee>(`/api/employees/${id}`).then(r => r.data),
  create:  (data: Record<string, unknown>)          => api.post<Employee>('/api/employees', data).then(r => r.data),
  update:  (id: string, data: Record<string, unknown>) => api.put<Employee>(`/api/employees/${id}`, data).then(r => r.data),
  setActive: (id: string, active: boolean)          => api.patch<Employee>(`/api/employees/${id}/active`, { active }).then(r => r.data),
  delete:  (id: string)                             => api.delete(`/api/employees/${id}`).then(r => r.data),
  importRows: (rows: Record<string, string>[], dryRun: boolean) => api.post<ImportResult>('/api/employees/import', { rows, dryRun }).then(r => r.data),
};