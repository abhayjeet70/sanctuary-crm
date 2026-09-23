-- Where a guest stands in the queue.
--
-- The guest can only see their own waitlist row, which is correct and also
-- means they cannot count the people in front of them. Position has to be
-- answered by something that can see the whole queue — so a definer function
-- that returns a number and nothing else. It never reveals who is ahead, only
-- how many.
--
-- Still derived, never stored: same rule as the admin side. A stored position
-- has to be rewritten every time somebody leaves the queue.

create or replace function public.waitlist_position(p_waitlist_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist%rowtype;
  v_ahead int;
begin
  select * into v_entry from public.waitlist where id = p_waitlist_id;
  if not found then return null; end if;

  -- Their own row, or the desk's business. Nobody else gets to ask.
  if not (public.is_admin() or public.has_permission('waitlist.manage'))
     and v_entry.customer_id is distinct from public.current_customer_id() then
    raise exception 'Not your place in the queue' using errcode = '42501';
  end if;

  -- First come, first served among everyone still waiting for the same
  -- villa. A request for any villa queues against the whole property.
  select count(*) into v_ahead
  from public.waitlist w
  where w.status = 'waiting'
    and w.created_at < v_entry.created_at
    and (
      v_entry.villa_id is null
      or w.villa_id is null
      or w.villa_id = v_entry.villa_id
    );

  return v_ahead + 1;
end;
$$;

revoke all on function public.waitlist_position from public, anon;
grant execute on function public.waitlist_position to authenticated;
