-- The signup route no longer treats "Chloe14" as an admin code. Remove the row
-- 20260224011947_invite_codes.sql seeded so it can't be used as a normal
-- invite either, if it is still unused.
delete from invite_codes where code = 'Chloe14' and used_by is null;
