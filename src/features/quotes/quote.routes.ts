import { Router } from 'express';
import type { Pool } from 'pg';

import { createQuoteController } from './quote.controller.js';

export function createQuoteRouter(pool: Pool): Router {
  const controller = createQuoteController(pool);
  const router = Router();
  router.post('/booking-quotes', controller.quoteBooking);
  return router;
}
