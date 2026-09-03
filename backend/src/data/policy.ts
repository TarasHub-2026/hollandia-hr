import type { Department } from '../types/index';

export const DEPT_CAPS: Record<Department, number> = {
  GREENHOUSE: 5,
  WAREHOUSE: 4,
  OFFICE: 2,             // Upper bound of the "1-2" range
  PACKING_WATER_BUCKET: 1,
  LOGISTICS: 1,
};

export const MAX_LEAVE_DAYS = 75;
export const DOC_VALIDITY_HARD_MONTHS = 4;      // Minimum beyond return date — hard denial
export const DOC_VALIDITY_ADVISORY_MONTHS = 6;  // Advisory — airline/customs 6-month rule
export const MIN_TENURE_YEARS = 1;
export const MAX_LOAN_OUTSTANDING_RATIO = 0.5;  // 50% must be repaid
