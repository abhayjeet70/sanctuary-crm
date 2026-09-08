-- 'manager' on its own, because Postgres will not let a new enum value be
-- used in the transaction that adds it. Everything that reads it is in the
-- next migration.
alter type public.app_role add value if not exists 'manager';
