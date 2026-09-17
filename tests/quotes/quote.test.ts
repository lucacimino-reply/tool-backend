import { newDb } from 'pg-mem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedSql, sql as promotionsMigration } from '../../src/db/migrations/002-create-promotions.js';
import { calculateBillingSnapshot, money, roundHalfUp } from '../../src/features/quotes/quote.pricing.js';
import { calculateQuote } from '../../src/features/quotes/quote.service.js';
import type { ArrivalSelection, QuoteDetails, ServiceSelection } from '../../src/features/quotes/quote.types.js';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool']['prototype'];

const fixedArrival: ArrivalSelection = { type: 'fixed', time: '08:00am' };
const baseService: ServiceSelection = { location: 'studio', rooms: 2, cleanType: 'standard' };
const oneTimeDetails: QuoteDetails = { frequency: 'onetime', extras: [] };

beforeEach(async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await pool.query(promotionsMigration);
});

afterEach(async () => pool.end());

describe('quote pricing', () => {
  it.each([
    ['studio', 'standard', '80.00'], ['studio', 'deep_clean', '96.00'], ['studio', 'moving_in_out', '112.00'], ['studio', 'post_construction', '128.00'],
    ['house', 'standard', '80.00'], ['house', 'deep_clean', '96.00'], ['house', 'moving_in_out', '112.00'], ['house', 'post_construction', '128.00'],
    ['commercial', 'standard', '100.00'], ['commercial', 'deep_clean', '120.00'], ['commercial', 'moving_in_out', '140.00'], ['commercial', 'post_construction', '160.00'],
    ['residential', 'standard', '100.00'], ['residential', 'deep_clean', '120.00'], ['residential', 'moving_in_out', '140.00'], ['residential', 'post_construction', '160.00'],
  ] as const)('uses the authoritative %s and %s price table', (location, cleanType, expected) => {
    const billing = calculateBillingSnapshot({ location, rooms: 2, cleanType }, fixedArrival, oneTimeDetails);
    expect(billing.baseService).toBe(expected);
  });

  it('subtracts the flexible discount before extras and frequency discounts', () => {
    const billing = calculateBillingSnapshot(
      baseService,
      { type: 'flexible' },
      { frequency: 'weekly', extras: ['inside_oven'] },
    );
    expect(billing).toMatchObject({
      baseService: '80.00', flexibleDiscount: '-8.10', extrasTotal: '20.00',
      frequencyDiscount: '-18.38', appointmentValue: '73.52', promoDiscount: '0.00',
      subtotal: '73.52', tax: '7.35', total: '80.87', currency: 'USD',
    });
    expect(calculateBillingSnapshot(baseService, fixedArrival, oneTimeDetails).flexibleDiscount).toBe('0.00');
  });

  it.each([
    [[], '0.00'], [['inside_fridge'], '25.00'], [['inside_oven'], '20.00'],
    [['inside_cabinets'], '25.00'], [['inside_fridge', 'inside_oven'], '45.00'],
    [['inside_fridge', 'inside_cabinets'], '50.00'], [['inside_oven', 'inside_cabinets'], '45.00'],
    [['inside_fridge', 'inside_oven', 'inside_cabinets'], '70.00'],
  ] as const)('sums selected extras %#', (extras, expected) => {
    expect(calculateBillingSnapshot(baseService, fixedArrival, { frequency: 'onetime', extras: [...extras] }).extrasTotal).toBe(expected);
  });

  it.each([
    ['onetime', '0.00', '80.00'], ['weekly', '-16.00', '64.00'],
    ['every_2_weeks', '-12.00', '68.00'], ['every_4_weeks', '-8.00', '72.00'],
  ] as const)('applies the %s frequency rate', (frequency, discount, appointmentValue) => {
    expect(calculateBillingSnapshot(baseService, fixedArrival, { frequency, extras: [] })).toMatchObject({ frequencyDiscount: discount, appointmentValue });
  });

  it('uses signed integer half-up rounding at decimal boundaries', () => {
    expect(roundHalfUp(45, 10)).toBe(5);
    expect(roundHalfUp(-45, 10)).toBe(-5);
    expect(money(roundHalfUp(10 * 15, 100))).toBe('0.02');
    expect(money(roundHalfUp(5 * 10, 100))).toBe('0.01');
  });
});

describe('promotion persistence and billing', () => {
  it('seeds exactly one active CLEAN10 promotion on repeated initialization', async () => {
    await pool.query(seedSql);
    await expect(pool.query('SELECT code, amount_cents, active FROM promotions')).resolves.toMatchObject({
      rows: [{ code: 'CLEAN10', amount_cents: 1000, active: true }],
    });
  });

  it.each(['CLEAN10', 'clean10', '  ClEaN10  '])('resolves normalized promo %s', async (promoCode) => {
    const billing = await calculateQuote(pool, baseService, fixedArrival, oneTimeDetails, promoCode);
    expect(billing).toMatchObject({ promoCode: 'CLEAN10', promoDiscount: '-10.00', subtotal: '70.00', tax: '7.00', total: '77.00' });
  });

  it('returns a complete zero-promo billing snapshot when no promo is applied', async () => {
    const billing = await calculateQuote(pool, baseService, fixedArrival, oneTimeDetails);
    expect(billing).toEqual({
      currency: 'USD', baseService: '80.00', flexibleDiscount: '0.00', extrasTotal: '0.00',
      frequencyDiscount: '0.00', appointmentValue: '80.00', promoDiscount: '0.00',
      subtotal: '80.00', tax: '8.00', total: '88.00',
    });
  });
});
