-- Wi-Fi events get their own kind in the activity log and the notification
-- tray. On its own migration because a new enum value cannot be used in the
-- same transaction that adds it.
alter type public.activity_kind add value if not exists 'wifi';
