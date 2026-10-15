# Owner queries: feedback and "wrong figure" reports

Students and visitors can send feedback (`/feedback`, table `feedback`,
[migration_026](../supabase/migration_026_feedback.sql)), and logged-in
students can report a wrong figure on a university's page (table
`figure_reports`, [migration_018](../supabase/migration_018_figure_reports.sql)).
Nobody can read either through the site or the API. You read them in the
Supabase **SQL Editor**, which runs as the database owner and isn't subject to
row level security.

## The inbox (both, newest first)

`owner_inbox` is a view over both tables with one status scale: `new`,
`fixed`, `wont_fix` (a report's `open` reads as `new`, `rejected` as
`wont_fix`). The API roles have no access to it.

```sql
-- Everything still to look at
select kind, created_at, about, detail, reply_to, id
from public.owner_inbox
where status = 'new'
order by created_at desc;

-- Everything, with its status
select kind, status, created_at, about, detail, reply_to, id
from public.owner_inbox
order by created_at desc
limit 100;
```

## Marking something done

```sql
-- Feedback: new → fixed or wont_fix
update public.feedback set status = 'fixed' where id = '<id>';
update public.feedback set status = 'wont_fix' where id = '<id>';

-- A figure report: open → fixed or rejected (shown as wont_fix in the inbox)
update public.figure_reports set status = 'fixed' where id = '<id>';
update public.figure_reports set status = 'rejected' where id = '<id>';
```

When a report is right, fix the figure at its source first
(`data/curated/*.csv`, then regenerate and run the seed files; see
[DATA-REFRESH.md](DATA-REFRESH.md)), then mark the report `fixed`.

## Weekly numbers

```sql
select kind, status, count(*) from public.owner_inbox
where created_at > now() - interval '7 days'
group by kind, status order by kind, status;
```

## Privacy reminders

- An email address in feedback is only for replying to that message. Don't
  copy it anywhere else.
- A logged-in student's feedback and reports are deleted with their account
  (cascade from `auth.users`). If someone asks by email for an anonymous
  message to be deleted: `delete from public.feedback where id = '<id>';`
