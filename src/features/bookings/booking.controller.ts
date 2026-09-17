import type { Request, Response } from 'express';
import type { Pool } from 'pg';

import { getAuthenticatedSession } from '../auth/auth.feature.js';
import { validateCreateBookingRequest } from './booking.schema.js';
import { createCompletedBooking } from './booking.service.js';

export function createBookingController(pool: Pool, now: () => Date = () => new Date()) {
  return {
    createBooking: async (request: Request, response: Response): Promise<void> => {
      const authenticated = await getAuthenticatedSession(pool, request.cookies.clean_session as string | undefined);
      if (!authenticated) {
        response.status(401).json({ code: 'unauthenticated', message: 'Authentication is required.' });
        return;
      }
      const idempotencyKey = request.header('Idempotency-Key');
      if (!idempotencyKey || idempotencyKey.length > 255) {
        response.status(422).json({ code: 'validation_error', message: 'One or more fields are invalid.', fieldErrors: { 'Idempotency-Key': 'Idempotency-Key must contain 1 to 255 characters.' } });
        return;
      }
      const input = validateCreateBookingRequest(request.body, now());
      if ('code' in input) {
        response.status(422).json(input);
        return;
      }
      const result = await createCompletedBooking(pool, authenticated.customer, idempotencyKey, input);
      if ('code' in result) {
        response.status(422).json(result);
        return;
      }
      if (result.outcome === 'conflict') {
        response.status(409).json({ code: 'idempotency_conflict', message: 'Idempotency-Key was already used for a different order.' });
        return;
      }
      response.status(result.outcome === 'created' ? 201 : 200).json(result.booking);
    },
  };
}
