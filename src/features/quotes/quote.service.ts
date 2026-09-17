import type { Pool } from 'pg';

import { findActivePromotion } from './promotion.repository.js';
import { calculateBillingSnapshot } from './quote.pricing.js';
import type { ArrivalSelection, BillingSnapshot, QuoteDetails, ServiceSelection } from './quote.types.js';

export function normalizePromotionCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function calculateQuote(
  pool: Pool,
  service: ServiceSelection,
  arrival: ArrivalSelection,
  details: QuoteDetails,
  promoCode?: string,
): Promise<BillingSnapshot> {
  const promotion = promoCode === undefined ? undefined : await findActivePromotion(pool, normalizePromotionCode(promoCode));
  return calculateBillingSnapshot(service, arrival, details, promotion);
}
