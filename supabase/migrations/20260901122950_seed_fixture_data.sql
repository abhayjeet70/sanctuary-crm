-- The fixture data from src/data/mocks/, as real rows.
--
-- Deterministic UUIDs so this migration is re-runnable and so the seed can be
-- reasoned about: v5 UUIDs derived from the slug that identified each record in
-- the mock data ('v-maaya', 'c-pooja', 'b-1001' …).

create or replace function public.seed_id(p_key text)
returns uuid
language sql
immutable
as $$
  -- A stable hash of the key, formatted as a UUID. Same key, same id, always.
  select (
    substr(md5('hos:' || p_key), 1, 8)  || '-' ||
    substr(md5('hos:' || p_key), 9, 4)  || '-' ||
    substr(md5('hos:' || p_key), 13, 4) || '-' ||
    substr(md5('hos:' || p_key), 17, 4) || '-' ||
    substr(md5('hos:' || p_key), 21, 12)
  )::uuid;
$$;

-- ---------------------------------------------------------------- villas ----
insert into public.villas (
  id, slug, name, description, image, gallery, bedrooms, capacity, mode, status,
  base_rate, weekend_rate, seasonal_rate, check_in_time, check_out_time,
  amenities, wifi_network, wifi_password
) values
(
  public.seed_id('v-maaya'), 'maaya', 'Villa Maaya',
  'The first house on the ridge. Rough-cut granite walls, a teak verandah that runs the full western face, and a lap pool that catches the Nandi Hills sunset. Four bedrooms open onto a shared courtyard.',
  '/villas/villa-maya.png',
  array['/villas/villa-maya.png', '/villas/nandi-hills.png', '/villas/villa-prana.png'],
  4, 10, 'whole', 'active', 32000, 38000, 44000, '14:00', '11:00',
  array['Private infinity pool','Open verandah','Outdoor firepit','Fully equipped kitchen','In-villa chef on request','Air conditioning','Wi-Fi throughout','Housekeeping twice daily','Complimentary breakfast','Free parking','Sunset deck','Yoga shala'],
  'Sanctuary-Maaya', 'stone-verandah-04'
),
(
  public.seed_id('v-praana'), 'praana', 'Villa Praana',
  'Built around a central water court, Praana is the quietest of the three. Lime-plastered walls, reclaimed timber joinery, and deep-set windows that keep the afternoons cool. Currently operating as four individually bookable rooms.',
  '/villas/villa-prana.png',
  array['/villas/villa-prana.png', '/villas/nandi-hills.png', '/villas/villa-norvana.png'],
  4, 10, 'split', 'active', 29000, 34000, 39000, '14:00', '11:00',
  array['Private infinity pool','Open verandah','Outdoor firepit','Fully equipped kitchen','In-villa chef on request','Air conditioning','Wi-Fi throughout','Housekeeping twice daily','Complimentary breakfast','Free parking','Water court','Reading room'],
  'Sanctuary-Praana', 'water-court-11'
),
(
  public.seed_id('v-nirvaana'), 'nirvaana', 'Villa Nirvaana',
  'The largest of the three, set furthest back into the orchard. A double-height living pavilion, a twenty-metre pool, and four bedrooms arranged along a shaded colonnade. Best suited to whole-villa stays.',
  '/villas/villa-norvana.png',
  array['/villas/villa-norvana.png', '/villas/villa-maya.png', '/villas/nandi-hills.png'],
  4, 12, 'whole', 'active', 36000, 42000, 48000, '14:00', '11:00',
  array['Private infinity pool','Open verandah','Outdoor firepit','Fully equipped kitchen','In-villa chef on request','Air conditioning','Wi-Fi throughout','Housekeeping twice daily','Complimentary breakfast','Free parking','Twenty-metre pool','Orchard walk','Outdoor dining pavilion'],
  'Sanctuary-Nirvaana', 'orchard-pavilion-27'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------- rooms ----
insert into public.rooms (id, villa_id, name, capacity, status, base_rate) values
  (public.seed_id('r-maaya-a1'),    public.seed_id('v-maaya'),    'Room A-1', 2, 'occupied',  9500),
  (public.seed_id('r-maaya-b1'),    public.seed_id('v-maaya'),    'Room B-1', 2, 'occupied',  9500),
  (public.seed_id('r-maaya-c1'),    public.seed_id('v-maaya'),    'Room C-1', 3, 'occupied', 10500),
  (public.seed_id('r-maaya-d1'),    public.seed_id('v-maaya'),    'Room D-1', 3, 'occupied', 10500),
  (public.seed_id('r-praana-a1'),   public.seed_id('v-praana'),   'Room A-1', 2, 'occupied',  8500),
  (public.seed_id('r-praana-b1'),   public.seed_id('v-praana'),   'Room B-1', 2, 'available', 8500),
  (public.seed_id('r-praana-c1'),   public.seed_id('v-praana'),   'Room C-1', 3, 'occupied',  9500),
  (public.seed_id('r-praana-d1'),   public.seed_id('v-praana'),   'Room D-1', 3, 'cleaning',  9500),
  (public.seed_id('r-nirvaana-a1'), public.seed_id('v-nirvaana'), 'Room A-1', 3, 'occupied', 10000),
  (public.seed_id('r-nirvaana-b1'), public.seed_id('v-nirvaana'), 'Room B-1', 3, 'occupied', 10000),
  (public.seed_id('r-nirvaana-c1'), public.seed_id('v-nirvaana'), 'Room C-1', 3, 'occupied', 11000),
  (public.seed_id('r-nirvaana-d1'), public.seed_id('v-nirvaana'), 'Room D-1', 3, 'occupied', 11000)
on conflict (id) do nothing;

-- ------------------------------------------------------------- customers ----
-- The two demo logins map onto Pooja (guest) and a staff account, by email.
insert into public.customers (id, name, phone, email, city, guest_type, preferences, notes, created_at) values
  (public.seed_id('c-pooja'),  'Pooja Bothra',        '+91 98450 22107', 'user@gmail.com',                'Bengaluru', 'returning',
   array['Vegetarian','Early breakfast','Poolside dining'],
   'Third stay with us. Prefers Villa Maaya, always asks for the sunset deck to be set up for dinner.', '2024-11-12T09:20:00+05:30'),
  (public.seed_id('c-prerna'), 'Prerna Lal Chugani',  '+91 99012 44831', 'prerna.chugani@outlook.com',    'Mumbai',    'vip',
   array['Jain food','No nuts','Late checkout'],
   'Travels with extended family. Books the whole of Nirvaana each Diwali.', '2023-08-04T17:05:00+05:30'),
  (public.seed_id('c-deepti'), 'Deepti Krishnan',     '+91 98860 71592', 'deepti.krishnan@gmail.com',     'Chennai',   'returning',
   array['Filter coffee at 6:30 am','Ground-floor room'], null, '2025-02-18T11:40:00+05:30'),
  (public.seed_id('c-rahul'),  'Rahul Sharma',        '+91 97400 38265', 'rahul.sharma@workmail.in',      'Hyderabad', 'new',
   array['Non-vegetarian','Extra pillows'], null, '2026-07-29T14:15:00+05:30'),
  (public.seed_id('c-ankit'),  'Ankit Deshpande',     '+91 96320 55014', 'ankit.deshpande@gmail.com',     'Pune',      'new',
   array['Airport transfer','Quiet room'], null, '2026-06-11T08:55:00+05:30'),
  (public.seed_id('c-farhan'), 'Farhan Qureshi',      '+91 99805 61247', 'farhan.q@sightlinecorp.in',     'Bengaluru', 'corporate',
   array['Halal','Conference setup in living pavilion','GST invoice'],
   'Books Nirvaana twice a year for the Sightline leadership offsite.', '2024-03-22T10:00:00+05:30')
on conflict (id) do nothing;

-- -------------------------------------------------------------- bookings ----
-- Inserted with the trigger active, so every one is expanded into room holds
-- and validated against the exclusion constraint. If the seed data ever
-- contradicts BR4, this migration fails loudly rather than seeding a conflict.
insert into public.bookings (
  id, reference, customer_id, villa_id, booking_mode, check_in, check_out,
  adults, children, source, status, payment_status,
  nightly_rate, nights, weekend_surcharge, seasonal_surcharge, extra_guest_charge,
  food, add_ons, discount, tax_rate, amount_paid, special_requests, internal_notes, created_at
) values
  (public.seed_id('b-1012'), 'HOS-1012', public.seed_id('c-farhan'),  public.seed_id('v-maaya'),    'whole', '2026-09-01','2026-09-03', 8,0,'phone',   'confirmed',        'partial', 32000,2,    0,0, 6000,     0,4500,3000,0.180, 40000,
   'Conference setup in the living pavilion from 10 am on day one. Halal menu for all meals.','Sightline leadership offsite. Farhan will settle the balance on arrival.','2026-08-14T11:02:00+05:30'),
  (public.seed_id('b-1002'), 'HOS-1002', public.seed_id('c-prerna'),  public.seed_id('v-nirvaana'), 'whole', '2026-08-30','2026-09-03', 9,3,'phone',   'in_house',         'paid',    36000,4,12000,0, 9000, 18400,6000,8000,0.180,240000,
   'Jain thali for two guests every evening. No nuts anywhere in the kitchen.','VIP. Anniversary on the 2nd — cake arranged with the kitchen.','2026-07-02T16:44:00+05:30'),
  (public.seed_id('b-1003'), 'HOS-1003', public.seed_id('c-deepti'),  public.seed_id('v-praana'),   'split', '2026-08-31','2026-09-04', 2,0,'whatsapp','in_house',         'paid',     8500,4, 2000,0,    0,  4250,   0,   0,0.180, 48000,
   'Filter coffee at 6:30 am, on the verandah when the weather allows.',null,'2026-08-18T09:12:00+05:30'),
  (public.seed_id('b-1004'), 'HOS-1004', public.seed_id('c-rahul'),   public.seed_id('v-praana'),   'split', '2026-08-29','2026-09-01', 2,1,'goibibo', 'checked_out',      'paid',     9500,3, 2500,0, 1500,  3100,   0,   0,0.180, 41300, null,null,'2026-08-09T20:31:00+05:30'),
  (public.seed_id('b-1005'), 'HOS-1005', public.seed_id('c-ankit'),   public.seed_id('v-maaya'),    'whole', '2026-09-05','2026-09-07', 6,2,'website', 'payment_uploaded', 'uploaded',32000,2, 6000,0, 3000,     0,2500,   0,0.180,     0,
   'Airport transfer for four guests landing at 3 pm on the 5th.',null,'2026-08-28T13:47:00+05:30'),
  (public.seed_id('b-1007'), 'HOS-1007', public.seed_id('c-pooja'),   public.seed_id('v-praana'),   'split', '2026-09-20','2026-09-22', 2,0,'whatsapp','payment_uploaded', 'uploaded', 8500,2, 2000,0,    0,     0,   0, 500,0.180,     0, null,null,'2026-08-30T19:05:00+05:30'),
  (public.seed_id('b-1013'), 'HOS-1013', public.seed_id('c-deepti'),  public.seed_id('v-nirvaana'), 'whole', '2026-09-26','2026-09-29', 7,2,'website', 'payment_uploaded', 'uploaded',36000,3,12000,0, 4500,     0,3500,   0,0.180,     0,
   'Ground-floor bedroom for one guest with limited mobility.',null,'2026-08-31T21:18:00+05:30'),
  (public.seed_id('b-1001'), 'HOS-1001', public.seed_id('c-pooja'),   public.seed_id('v-maaya'),    'whole', '2026-09-12','2026-09-15', 8,2,'website', 'confirmed',        'partial', 32000,3,12000,0, 6000,     0,5000,4000,0.180, 60000,
   'Vegetarian kitchen for the whole stay. Dinner on the sunset deck on the second night.','Third stay. Send the returning-guest welcome note.','2026-08-05T10:26:00+05:30'),
  (public.seed_id('b-1006'), 'HOS-1006', public.seed_id('c-farhan'),  public.seed_id('v-nirvaana'), 'whole', '2026-09-18','2026-09-21',10,0,'referral','pending_payment',  'pending', 36000,3,12000,0,    0,     0,   0,10000,0.180,    0,
   null,'Referred by Prerna Chugani. Corporate rate applied as a flat discount.','2026-08-29T15:33:00+05:30'),
  (public.seed_id('b-1014'), 'HOS-1014', public.seed_id('c-rahul'),   public.seed_id('v-praana'),   'split', '2026-10-02','2026-10-05', 4,2,'phone',   'inquiry',          'pending', 19000,3, 4000,6000,   0,     0,   0,   0,0.180,    0,
   'Two adjoining rooms if possible — travelling with children.','Gandhi Jayanti long weekend. Hold until the 8th, then release.','2026-08-31T12:09:00+05:30'),
  (public.seed_id('b-1008'), 'HOS-1008', public.seed_id('c-deepti'),  public.seed_id('v-maaya'),    'whole', '2026-07-04','2026-07-07', 6,1,'website', 'completed',        'paid',    32000,3,12000,0, 1500,  9800,2000,   0,0.180,143964, null,null,'2026-06-01T08:20:00+05:30'),
  (public.seed_id('b-1009'), 'HOS-1009', public.seed_id('c-prerna'),  public.seed_id('v-nirvaana'), 'whole', '2026-06-12','2026-06-15', 9,4,'goibibo', 'completed',        'paid',    36000,3,12000,0, 7500, 14200,4000,5000,0.180,165316, null,null,'2026-05-02T18:11:00+05:30'),
  (public.seed_id('b-1010'), 'HOS-1010', public.seed_id('c-rahul'),   public.seed_id('v-maaya'),    'whole', '2026-09-09','2026-09-11', 5,0,'walk_in', 'cancelled',        'refunded',32000,2,    0,0,    0,     0,   0,   0,0.180,     0,
   null,'Guest cancelled on 26 Aug, inside the free-cancellation window. Advance refunded in full.','2026-08-21T17:52:00+05:30'),
  (public.seed_id('b-1011'), 'HOS-1011', public.seed_id('c-ankit'),   public.seed_id('v-praana'),   'split', '2026-08-20','2026-08-23', 2,0,'other',   'no_show',          'rejected', 9500,3, 2500,0,    0,     0,   0,   0,0.180,     0,
   null,'Receipt rejected — amount did not match. Guest never arrived and stopped responding.','2026-08-12T07:41:00+05:30')
on conflict (id) do nothing;

-- Room holds. Whole-villa bookings expand to all four bedrooms automatically.
select public.sync_booking_rooms(public.seed_id('b-1012'));
select public.sync_booking_rooms(public.seed_id('b-1002'));
select public.sync_booking_rooms(public.seed_id('b-1003'), array[public.seed_id('r-praana-a1')]);
select public.sync_booking_rooms(public.seed_id('b-1004'), array[public.seed_id('r-praana-c1')]);
select public.sync_booking_rooms(public.seed_id('b-1005'));
select public.sync_booking_rooms(public.seed_id('b-1007'), array[public.seed_id('r-praana-b1')]);
select public.sync_booking_rooms(public.seed_id('b-1013'));
select public.sync_booking_rooms(public.seed_id('b-1001'));
select public.sync_booking_rooms(public.seed_id('b-1006'));
select public.sync_booking_rooms(public.seed_id('b-1014'), array[public.seed_id('r-praana-c1'), public.seed_id('r-praana-d1')]);
select public.sync_booking_rooms(public.seed_id('b-1008'));
select public.sync_booking_rooms(public.seed_id('b-1009'));
select public.sync_booking_rooms(public.seed_id('b-1010'));
select public.sync_booking_rooms(public.seed_id('b-1011'), array[public.seed_id('r-praana-d1')]);

-- -------------------------------------------------------------- payments ----
insert into public.payments (id, booking_id, amount, method, reference, status, rejection_reason, rejection_note, verified_at, created_at) values
  (public.seed_id('p-2001'), public.seed_id('b-1001'),  60000,'upi',          '428106552931',     'approved', null,null,'2026-08-05T11:14:00+05:30','2026-08-05T10:52:00+05:30'),
  (public.seed_id('p-2002'), public.seed_id('b-1002'), 240000,'bank_transfer','HDFCN26071900418', 'approved', null,null,'2026-07-03T09:30:00+05:30','2026-07-02T18:02:00+05:30'),
  (public.seed_id('p-2003'), public.seed_id('b-1003'),  48000,'upi',          '551204877310',     'approved', null,null,'2026-08-18T10:05:00+05:30','2026-08-18T09:48:00+05:30'),
  (public.seed_id('p-2004'), public.seed_id('b-1004'),  41300,'bank_transfer','ICICN26080901772', 'approved', null,null,'2026-08-10T08:40:00+05:30','2026-08-09T21:16:00+05:30'),
  (public.seed_id('p-2005'), public.seed_id('b-1005'),  45000,'upi',          '690431228805',     'uploaded', null,null,null,'2026-08-31T22:41:00+05:30'),
  (public.seed_id('p-2006'), public.seed_id('b-1007'),  11000,'upi',          '718002465119',     'uploaded', null,null,null,'2026-08-30T19:22:00+05:30'),
  (public.seed_id('p-2007'), public.seed_id('b-1013'),  75000,'bank_transfer','SBIN26083101994',  'uploaded', null,null,null,'2026-08-31T21:35:00+05:30'),
  (public.seed_id('p-2008'), public.seed_id('b-1011'),  12000,'upi',          '330991044728',     'rejected','wrong_amount',
   'Advance due was 18,000. Guest transferred 12,000 and did not respond to the follow-up.','2026-08-13T10:20:00+05:30','2026-08-12T08:04:00+05:30'),
  (public.seed_id('p-2009'), public.seed_id('b-1012'),  40000,'bank_transfer','AXISN26081400627', 'approved', null,null,'2026-08-14T12:15:00+05:30','2026-08-14T11:31:00+05:30'),
  (public.seed_id('p-2010'), public.seed_id('b-1008'), 143964,'upi',          '204118763055',     'approved', null,null,'2026-07-07T11:22:00+05:30','2026-07-07T11:02:00+05:30'),
  (public.seed_id('p-2011'), public.seed_id('b-1009'), 165316,'bank_transfer','HDFCN26061500832', 'approved', null,null,'2026-06-15T10:48:00+05:30','2026-06-15T10:12:00+05:30'),
  (public.seed_id('p-2012'), public.seed_id('b-1010'),  32000,'upi',          '884210036471',     'refunded', null,null,'2026-08-26T16:30:00+05:30','2026-08-21T18:09:00+05:30')
on conflict (id) do nothing;

-- -------------------------------------------------------------- invoices ----
insert into public.invoices (id, number, booking_id, issued_at, tax_rate, status) values
  (public.seed_id('i-6001'), 'HOS/26-27/0041', public.seed_id('b-1008'), '2026-07-07', 0.180, 'paid'),
  (public.seed_id('i-6002'), 'HOS/26-27/0033', public.seed_id('b-1009'), '2026-06-15', 0.180, 'paid'),
  (public.seed_id('i-6003'), 'HOS/26-27/0052', public.seed_id('b-1002'), '2026-09-01', 0.180, 'issued'),
  (public.seed_id('i-6004'), 'HOS/26-27/0054', public.seed_id('b-1012'), '2026-09-01', 0.180, 'draft')
on conflict (id) do nothing;

-- ------------------------------------------------------------------ menu ----
insert into public.menu_items (id, name, description, price, image, category, is_veg, available) values
  (public.seed_id('m-101'),'Set Dosa with Vegetable Kurma','Three soft dosas cooked on the griddle, served with a mild coconut kurma and coriander chutney.',320,'https://picsum.photos/seed/hos-set-dosa/800/600','south_indian',true,true),
  (public.seed_id('m-102'),'Bisi Bele Bath','The Karnataka classic — rice, lentils and vegetables in a roasted spice blend, finished with ghee and crisp boondi.',340,'https://picsum.photos/seed/hos-bisibele/800/600','south_indian',true,true),
  (public.seed_id('m-103'),'Nandi Hills Filter Coffee','Chicory-blend decoction from a Chikmagalur estate, brewed overnight and served in the traditional davara set.',140,'https://picsum.photos/seed/hos-filter-coffee/800/600','beverages',true,true),
  (public.seed_id('m-104'),'Akki Roti with Ennegayi','Hand-pressed rice flour rotis with stuffed baby brinjal in a peanut and sesame masala.',360,'https://picsum.photos/seed/hos-akki-roti/800/600','breakfast',true,true),
  (public.seed_id('m-105'),'Verandah Breakfast Plate','Two eggs your way, sourdough toast, orchard preserve, grilled tomato and a glass of cold-pressed juice.',480,'https://picsum.photos/seed/hos-breakfast-plate/800/600','breakfast',false,true),
  (public.seed_id('m-106'),'Charred Corn and Avocado Salad','Fire-roasted corn, avocado, cherry tomato and feta with a lime and toasted cumin dressing.',420,'https://picsum.photos/seed/hos-corn-salad/800/600','continental',true,true),
  (public.seed_id('m-107'),'Wood-Fired Margherita','Slow-proved base, San Marzano tomato, buffalo mozzarella and basil from the kitchen garden.',560,'https://picsum.photos/seed/hos-margherita/800/600','continental',true,true),
  (public.seed_id('m-108'),'Coorg Pandi Curry with Kadambuttu','Slow-cooked pork in kachampuli and Coorg spices, served with steamed rice dumplings.',720,'https://picsum.photos/seed/hos-pandi-curry/800/600','lunch',false,true),
  (public.seed_id('m-109'),'Malnad Chicken Curry Thali','Country chicken in a roasted coconut gravy with jowar roti, rice, palya and a curd salad.',680,'https://picsum.photos/seed/hos-malnad-thali/800/600','lunch',false,true),
  (public.seed_id('m-110'),'Sanctuary Vegetarian Thali','Seasonal palya, dal, sambar, rasam, curd, two rotis, rice and a sweet — changes with the kitchen garden.',540,'https://picsum.photos/seed/hos-veg-thali/800/600','dinner',true,true),
  (public.seed_id('m-111'),'Grilled Fish with Verandah Herbs','Line-caught seer fish grilled over charcoal, with burnt-butter greens and a lemon caper dressing.',860,'https://picsum.photos/seed/hos-grilled-fish/800/600','dinner',false,false),
  (public.seed_id('m-112'),'Masala Peanuts and Papad Basket','Crisp masala peanuts, roasted papad and a green chilli pickle — the standard sundowner order.',240,'https://picsum.photos/seed/hos-masala-peanuts/800/600','snacks',true,true),
  (public.seed_id('m-113'),'Mangalore Bajji with Chutney','Golden goli bajji, fried to order, with coconut chutney and a cup of hot ginger tea.',260,'https://picsum.photos/seed/hos-bajji/800/600','snacks',true,true),
  (public.seed_id('m-114'),'Estate Nilgiri Tea','Single-estate Nilgiri leaf, served as a pot for two with jaggery on the side.',180,'https://picsum.photos/seed/hos-nilgiri-tea/800/600','beverages',true,true),
  (public.seed_id('m-115'),'Tender Coconut Cooler','Fresh tender coconut water with lime, mint and a touch of black salt.',200,'https://picsum.photos/seed/hos-coconut-cooler/800/600','beverages',true,true)
on conflict (id) do nothing;

-- ----------------------------------------------------------- food orders ----
-- Statuses are set directly here so the BR12 trigger does not double-count the
-- food already baked into the seeded booking totals.
insert into public.food_orders (id, reference, booking_id, customer_id, villa_id, room_id, status, notes, placed_at) values
  (public.seed_id('f-3001'),'KIT-3001',public.seed_id('b-1002'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),null,'cooking','Two thalis to be prepared Jain — no onion, no garlic, no root vegetables.','2026-09-01T12:40:00+05:30'),
  (public.seed_id('f-3002'),'KIT-3002',public.seed_id('b-1003'),public.seed_id('c-deepti'),public.seed_id('v-praana'),public.seed_id('r-praana-a1'),'served',null,'2026-09-01T07:15:00+05:30'),
  (public.seed_id('f-3003'),'KIT-3003',public.seed_id('b-1012'),public.seed_id('c-farhan'),public.seed_id('v-maaya'),null,'confirmation_pending','Sundowner service on the deck at 6 pm — call to confirm headcount.','2026-09-01T15:02:00+05:30'),
  (public.seed_id('f-3004'),'KIT-3004',public.seed_id('b-1002'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),null,'placed',null,'2026-09-01T16:20:00+05:30'),
  (public.seed_id('f-3005'),'KIT-3005',public.seed_id('b-1003'),public.seed_id('c-deepti'),public.seed_id('v-praana'),public.seed_id('r-praana-a1'),'ready',null,'2026-09-01T13:05:00+05:30'),
  (public.seed_id('f-3006'),'KIT-3006',public.seed_id('b-1002'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),null,'billed',null,'2026-08-31T20:10:00+05:30'),
  (public.seed_id('f-3007'),'KIT-3007',public.seed_id('b-1012'),public.seed_id('c-farhan'),public.seed_id('v-maaya'),null,'confirmed','Halal sourcing confirmed with the supplier. Serve at 8:30 pm in the dining pavilion.','2026-09-01T14:48:00+05:30')
on conflict (id) do nothing;

insert into public.food_order_lines (order_id, menu_item_id, name, price, quantity) values
  (public.seed_id('f-3001'),public.seed_id('m-110'),'Sanctuary Vegetarian Thali',540,6),
  (public.seed_id('f-3001'),public.seed_id('m-103'),'Nandi Hills Filter Coffee',140,4),
  (public.seed_id('f-3002'),public.seed_id('m-101'),'Set Dosa with Vegetable Kurma',320,2),
  (public.seed_id('f-3002'),public.seed_id('m-103'),'Nandi Hills Filter Coffee',140,2),
  (public.seed_id('f-3003'),public.seed_id('m-112'),'Masala Peanuts and Papad Basket',240,3),
  (public.seed_id('f-3003'),public.seed_id('m-115'),'Tender Coconut Cooler',200,8),
  (public.seed_id('f-3004'),public.seed_id('m-113'),'Mangalore Bajji with Chutney',260,4),
  (public.seed_id('f-3004'),public.seed_id('m-114'),'Estate Nilgiri Tea',180,3),
  (public.seed_id('f-3005'),public.seed_id('m-106'),'Charred Corn and Avocado Salad',420,2),
  (public.seed_id('f-3006'),public.seed_id('m-107'),'Wood-Fired Margherita',560,3),
  (public.seed_id('f-3006'),public.seed_id('m-115'),'Tender Coconut Cooler',200,5),
  (public.seed_id('f-3007'),public.seed_id('m-109'),'Malnad Chicken Curry Thali',680,8)
on conflict do nothing;

-- -------------------------------------------------------------- requests ----
insert into public.guest_requests (id, reference, booking_id, customer_id, villa_id, category, description, priority, status, assigned_to, created_at) values
  (public.seed_id('q-4001'),'REQ-4001',public.seed_id('b-1002'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),'extra_towels','Four extra bath towels and two pool towels for the west wing bedrooms.','normal','completed','housekeeping','2026-09-01T09:30:00+05:30'),
  (public.seed_id('q-4002'),'REQ-4002',public.seed_id('b-1003'),public.seed_id('c-deepti'),public.seed_id('v-praana'),'maintenance','The hot water in Room A-1 runs cold after a few minutes. Could someone take a look before the evening?','high','in_progress','maintenance','2026-09-01T11:05:00+05:30'),
  (public.seed_id('q-4003'),'REQ-4003',public.seed_id('b-1012'),public.seed_id('c-farhan'),public.seed_id('v-maaya'),'room_setup','Living pavilion needs a U-shaped table setup for ten, a whiteboard, and an extension board near the projector.','urgent','assigned','manager','2026-09-01T08:12:00+05:30'),
  (public.seed_id('q-4004'),'REQ-4004',public.seed_id('b-1002'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),'transport','Cab to Bengaluru airport on the 3rd, leaving at 5:30 am. Six passengers with luggage.','high','pending',null,'2026-09-01T17:24:00+05:30'),
  (public.seed_id('q-4005'),'REQ-4005',public.seed_id('b-1003'),public.seed_id('c-deepti'),public.seed_id('v-praana'),'wifi','Wi-Fi drops in the reading room. Fine everywhere else.','low','rejected','maintenance','2026-08-31T18:40:00+05:30')
on conflict (id) do nothing;

-- -------------------------------------------------------------- feedback ----
insert into public.feedback (id, booking_id, customer_id, villa_id, rating, comment, reviewed, reply, created_at) values
  (public.seed_id('fb-5001'),public.seed_id('b-1008'),public.seed_id('c-deepti'),public.seed_id('v-maaya'),5,
   'The verandah at Maaya is worth the drive on its own. Filter coffee arrived at 6:30 every morning without a reminder. We will be back in the winter.',true,
   'Thank you Deepti — the coffee will be waiting. We have noted the ground-floor room for your next stay.','2026-07-07T14:20:00+05:30'),
  (public.seed_id('fb-5002'),public.seed_id('b-1009'),public.seed_id('c-prerna'),public.seed_id('v-nirvaana'),4,
   'Beautiful house and the kitchen handled our Jain requirements carefully. The pool heating took a while to come on in the mornings.',true,null,'2026-06-15T11:05:00+05:30'),
  (public.seed_id('fb-5003'),public.seed_id('b-1004'),public.seed_id('c-rahul'),public.seed_id('v-praana'),4,
   'Booked through Goibibo and did not expect this level of quiet. Room C-1 is small but very well made. Breakfast was excellent.',false,null,'2026-09-01T11:40:00+05:30'),
  (public.seed_id('fb-5004'),public.seed_id('b-1003'),public.seed_id('c-deepti'),public.seed_id('v-praana'),3,
   'Lovely stay overall, but the hot water issue in A-1 took most of a day to resolve. Staff were apologetic and helpful throughout.',false,null,'2026-09-01T16:55:00+05:30')
on conflict (id) do nothing;

-- --------------------------------------------------------- notifications ----
insert into public.notifications (kind, title, detail, at, read) values
  ('payment','Payment uploaded','Deepti Krishnan · 75,000 for HOS-1013','2026-08-31T21:35:00+05:30',false),
  ('food','New kitchen order','KIT-3004 · Villa Nirvaana · 7 items','2026-09-01T16:20:00+05:30',false),
  ('request','New guest request','Transport · Villa Nirvaana · airport drop on the 3rd','2026-09-01T17:24:00+05:30',false),
  ('feedback','New feedback received','Deepti Krishnan rated her stay 3 out of 5','2026-09-01T16:55:00+05:30',true),
  ('booking','Booking cancelled','HOS-1010 · Rahul Sharma · Villa Maaya','2026-08-26T16:12:00+05:30',true)
on conflict do nothing;
