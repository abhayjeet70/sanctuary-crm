-- Lost & Found, end to end, against the live policies.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/lost_and_found.sql
--
-- One transaction, rolled back. Refusals are checked by their message where
-- the reason matters — a refusal for the wrong reason proves nothing.

begin;

do $$
declare
  v_admin       uuid;
  v_manager     uuid;
  v_housekeeper uuid;
  v_hk_dept     uuid;
  v_holder_user uuid;
  v_holder      uuid;
  v_villa       uuid;
  v_room        uuid;
  v_booking     uuid;
  v_rahul       record;
  v_ananya      record;
  v_rahul_user  uuid;
  v_ananya_user uuid;
  v_item        public.lost_items%rowtype;
  v_watch       public.lost_items%rowtype;
  v_passport    public.lost_items%rowtype;
  v_claim       uuid;
  v_report      public.lost_reports%rowtype;
  v_count       int;
  v_sent        int;
  v_text        text;
  v_message     text;
  v_status      public.lost_item_status;
begin
  -- ------------------------------------------------------------- fixtures
  select u.id into v_admin       from auth.users u where u.email = 'admin@gmail.com';
  select u.id into v_manager     from auth.users u where u.email = 'manager@gmail.com';
  select u.id into v_housekeeper from auth.users u where u.email = 'housekeeping@gmail.com';
  select department_id into v_hk_dept from public.profiles where id = v_housekeeper;

  select p.id, p.customer_id into v_holder_user, v_holder
  from public.profiles p where p.role = 'guest' and p.customer_id is not null limit 1;

  select v.id, r.id into v_villa, v_room
  from public.villas v join public.rooms r on r.villa_id = v.id
  where v.status = 'active' order by v.name, r.name limit 1;

  -- A stay that ended two days ago, in the room the watch will be found in.
  insert into public.bookings (
    reference, customer_id, villa_id, booking_mode, check_in, check_out,
    adults, children, source, status, payment_status, nightly_rate, nights, tax_rate
  ) values (
    'HOS-T9201', v_holder, v_villa, 'whole', current_date + 600, current_date + 603,
    3, 0, 'website', 'confirmed', 'pending', 10000, 3, 0.18
  ) returning id into v_booking;

  set local role authenticated;

  -- The holder brings two people.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder_user, 'role', 'authenticated')::text, true);
  select * into v_rahul  from public.add_companion(v_booking, 'Rahul Check', '', '', 'friend', false);
  select * into v_ananya from public.add_companion(v_booking, 'Ananya Check', '', '', 'family', false);
  select profile_id into v_rahul_user  from public.booking_companions where id = v_rahul.companion_id;
  select profile_id into v_ananya_user from public.booking_companions where id = v_ananya.companion_id;

  -- ============================================== 1-3. housekeeping logs it
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_housekeeper, 'role', 'authenticated')::text, true);

  select * into v_watch from public.log_found_item(
    'Black Apple Watch', 'watch', 'room', v_villa, v_room, 'On the bedside table',
    'Black strap, midnight case', 'Apple', 'Black', 'Engraved "S & M 2019" on the back',
    1, 'normal', now(), '', 'L&F shelf', 'B-04', false, null);
  raise notice '%  1. housekeeping logs a found item (%)',
    case when v_watch.reference like 'LF-%' and v_watch.status = 'found' then 'ok  ' else 'FAIL' end,
    v_watch.reference;

  perform public.add_lost_item_photos(v_watch.id, array['items/' || v_watch.id || '/1.jpg']);
  select count(*) into v_count from public.lost_items
   where id = v_watch.id and cardinality(photo_paths) = 1;
  raise notice '%  2. the photo path is stored against the item',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  raise notice '%  3. it is tied to the villa and the room',
    case when v_watch.villa_id = v_villa and v_watch.room_id = v_room then 'ok  ' else 'FAIL' end;

  raise notice '%  19. a retention date is set from property policy (%)',
    case when v_watch.retention_until = current_date + 90 then 'ok  ' else 'FAIL' end,
    v_watch.retention_until;

  v_message := null;
  begin
    perform public.set_lost_item_status(v_watch.id, 'unclaimed', '');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a housekeeper can log but not run the queue (%)',
    case when v_message = 'Not allowed' then 'ok  ' else 'FAIL' end, coalesce(v_message, 'allowed');

  -- ======================================== an illegal jump is refused ==
  reset role;
  v_message := null;
  begin
    update public.lost_items set status = 'returned' where id = v_watch.id;
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a direct update cannot jump found → returned, even as the owner of the table (%)',
    case when v_message = 'A found item cannot go from found to returned' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');
  set local role authenticated;

  -- ========================================== 4. the desk finds the guest
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);

  -- Move the found time into the stay, so the suggestion has something to find.
  reset role;
  update public.lost_items set found_at = ((current_date + 602)::timestamp at time zone 'Asia/Kolkata')
   where id = v_watch.id;
  set local role authenticated;

  select count(*) into v_count
  from public.suggest_lost_item_owners(v_watch.id) s
  where s.booking_id = v_booking;
  raise notice '%  4. the stay in that villa is suggested as a possible owner',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.lost_items
   where id = v_watch.id and customer_id is null;
  raise notice '%  a suggestion does not tie the item to anyone',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  -- Tied to Rahul, the companion who says he lost a watch.
  perform public.identify_lost_item_owner(v_watch.id, v_booking, v_rahul.companion_id);

  -- Not yet the guest's business.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.guest_lost_items;
  raise notice '%  an identified item is not shown to the guest until they are contacted',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  -- ================================================= 5-6. notify the guest
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.contact_lost_item_owner(v_watch.id) into v_sent;
  raise notice '%  5. the desk notifies the guest (% portal message sent)',
    case when v_sent = 1 then 'ok  ' else 'FAIL' end, v_sent;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.notifications
   where kind = 'lost_found' and title = 'We found something';
  raise notice '%  6. the guest receives it in their portal',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  select title into v_text from public.notifications
   where kind = 'lost_found' order by at desc limit 1;
  select detail into v_text from public.notifications
   where kind = 'lost_found' order by at desc limit 1;
  raise notice '%  the message says "may belong to you", never "is yours"',
    case when v_text like '%may belong to you%' then 'ok  ' else 'FAIL' end;

  -- ============================================ 7-8. seeing only your own
  select count(*) into v_count from public.guest_lost_items where id = v_watch.id;
  raise notice '%  7. the guest sees their own case',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.lost_items;
  raise notice '%  the guest cannot read the item table itself',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'guest_lost_items'
    and column_name in ('storage_location', 'storage_ref', 'found_by_name',
                        'distinguishing', 'created_by', 'secured', 'disposition_note');
  raise notice '%  the guest view carries no storage, finder or distinguishing detail',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ananya_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.guest_lost_items;
  raise notice '%  8/41. another companion cannot see Rahul''s case',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.guest_lost_items where id = v_watch.id;
  raise notice '%  40. the booking holder can see a companion''s case on their booking',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    perform public.respond_to_lost_item(v_watch.id, true, 'It has an engraving on the back');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  but only Rahul answers for it (%)',
    case when v_message = 'That is not your item' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');

  -- ====================================================== 9-11. the claim
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);

  v_message := null;
  begin
    perform public.respond_to_lost_item(v_watch.id, true, 'mine');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  10. a claim needs a real description, not a word (%)',
    case when v_message like 'Describe it in your own words%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'accepted');

  perform public.respond_to_lost_item(v_watch.id, true,
    'It has an engraving on the back, S and M 2019. Midnight case.');
  select status into v_status from public.guest_lost_items where id = v_watch.id;
  raise notice '%  9. the guest claims it, and it waits for a person (%)',
    case when v_status = 'claim_pending' then 'ok  ' else 'FAIL' end, v_status;

  v_message := null;
  begin
    select id into v_claim from public.lost_item_claims where item_id = v_watch.id;
    perform public.decide_lost_item_claim(
      (select c.id from public.lost_item_claims c where c.item_id = v_watch.id), true, '');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a guest cannot approve their own claim (%)',
    case when v_message = 'Not allowed' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select id into v_claim from public.lost_item_claims where item_id = v_watch.id;
  perform public.decide_lost_item_claim(v_claim, true, 'Engraving matches');
  select status into v_status from public.lost_items where id = v_watch.id;
  raise notice '%  11. the desk verifies the claim (%)',
    case when v_status = 'claim_verified' then 'ok  ' else 'FAIL' end, v_status;

  -- ===================================================== 12-17. the return
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);

  v_message := null;
  begin
    perform public.choose_lost_item_return(v_watch.id, 'courier');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a courier without an address is refused (%)',
    case when v_message like 'A courier needs%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'accepted');

  perform public.choose_lost_item_return(
    v_watch.id, 'courier', null, '',
    'Rahul Sharma', '+91 98450 00001', '12 MG Road', 'Flat 4B',
    'Bengaluru', 'Karnataka', 'India', '560001', 'Ring twice');
  select status into v_status from public.guest_lost_items where id = v_watch.id;
  raise notice '%  13/14. the guest chooses a courier and the address is saved (%)',
    case when v_status = 'return_method_selected' then 'ok  ' else 'FAIL' end, v_status;

  update public.lost_items set status = 'returned' where id = v_watch.id;
  get diagnostics v_count = row_count;
  raise notice '%  a guest cannot mark their own item returned',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    perform public.arrange_lost_item_return(v_watch.id, 'Anybody', 'FAKE123');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a guest cannot set the tracking number (%)',
    case when v_message = 'Not allowed' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform public.arrange_lost_item_return(
    v_watch.id, 'Blue Dart', 'BD123456789IN', 350, 'guest', 'paid', 'UTR-SHIP-1',
    'in_transit', current_date, current_date + 3, null);
  select status into v_status from public.lost_items where id = v_watch.id;
  raise notice '%  15. the tracking number is saved and the item is in transit (%)',
    case when v_status = 'in_transit' then 'ok  ' else 'FAIL' end, v_status;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);
  select tracking_number into v_text from public.guest_lost_items where id = v_watch.id;
  raise notice '%  16. the guest sees the shipment and its tracking (%)',
    case when v_text = 'BD123456789IN' then 'ok  ' else 'FAIL' end, v_text;

  select count(*) into v_count from public.notifications
   where kind = 'lost_found' and title like 'Your return:%';
  raise notice '%  the guest is told when it ships',
    case when v_count >= 1 then 'ok  ' else 'FAIL' end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform public.arrange_lost_item_return(
    v_watch.id, null, null, null, null, null, null, 'delivered');
  select status into v_status from public.lost_items where id = v_watch.id;
  raise notice '%  17. delivery marks it returned (%)',
    case when v_status = 'returned' then 'ok  ' else 'FAIL' end, v_status;

  perform public.set_lost_item_status(v_watch.id, 'closed', 'Delivered and signed for');
  select status into v_status from public.lost_items where id = v_watch.id;
  raise notice '%  18. a returned item closes (%)',
    case when v_status = 'closed' then 'ok  ' else 'FAIL' end, v_status;

  -- ================================================ 22. chain of custody
  select count(*) into v_count from public.activity_events
   where entity_id = v_watch.id and kind = 'lost_found';
  raise notice '%  22. every step is on the custody trail (% entries)',
    case when v_count >= 9 then 'ok  ' else 'FAIL' end, v_count;

  -- ============================== a delivery recorded without "picked up"
  -- Straight from arranged to delivered must still walk the item legally.
  reset role;
  insert into public.lost_items (reference, title, category, status, created_by, villa_id)
  values ('LF-T1', 'Blue scarf', 'clothing', 'return_method_selected', v_manager, v_villa)
  returning * into v_item;
  insert into public.lost_item_returns (item_id, method, recipient_name, shipping_status)
  values (v_item.id, 'courier', 'X', 'quote_required');
  set local role authenticated;
  perform public.arrange_lost_item_return(
    v_item.id, 'DTDC', 'D1', null, null, null, null, 'delivered');
  select status into v_status from public.lost_items where id = v_item.id;
  raise notice '%  a courier jumping straight to delivered still ends in returned (%)',
    case when v_status = 'returned' then 'ok  ' else 'FAIL' end, v_status;

  -- ============================================ 19-20. unclaimed and gone
  select * into v_item from public.log_found_item(
    'Grey hoodie', 'clothing', 'pool', v_villa, null, '', '', '', 'Grey', '',
    1, 'normal', now(), '', 'Laundry', 'L-1', false, null);
  perform public.set_lost_item_status(v_item.id, 'unclaimed', 'Nobody came forward');

  v_message := null;
  begin
    perform public.dispose_lost_item(v_item.id, 'returned', '');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  disposal cannot pretend an item was returned (%)',
    case when v_message like 'Returning an item goes through the return%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');

  perform public.dispose_lost_item(v_item.id, 'donated', 'Given to the village school');
  select count(*) into v_count from public.lost_items
   where id = v_item.id and status = 'disposed' and disposition = 'donated'
     and disposition_note = 'Given to the village school';
  raise notice '%  20. the disposition is recorded, with its reason',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  -- =========================================== 21. valuable and sensitive
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select * into v_passport from public.log_found_item(
    'Passport', 'documents', 'front_desk', v_villa, null, '', 'Indian passport',
    '', 'Blue', 'Name page reads R. SHARMA', 1, 'sensitive', now(), 'Front desk',
    'Safe', 'S-1', false, null);
  raise notice '%  a sensitive item is secured whatever the form said',
    case when v_passport.secured then 'ok  ' else 'FAIL' end;

  -- A department with the desk's permission, but not management.
  reset role;
  insert into public.department_permissions (department_id, permission)
  values (v_hk_dept, 'lostfound.manage') on conflict do nothing;
  set local role authenticated;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_housekeeper, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.lost_items where id = v_passport.id;
  raise notice '%  21. the desk cannot see a sensitive item — management only',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    perform public.dispose_lost_item(v_passport.id, 'disposed', '');
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  and cannot decide what happens to it (%)',
    case when v_message like 'Only management%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'allowed');

  -- ================================ 23 / 42. companion report + recovery
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ananya_user, 'role', 'authenticated')::text, true);
  select * into v_report from public.report_lost_item(
    'Silver earring', 'jewellery', 'One of a pair, a small pearl', 'Silver', '',
    'Probably in the pool bathroom', now(), 'whatsapp');
  raise notice '%  23. a companion reports their own lost item (%)',
    case when v_report.companion_id = v_ananya.companion_id and v_report.booking_id = v_booking
         then 'ok  ' else 'FAIL' end, v_report.reference;

  select count(*) into v_count from public.lost_reports;
  raise notice '%  and sees only their own report',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.lost_reports;
  raise notice '%  another companion cannot read it',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  -- The stay ends. Rahul's stay access goes; his lost-and-found does not.
  reset role;
  update public.bookings
     set check_in = current_date - 6, check_out = current_date - 3
   where id = v_booking;
  -- Reopen a case for him, as if something else turned up after checkout.
  insert into public.lost_items (
    reference, title, category, status, created_by, villa_id,
    booking_id, customer_id, companion_id
  ) values (
    'LF-T2', 'Phone charger', 'electronics', 'guest_contacted', v_manager, v_villa,
    v_booking, v_holder, v_rahul.companion_id
  );
  set local role authenticated;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rahul_user, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.companion_stays;
  raise notice '%  42. after checkout the companion''s stay access is gone (%)',
    case when v_count = 0 then 'ok  ' else 'FAIL' end, v_count;

  select count(*) into v_count from public.guest_lost_items where reference = 'LF-T2';
  raise notice '%  31/42. but they can still see and answer for their lost item',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    perform public.place_food_order(
      v_booking,
      jsonb_build_array(jsonb_build_object(
        'menu_item_id', (select id from public.menu_items where available limit 1),
        'quantity', 1)),
      null);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  recovery access does not reopen the kitchen (%)',
    case when v_message = 'That is not your booking' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'order placed');

  reset role;
end $$;

rollback;
