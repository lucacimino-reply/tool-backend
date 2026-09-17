import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { sql as authMigration } from '../../src/db/migrations/001-create-auth.js';
import { sql as promotionsMigration } from '../../src/db/migrations/002-create-promotions.js';
import { sql as bookingsMigration } from '../../src/db/migrations/003-create-completed-bookings.js';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool']['prototype'];
let app: ReturnType<typeof createApp>;
const now = () => new Date('2030-01-01T04:30:00.000Z'); // Dec 31 in New York, Jan 1 in Tokyo.

const validRequest = {
  service: { location: 'studio', rooms: 2, cleanType: 'standard' },
  schedule: { date: '2029-12-31', customerTimeZone: 'America/New_York', arrival: { type: 'flexible' } },
  details: { frequency: 'weekly', address: ' 12 Computing Lane ', apartmentNumber: ' 4B ', accessMethod: 'doorman', extras: ['inside_oven'], hasPets: true, petDescription: ' Cat ', additionalNotes: ' Ring bell ' },
  promoCode: ' clean10 ',
  payment: { cardNumber: '4242-4242 4242-4242', expiry: '12/30', cvv: '123', fullName: ' Ada Lovelace ', email: ' ADA@Example.com ', phone: ' 555 0100 ', contactPreference: 'email' },
};

async function authenticatedAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ name: 'Ada', email: `ada-${randomUUID()}@example.com`, password: 'password1', termsAccepted: true }).expect(201);
  return agent;
}

beforeEach(async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await pool.query(authMigration);
  await pool.query(promotionsMigration);
  await pool.query(bookingsMigration);
  app = createApp(pool, { sessionDurationHours: 24, secureCookies: false, now });
});

afterEach(async () => pool.end());

describe('POST /api/bookings', () => {
  it('creates a sanitized canonical completed booking and replays it', async () => {
    const agent = await authenticatedAgent();
    const first = await agent.post('/api/bookings').set('Idempotency-Key', 'order-1').send(validRequest).expect(201);

    expect(first.body).toMatchObject({
      schedule: validRequest.schedule,
      details: { address: '12 Computing Lane', apartmentNumber: '4B', petDescription: 'Cat', additionalNotes: 'Ring bell', extras: [{ name: 'inside_oven', price: '20.00' }] },
      contact: { fullName: 'Ada Lovelace', email: 'ADA@Example.com', phone: '555 0100', cardLastFour: '4242' },
      billing: { promoCode: 'CLEAN10', appointmentValue: '73.52', total: '69.87' },
    });
    expect(JSON.stringify(first.body)).not.toContain('4242424242424242');
    expect(JSON.stringify(first.body)).not.toContain('"cvv"');
    const replay = await agent.post('/api/bookings').set('Idempotency-Key', 'order-1').send(validRequest).expect(200);
    expect(replay.body).toEqual(first.body);
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('authenticates before evaluating idempotency or request fields', async () => {
    await request(app).post('/api/bookings').send({}).expect(401).expect({ code: 'unauthenticated', message: 'Authentication is required.' });
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 0 });
  });

  it.each([
    ['Idempotency-Key', undefined, 'Idempotency-Key'],
    ['schedule.date', '2029-12-30', 'schedule.date'],
    ['schedule.customerTimeZone', 'Not/AZone', 'schedule.customerTimeZone'],
    ['payment.expiry', '11/29', 'payment.expiry'],
    ['payment.expiry', ' 12/30 ', 'payment.expiry'],
    ['payment.cardNumber', '4242x4242', 'payment.cardNumber'],
    ['details.address', '   ', 'details.address'],
    ['details.petDescription', undefined, 'details.petDescription'],
  ])('rejects %s without persistence', async (_name, value, expectedField) => {
    const agent = await authenticatedAgent();
    const body = structuredClone(validRequest);
    let key = 'order-invalid';
    if (expectedField === 'schedule.date') body.schedule.date = value as string;
    if (expectedField === 'schedule.customerTimeZone') body.schedule.customerTimeZone = value as string;
    if (expectedField === 'payment.expiry') body.payment.expiry = value as string;
    if (expectedField === 'payment.cardNumber') body.payment.cardNumber = value as string;
    if (expectedField === 'details.address') body.details.address = value as string;
    if (expectedField === 'details.petDescription') delete body.details.petDescription;
    if (expectedField === 'Idempotency-Key') key = '';
    const response = await agent.post('/api/bookings').set('Idempotency-Key', key).send(body).expect(422);
    expect(response.body.fieldErrors).toHaveProperty(expectedField);
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 0 });
  });

  it('uses the request zone for local calendar and payment checks without changing selected values', async () => {
    const agent = await authenticatedAgent();
    await agent.post('/api/bookings').set('Idempotency-Key', 'tokyo').send({
      ...validRequest, schedule: { ...validRequest.schedule, date: '2030-01-01', customerTimeZone: 'Asia/Tokyo' }, payment: { ...validRequest.payment, expiry: '01/30' },
    }).expect(201).expect(({ body }) => expect(body.schedule).toEqual({ date: '2030-01-01', customerTimeZone: 'Asia/Tokyo', arrival: { type: 'flexible' } }));
  });

  it('returns conflict for a different normalized order using the same key', async () => {
    const agent = await authenticatedAgent();
    await agent.post('/api/bookings').set('Idempotency-Key', 'order-conflict').send(validRequest).expect(201);
    await agent.post('/api/bookings').set('Idempotency-Key', 'order-conflict').send({ ...validRequest, details: { ...validRequest.details, address: 'Different address' } }).expect(409);
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('allows separate customers to book the same selected date and arrival', async () => {
    const first = await authenticatedAgent();
    const second = await authenticatedAgent();
    await first.post('/api/bookings').set('Idempotency-Key', 'first').send(validRequest).expect(201);
    await second.post('/api/bookings').set('Idempotency-Key', 'second').send(validRequest).expect(201);
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 2 });
  });

  it('rolls back and reports an unexpected persistence failure', async () => {
    const agent = await authenticatedAgent();
    await pool.query('DROP TABLE completed_booking_contacts');
    await agent.post('/api/bookings').set('Idempotency-Key', 'rollback').send(validRequest).expect(500);
  });
});
