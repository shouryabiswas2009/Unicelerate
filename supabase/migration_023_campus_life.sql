-- Unicelerate: the two campus-life focuses (lib/campus-life.ts,
-- docs/CAMPUS-LIFE-DATA.md).
--
-- 1. profiles.focuses may now also hold 'academic_community' and
--    'social_life' (the check from migration_009 is widened).
-- 2. Optional follow-up choices under each, as text arrays. Empty means
--    "Not sure". Row level security on profiles is unchanged (students read
--    and write only their own row).
-- 3. universities.campus_life: the published proxies, stored at import
--    time by scripts/campus-life/build.mjs and loaded by
--    supabase/seed_campus_life/*.sql. Shared schools only.
--
-- Safe to re-run.

alter table public.profiles drop constraint if exists profiles_focuses_check;
alter table public.profiles add constraint profiles_focuses_check check (
  focuses <@ array['academic', 'work_experience', 'research', 'affordability', 'academic_community', 'social_life']::text[]
);

alter table public.profiles
  add column if not exists campus_academic_prefs text[] not null default '{}',
  add column if not exists campus_social_prefs text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_campus_academic_prefs_check;
alter table public.profiles add constraint profiles_campus_academic_prefs_check check (
  campus_academic_prefs <@ array['hackathons_tech', 'competitions_teams', 'clubs_societies', 'career_networking', 'research', 'not_sure']::text[]
);

alter table public.profiles drop constraint if exists profiles_campus_social_prefs_check;
alter table public.profiles add constraint profiles_campus_social_prefs_check check (
  campus_social_prefs <@ array['big_events_sports', 'greek_life', 'city_nightlife', 'festivals_concerts', 'quiet_close_knit', 'not_sure']::text[]
);

alter table public.universities add column if not exists campus_life jsonb;

alter table public.universities drop constraint if exists universities_campus_life_check;
alter table public.universities add constraint universities_campus_life_check check (
  campus_life is null
  or (created_by is null and jsonb_typeof(campus_life) = 'object')
);

-- Check (should be 2, then after seed_campus_life/*.sql the second query
-- gives the count of shared schools with campus-life data, 1688):
--   select count(*) from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('campus_academic_prefs', 'campus_social_prefs');
--   select count(*) from public.universities where created_by is null and campus_life is not null;
