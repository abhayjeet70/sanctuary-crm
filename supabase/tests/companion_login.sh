#!/usr/bin/env bash
# End-to-end: provision a companion in SQL, sign in over HTTP as a browser
# would, read through RLS with their token, then remove every trace.
# Prints outcomes only — never the generated password.
set -u
cd "C:/Users/abhay/OneDrive/Desktop/Webnxt/Sanctuary-crm"
set -a; . ./.env.local; set +a

DB="postgresql://postgres.tufwyptholucfgdrldzh@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
q() { psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }

HOLDER_USER=$(q "select id from public.profiles where role='guest' and customer_id is not null limit 1")
HOLDER=$(q "select customer_id from public.profiles where id='$HOLDER_USER'")
VILLA=$(q "select id from public.villas where status='active' order by name limit 1")

BOOKING=$(q "insert into public.bookings (reference, customer_id, villa_id, booking_mode, check_in, check_out, adults, children, source, status, payment_status, nightly_rate, nights, tax_rate) values ('HOS-T9101', '$HOLDER', '$VILLA', 'whole', current_date + 500, current_date + 502, 3, 0, 'website', 'confirmed', 'pending', 10000, 2, 0.18) returning id" | head -1)

# add_companion reads auth.uid() from the JWT claims, so call it as the holder.
ROW=$(psql "$DB" -X -q -t -A -F '|' -v ON_ERROR_STOP=1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$HOLDER_USER', 'role', 'authenticated')::text, true);
select guest_code, temporary_password from public.add_companion('$BOOKING', 'Login Check', '', '', 'friend', false);
commit;
SQL
)
ROW=$(echo "$ROW" | grep '^HOS-G' | head -1)
CODE="${ROW%%|*}"
PASS="${ROW#*|}"
EMAIL="$(echo "${CODE#HOS-}" | tr 'A-Z' 'a-z')@guest.homesofsanctuary.in"

echo "provisioned: $CODE"

TOKEN=$(curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -n "$TOKEN" ]; then echo "ok    GoTrue accepts the SQL-provisioned login"; else echo "FAIL  sign-in refused"; fi

WRONG=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"not-the-password\"}")
echo "$( [ "$WRONG" = "400" ] && echo ok || echo FAIL )    a wrong password is refused ($WRONG)"

if [ -n "$TOKEN" ]; then
  BOOKINGS=$(curl -s "$VITE_SUPABASE_URL/rest/v1/bookings?select=reference" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN")
  echo "      bookings visible over REST: $BOOKINGS"
  PAYMENTS=$(curl -s "$VITE_SUPABASE_URL/rest/v1/payments?select=id" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN")
  echo "      payments visible over REST: $PAYMENTS"
  CUSTOMERS=$(curl -s "$VITE_SUPABASE_URL/rest/v1/customers?select=id" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN")
  echo "      customers visible over REST: $CUSTOMERS"
  STAYS=$(curl -s "$VITE_SUPABASE_URL/rest/v1/companion_stays?select=*" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN")
  echo "      companion_stays over REST: $STAYS"
  case "$STAYS" in
    *nightly_rate*|*internal_notes*|*amount_paid*) echo "FAIL  the stay leaks money or notes";;
    *HOS-T9101*) echo "ok    the stay arrives, with no money and no notes in it";;
    *) echo "FAIL  the stay did not arrive";;
  esac
  TOTALS=$(curl -s "$VITE_SUPABASE_URL/rest/v1/booking_totals?select=*" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN")
  echo "      booking_totals over REST: $TOTALS"
fi

# ------------------------------------------------------------------- tidy up
USER_ID=$(q "select profile_id from public.booking_companions where guest_code='$CODE'")
q "delete from public.activity_events where entity_id='$BOOKING'" >/dev/null
q "delete from public.booking_companions where booking_id='$BOOKING'" >/dev/null
q "delete from public.bookings where id='$BOOKING'" >/dev/null
[ -n "$USER_ID" ] && q "delete from auth.users where id='$USER_ID'" >/dev/null
LEFT=$(q "select count(*) from public.bookings where reference='HOS-T9101'")
LEFT_USER=$(q "select count(*) from auth.users where email='$EMAIL'")
echo "cleaned up: bookings left=$LEFT, auth users left=$LEFT_USER"
