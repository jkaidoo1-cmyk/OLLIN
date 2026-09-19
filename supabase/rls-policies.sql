-- OLLIN — Row Level Security policies
-- Run this in the Supabase SQL editor AFTER schema.sql.
--
-- Design: the server uses the service_role key (bypasses RLS) for admin
-- operations. The browser uses the anon key as an authenticated user for
-- student flows, so reads on content tables stay open to authenticated
-- users, while writes are restricted to owner-scoped rows.
-- The api_keys table is server-only: no policy grants access, so with RLS
-- enabled it is completely invisible to anon/authenticated clients.

-- ── profiles ─────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select to authenticated
  using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── programs ─────────────────────────────────────────────────────────
alter table public.programs enable row level security;

drop policy if exists "programs_read" on public.programs;
create policy "programs_read" on public.programs
  for select to authenticated using (true);

-- ── courses ──────────────────────────────────────────────────────────
alter table public.courses enable row level security;

drop policy if exists "courses_read" on public.courses;
create policy "courses_read" on public.courses
  for select to authenticated using (true);

-- ── quizzes ──────────────────────────────────────────────────────────
alter table public.quizzes enable row level security;

drop policy if exists "quizzes_read" on public.quizzes;
create policy "quizzes_read" on public.quizzes
  for select to authenticated using (true);

drop policy if exists "quizzes_insert_own" on public.quizzes;
create policy "quizzes_insert_own" on public.quizzes
  for insert to authenticated
  with check (auth.uid() = host_id);

drop policy if exists "quizzes_update_own" on public.quizzes;
create policy "quizzes_update_own" on public.quizzes
  for update to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

drop policy if exists "quizzes_delete_own" on public.quizzes;
create policy "quizzes_delete_own" on public.quizzes
  for delete to authenticated
  using (auth.uid() = host_id);

-- ── questions (readable with their quiz) ─────────────────────────────
alter table public.questions enable row level security;

drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions
  for select to authenticated using (true);

-- ── quiz_attempts: participants see their own; quiz hosts see theirs ─
alter table public.quiz_attempts enable row level security;

drop policy if exists "attempts_insert" on public.quiz_attempts;
create policy "attempts_insert" on public.quiz_attempts
  for insert to authenticated
  with check (true);

drop policy if exists "attempts_read_own_or_host" on public.quiz_attempts;
create policy "attempts_read_own_or_host" on public.quiz_attempts
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.quizzes q
      where q.id = quiz_attempts.quiz_id and q.host_id = auth.uid()
    )
  );

-- ── attempt_answers follow the parent attempt ────────────────────────
alter table public.attempt_answers enable row level security;

drop policy if exists "answers_insert" on public.attempt_answers;
create policy "answers_insert" on public.attempt_answers
  for insert to authenticated
  with check (true);

drop policy if exists "answers_read_via_attempt" on public.attempt_answers
as permissive
for select to authenticated
using (
  exists (
    select 1 from public.quiz_attempts a
    where a.id = attempt_answers.attempt_id
      and (a.user_id = auth.uid()
        or exists (
          select 1 from public.quizzes q
          where q.id = a.quiz_id and q.host_id = auth.uid()
        ))
  )
);

-- ── saved_quizzes: any authenticated user manages the course library ─
alter table public.saved_quizzes enable row level security;

drop policy if exists "saved_read" on public.saved_quizzes;
create policy "saved_read" on public.saved_quizzes
  for select to authenticated using (true);

drop policy if exists "saved_write" on public.saved_quizzes;
create policy "saved_write" on public.saved_quizzes
  for all to authenticated
  using (true)
  with check (true);

-- ── notifications: strictly per-user ─────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- ── api_keys: NO policies — with RLS enabled, invisible to clients ──
alter table public.api_keys enable row level security;

-- ── sessions: server-managed; no client access ──────────────────────
alter table public.sessions enable row level security;
