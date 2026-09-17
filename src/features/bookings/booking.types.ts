import type { Customer } from '../auth/auth.types.js';
import type { ArrivalSelection, BillingSnapshot, CleanType, Extra, Frequency, Location, ServiceSelection } from '../quotes/quote.types.js';

export type BookingDetails = {
  frequency: Frequency;
  address: string;
  apartmentNumber?: string;
  accessMethod: 'someone_is_home' | 'doorman' | 'hidden_key' | 'others';
  extras: Array<{ name: Extra; price: string }>;
  hasPets: boolean;
  petDescription?: string;
  additionalNotes?: string;
};

export type BookingContact = {
  fullName: string;
  email: string;
  phone: string;
  contactPreference: 'text' | 'call' | 'email';
  cardLastFour: string;
};

export type CompletedBooking = {
  id: string;
  customer: Customer;
  service: ServiceSelection;
  schedule: { date: string; customerTimeZone: string; arrival: ArrivalSelection };
  details: BookingDetails;
  contact: BookingContact;
  billing: BillingSnapshot;
  createdAt: string;
};

export type NewCompletedBooking = Omit<CompletedBooking, 'id' | 'createdAt'>;

export type PersistBookingResult =
  | { outcome: 'created'; booking: CompletedBooking }
  | { outcome: 'replayed'; booking: CompletedBooking }
  | { outcome: 'conflict' };

export type BookingSelection = {
  location: Location;
  cleanType: CleanType;
};
