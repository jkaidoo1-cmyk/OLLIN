-- ============================================================
-- OLLIN Database Schema (v2 — matches the app as it is today)
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run: tables are created if missing, policies replaced.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- HELPERS (security definer so RLS policies can't recurse)
-- ============================================================

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
$$ language sql security definer stable;

create or replace function public.owns_quiz(p_quiz_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.quizzes
    where quizzes.id = p_quiz_id
      and quizzes.host_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- PROFILES (1:1 with Supabase auth.users)
-- ============================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  program_id uuid,
  current_year integer default 1,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create profile on signup (admin-created users included)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, current_year)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce((new.raw_user_meta_data->>'current_year')::int, 1)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles: read own or admin reads all" on public.profiles;
create policy "profiles: read own or admin reads all"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles: user updates own, admin updates all" on public.profiles;
create policy "profiles: user updates own, admin updates all"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- Inserts/deletes of profiles go through the service-role key (admin API routes).

-- ============================================================
-- PROGRAMS
-- ============================================================

create table if not exists public.programs (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null,
  name text not null,
  department text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.programs enable row level security;

drop policy if exists "programs: viewable by everyone" on public.programs;
create policy "programs: viewable by everyone"
  on public.programs for select using (true);

-- Writes go through the service-role key (admin routes).

-- ============================================================
-- COURSES
-- ============================================================

create table if not exists public.courses (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null,
  name text not null,
  description text,
  department text,
  program_id uuid references public.programs(id) on delete set null, -- null = general course
  year integer,                                                      -- null = all years
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;

drop policy if exists "courses: viewable by everyone" on public.courses;
create policy "courses: viewable by everyone"
  on public.courses for select using (true);

-- Writes go through the service-role key (admin routes).

-- ============================================================
-- QUIZZES
-- ============================================================

create table if not exists public.quizzes (
  id uuid default uuid_generate_v4() primary key,
  host_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  share_code text unique not null,

  -- Rules
  time_limit_minutes integer,
  max_attempts integer default 1,
  show_answers_after text default 'after_completion'
    check (show_answers_after in ('after_each', 'after_completion', 'never')),
  shuffle_questions boolean default true,
  shuffle_options boolean default true,
  passing_score integer default 50,

  -- Timing
  starts_at timestamptz,
  ends_at timestamptz,

  -- Status
  status text default 'published'
    check (status in ('draft', 'published', 'active', 'completed', 'archived')),

  course_id uuid references public.courses(id) on delete set null,
  material_id text, -- plain text: materials are not server-backed yet

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quizzes enable row level security;

drop policy if exists "quizzes: host CRUD own" on public.quizzes;
create policy "quizzes: host CRUD own"
  on public.quizzes for all
  using (auth.uid() = host_id or public.is_admin())
  with check (auth.uid() = host_id or public.is_admin());

drop policy if exists "quizzes: published viewable by code (incl. guests)" on public.quizzes;
create policy "quizzes: published viewable by code (incl. guests)"
  on public.quizzes for select
  using (status in ('published', 'active'));

-- ============================================================
-- QUESTIONS
-- ============================================================

create table if not exists public.questions (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  question_text text not null,
  question_type text not null default 'multiple_choice'
    check (question_type in ('multiple_choice', 'true_false', 'short_answer', 'fill_blank')),
  options jsonb,
  correct_answer text not null,
  explanation text,
  topic text,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  marks integer default 1,
  order_index integer default 0,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

drop policy if exists "questions: host manages own quiz questions" on public.questions;
create policy "questions: host manages own quiz questions"
  on public.questions for all
  using (public.owns_quiz(quiz_id) or public.is_admin())
  with check (public.owns_quiz(quiz_id) or public.is_admin());

drop policy if exists "questions: readable on published quizzes (incl. guests)" on public.questions;
create policy "questions: readable on published quizzes (incl. guests)"
  on public.questions for select
  using (
    exists (
      select 1 from public.quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.status in ('published', 'active')
    )
  );

-- ============================================================
-- QUIZ ATTEMPTS
-- ============================================================

create table if not exists public.quiz_attempts (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  participant_id uuid references public.profiles(id) on delete cascade,
  participant_name text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  time_taken_seconds integer,

  total_questions integer default 0,
  correct_answers integer default 0,
  score_percentage numeric(5,2) default 0,
  marks_earned numeric(6,2) default 0,
  marks_total numeric(6,2) default 0,

  status text default 'in_progress'
    check (status in ('in_progress', 'completed', 'timed_out', 'abandoned')),

  created_at timestamptz not null default now()
);

alter table public.quiz_attempts enable row level security;

drop policy if exists "attempts: participants insert own (guests allowed)" on public.quiz_attempts;
create policy "attempts: participants insert own (guests allowed)"
  on public.quiz_attempts for insert
  with check (
    participant_id is null or participant_id = auth.uid()
  );

drop policy if exists "attempts: participant, host or admin reads" on public.quiz_attempts;
create policy "attempts: participant, host or admin reads"
  on public.quiz_attempts for select
  using (
    participant_id = auth.uid()
    or public.owns_quiz(quiz_id)
    or public.is_admin()
  );

drop policy if exists "attempts: participant updates own" on public.quiz_attempts;
create policy "attempts: participant updates own"
  on public.quiz_attempts for update
  using (participant_id = auth.uid() or participant_id is null);

-- ============================================================
-- ATTEMPT ANSWERS (per-question responses)
-- ============================================================

create table if not exists public.attempt_answers (
  id uuid default uuid_generate_v4() primary key,
  attempt_id uuid references public.quiz_attempts(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_answer text,
  is_correct boolean,
  marks_awarded numeric(6,2) default 0,
  answered_at timestamptz not null default now(),

  unique(attempt_id, question_id)
);

alter table public.attempt_answers enable row level security;

drop policy if exists "answers: participant manages own (guests allowed)" on public.attempt_answers;
create policy "answers: participant manages own (guests allowed)"
  on public.attempt_answers for all
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_answers.attempt_id
        and (a.participant_id = auth.uid() or a.participant_id is null)
    )
    or public.owns_quiz((select quiz_id from public.quiz_attempts a where a.id = attempt_answers.attempt_id))
    or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_answers.attempt_id
        and (a.participant_id = auth.uid() or a.participant_id is null)
    )
  );

-- ============================================================
-- SAVED QUIZZES (admin saves a quiz under a course)
-- ============================================================

create table if not exists public.saved_quizzes (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  saved_by uuid references public.profiles(id) on delete set null,
  saved_at timestamptz not null default now(),

  unique(quiz_id, course_id)
);

alter table public.saved_quizzes enable row level security;

drop policy if exists "saved_quizzes: everyone reads, admin writes" on public.saved_quizzes;
create policy "saved_quizzes: everyone reads, admin writes"
  on public.saved_quizzes for select using (true);

-- Writes go through the service-role key (admin routes).

-- ============================================================
-- API KEYS (admin-managed, with rotation + usage)
-- ============================================================

create table if not exists public.api_keys (
  id text primary key,
  key text not null,
  label text not null default 'Key',
  provider text not null check (provider in ('groq', 'gemini')),
  enabled boolean not null default true,

  total_requests bigint not null default 0,
  total_input_tokens bigint not null default 0,
  total_output_tokens bigint not null default 0,
  estimated_cost_usd numeric(10,4) default 0,

  last_used_at timestamptz,
  added_at timestamptz default now(),
  last_error text,
  last_error_at timestamptz
);

alter table public.api_keys enable row level security;

drop policy if exists "api_keys: admin only" on public.api_keys;
create policy "api_keys: admin only"
  on public.api_keys for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null default '',
  type text not null default 'system' check (type in ('quiz', 'result', 'system')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "notifications: user manages own" on public.notifications;
create policy "notifications: user manages own"
  on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- updated_at TRIGGERS
-- ============================================================

drop trigger if exists trg_programs_updated on public.programs;
create trigger trg_programs_updated before update on public.programs
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_courses_updated on public.courses;
create trigger trg_courses_updated before update on public.courses
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_quizzes_updated on public.quizzes;
create trigger trg_quizzes_updated before update on public.quizzes
  for each row execute function public.touch_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_profiles_program_id on public.profiles(program_id);
create index if not exists idx_courses_program_id on public.courses(program_id);
create index if not exists idx_courses_year on public.courses(year);
create index if not exists idx_quizzes_course_id on public.quizzes(course_id);
create index if not exists idx_quizzes_share_code on public.quizzes(share_code);
create index if not exists idx_quizzes_host_id on public.quizzes(host_id);
create index if not exists idx_quizzes_status on public.quizzes(status);
create index if not exists idx_questions_quiz_id on public.questions(quiz_id);
create index if not exists idx_attempts_quiz_id on public.quiz_attempts(quiz_id);
create index if not exists idx_attempts_participant on public.quiz_attempts(participant_id);
create index if not exists idx_attempt_answers_attempt on public.attempt_answers(attempt_id);
create index if not exists idx_saved_quizzes_course on public.saved_quizzes(course_id);
create index if not exists idx_saved_quizzes_quiz on public.saved_quizzes(quiz_id);
create index if not exists idx_notifications_user on public.notifications(user_id);
