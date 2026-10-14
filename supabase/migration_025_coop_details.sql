-- Unicelerate migration 025: co-op details (after migration_009, which added
-- coop_program and internship_support_url).
--
-- "Mandatory co-op" alone doesn't tell a student how much work experience
-- they'd get, so each school's co-op row can now say how long and how many
-- work terms its own page describes, and when we checked that page:
--   coop_work_terms   e.g. "Four to six four-month work terms"; null when
--                     the page doesn't say
--   coop_checked_on   the day we read the school's co-op page
-- Both are only ever filled from the school's own page (data/curated/
-- coop_programs.csv → supabase/seed_international/90_coop.sql), never
-- inferred. Student-added schools leave them empty.
--
-- Safe to re-run.

alter table public.universities add column if not exists coop_work_terms text;
alter table public.universities add column if not exists coop_checked_on date;

-- Short free text, not an essay (the card has one line for it).
alter table public.universities drop constraint if exists universities_coop_work_terms_length;
alter table public.universities add constraint universities_coop_work_terms_length check (
  coop_work_terms is null or char_length(coop_work_terms) <= 300
);
