export type Department = 'GREENHOUSE' | 'WAREHOUSE' | 'OFFICE' | 'PACKING_WATER_BUCKET' | 'LOGISTICS' | 'SHIPPING' | 'MAINTENANCE';
export const DEPARTMENTS: Department[] = ['GREENHOUSE','WAREHOUSE','OFFICE','PACKING_WATER_BUCKET','SHIPPING','MAINTENANCE'];
export const DEPARTMENT_LABELS: Record<Department, string> = {
  GREENHOUSE: 'Greenhouse',
  WAREHOUSE: 'Warehouse',
  OFFICE: 'Office',
  PACKING_WATER_BUCKET: 'Water Bucket Station',
  LOGISTICS: 'Logistics',
  SHIPPING: 'Shipping',
  MAINTENANCE: 'Maintenance',
};
export type Role = 'EMPLOYEE' | 'ADMIN';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

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
  firstName?: string;
  lastName?: string;
  employeeNumber?: string;
  immigrationStatus?: ImmigrationStatus;
  passportExpiry?: string;
  workPermitExpiry?: string;
  deptPending?: boolean;
  nationality?: string; passportNumber?: string; lmiaNumber?: string;
  cowanCertNumber?: string; cowanCertExpiry?: string;
  active?: boolean;
  registered?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ImmigrationStatus = 'TFW' | 'NON_TFW';

export interface ProfileInput {
  firstName: string;
  lastName: string;
  employeeNumber: string;
  username?: string;
  email: string;
  hireDate: string;
  department: Department;
  immigrationStatus: ImmigrationStatus | '';
  passportExpiry?: string;
  workPermitExpiry?: string;
}

export interface AuthUser {
  mustChangePin?: boolean;
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  employeeNumber?: string;
  username?: string;
  immigrationStatus?: ImmigrationStatus;
  passportExpiry?: string;
  workPermitExpiry?: string;
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
  isFlagged?: boolean;
  paidSickDays?: number | null;
  decisionNote?: string | null; decidedAt?: string | null; decidedBy?: string | null;
}
export interface PaidSickRecord { id: string; startDate: string; endDate: string; days: number; status: string }
export interface PaidSickBalance {
  year: number; entitlement: number; tracked: boolean; startYear: number;
  approved: number; pending: number; remaining: number; records: PaidSickRecord[];
}
export interface PaidSickRow {
  id: string; name: string; employeeNumber: string; department: Department;
  approved: number; pending: number; remaining: number; records: PaidSickRecord[];
}
export interface PaidSickOverview {
  year: number; entitlement: number; startYear: number; tracked: boolean; employees: PaidSickRow[];
}
export interface EmployeeNotice {
  id: string; kind: string; title: string; message: string; leaveRequestId: string | null; createdAt: string; read: boolean;
}
export interface DateChange {
  id: string; leaveRequestId: string; employeeId: string; employeeName?: string;
  oldStart: string; oldEnd: string; newStart: string; newEnd: string; reason: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN'; createdAt: string;
  decidedAt: string | null; decisionNote: string | null;
}
export interface AdminAccessRequest {
  id: string; name: string; email: string; username: string; reason: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED'; createdAt: string; decidedAt: string | null; decisionNote: string | null;
}
export interface AdminAccessData {
  requests: AdminAccessRequest[];
  admins: { id: string; name: string; username: string; email: string; createdAt: string; primary: boolean }[];
}
export interface EligibilityCheck { rule: string; passed: boolean; isWarning: boolean; message: string; }
export interface EligibilityResult {
  eligible: boolean; status: RequestStatus;
  failures: EligibilityCheck[]; warnings: EligibilityCheck[]; passes: EligibilityCheck[];
  adjustedEndDate: string | null;
}
export interface CreateLeaveRequestPayload {
  statutory?: boolean;
  extraFlags?: string[];
  paidSickDays?: number;
  hireDate?: string;
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

export interface LookupEmployee {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: Department;
  hireDate: string;
  email: string;
  immigrationStatus: ImmigrationStatus | '';
  passportExpiry: string;
  workPermitExpiry: string;
}

export interface LoanApplication {
  id: string; employeeId: string; employeeName: string; employeeNumber: string; department: Department; email: string;
  amount: number; purpose: string; estimatedInterest: number; payments: number; biweekly: number; interestRate: number;
  status: 'PENDING' | 'APPROVED' | 'DENIED'; submittedAt: string; updatedAt: string; edited: boolean; onBehalf: boolean;
  hasProof: boolean; proofName: string | null;
  decidedAt: string | null; decisionNote: string | null;
  signatureType: 'DRAWN' | 'TYPED' | null; signature: string | null; signatureName: string | null;
  loanApplied: boolean;
  currentLoan: { original: number; remaining: number; repaidPercent: number };
}
export interface LoanProofUpload { name: string; data: string }
export interface LoanApplyPayload {
  employeeId?: string; amount: number; purpose: string; agreements: boolean[]; proof?: LoanProofUpload;
}

export interface Announcement {
  id: string; title: string; body: string; createdAt: string; updatedAt: string; endsOn: string | null; expired: boolean;
  acknowledged?: boolean;
  // HR view only
  readCount?: number; total?: number;
  notRead?: { id: string; name: string; employeeNumber: string }[];
  readBy?: { id: string; name: string; employeeNumber: string; readAt: string }[];
}
export interface MessageThread {
  id: string; subject: string; createdAt: string; lastMessageAt: string;
  employeeId: string; employeeName: string; employeeNumber: string; department: Department;
  unread: number; lastBody: string; lastSender: 'HR' | 'EMPLOYEE';
}
export interface ThreadMessage { id: string; from: 'HR' | 'EMPLOYEE'; senderName: string; body: string; createdAt: string; readAt: string | null }
export interface ThreadDetail { id: string; subject: string; employeeId: string; employeeName: string; employeeNumber: string; messages: ThreadMessage[] }
export interface CommsSummary { unreadMessages: number; newAnnouncements: number }
