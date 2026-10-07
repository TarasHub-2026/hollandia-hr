export type Department = 'GREENHOUSE' | 'WAREHOUSE' | 'OFFICE' | 'PACKING_WATER_BUCKET' | 'LOGISTICS';
export const DEPARTMENTS: Department[] = ['GREENHOUSE','WAREHOUSE','OFFICE','PACKING_WATER_BUCKET','LOGISTICS'];
export const DEPARTMENT_LABELS: Record<Department, string> = {
  GREENHOUSE: 'Greenhouse',
  WAREHOUSE: 'Warehouse',
  OFFICE: 'Office',
  PACKING_WATER_BUCKET: 'Packing & Water Bucket Station',
  LOGISTICS: 'Logistics',
};
export type Role = 'EMPLOYEE' | 'ADMIN';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface Employee {
  id: string;
  name: string;
  department: Department;
  hireDate: string;
  loanOriginal: number;
  loanRemaining: number;
  pin?: string;
  role: Role;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  department: Department;
  hireDate: string;
  role: Role;
  email?: string;
  loanOriginal: number;
  loanRemaining: number;
}

export interface LoginPayload {
  identifier: string;
  pin: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}
export interface LeaveRequest {
  id: string; employeeId: string; employeeName: string; department: Department;
  startDate: string; endDate: string; purpose: string;
  passportExpiry: string | null; workPermitExpiry: string | null; contractExpiry: string | null;
  submittedAt: string; status: RequestStatus; denialReasons: string[];
  warnings: string[]; adjustedEndDate: string | null; queuePosition: number;
}
export interface EligibilityCheck { rule: string; passed: boolean; isWarning: boolean; message: string; }
export interface EligibilityResult {
  eligible: boolean; status: RequestStatus;
  failures: EligibilityCheck[]; warnings: EligibilityCheck[]; passes: EligibilityCheck[];
  adjustedEndDate: string | null;
}
export interface CreateLeaveRequestPayload {
  employeeId?: string;
  employeeName?: string;
  department?: Department;
  category?: string;
  destination?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  startDate: string;
  endDate: string;
  purpose?: string;
  passportExpiry?: string | null;
  workPermitExpiry?: string | null;
  contractExpiry?: string | null;
}