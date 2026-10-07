import { api } from './client';
import type { AuthUser, LoginPayload, LoginResponse } from '../types';

export const authApi = {
  login: (data: LoginPayload) => 
    api.post<LoginResponse>('/api/auth/login', data).then(r => r.data),

  getMe: () => 
    api.get<{ user: AuthUser }>('/api/auth/me').then(r => r.data.user),

  changePin: (employeeId: string, oldPin: string, newPin: string) => 
    api.put<{ message: string }>('/api/auth/change-pin', { employeeId, oldPin, newPin }).then(r => r.data),
};