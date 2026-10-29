import { api } from './client';
import type { AuthUser, LoginPayload, LoginResponse, ProfileInput, LookupEmployee, AdminAccessData, AdminAccessRequest } from '../types';

export const authApi = {
  login: (data: LoginPayload) =>
    api.post<LoginResponse>('/api/auth/login', data).then(r => r.data),

  register: (data: ProfileInput & { pin: string }) =>
    api.post<LoginResponse>('/api/auth/register', data).then(r => r.data),

  registerAdmin: (data: { name: string; email: string; username: string; pin: string; reason?: string }) =>
    api.post<{ message: string }>('/api/auth/register-admin', data).then(r => r.data),

  getAdminAccess: () =>
    api.get<AdminAccessData>('/api/auth/admin-access').then(r => r.data),

  decideAdminRequest: (id: string, status: 'APPROVED' | 'DENIED', note?: string) =>
    api.put<AdminAccessRequest>(`/api/auth/admin-access/${id}`, { status, note }).then(r => r.data),

  removeAdmin: (id: string) =>
    api.delete(`/api/auth/admin-access/admins/${id}`).then(r => r.data),

  updateProfile: (data: ProfileInput) =>
    api.put<{ user: AuthUser }>('/api/auth/profile', data).then(r => r.data.user),

  lookup: (employeeNumber: string) =>
    api.get<LookupEmployee>('/api/auth/lookup', { params: { employeeNumber } }).then(r => r.data),

  getMe: () =>
    api.get<{ user: AuthUser }>('/api/auth/me').then(r => r.data.user),

  changePin: (employeeId: string, oldPin: string, newPin: string) =>
    api.put<{ message: string }>('/api/auth/change-pin', { employeeId, oldPin, newPin }).then(r => r.data),
};
