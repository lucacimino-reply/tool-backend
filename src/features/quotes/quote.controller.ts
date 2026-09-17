import type { Request, Response } from 'express';
import type { Pool } from 'pg';

import { getAuthenticatedSession } from '../auth/auth.feature.js';
import { ineligiblePromoProblem, validateQuoteRequest } from './quote.schema.js';
import { calculateQuote } from './quote.service.js';

export function createQuoteController(pool: Pool) {
  return {
    quoteBooking: async (request: Request, response: Response): Promise<void> => {
      const authenticated = await getAuthenticatedSession(pool, request.cookies.clean_session as string | undefined);
      if (!authenticated) {
        response.status(401).json({ code: 'unauthenticated', message: 'Authentication is required.' });
        return;
      }

      const input = validateQuoteRequest(request.body);
      if ('code' in input) {
        response.status(422).json(input);
        return;
      }

      if (input.promoCode !== undefined) {
        const billing = await calculateQuote(pool, input.service, input.arrival, input.details, input.promoCode);
        if (!billing.promoCode) {
          response.status(422).json(ineligiblePromoProblem());
          return;
        }
        response.status(200).json({ billing });
        return;
      }

      const billing = await calculateQuote(pool, input.service, input.arrival, input.details);
      response.status(200).json({ billing });
    },
  };
}
