import { Router } from 'express';
import type { Pool } from 'pg';

import { createBookingController } from './booking.controller.js';

export function createBookingRouter(pool: Pool, now?: () => Date): Router {
  const router = Router();
  router.post('/bookings', createBookingController(pool, now).createBooking);
  return router;
}
