/**
 * Returns the minimum permitted monthly payment for a loan.
 *
 * @param principal - Outstanding loan principal.
 * @param annualRate - Annual percentage rate as a decimal.
 * @param months - Remaining loan term in months.
 * @returns The greater of the amortized payment or one percent of principal.
 */
export function getMinEmi(
  principal: number,
  annualRate: number,
  months: number,
): number {
  return Math.max(calculateEmi(principal, annualRate, months), principal * 0.01);
}

/**
 * Calculates an amortized equated monthly installment.
 *
 * @param principal - Outstanding loan principal.
 * @param annualRate - Annual percentage rate as a decimal.
 * @param months - Loan term in months.
 * @returns Monthly installment rounded to two decimal places.
 */
export function calculateEmi(
  principal: number,
  annualRate: number,
  months: number,
): number {
  const monthlyRate = annualRate / 12;
  const growth = (1 + monthlyRate) ** months;
  return Math.round(((principal * monthlyRate * growth) / (growth - 1)) * 100) / 100;
}
