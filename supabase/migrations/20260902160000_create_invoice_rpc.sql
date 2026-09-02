-- Raising an invoice from the admin UI.
--
-- The number has to be unique and gapless-looking, and two people raising an
-- invoice at the same moment must not land on the same one. A sequence settles
-- that without a lock or a retry loop: max(nnnn) + 1 read from the table would
-- race, a sequence cannot.

create sequence if not exists public.invoice_number_seq start with 55;

-- The existing numbers run to 0054, so the sequence starts above them.
select setval(
  'public.invoice_number_seq',
  greatest(
    54,
    coalesce((select max(nullif(regexp_replace(number, '^.*/', ''), '')::int) from public.invoices), 0)
  )
);

/**
 * The Indian financial year label for a date: April to March, so
 * 2026-09-02 is '26-27'.
 */
create or replace function public.financial_year(d date default current_date)
returns text
language sql
immutable
as $$
  select case
    when extract(month from d) >= 4
      then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY')
  end;
$$;

create or replace function public.create_invoice(p_booking_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  prefix text;
  rate numeric(4,3);
  result public.invoices;
begin
  if not public.is_admin() then
    raise exception 'Only staff can raise an invoice' using errcode = 'insufficient_privilege';
  end if;

  -- One booking, one invoice. Raising a second would put two numbers against
  -- the same stay, and neither would be the one the guest was sent.
  if exists (select 1 from public.invoices where booking_id = p_booking_id) then
    raise exception 'That booking already has an invoice.' using errcode = 'unique_violation';
  end if;

  -- Identity and the tax rate come from the booking and the settings, never
  -- from the browser, so an invoice cannot disagree with what was charged.
  select b.tax_rate into rate from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'No such booking.' using errcode = 'no_data_found';
  end if;

  select coalesce(invoice_prefix, 'HOS') into prefix from public.property_settings limit 1;

  insert into public.invoices (number, booking_id, issued_at, tax_rate, status)
  values (
    coalesce(prefix, 'HOS') || '/' || public.financial_year() || '/' ||
      lpad(nextval('public.invoice_number_seq')::text, 4, '0'),
    p_booking_id,
    current_date,
    coalesce(rate, 0.180),
    'draft'
  )
  returning * into result;

  return result;
end;
$$;

grant usage on sequence public.invoice_number_seq to authenticated;
grant execute on function public.create_invoice(uuid) to authenticated;
grant execute on function public.financial_year(date) to authenticated;
