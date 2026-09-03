import { api } from './client';
import type { LeaveRequest, EligibilityResult, CreateLeaveRequestPayload } from '../types';

interface SubmitResponse  { request: LeaveRequest; eligibility: EligibilityResult }
interface PreviewResponse { eligibility: EligibilityResult }

export const leaveRequestsApi = {
  getAll:    ()                                        => api.get<LeaveRequest[]>('/api/leave-requests').then(r => r.data),
  getById:   (id: string)                              => api.get<LeaveRequest>(`/api/leave-requests/${id}`).then(r => r.data),
  preview:   (data: CreateLeaveRequestPayload)         => api.post<PreviewResponse>('/api/leave-requests/preview', data).then(r => r.data),
  submit:    (data: CreateLeaveRequestPayload)         => api.post<SubmitResponse>('/api/leave-requests', data).then(r => r.data),
  setStatus: (id: string, status: string)              => api.put<LeaveRequest>(`/api/leave-requests/${id}/status`, { status }).then(r => r.data),
  delete:    (id: string)                              => api.delete(`/api/leave-requests/${id}`).then(r => r.data),
};