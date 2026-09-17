import { z } from 'zod';

import { CLEAN_TYPES, EXTRAS, FREQUENCIES, LOCATIONS } from './quote.types.js';
import type { QuoteRequest } from './quote.types.js';

const FIXED_ARRIVAL_TIMES = [
  '08:00am', '08:30am', '09:00am', '09:30am', '10:00am', '10:30am', '11:00am', '11:30am',
  '12:00pm', '12:30pm', '01:00pm', '01:30pm', '02:00pm', '02:30pm', '03:00pm', '03:30pm',
  '04:00pm',
] as const;

const requestSchema = z.object({
  service: z.object({
    location: z.enum(LOCATIONS),
    rooms: z.number().int().min(1).max(9),
    cleanType: z.enum(CLEAN_TYPES),
  }).strict(),
  arrival: z.discriminatedUnion('type', [
    z.object({ type: z.literal('flexible') }).strict(),
    z.object({ type: z.literal('fixed'), time: z.enum(FIXED_ARRIVAL_TIMES) }).strict(),
  ]),
  details: z.object({
    frequency: z.enum(FREQUENCIES),
    extras: z.array(z.enum(EXTRAS)).max(3).refine((extras) => new Set(extras).size === extras.length, 'Extras must be unique.'),
  }).strict(),
  promoCode: z.string().optional(),
}).strict();

export type ValidationProblem = {
  code: 'validation_error';
  message: string;
  fieldErrors: Record<string, string>;
};

function validationProblem(fieldErrors: Record<string, string>): ValidationProblem {
  return { code: 'validation_error', message: 'One or more fields are invalid.', fieldErrors };
}

export function validateQuoteRequest(input: unknown): QuoteRequest | ValidationProblem {
  const result = requestSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.') || 'body';
      fieldErrors[path] ??= issue.message;
    }
    return validationProblem(fieldErrors);
  }

  if (result.data.promoCode !== undefined) {
    const promoCode = result.data.promoCode.trim();
    if (promoCode.length > 64) return validationProblem({ promoCode: 'Promo code must be at most 64 characters.' });
    if (promoCode.length === 0) return validationProblem({ promoCode: 'Promo code is not eligible.' });
    return { ...result.data, promoCode };
  }
  return result.data;
}

export function ineligiblePromoProblem(): ValidationProblem {
  return validationProblem({ promoCode: 'Promo code is not eligible.' });
}
