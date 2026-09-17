import { z } from 'zod';

import { validateBookingQuoteRequest, type ValidationProblem } from '../quotes/quote.feature.js';
import type { ArrivalSelection, ServiceSelection } from '../quotes/quote.feature.js';
import type { BookingContact, BookingDetails } from './booking.types.js';

const ACCESS_METHODS = ['someone_is_home', 'doorman', 'hidden_key', 'others'] as const;
const CONTACT_PREFERENCES = ['text', 'call', 'email'] as const;

const requestSchema = z.object({
  service: z.unknown(),
  schedule: z.object({ date: z.string(), customerTimeZone: z.string(), arrival: z.unknown() }).strict(),
  details: z.object({
    frequency: z.unknown(), address: z.string(), apartmentNumber: z.string().optional(), accessMethod: z.enum(ACCESS_METHODS),
    extras: z.unknown(), hasPets: z.boolean(), petDescription: z.string().optional(), additionalNotes: z.string().optional(),
  }).strict(),
  promoCode: z.string().optional(),
  payment: z.object({
    cardNumber: z.string(), expiry: z.string(), cvv: z.string(), fullName: z.string(), email: z.string(),
    phone: z.string(), contactPreference: z.enum(CONTACT_PREFERENCES),
  }).strict(),
}).strict();

export type CreateBookingInput = {
  service: ServiceSelection;
  schedule: { date: string; customerTimeZone: string; arrival: ArrivalSelection };
  details: BookingDetails;
  promoCode?: string;
  contact: BookingContact;
};

function problem(fieldErrors: Record<string, string>): ValidationProblem {
  return { code: 'validation_error', message: 'One or more fields are invalid.', fieldErrors };
}

function addZodErrors(error: z.ZodError): ValidationProblem {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.map(String).join('.') || 'body'] ??= issue.message;
  return problem(fieldErrors);
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function localParts(now: Date, timeZone: string): { year: number; month: number; day: number } | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value('year'), month: value('month'), day: value('day') };
  } catch {
    return undefined;
  }
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateCreateBookingRequest(input: unknown, now: Date): CreateBookingInput | ValidationProblem {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return addZodErrors(parsed.error);
  const { schedule, details, payment } = parsed.data;
  const quote = validateBookingQuoteRequest({ service: parsed.data.service, arrival: schedule.arrival, details: { frequency: details.frequency, extras: details.extras }, promoCode: parsed.data.promoCode });
  if ('code' in quote) return quote;

  const errors: Record<string, string> = {};
  const timeZone = schedule.customerTimeZone.trim();
  const current = timeZone.length <= 255 && timeZone ? localParts(now, timeZone) : undefined;
  if (!current) errors['schedule.customerTimeZone'] = 'Customer time zone must be a valid IANA time zone.';
  if (!isValidCalendarDate(schedule.date)) {
    errors['schedule.date'] = 'Schedule date must be a valid ISO calendar date.';
  } else if (current && schedule.date < `${current.year}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`) {
    errors['schedule.date'] = 'Schedule date must be today or later in the customer time zone.';
  }

  const address = details.address.trim();
  const apartmentNumber = trimOptional(details.apartmentNumber);
  const petDescription = trimOptional(details.petDescription);
  const additionalNotes = trimOptional(details.additionalNotes);
  if (!address) errors['details.address'] = 'Address is required.';
  else if (address.length > 255) errors['details.address'] = 'Address must be at most 255 characters.';
  if (apartmentNumber && apartmentNumber.length > 255) errors['details.apartmentNumber'] = 'Apartment number must be at most 255 characters.';
  if (additionalNotes && additionalNotes.length > 2000) errors['details.additionalNotes'] = 'Additional notes must be at most 2000 characters.';
  if (details.hasPets && !petDescription) errors['details.petDescription'] = 'Pet description is required when pets are present.';
  if (petDescription && petDescription.length > 255) errors['details.petDescription'] = 'Pet description must be at most 255 characters.';
  if (!details.hasPets && details.petDescription !== undefined) errors['details.petDescription'] = 'Pet description must be omitted when pets are not present.';

  const cardDigits = payment.cardNumber.replace(/[ -]/g, '');
  if (!/^[0-9](?:[ -]?[0-9]){11,18}$/.test(payment.cardNumber) || !/^\d{12,19}$/.test(cardDigits)) errors['payment.cardNumber'] = 'Card number must contain 12 to 19 digits with only single spaces or hyphens between digits.';
  const expiry = payment.expiry;
  const expiryMatch = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.exec(expiry);
  if (!expiryMatch) errors['payment.expiry'] = 'Expiry must use MM/YY or MM/YYYY.';
  else if (current) {
    const expiryYear = expiryMatch[2].length === 2 ? 2000 + Number(expiryMatch[2]) : Number(expiryMatch[2]);
    if (expiryYear * 12 + Number(expiryMatch[1]) < current.year * 12 + current.month) errors['payment.expiry'] = 'Card expiry month has passed.';
  }
  if (!/^\d{3,4}$/.test(payment.cvv)) errors['payment.cvv'] = 'CVV must contain 3 or 4 digits.';
  const fullName = payment.fullName.trim();
  const email = payment.email.trim();
  const phone = payment.phone.trim();
  if (!fullName) errors['payment.fullName'] = 'Full name is required.';
  else if (fullName.length > 100) errors['payment.fullName'] = 'Full name must be at most 100 characters.';
  if (!email) errors['payment.email'] = 'Email is required.';
  else if (email.length > 254 || !isEmail(email)) errors['payment.email'] = 'Email must be a valid email address.';
  if (!phone) errors['payment.phone'] = 'Phone is required.';
  else if (phone.length > 100) errors['payment.phone'] = 'Phone must be at most 100 characters.';
  if (Object.keys(errors).length) return problem(errors);

  return {
    service: quote.service, schedule: { date: schedule.date, customerTimeZone: timeZone, arrival: quote.arrival },
    details: { frequency: quote.details.frequency, address, ...(apartmentNumber ? { apartmentNumber } : {}), accessMethod: details.accessMethod,
      extras: quote.details.extras.map((name) => ({ name, price: '' })), hasPets: details.hasPets,
      ...(details.hasPets && petDescription ? { petDescription } : {}), ...(additionalNotes ? { additionalNotes } : {}) },
    ...(quote.promoCode ? { promoCode: quote.promoCode } : {}),
    contact: { fullName, email, phone, contactPreference: payment.contactPreference, cardLastFour: cardDigits.slice(-4) },
  };
}
