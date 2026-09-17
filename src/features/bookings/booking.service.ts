import { createHash } from 'node:crypto';

import type { Pool } from 'pg';

import type { AuthenticatedCustomer } from '../auth/auth.types.js';
import { calculateBookingQuote, ineligiblePromoProblem, type ValidationProblem } from '../quotes/quote.feature.js';
import { persistCompletedBooking } from './booking.repository.js';
import type { CreateBookingInput } from './booking.schema.js';
import type { PersistBookingResult } from './booking.types.js';

const EXTRA_PRICES: Record<string, string> = { inside_fridge: '25.00', inside_oven: '20.00', inside_cabinets: '25.00' };

function fingerprint(input: CreateBookingInput): string {
  return createHash('sha256').update(JSON.stringify({
    service: input.service, schedule: input.schedule, details: input.details, promoCode: input.promoCode, contact: input.contact,
  })).digest('hex');
}

export async function createCompletedBooking(pool: Pool, customer: AuthenticatedCustomer['customer'], idempotencyKey: string, input: CreateBookingInput): Promise<PersistBookingResult | ValidationProblem> {
  const billing = await calculateBookingQuote(pool, input.service, input.schedule.arrival, {
    frequency: input.details.frequency, extras: input.details.extras.map((extra) => extra.name),
  }, input.promoCode);
  if (input.promoCode && !billing.promoCode) return ineligiblePromoProblem();
  const details = { ...input.details, extras: input.details.extras.map((extra) => ({ ...extra, price: EXTRA_PRICES[extra.name] })) };
  return persistCompletedBooking(pool, idempotencyKey, fingerprint({ ...input, details }), {
    customer, service: input.service, schedule: input.schedule, details, contact: input.contact, billing,
  });
}
