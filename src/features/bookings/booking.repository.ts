import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { Customer } from '../auth/auth.types.js';
import { money } from '../quotes/quote.pricing.js';
import type { ArrivalSelection, BillingSnapshot } from '../quotes/quote.types.js';
import type { BookingContact, BookingDetails, CompletedBooking, NewCompletedBooking, PersistBookingResult } from './booking.types.js';

type BookingRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  location: CompletedBooking['service']['location'];
  rooms: number;
  cleanType: CompletedBooking['service']['cleanType'];
  date: string | Date;
  customerTimeZone: string;
  arrivalType: 'flexible' | 'fixed';
  arrivalTime: string | null;
  frequency: BookingDetails['frequency'];
  address: string;
  apartmentNumber: string | null;
  accessMethod: BookingDetails['accessMethod'];
  hasPets: boolean;
  petDescription: string | null;
  additionalNotes: string | null;
  createdAt: Date;
  fullName: string;
  email: string;
  phone: string;
  contactPreference: BookingContact['contactPreference'];
  cardLastFour: string;
  currency: 'USD';
  baseServiceCents: number;
  flexibleDiscountCents: number;
  extrasTotalCents: number;
  frequencyDiscountCents: number;
  appointmentValueCents: number;
  promoCode: string | null;
  promoDiscountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

type ExtraRow = { name: BookingDetails['extras'][number]['name']; priceCents: number };

const bookingColumns = `
  b.id, b.customer_id AS "customerId", c.name AS "customerName", c.email AS "customerEmail",
  b.location, b.rooms, b.clean_type AS "cleanType", b.schedule_date AS date,
  b.customer_time_zone AS "customerTimeZone", b.arrival_type AS "arrivalType", b.arrival_time AS "arrivalTime",
  b.frequency, b.address, b.apartment_number AS "apartmentNumber", b.access_method AS "accessMethod",
  b.has_pets AS "hasPets", b.pet_description AS "petDescription", b.additional_notes AS "additionalNotes", b.created_at AS "createdAt",
  ct.full_name AS "fullName", ct.email, ct.phone, ct.contact_preference AS "contactPreference", ct.card_last_four AS "cardLastFour",
  bl.currency, bl.base_service_cents AS "baseServiceCents", bl.flexible_discount_cents AS "flexibleDiscountCents",
  bl.extras_total_cents AS "extrasTotalCents", bl.frequency_discount_cents AS "frequencyDiscountCents",
  bl.appointment_value_cents AS "appointmentValueCents", bl.promo_code AS "promoCode", bl.promo_discount_cents AS "promoDiscountCents",
  bl.subtotal_cents AS "subtotalCents", bl.tax_cents AS "taxCents", bl.total_cents AS "totalCents"`;

function cents(value: string): number {
  if (!/^-?\d+\.\d{2}$/.test(value)) throw new Error('Money snapshots must use two decimal places.');
  const [whole, fraction] = value.replace('-', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(amount)) throw new Error('Money snapshot is outside the supported range.');
  return value.startsWith('-') ? -amount : amount;
}

function mapBooking(row: BookingRow, extras: ExtraRow[]): CompletedBooking {
  const customer: Customer = { id: row.customerId, name: row.customerName, email: row.customerEmail };
  const arrival: ArrivalSelection = row.arrivalType === 'flexible' ? { type: 'flexible' } : { type: 'fixed', time: row.arrivalTime! };
  const billing: BillingSnapshot = {
    currency: row.currency, baseService: money(row.baseServiceCents), flexibleDiscount: money(row.flexibleDiscountCents),
    extrasTotal: money(row.extrasTotalCents), frequencyDiscount: money(row.frequencyDiscountCents),
    appointmentValue: money(row.appointmentValueCents), ...(row.promoCode ? { promoCode: row.promoCode } : {}),
    promoDiscount: money(row.promoDiscountCents), subtotal: money(row.subtotalCents), tax: money(row.taxCents), total: money(row.totalCents),
  };
  return {
    id: row.id, customer, service: { location: row.location, rooms: row.rooms, cleanType: row.cleanType },
    schedule: { date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date, customerTimeZone: row.customerTimeZone, arrival },
    details: {
      frequency: row.frequency, address: row.address, ...(row.apartmentNumber ? { apartmentNumber: row.apartmentNumber } : {}),
      accessMethod: row.accessMethod, extras: extras.map((extra) => ({ name: extra.name, price: money(extra.priceCents) })),
      hasPets: row.hasPets, ...(row.petDescription ? { petDescription: row.petDescription } : {}),
      ...(row.additionalNotes ? { additionalNotes: row.additionalNotes } : {}),
    },
    contact: { fullName: row.fullName, email: row.email, phone: row.phone, contactPreference: row.contactPreference, cardLastFour: row.cardLastFour },
    billing, createdAt: row.createdAt.toISOString(),
  };
}

