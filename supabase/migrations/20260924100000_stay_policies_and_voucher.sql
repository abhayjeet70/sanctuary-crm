-- What a guest is told before booking, and what their voucher says.
--
-- Dining, add-ons, terms and the two policies were being retyped into WhatsApp
-- messages by hand. They live on the single settings row instead, so the admin
-- edits them once and the booking form, the voucher and the voucher email all
-- read the same words. One line per bullet; the UI splits on newlines.

alter table public.property_settings
  add column if not exists dining_menu     text not null default '',
  add column if not exists addons          text not null default '',
  add column if not exists stay_terms      text not null default '',
  add column if not exists booking_policy  text not null default '',
  add column if not exists pet_policy      text not null default '',
  add column if not exists important_info  text not null default '',
  add column if not exists breakfast_line  text not null default 'Complimentary Breakfast',
  add column if not exists website         text not null default '',
  add column if not exists instagram       text not null default '';

-- Seed only what is still empty, so re-running never overwrites an admin's edit.
update public.property_settings set
  dining_menu = case when dining_menu <> '' then dining_menu else
'BREAKFAST — Fresh fruit juice (1 glass per person), choice of any two: Dosa with sambhar, chutney & palya · Aloo paratha with curd & pickle · Eggs, toast, butter & jam · Upma · Poha, and tea or coffee
LUNCH / DINNER — Dal, paneer dish, seasonal dry vegetable, Indian green salad, raita, jeera pulao, phulkas, tawa lacchha paratha, pickle / chutney
DESSERT (choose 1) — Kesari kheer · Custard with fruit · Ice cream (on availability)' end,
  addons = case when addons <> '' then addons else
'Veg unlimited lunch/dinner — ₹850 per person per meal + 18% GST
High tea — ₹350 per person + 18% GST
Non-vegetarian dishes — à la carte + 18% GST
Extra bed — ₹3,500 per bed, including breakfast
Barbecue setup — available on request' end,
  stay_terms = case when stay_terms <> '' then stay_terms else
'Check-in 2:00 PM, check-out 11:00 AM
Maximum 8 adults per villa
Additional guests: ₹3,500 per person, including extra bed and breakfast
Visiting guests are permitted only with prior approval' end,
  booking_policy = case when booking_policy <> '' then booking_policy else
'100% advance payment is required to confirm the booking
10 days or more before check-in: 50% refund
Less than 10 days before check-in: no refund' end,
  pet_policy = case when pet_policy <> '' then pet_policy else
'Pets are welcome with prior intimation and approval
Please bring all pet essentials, including food and bedding
Pets must be supervised by their owners at all times
Pets are not permitted in the swimming pool
Damage caused by pets is chargeable to the guest
A refundable pet security deposit may apply' end,
  important_info = case when important_info <> '' then important_info else
'Complimentary breakfast is included for all guests
Kindly carry a valid government ID proof during check-in' end
where id;
