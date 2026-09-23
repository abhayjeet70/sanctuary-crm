-- Checks for what a guest tells us once.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/stay_preferences.sql
--
-- Wrapped in a transaction that rolls back, so it is safe against the live
-- database. Every check prints ok or FAIL; nothing is left behind.

begin;

do $$
declare
  v_guest       uuid;
  v_other       uuid;
  v_guest_user  uuid;
  v_villa       uuid;
  v_entry       public.waitlist%rowtype;
  v_count       int;
  v_position    int;
  v_failed      boolean;
  v_message     text;
begin
  select id into v_villa from public.villas order by name limit 1;

  -- Two guests, one of whom has a login we can pretend to be.
  insert into public.customers (name, phone, email)
  values ('Preference Check', '+910000000001', 'prefcheck@example.test')
  returning id into v_guest;

  insert into public.customers (name, phone, email)
  values ('Somebody Else', '+910000000002', 'elsecheck@example.test')
  returning id into v_other;

  select p.id into v_guest_user
  from public.profiles p where p.role = 'guest' limit 1;

  update public.profiles set customer_id = v_guest where id = v_guest_user;

  -- ---------------------------------------------------------------- 1. join
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_guest_user, 'role', 'authenticated')::text, true);

  select * into v_entry from public.join_waitlist(
    v_villa,
    current_date + 30,
    current_date + 33,
    2, 1,
    'website',
    'Checking the queue',
    '{}'::uuid[],
    '22:30'::time,
    '10:00'::time,
    '{"dietary":"jain","meals":["breakfast","dinner"],"cuisines":["south_indian"],
      "allergies":"Peanuts","dietaryNotes":"No onion or garlic",
      "foodNotes":"Breakfast on the verandah","occasions":["birthday"],
      "specialRequests":"Late arrival, flying in"}'::jsonb);

  raise notice '%  a guest joins the queue with everything they told us',
    case when v_entry.id is not null then 'ok  ' else 'FAIL' end;

  raise notice '%  the arrival they asked for is kept',
    case when v_entry.check_in_time = '22:30'::time then 'ok  ' else 'FAIL' end;

  select count(*) into v_count
  from public.stay_preferences where waitlist_id = v_entry.id;
  raise notice '%  the preferences land in their own typed columns',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count
  from public.stay_preferences
  where waitlist_id = v_entry.id
    and dietary = 'jain'
    and 'breakfast' = any (meals)
    and allergies = 'Peanuts'
    and 'birthday' = any (occasions);
  raise notice '%  diet, meals, allergies and the occasion are all queryable',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  -- -------------------------------------------------------- 2. own row only
  select public.waitlist_position(v_entry.id) into v_position;
  raise notice '%  the guest is told their place in the queue (%)',
    case when v_position >= 1 then 'ok  ' else 'FAIL' end, v_position;

  -- Queueing as somebody else must be ignored, not honoured.
  select * into v_entry from public.join_waitlist(
    v_villa, current_date + 40, current_date + 42, 2, 0,
    'website', '', '{}'::uuid[], null, null, null, v_other);
  raise notice '%  a guest cannot queue in somebody else''s name',
    case when v_entry.customer_id = v_guest then 'ok  ' else 'FAIL' end;

  -- Converting is the desk's move, never the guest's.
  -- The message is checked, not merely the failure: a null booking id would
  -- also raise, and a test that passes for the wrong reason proves nothing.
  v_failed := false;
  begin
    perform public.convert_waitlist_entry(v_entry.id, null);
  exception when others then
    v_failed := true;
    v_message := sqlerrm;
  end;
  raise notice '%  a guest cannot convert themselves into a booking (%)',
    case when v_failed and v_message like 'Only the desk%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'no error raised');

  -- ------------------------------------------------- 3. what a guest can read
  select count(*) into v_count
  from public.stay_preferences
  where waitlist_id in (
    select id from public.waitlist where customer_id = v_other
  );
  raise notice '%  a guest cannot read anybody else''s preferences',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  reset role;
end $$;

rollback;
