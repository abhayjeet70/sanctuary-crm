-- The invoice trigger could not insert.
--
-- `case when v_settled then 'issued' else 'draft' end` resolves to text, and
-- invoices.status is an enum, so every booking INSERT failed with 42804 —
-- taking manual booking creation down with it.
--
-- The backfill in the same migration was fine because it cast explicitly, so
-- the invoices appeared and the trigger looked as though it had worked. It had
-- never run. A test that only exercises one path proves nothing about the other.

create or replace function public.ensure_booking_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settled boolean;
  v_status public.invoice_status;
  v_existing public.invoices%rowtype;
begin
  if new.status in ('cancelled', 'rejected', 'no_show', 'inquiry') then
    return new;
  end if;

  v_settled := new.status in
    ('payment_approved', 'confirmed', 'checked_in', 'in_house', 'checked_out', 'completed');
  v_status := case when v_settled
                   then 'issued'::public.invoice_status
                   else 'draft'::public.invoice_status end;

  select * into v_existing from public.invoices where booking_id = new.id limit 1;

  if not found then
    insert into public.invoices (number, booking_id, issued_at, tax_rate, status)
    values (public.next_invoice_number(), new.id, current_date,
            coalesce(new.tax_rate, 0.180), v_status);
  elsif v_settled and v_existing.status = 'draft' then
    update public.invoices set status = 'issued' where id = v_existing.id;
  end if;

  return new;
end;
$$;
