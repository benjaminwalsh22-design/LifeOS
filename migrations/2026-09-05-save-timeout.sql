-- The app saves its whole state as one 10 MB jsonb row. Parsing, compressing and
-- toasting that takes ~8 s of database time on this instance, which is exactly
-- Supabase's default statement_timeout for signed-in requests — so saves were
-- failing with 57014 while nothing was actually wrong. Give writes room until the
-- journal text moves out of the blob (journal_entries already mirrors it).
alter role authenticated set statement_timeout = '30s';
notify pgrst, 'reload config';
