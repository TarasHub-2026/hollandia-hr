const INTEREST_RATE = 0.05;                                    // 5% per annum (same rule as the server)
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Same rule the server uses: interest = amount x 5% x ((amount / bi-weekly) / 26 years); payments cover principal + interest. */
export function previewLoan(amount: number, biweekly: number) {
  if (!(amount > 0) || !(biweekly > 0)) return null;
  const interest = round2(amount * INTEREST_RATE * (amount / biweekly / 26));
  const total = round2(amount + interest);
  const payments = Math.ceil(total / biweekly - 1e-9);
  const lastPayment = round2(total - biweekly * (payments - 1));
  return { interest, total, payments, lastPayment };
}

/** Total to repay and the (possibly smaller) final payment for a saved application. */
export function repayment(amount: number, interest: number, biweekly: number, payments: number) {
  const total = round2(amount + interest);
  return { total, lastPayment: round2(total - biweekly * Math.max(0, payments - 1)) };
}
