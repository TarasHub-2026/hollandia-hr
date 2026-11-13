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
  cowanCertNumber?: string; cowanCertExpiry?: string; visaExpiry?: string;
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
  visaExpiry?: string;
  cowanCertNumber?: string;
  cowanCertExpiry?: string;
}

export interface AuthUser {
  visaExpiry?: string;
  cowanCertNumber?: string;
  cowanCertExpiry?: string;
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
  // Only on the single-application endpoint (the printable form)
  requestedAmount: number;                                        // what the employee asked for (amount is what management approved)
  reviewComment: string | null; reviewBy: string | null; reviewAt: string | null;           // HR/Accounting comment (HR only)
  chequeNumber: string | null; chequeDate: string | null; chequeNote: string | null; chequeReadyAt: string | null; chequeReadyBy: string | null;
  employeeSignatureType: 'DRAWN' | 'TYPED' | null; employeeSignature: string | null; employeeSignedAt: string | null;
  chequeReceivedOn: string | null; chequeReference: string | null; receiptByHr: boolean;
  schedule?: LoanScheduleRow[]; paymentLog?: LoanPayment[]; balance?: { total: number; paid: number; outstanding: number }; payday?: string | null;
}
export interface LoanScheduleRow { n: number; dueDate: string | null; payment: number; interest: number; principal: number; balance: number; status: 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE' | null }
export interface LoanPayment { id: string; paidOn: string; amount: number; principal: number; interest: number; source: string; note: string | null }
export interface PayrollImportRow { line: number; employeeNumber: string; employeeName: string | null; date: string; amount: number | null; status: 'OK' | 'DUPLICATE' | 'ERROR'; message: string }
export interface PayrollImportResult { committed: boolean; rows: PayrollImportRow[]; summary: { ok: number; duplicate: number; error: number; total: number } }
export interface LoanProofUpload { name: string; data: string }
export interface LoanApplyPayload {
  employeeId?: string; amount: number; purpose: string; agreements: boolean[]; proof?: LoanProofUpload;
}

export interface Announcement {
  id: string; title: string; body: string; createdAt: string; updatedAt: string; endsOn: string | null; expired: boolean;
  postedBy: string;
  acknowledged?: boolean;
  // HR view only
  readCount?: number; total?: number;
  notRead?: { id: string; name: string; employeeNumber: string }[];
  readBy?: { id: string; name: string; employeeNumber: string; readAt: string }[];
}
export interface MessageThread {
  id: string; subject: string; createdAt: string; lastMessageAt: string;
  employeeId: string; employeeName: string; employeeNumber: string; department: Department;
  unread: number; lastBody: string; lastSender: 'HR' | 'EMPLOYEE'; lastSenderName: string;
}
export interface ThreadMessage { id: string; from: 'HR' | 'EMPLOYEE'; senderName: string; body: string; createdAt: string; readAt: string | null }
export interface ThreadDetail { id: string; subject: string; employeeId: string; employeeName: string; employeeNumber: string; messages: ThreadMessage[] }
export interface CommsSummary { unreadMessages: number; newAnnouncements: number }
