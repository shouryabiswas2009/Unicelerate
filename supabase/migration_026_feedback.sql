-- Unicelerate migration 026: "Send feedback".
--
-- Anyone, logged in or not, can send a short message (with an optional
-- email address for a reply, and the page they were on). Nobody can read,
-- change or delete feedback through the app or the API: there is no select,
-- update or delete policy. The site's owner reads it in the SQL Editor,
-- which isn't subject to row level security (queries in
-- docs/OWNER-QUERIES.md):
--
--   select created_at, status, page, message, email, id
--   from public.feedback order by created_at desc;
--   update public.feedback set status = 'fixed' where id = '<id>';  -- or 'wont_fix'
--
-- A logged-in student's feedback is linked to their account and goes when
-- they delete it (cascade from auth.users), as /privacy promises.
--
-- Rate limits: the app allows a few per hour per visitor (lib/rate-limit.ts,
-- per server instance); this database rule is the hard cap that holds
-- however many instances run: at most 10 a day per logged-in student and
-- 200 an hour from everyone together (so a flood can't fill the database).
-- The error message contains "feedback_limit", which the app turns into a
-- friendly message.
--
-- Safe to re-run.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 3 and 2000),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  page text check (page is null or (char_length(page) <= 200 and page ~ '^/')),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'fixed', 'wont_fix')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id) where user_id is not null;

alter table public.feedback enable row level security;

drop policy if exists "Anyone can send feedback" on public.feedback;
-- Only new feedback, and only as yourself (or as nobody, logged out).
create policy "Anyone can send feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));

-- Insert only: no reading back through the API, even your own.
revoke all on public.feedback from anon, authenticated;
grant insert (message, email, page, user_id) on public.feedback to anon, authenticated;

create or replace function public.limit_feedback()
returns trigger
language plpgsql
-- Definer rights so the count sees every row (the caller can't read any),
-- and an empty search_path so it can't be tricked into another table.
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and (
    select count(*) from public.feedback
    where user_id = new.user_id and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'feedback_limit: at most 10 messages per day' using errcode = 'P0001';
  end if;
  if (select count(*) from public.feedback where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'feedback_limit: too many messages right now' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit
  before insert on public.feedback
  for each row execute function public.limit_feedback();

-- The owner's inbox: feedback and "wrong figure" reports (migration_018) in
-- one list, newest first, with one status scale (new / fixed / wont_fix;
-- a report's "open" reads as new and "rejected" as wont_fix). Read it in the
-- SQL Editor: select * from public.owner_inbox;
-- A view runs with its owner's rights, so the API roles must never reach
-- it: everything is revoked from them (Supabase grants new views to them by
-- default).
create or replace view public.owner_inbox as
  select 'feedback'::text as kind, f.created_at, f.status, f.page as about,
         f.message as detail, f.email as reply_to, f.id
  from public.feedback f
  union all
  select 'figure report', r.created_at,
         case r.status when 'open' then 'new' when 'rejected' then 'wont_fix' else r.status end,
         u.name || ' · ' || r.field,
         concat_ws(' → ', r.current_value, r.suggested_value)
           || coalesce(' (' || r.source_url || ')', '') || coalesce(' — ' || r.note, ''),
         null, r.id
  from public.figure_reports r
  join public.universities u on u.id = r.university_id;

revoke all on public.owner_inbox from anon, authenticated;
