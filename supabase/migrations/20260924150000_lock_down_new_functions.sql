-- Postgres grants EXECUTE to PUBLIC on every new function unless told otherwise,
-- which quietly includes anon. Every function below checks who is calling, so
-- nothing was exposed — but the project convention is that anon never reaches a
-- signed-in function at all, and an unreachable function is a safer one.
revoke all on function public.cancellation_quote(uuid, date)              from public, anon;
revoke all on function public.cancel_booking(uuid, text, boolean)         from public, anon;
revoke all on function public.process_refund(uuid, text, text, text)      from public, anon;
revoke all on function public.update_companion_details(text, text, text)  from public, anon;

grant execute on function public.cancellation_quote(uuid, date)              to authenticated;
grant execute on function public.cancel_booking(uuid, text, boolean)         to authenticated;
grant execute on function public.process_refund(uuid, text, text, text)      to authenticated;
grant execute on function public.update_companion_details(text, text, text)  to authenticated;
