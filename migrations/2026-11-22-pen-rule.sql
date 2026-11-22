-- Which pages of a notebook are his. A notebook that comes from the Moleskine app
-- is not drawn, stored or imported at all until it has a rule; pages outside the
-- rule (the ones the children drew on) never leave OneDrive.
--   {"only": [[1, 40]]}   or   {"skip": [[150, 176]]}   or   {}  for every page
-- Positions count from 1 as the pages sit in the file.
alter table public.pen_files add column if not exists rule jsonb;
