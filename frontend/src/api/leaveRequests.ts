import { api } from './client';
import type { LeaveRequest, EligibilityResult, CreateLeaveRequestPayload } from '../types';

export interface LeaveNotice { id: string; name?: string; details?: string; ts: string }
export interface LeaveImportOptions { skipUnmatched?: boolean; skipEntries?: number[]; updateDepartments?: boolean }
export interface LeaveImportResult {
  dryRun: boolean; toAdd: number; total: number; deptChanges?: number;
  byStatus: { APPROVED: number; PENDING: number; DENIED: number; CANCELLED: number };
  skipped: { row: number; message: string }[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}
interface SubmitResponse  { request: LeaveRequest; eligibility: EligibilityResult }
interface PreviewResponse { eligibility: EligibilityResult }

export const leaveRequestsApi = {
  getAll:        ()                                        => api.get<LeaveRequest[]>('/api/leave-requests').then(r => r.data),
  getById:       (id: string)                              => api.get<LeaveRequest>(`/api/leave-requests/${id}`).then(r => r.data),
  getByEmployee: (employeeId: string)                      => api.get<LeaveRequest[]>(`/api/leave-requests/employee/${employeeId}`).then(r => r.data),
  preview:       (data: CreateLeaveRequestPayload)         => api.post<PreviewResponse>('/api/leave-requests/preview', data).then(r => r.data),
  submit:        (data: CreateLeaveRequestPayload)         => api.post<SubmitResponse>('/api/leave-requests', data).then(r => r.data),
  setStatus:     (id: string, status: string, note?: string) => api.put<LeaveRequest>(`/api/leave-requests/${id}/status`, { status, note }).then(r => r.data),
  setDates:      (id: string, startDate: string, endDate: string) => api.put<LeaveRequest>(`/api/leave-requests/${id}/dates`, { startDate, endDate }).then(r => r.data),
  notifications: (since?: string) => api.get<{ now: string; pending: number; items: LeaveNotice[] }>('/api/leave-requests/notifications', { params: since ? { since } : {} }).then(r => r.data),
  importRows:    (rows: Record<string, string>[], dryRun: boolean, defaultStatus: string, opts: LeaveImportOptions = {}) => api.post<LeaveImportResult>('/api/leave-requests/import', { rows, dryRun, defaultStatus, ...opts }).then(r => r.data),
  delete:        (id: string)                              => api.delete(`/api/leave-requests/${id}`).then(r => r.data),
};