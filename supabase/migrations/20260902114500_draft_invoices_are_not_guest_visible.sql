-- A draft invoice is the property's working copy, not something a guest should
-- read. Issuing it is what publishes it.
--
-- The admin screen has an "Issue to the portal" action, but hiding drafts in
-- the UI alone would be decoration: any guest could still read one straight
-- from the API. So the boundary goes here, in the policy.

drop policy if exists "guests read own invoices" on public.invoices;

create policy "guests read own issued invoices" on public.invoices
  for select to authenticated
  using (
    public.is_admin() or (
      status <> 'draft'
      and exists (
        select 1 from public.bookings b
        where b.id = invoices.booking_id
          and b.customer_id = public.current_customer_id()
      )
    )
  );
