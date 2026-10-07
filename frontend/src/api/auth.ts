import { api } from './client';
import type { AuthUser, LoginPayload, LoginResponse, ProfileInput } from '../types';

export const authApi = {
  login: (data: LoginPayload) =>
    api.post<LoginResponse>('/api/auth/login', data).then(r => r.data),

  register: (data: ProfileInput & { pin: string }) =>
    api.post<LoginResponse>('/api/auth/register', data).then(r => r.data),

  updateProfile: (data: ProfileInput) =>
    api.put<{ user: AuthUser }>('/api/auth/profile', data).then(r => r.data.user),

  getMe: () =>
    api.get<{ user: AuthUser }>('/api/auth/me').then(r => r.data.user),

  changePin: (employeeId: string, oldPin: string, newPin: string) =>
    api.put<{ message: string }>('/api/auth/change-pin', { employeeId, oldPin, newPin }).then(r => r.data),
};
