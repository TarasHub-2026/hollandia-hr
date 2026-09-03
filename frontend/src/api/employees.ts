import { api } from './client';
import type { Employee } from '../types';

export const employeesApi = {
  getAll:  ()                                       => api.get<Employee[]>('/api/employees').then(r => r.data),
  getById: (id: string)                             => api.get<Employee>(`/api/employees/${id}`).then(r => r.data),
  create:  (data: Partial<Employee> & { hireDate: string }) => api.post<Employee>('/api/employees', data).then(r => r.data),
  update:  (id: string, data: Partial<Employee>)    => api.put<Employee>(`/api/employees/${id}`, data).then(r => r.data),
  delete:  (id: string)                             => api.delete(`/api/employees/${id}`).then(r => r.data),
};