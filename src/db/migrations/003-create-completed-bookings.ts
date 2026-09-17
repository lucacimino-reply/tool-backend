export const sql = `
CREATE TABLE completed_bookings (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  location VARCHAR(32) NOT NULL,
  rooms SMALLINT NOT NULL CHECK (rooms BETWEEN 1 AND 9),
  clean_type VARCHAR(32) NOT NULL,
  schedule_date DATE NOT NULL,
  customer_time_zone VARCHAR(255) NOT NULL,
  arrival_type VARCHAR(16) NOT NULL CHECK (arrival_type IN ('flexible', 'fixed')),
  arrival_time VARCHAR(16),
  frequency VARCHAR(32) NOT NULL,
  address VARCHAR(255) NOT NULL,
  apartment_number VARCHAR(255),
  access_method VARCHAR(32) NOT NULL,
  has_pets BOOLEAN NOT NULL,
  pet_description VARCHAR(255),
  additional_notes VARCHAR(2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((arrival_type = 'flexible' AND arrival_time IS NULL) OR (arrival_type = 'fixed' AND arrival_time IS NOT NULL)),
  CHECK ((has_pets AND pet_description IS NOT NULL) OR (NOT has_pets AND pet_description IS NULL))
);

CREATE TABLE completed_booking_extras (
  booking_id UUID NOT NULL REFERENCES completed_bookings(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (booking_id, name)
);

CREATE TABLE completed_booking_contacts (
  booking_id UUID PRIMARY KEY REFERENCES completed_bookings(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(100) NOT NULL,
  contact_preference VARCHAR(16) NOT NULL,
  card_last_four CHAR(4) NOT NULL
);

CREATE TABLE completed_booking_billings (
  booking_id UUID PRIMARY KEY REFERENCES completed_bookings(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL CHECK (currency = 'USD'),
  base_service_cents INTEGER NOT NULL,
  flexible_discount_cents INTEGER NOT NULL,
  extras_total_cents INTEGER NOT NULL,
  frequency_discount_cents INTEGER NOT NULL,
  appointment_value_cents INTEGER NOT NULL,
  promo_code VARCHAR(64),
  promo_discount_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);

CREATE TABLE booking_idempotency (
  customer_id UUID NOT NULL REFERENCES customers(id),
  idempotency_key VARCHAR(255) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  booking_id UUID REFERENCES completed_bookings(id),
  PRIMARY KEY (customer_id, idempotency_key),
  CHECK (booking_id IS NOT NULL)
);
`;
