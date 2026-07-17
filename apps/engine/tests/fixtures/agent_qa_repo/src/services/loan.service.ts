import { getMinEmi } from '../loan.utils';

interface LoanInput {
  principal: number;
  annualRate: number;
  months: number;
}

/** Coordinates local EMI calculation and the remote rate lookup. */
export class LoanService {
  /**
   * Calculates a minimum EMI after loading the current rate policy.
   *
   * @param input - Loan values supplied by the API route.
   * @returns The calculated EMI and current policy identifier.
   */
  async doCalc(input: LoanInput): Promise<{ emi: number; policy: string }> {
    const response = await fetch('http://rates-service/internal/rates/current');
    const policy = (await response.json()) as { id: string };
    return {
      emi: getMinEmi(input.principal, input.annualRate, input.months),
      policy: policy.id,
    };
  }
}
