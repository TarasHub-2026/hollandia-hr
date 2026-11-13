// The Employee Loan Agreement and Terms & Conditions the employee agrees to when applying.
export interface AgreementSection { title: string; paras: string[] }

export const AGREEMENT_TITLE = 'HOLLANDIA GREENHOUSES LTD. EMPLOYEE LOAN AGREEMENT AND TERMS & CONDITIONS';

export const LOAN_AGREEMENT: AgreementSection[] = [
  {
    title: '1. PARTIES AND PURPOSE',
    paras: [
      'This Employee Loan Agreement ("Agreement") is entered into by and between Hollandia Greenhouses Ltd. ("Employer") and the employee submitting this application ("Employee"). The purpose of this loan is to provide financial assistance to the Employee under the terms and conditions outlined below.',
    ],
  },
  {
    title: '2. LOAN AMOUNT AND DISBURSEMENT',
    paras: [
      'The approved loan amount shall be disbursed to the Employee via direct deposit or company cheque following the final execution of this Agreement.',
      'A detailed repayment schedule, including the principal amount, interest rate, and per-pay-period deduction amounts, will be provided to the Employee upon loan approval.',
    ],
  },
  {
    title: '3. INTEREST RATE AND CRA COMPLIANCE',
    paras: [
      'The loan shall bear interest at the rate specified in the approved loan schedule. To comply with Canada Revenue Agency (CRA) guidelines regarding taxable benefits on low-interest loans, the interest rate shall be set at or above the CRA\u2019s prescribed interest rate for the applicable calendar quarter, ensuring no unintended taxable benefit is conferred upon the Employee.',
      'Under no circumstances shall the effective annual interest rate exceed the maximum limits established by the Criminal Code of Canada (maximum 60% per annum).',
      'Any required reporting of loan details or taxable benefits on T4 slips will be managed in strict accordance with CRA regulations.',
    ],
  },
  {
    title: '4. AUTHORIZATION FOR PAYROLL DEDUCTIONS',
    paras: [
      'Pursuant to Section 21 and Section 22 of the British Columbia Employment Standards Act, the Employee hereby expressly authorizes and directs Hollandia Greenhouses Ltd. to deduct scheduled loan repayments directly from their regular wages each pay period as specified in the loan schedule.',
    ],
  },
  {
    title: '5. REPAYMENT UPON TERMINATION OR RESIGNATION',
    paras: [
      'In the event of the Employee\u2019s resignation or the termination of employment with Hollandia Greenhouses Ltd. for any reason, any outstanding balance on this employee loan shall become immediately due and payable.',
      'The Employee expressly authorizes Hollandia Greenhouses Ltd. to deduct the remaining loan balance from their final paycheck, up to the maximum amount legally permissible under the British Columbia Employment Standards Act.',
      'If the outstanding loan balance exceeds the amount of the final paycheck, the Employee agrees to promptly execute a mutually agreed-upon, written repayment schedule to settle the remaining balance in full.',
    ],
  },
  {
    title: '6. GOVERNING LAW',
    paras: [
      'This Agreement shall be governed by, construed, and enforced in accordance with the laws of the Province of British Columbia and the federal laws of Canada applicable therein.',
    ],
  },
];

export const AGREE_CHECKBOX = 'I have read and agree to the Employee Loan Agreement and Terms & Conditions above, including the repayment schedule and payroll deductions.';
