-- GoTrue scans auth.users into Go structs with non-nullable string fields, so a
-- NULL in any of the token columns makes every password sign-in fail with
-- "Database error querying schema" (a 500, with nothing useful in the response).
--
-- Inserting a user by hand leaves those columns NULL because they have no
-- default. GoTrue's own signup path writes empty strings instead. This
-- normalises them for every hand-inserted row.

update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;

-- The columns cannot be given defaults here: auth.users is owned by
-- supabase_auth_admin and even the postgres role may not ALTER it. Any future
-- hand-inserted demo user must therefore write '' explicitly, which
-- 20260901122955 now does.
