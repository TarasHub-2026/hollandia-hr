import { api } from './client';
import type { Employee } from '../types';

export interface ImportResult {
  dryRun: boolean;
  toCreate: number;
  toUpdate: number;
  missingEmail?: number;
  missingDepartment?: number;
  /** Employee numbers (S-001 ...) the app assigned to salaried rows that had none. */
  autoNumbers?: string[];
  errors: { row: number; message: string }[];
}

export interface ReminderResult { sent: number; failed: string[]; noEmail: number }

export interface BirthdateImportResult {
  dryRun: boolean; total: number; toSet: number; toChange: number; unchanged: number;
  /** Rows that matched nobody (or more than one person) and were left out. */
  skipped?: { row: number; message: string }[];
  errors: { row: number; message: string }[];
}

export const employeesApi = {
  importBirthdates: (rows: Record<string, string>[], dryRun: boolean) => api.post<BirthdateImportResult>('/api/employees/import-birthdates', { rows, dryRun }).then(r => r.data),
  getAll:  ()                                       => api.get<Employee[]>('/api/employees').then(r => r.data),
  getById: (id: string)                             => api.get<Employee>(`/api/employees/${id}`).then(r => r.data),
  create:  (data: Record<string, unknown>)          => api.post<Employee>('/api/employees', data).then(r => r.data),
  update:  (id: string, data: Record<string, unknown>) => api.put<Employee>(`/api/employees/${id}`, data).then(r => r.data),
  setActive: (id: string, active: boolean)          => api.patch<Employee>(`/api/employees/${id}/active`, { active }).then(r => r.data),
  resetPin: (id: string)                            => api.post<{ pin: string; expiresAt: string }>(`/api/employees/${id}/reset-pin`).then(r => r.data),
  remindProfile: (ids?: string[])                   => api.post<ReminderResult>('/api/employees/remind-profile', { ids }, { timeout: 300000 }).then(r => r.data),
  delete:  (id: string)                             => api.delete(`/api/employees/${id}`).then(r => r.data),
  importRows: (rows: Record<string, string>[], dryRun: boolean, defaultDepartment?: string) => api.post<ImportResult>('/api/employees/import', { rows, dryRun, defaultDepartment }).then(r => r.data),
};