-- Its own migration: a new enum value cannot be used in the transaction that
-- adds it, and the channel-sync migration uses it.
alter type public.activity_kind add value if not exists 'channel';
