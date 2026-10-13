-- Unicelerate: a student's high-school courses (optional), for the
-- relevant-coursework average (lib/courses.ts). Owner-only: row level
-- security lets a student read and change only their own rows. Rows go
-- when the profile goes (and the profile goes with the account, so
-- delete_my_account() removes them too). Safe to re-run.

create table if not exists public.profile_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject text not null check (subject in ('mathematics', 'calculus', 'statistics', 'computer_science', 'physics', 'chemistry', 'biology', 'economics', 'business', 'english', 'social_studies', 'languages', 'arts', 'other')),
  level text not null default 'standard' check (level in ('standard', 'honors', 'ap', 'ib_sl', 'ib_hl', 'a_level', 'other')),
  grade_percentage numeric(4, 1) not null check (grade_percentage between 0 and 100),
  grade_year smallint not null default 12 check (grade_year between 9 and 12),
  created_at timestamptz not null default now()
);

create index if not exists profile_courses_user_id_idx on public.profile_courses (user_id);

alter table public.profile_courses enable row level security;

drop policy if exists "Read your own courses" on public.profile_courses;
drop policy if exists "Add your own courses" on public.profile_courses;
drop policy if exists "Edit your own courses" on public.profile_courses;
drop policy if exists "Delete your own courses" on public.profile_courses;

create policy "Read your own courses" on public.profile_courses for select using (user_id = auth.uid());
create policy "Add your own courses" on public.profile_courses for insert with check (user_id = auth.uid());
create policy "Edit your own courses" on public.profile_courses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Delete your own courses" on public.profile_courses for delete using (user_id = auth.uid());

-- Check (should be true, then list four policies):
--   select relrowsecurity from pg_class where oid = 'public.profile_courses'::regclass;
--   select policyname from pg_policies where tablename = 'profile_courses';
