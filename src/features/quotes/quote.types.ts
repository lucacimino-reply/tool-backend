export const LOCATIONS = ['studio', 'house', 'commercial', 'residential'] as const;
export const CLEAN_TYPES = ['standard', 'deep_clean', 'moving_in_out', 'post_construction'] as const;
export const FREQUENCIES = ['onetime', 'weekly', 'every_2_weeks', 'every_4_weeks'] as const;
export const EXTRAS = ['inside_fridge', 'inside_oven', 'inside_cabinets'] as const;

export type Location = (typeof LOCATIONS)[number];
export type CleanType = (typeof CLEAN_TYPES)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type Extra = (typeof EXTRAS)[number];

export type ServiceSelection = {
  location: Location;
  rooms: number;
  cleanType: CleanType;
};

export type ArrivalSelection = { type: 'flexible' } | { type: 'fixed'; time: string };

export type QuoteDetails = {
  frequency: Frequency;
  extras: Extra[];
};

export type Promotion = {
  code: string;
  amountCents: number;
};

export type BillingSnapshot = {
  currency: 'USD';
  baseService: string;
  flexibleDiscount: string;
  extrasTotal: string;
  frequencyDiscount: string;
  appointmentValue: string;
  promoCode?: string;
  promoDiscount: string;
  subtotal: string;
  tax: string;
  total: string;
};
