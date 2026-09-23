-- A notification about the waiting list is its own kind.
--
-- It used to borrow `booking`, which sent the desk to a cancelled booking
-- rather than to the queue of people who want those dates — the one screen
-- the message is actually about.
--
-- Alone in its own migration because Postgres will not let a transaction add
-- an enum value and then use it. The next migration is where it is used.

alter type public.activity_kind add value if not exists 'waitlist';