async function loadBooking(client: PoolClient, id: string): Promise<CompletedBooking> {
  const result = await client.query<BookingRow>(`SELECT ${bookingColumns} FROM completed_bookings b
    JOIN customers c ON c.id = b.customer_id JOIN completed_booking_contacts ct ON ct.booking_id = b.id
    JOIN completed_booking_billings bl ON bl.booking_id = b.id WHERE b.id = $1`, [id]);
  if (!result.rows[0]) throw new Error('Completed booking was not found after persistence.');
  const extras = await client.query<ExtraRow>('SELECT name, price_cents AS "priceCents" FROM completed_booking_extras WHERE booking_id = $1 ORDER BY name', [id]);
  return mapBooking(result.rows[0], extras.rows);
}

async function insertBooking(client: PoolClient, id: string, booking: NewCompletedBooking): Promise<void> {
  const { service, schedule, details, contact, billing } = booking;
  if (!/^\d{4}$/.test(contact.cardLastFour)) throw new Error('Card last four must contain exactly four digits.');
  await client.query(`INSERT INTO completed_bookings (id, customer_id, location, rooms, clean_type, schedule_date, customer_time_zone, arrival_type, arrival_time, frequency, address, apartment_number, access_method, has_pets, pet_description, additional_notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
    id, booking.customer.id, service.location, service.rooms, service.cleanType, schedule.date, schedule.customerTimeZone,
    schedule.arrival.type, schedule.arrival.type === 'fixed' ? schedule.arrival.time : null, details.frequency, details.address,
    details.apartmentNumber ?? null, details.accessMethod, details.hasPets, details.hasPets ? details.petDescription ?? null : null, details.additionalNotes ?? null,
  ]);
  for (const extra of details.extras) {
    await client.query('INSERT INTO completed_booking_extras (booking_id, name, price_cents) VALUES ($1, $2, $3)', [id, extra.name, cents(extra.price)]);
  }
  await client.query(`INSERT INTO completed_booking_contacts (booking_id, full_name, email, phone, contact_preference, card_last_four)
    VALUES ($1, $2, $3, $4, $5, $6)`, [id, contact.fullName, contact.email, contact.phone, contact.contactPreference, contact.cardLastFour]);
  await client.query(`INSERT INTO completed_booking_billings (booking_id, currency, base_service_cents, flexible_discount_cents, extras_total_cents, frequency_discount_cents, appointment_value_cents, promo_code, promo_discount_cents, subtotal_cents, tax_cents, total_cents)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
    id, billing.currency, cents(billing.baseService), cents(billing.flexibleDiscount), cents(billing.extrasTotal), cents(billing.frequencyDiscount),
    cents(billing.appointmentValue), billing.promoCode ?? null, cents(billing.promoDiscount), cents(billing.subtotal), cents(billing.tax), cents(billing.total),
  ]);
}

export async function persistCompletedBooking(pool: Pool, idempotencyKey: string, requestFingerprint: string, booking: NewCompletedBooking): Promise<PersistBookingResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Locking the customer row serializes their idempotency claims without imposing any schedule-wide lock.
    await client.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [booking.customer.id]);
    const existing = await client.query<{ requestFingerprint: string; bookingId: string }>('SELECT request_fingerprint AS "requestFingerprint", booking_id AS "bookingId" FROM booking_idempotency WHERE customer_id = $1 AND idempotency_key = $2 FOR UPDATE', [booking.customer.id, idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].requestFingerprint !== requestFingerprint) {
        await client.query('COMMIT');
        return { outcome: 'conflict' };
      }
      const completed = await loadBooking(client, existing.rows[0].bookingId);
      await client.query('COMMIT');
      return { outcome: 'replayed', booking: completed };
    }
    const bookingId = randomUUID();
    await insertBooking(client, bookingId, booking);
    const claim = await client.query('INSERT INTO booking_idempotency (customer_id, idempotency_key, request_fingerprint, booking_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING booking_id', [booking.customer.id, idempotencyKey, requestFingerprint, bookingId]);
    if (!claim.rows[0]) {
      // A database that does not honor row locks can still race here. Remove our unclaimed snapshot before returning the winner.
      await client.query('DELETE FROM completed_bookings WHERE id = $1', [bookingId]);
      const winner = await client.query<{ requestFingerprint: string; bookingId: string }>('SELECT request_fingerprint AS "requestFingerprint", booking_id AS "bookingId" FROM booking_idempotency WHERE customer_id = $1 AND idempotency_key = $2', [booking.customer.id, idempotencyKey]);
      if (!winner.rows[0]) throw new Error('Idempotency record was not found after conflict.');
      if (winner.rows[0].requestFingerprint !== requestFingerprint) {
        await client.query('COMMIT');
        return { outcome: 'conflict' };
      }
      const completed = await loadBooking(client, winner.rows[0].bookingId);
      await client.query('COMMIT');
      return { outcome: 'replayed', booking: completed };
    }
    const completed = await loadBooking(client, bookingId);
    await client.query('COMMIT');
    return { outcome: 'created', booking: completed };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
