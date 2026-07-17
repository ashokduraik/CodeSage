import { Router } from 'express';

import { LoanService } from '../services/loan.service';

const router = Router();
const loanService = new LoanService();

router.post('/loans/calculate', async (request, response) => {
  const result = await loanService.doCalc(request.body);
  response.json(result);
});

export default router;
