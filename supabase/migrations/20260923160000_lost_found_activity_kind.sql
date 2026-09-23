-- Lost & Found is its own kind of event.
--
-- Its own migration because Postgres will not let one transaction add an enum
-- value and use it. The next migration uses it for the chain of custody and
-- for the notifications sent to a guest about their item.

alter type public.activity_kind add value if not exists 'lost_found';
