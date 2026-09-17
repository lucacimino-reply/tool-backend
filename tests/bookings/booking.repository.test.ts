import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sql as authMigration } from '../../src/db/migrations/001-create-auth.js';
import { sql as bookingsMigration } from '../../src/db/migrations/003-create-completed-bookings.js';
import { persistCompletedBooking } from '../../src/features/bookings/booking.repository.js';
import type { NewCompletedBooking } from '../../src/features/bookings/booking.types.js';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool']['prototype'];
const customer = { id: '00000000-0000-4000-8000-000000000001', name: 'Ada Lovelace', email: 'ada@example.com' };

function bookingFor(currentCustomer = customer, overrides: Partial<NewCompletedBooking> = {}): NewCompletedBooking {
  return {
    customer: currentCustomer,
    service: { location: 'studio', rooms: 2, cleanType: 'standard' },
    schedule: { date: '2030-01-02', customerTimeZone: 'America/New_York', arrival: { type: 'fixed', time: '08:00am' } },
    details: {
      frequency: 'weekly', address: '12 Computing Lane', apartmentNumber: '4B', accessMethod: 'doorman',
      extras: [{ name: 'inside_oven', price: '20.00' }], hasPets: true, petDescription: 'Cat', additionalNotes: 'Ring bell',
    },
    contact: { fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '555 0100', contactPreference: 'email', cardLastFour: '4242' },
    billing: {
      currency: 'USD', baseService: '80.00', flexibleDiscount: '0.00', extrasTotal: '20.00', frequencyDiscount: '-20.00',
      appointmentValue: '80.00', promoCode: 'CLEAN10', promoDiscount: '-10.00', subtotal: '70.00', tax: '7.00', total: '77.00',
    },
    ...overrides,
  };
}

beforeEach(async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await pool.query(authMigration);
  await pool.query(bookingsMigration);
  await pool.query('INSERT INTO customers (id, name, email, email_identity, password_hash) VALUES ($1, $2, $3, $4, $5)', [customer.id, customer.name, customer.email, customer.email.toUpperCase(), 'hash']);
});

afterEach(async () => pool.end());

describe('completed booking persistence', () => {
  it('persists and reloads immutable appointment, contact, extra, and billing snapshots', async () => {
    const result = await persistCompletedBooking(pool, 'order-1', 'a'.repeat(64), bookingFor());

    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') return;
    expect(result.booking).toMatchObject({
      customer, service: { location: 'studio', rooms: 2, cleanType: 'standard' },
      schedule: { date: '2030-01-02', customerTimeZone: 'America/New_York', arrival: { type: 'fixed', time: '08:00am' } },
      details: { extras: [{ name: 'inside_oven', price: '20.00' }], petDescription: 'Cat' },
      contact: { cardLastFour: '4242' }, billing: { currency: 'USD', total: '77.00', promoCode: 'CLEAN10' },
    });
    expect(result.booking.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not retain pet descriptions when pets are not present', async () => {
    const input = bookingFor(undefined, { details: { ...bookingFor().details, hasPets: false, petDescription: 'must be omitted' } });
    const result = await persistCompletedBooking(pool, 'order-2', 'b'.repeat(64), input);

    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') return;
    expect(result.booking.details).not.toHaveProperty('petDescription');
  });

  it('stores only the contact card suffix and has no fields for raw payment secrets', async () => {
    await persistCompletedBooking(pool, 'order-3', 'c'.repeat(64), bookingFor());
    const stored = await pool.query('SELECT * FROM completed_booking_contacts');

    expect(stored.rows[0]).toEqual(expect.objectContaining({ card_last_four: '4242' }));
    expect(Object.keys(stored.rows[0])).toEqual(['booking_id', 'full_name', 'email', 'phone', 'contact_preference', 'card_last_four']);
  });

  it('allows identical schedules for different customers without an availability record', async () => {
    const other = { id: randomUUID(), name: 'Grace Hopper', email: 'grace@example.com' };
    await pool.query('INSERT INTO customers (id, name, email, email_identity, password_hash) VALUES ($1, $2, $3, $4, $5)', [other.id, other.name, other.email, other.email.toUpperCase(), 'hash']);

    await expect(persistCompletedBooking(pool, 'order-4', 'd'.repeat(64), bookingFor())).resolves.toMatchObject({ outcome: 'created' });
    await expect(persistCompletedBooking(pool, 'order-4', 'e'.repeat(64), bookingFor(other))).resolves.toMatchObject({ outcome: 'created' });
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 2 });
  });

  it('returns the original booking for equivalent idempotent retries and detects conflicts', async () => {
    const first = await persistCompletedBooking(pool, 'order-5', 'f'.repeat(64), bookingFor());
    const replay = await persistCompletedBooking(pool, 'order-5', 'f'.repeat(64), bookingFor());
    const conflict = await persistCompletedBooking(pool, 'order-5', '0'.repeat(64), bookingFor());

    expect(first).toMatchObject({ outcome: 'created' });
    expect(replay).toMatchObject({ outcome: 'replayed' });
    if (first.outcome === 'created' && replay.outcome === 'replayed') expect(replay.booking.id).toBe(first.booking.id);
    expect(conflict).toEqual({ outcome: 'conflict' });
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('creates one booking when concurrent attempts claim the same idempotency identity', async () => {
    const [first, second] = await Promise.all([
      persistCompletedBooking(pool, 'order-concurrent', '2'.repeat(64), bookingFor()),
      persistCompletedBooking(pool, 'order-concurrent', '2'.repeat(64), bookingFor()),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual(['created', 'replayed']);
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('rolls back both booking and idempotency rows when a snapshot write fails', async () => {
    const missingCustomer = { ...customer, id: randomUUID() };

    await expect(persistCompletedBooking(pool, 'order-6', '1'.repeat(64), bookingFor(missingCustomer))).rejects.toThrow();
    await expect(pool.query('SELECT id FROM completed_bookings')).resolves.toMatchObject({ rowCount: 0 });
    await expect(pool.query('SELECT idempotency_key FROM booking_idempotency')).resolves.toMatchObject({ rowCount: 0 });
  });
});
