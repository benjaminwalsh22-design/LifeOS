-- The Moleskine app only backs up to Google Drive, one PDF per page
-- ("<notebook>_p<page>.pdf"). A Zapier workflow in his account hands the pages
-- that are his to pen-in, which keeps each one in a private bucket until
-- pen-tick has drawn it; the PDF is then deleted.
alter table public.pen_files add column if not exists src text not null default 'onedrive';   -- onedrive | inbox
alter table public.pen_files add column if not exists book text;        -- the notebook a single-page file belongs to
alter table public.pen_files add column if not exists pageno int;       -- its printed page number
alter table public.pen_files add column if not exists inbox_tag text;   -- the version waiting in the inbox (md5)
create index if not exists pen_files_book on public.pen_files (user_id, book, pageno);

insert into storage.buckets (id, name, public) values ('pen-inbox', 'pen-inbox', false)
on conflict (id) do nothing;

-- a page promised to one run of the Zapier workflow is not offered to another for a few minutes
alter table public.pen_files add column if not exists claim text;
alter table public.pen_files add column if not exists claimed_at timestamptz;
