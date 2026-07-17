import { Router } from 'express';

const router = Router();

router.get('/internal/rates/current', (_request, response) => {
  response.json({ id: 'standard-2026', source: 'rates-service' });
});

export default router;
