import type { ArrivalSelection, BillingSnapshot, CleanType, Extra, Frequency, Location, Promotion, QuoteDetails, ServiceSelection } from './quote.types.js';

const LOCATION_CENTS: Record<Location, number> = {
  studio: 800,
  house: 800,
  commercial: 1000,
  residential: 1000,
};

const CLEAN_TYPE_CENTS: Record<CleanType, number> = {
  standard: 500,
  deep_clean: 600,
  moving_in_out: 700,
  post_construction: 800,
};

const EXTRA_CENTS: Record<Extra, number> = {
  inside_fridge: 2500,
  inside_oven: 2000,
  inside_cabinets: 2500,
};

const FREQUENCY_PERCENT: Record<Frequency, number> = {
  onetime: 0,
  weekly: 20,
  every_2_weeks: 15,
  every_4_weeks: 10,
};

const FLEXIBLE_DISCOUNT_CENTS = 810;
const TAX_PERCENT = 10;

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error('Rounding requires safe integer values and a positive denominator.');
  }
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

function percentOf(cents: number, percent: number): number {
  return roundHalfUp(cents * percent, 100);
}

export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function calculateBillingSnapshot(
  service: ServiceSelection,
  arrival: ArrivalSelection,
  details: QuoteDetails,
  promotion?: Promotion,
): BillingSnapshot {
  const baseService = roundHalfUp(LOCATION_CENTS[service.location] * service.rooms * CLEAN_TYPE_CENTS[service.cleanType], 100);
  const flexibleDiscount = arrival.type === 'flexible' ? -FLEXIBLE_DISCOUNT_CENTS : 0;
  const extrasTotal = details.extras.reduce((total, extra) => total + EXTRA_CENTS[extra], 0);
  const beforeFrequency = roundHalfUp(baseService + flexibleDiscount + extrasTotal, 1);
  const frequencyDiscount = -percentOf(beforeFrequency, FREQUENCY_PERCENT[details.frequency]);
  const appointmentValue = roundHalfUp(beforeFrequency + frequencyDiscount, 1);
  const promoDiscount = promotion ? -promotion.amountCents : 0;
  const subtotal = roundHalfUp(appointmentValue + promoDiscount, 1);
  const tax = percentOf(subtotal, TAX_PERCENT);
  const total = roundHalfUp(subtotal + tax, 1);

  return {
    currency: 'USD',
    baseService: money(baseService),
    flexibleDiscount: money(flexibleDiscount),
    extrasTotal: money(extrasTotal),
    frequencyDiscount: money(frequencyDiscount),
    appointmentValue: money(appointmentValue),
    ...(promotion ? { promoCode: promotion.code } : {}),
    promoDiscount: money(promoDiscount),
    subtotal: money(subtotal),
    tax: money(tax),
    total: money(total),
  };
}
