-- Unicelerate: a daily cap on "report a wrong figure" (figure_reports,
-- migration_018), enforced by the database, so it holds however many
-- server instances are running (the app's in-memory limiter in
-- lib/rate-limit.ts only sees one instance). 20 reports per student per
-- 24 hours is far above honest use. The error message contains
-- "report_limit", which the app turns into a friendly message.
--
-- Safe to re-run.

create or replace function public.limit_figure_reports()
returns trigger
language plpgsql
-- An empty search_path, so the function can't be tricked into using
-- someone else's table with the same name.
set search_path = ''
as $$
begin
  if (
    select count(*) from public.figure_reports
    where user_id = new.user_id and created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'report_limit: at most 20 reports per day' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists figure_reports_daily_limit on public.figure_reports;
create trigger figure_reports_daily_limit
  before insert on public.figure_reports
  for each row execute function public.limit_figure_reports();

-- Check (should return 1 row):
--   select tgname from pg_trigger where tgname = 'figure_reports_daily_limit';
