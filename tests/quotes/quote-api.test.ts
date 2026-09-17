import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { sql as authMigration } from '../../src/db/migrations/001-create-auth.js';
import { sql as promotionsMigration } from '../../src/db/migrations/002-create-promotions.js';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool']['prototype'];
let app: ReturnType<typeof createApp>;

const validRequest = {
  service: { location: 'studio', rooms: 2, cleanType: 'standard' },
  arrival: { type: 'fixed', time: '08:00am' },
  details: { frequency: 'onetime', extras: [] },
};

async function authenticatedAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({
    name: 'Ada', email: `ada-${randomUUID()}@example.com`, password: 'password1', termsAccepted: true,
  }).expect(201);
  return agent;
}

beforeEach(async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await pool.query(authMigration);
  await pool.query(promotionsMigration);
  app = createApp(pool, { sessionDurationHours: 24, secureCookies: false });
});

afterEach(async () => pool.end());

describe('POST /api/booking-quotes', () => {
  it('requires a valid clean_session before evaluating a quote', async () => {
    await request(app).post('/api/booking-quotes').send(validRequest).expect(401).expect({
      code: 'unauthenticated', message: 'Authentication is required.',
    });
  });

  it('returns the canonical billing snapshot for a flexible quote with CLEAN10', async () => {
    const agent = await authenticatedAgent();
    const response = await agent.post('/api/booking-quotes').send({
      service: validRequest.service,
      arrival: { type: 'flexible' },
      details: { frequency: 'weekly', extras: ['inside_oven'] },
      promoCode: '  clean10  ',
    }).expect(200);

    expect(response.body).toEqual({ billing: {
      currency: 'USD', baseService: '80.00', flexibleDiscount: '-8.10', extrasTotal: '20.00',
      frequencyDiscount: '-18.38', appointmentValue: '73.52', promoCode: 'CLEAN10', promoDiscount: '-10.00',
      subtotal: '63.52', tax: '6.35', total: '69.87',
    } });
  });

  it.each([
    '08:00am', '08:30am', '09:00am', '09:30am', '10:00am', '10:30am', '11:00am', '11:30am',
    '12:00pm', '12:30pm', '01:00pm', '01:30pm', '02:00pm', '02:30pm', '03:00pm', '03:30pm', '04:00pm',
  ])('accepts fixed arrival %s', async (time) => {
    const agent = await authenticatedAgent();
    await agent.post('/api/booking-quotes').send({ ...validRequest, arrival: { type: 'fixed', time } }).expect(200);
  });

  it.each([
    [{ ...validRequest, service: { ...validRequest.service, location: 'unknown' } }, 'service.location'],
    [{ ...validRequest, service: { ...validRequest.service, rooms: 0 } }, 'service.rooms'],
    [{ ...validRequest, service: { ...validRequest.service, cleanType: 'unknown' } }, 'service.cleanType'],
    [{ ...validRequest, arrival: { type: 'fixed', time: '04:30pm' } }, 'arrival.time'],
    [{ ...validRequest, arrival: { type: 'flexible', time: '08:00am' } }, 'arrival'],
    [{ ...validRequest, details: { frequency: 'monthly', extras: [] } }, 'details.frequency'],
    [{ ...validRequest, details: { frequency: 'onetime', extras: ['unknown'] } }, 'details.extras.0'],
    [{ ...validRequest, details: { frequency: 'onetime', extras: ['inside_oven', 'inside_oven'] } }, 'details.extras'],
    [{ ...validRequest, details: { frequency: 'onetime', extras: ['inside_oven', 'inside_fridge', 'inside_cabinets', 'inside_oven'] } }, 'details.extras'],
    [{ ...validRequest, unexpected: true }, 'body'],
  ])('returns field-specific validation for invalid selections', async (body, field) => {
    const agent = await authenticatedAgent();
    const response = await agent.post('/api/booking-quotes').send(body).expect(422);
    expect(response.body).toMatchObject({ code: 'validation_error', fieldErrors: { [field]: expect.any(String) } });
  });

  it('rejects invalid promo input without altering the persisted promotion', async () => {
    const agent = await authenticatedAgent();
    for (const promoCode of ['', 'NOT_ELIGIBLE']) {
      const response = await agent.post('/api/booking-quotes').send({ ...validRequest, promoCode }).expect(422);
      expect(response.body).toMatchObject({ fieldErrors: { promoCode: 'Promo code is not eligible.' } });
    }
    await agent.post('/api/booking-quotes').send({ ...validRequest, promoCode: 'x'.repeat(65) }).expect(422)
      .expect(({ body }) => expect(body.fieldErrors.promoCode).toContain('64'));
    await expect(pool.query('SELECT code, amount_cents, active FROM promotions')).resolves.toMatchObject({
      rows: [{ code: 'CLEAN10', amount_cents: 1000, active: true }],
    });
  });

  it('does not make equivalent quote requests exclusive between customers', async () => {
    const first = await authenticatedAgent();
    const second = await authenticatedAgent();
    await first.post('/api/booking-quotes').send(validRequest).expect(200);
    await second.post('/api/booking-quotes').send(validRequest).expect(200);
  });
});
