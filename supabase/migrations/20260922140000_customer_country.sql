-- Where the guest is from.
--
-- A villa on Nandi Hills takes foreign guests, and the country decides things
-- the city cannot: the Form C a hotel must file for a foreign national, which
-- currency someone thinks in, and whether a phone number needs a country code
-- to be dialled.
--
-- Defaulted to India rather than left blank, because that is what the existing
-- rows are and a nullable column would only push the guess into the UI.

alter table public.customers
  add column country text not null default 'India';

comment on column public.customers.country is
  'Country of origin. Drives the foreign-national paperwork a property must file.';
