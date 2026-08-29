-- =============================================
-- OLLIN Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- PROFILES
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'host', 'admin')),
  program_id uuid references public.programs(id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- =============================================
-- PROGRAMS
-- =============================================
create table public.programs (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null, -- e.g. "BSc CS", "BSc BIO"
  name text not null, -- e.g. "BSc Computer Science"
  department text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.programs enable row level security;

create policy "Programs are viewable by everyone"
  on public.programs for select
  using (true);

create policy "Admins can manage programs"
  on public.programs for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- =============================================
-- COURSES
-- =============================================
create table public.courses (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null, -- e.g. "CSC 101", "MATH 201"
  name text not null, -- e.g. "Introduction to Computer Science"
  description text,
  department text, -- e.g. "Computer Science", "Mathematics"
  program_id uuid references public.programs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;

-- Everyone can view courses
create policy "Courses are viewable by everyone"
  on public.courses for select
  using (true);

-- Only admins can manage courses
create policy "Admins can manage courses"
  on public.courses for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- =============================================
-- MATERIALS (uploaded learning materials)
-- =============================================
create table public.materials (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  file_url text,
  file_type text, -- pdf, docx, txt, image
  extracted_text text,
  char_count integer default 0,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;

create policy "Owners can CRUD their materials"
  on public.materials for all
  using (auth.uid() = owner_id);

-- =============================================
-- QUIZZES
-- =============================================
create table public.quizzes (
  id uuid default uuid_generate_v4() primary key,
  host_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  share_code text unique not null,
  
  -- Rules
  time_limit_minutes integer, -- null = no limit
  max_attempts integer default 1,
  show_answers_after text default 'after_completion' 
    check (show_answers_after in ('after_each', 'after_completion', 'never')),
  shuffle_questions boolean default true,
  shuffle_options boolean default true,
  passing_score integer default 50, -- percentage
  
  -- Timing
  starts_at timestamptz,
  ends_at timestamptz,
  
  -- Status
  status text default 'draft' 
    check (status in ('draft', 'published', 'active', 'completed', 'archived')),
  
  -- Material reference
  course_id uuid references public.courses(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quizzes enable row level security;

-- Hosts can manage their quizzes
create policy "Hosts can CRUD their quizzes"
  on public.quizzes for all
  using (auth.uid() = host_id);

-- Anyone can read published quizzes by share_code (for joining)
create policy "Published quizzes are viewable by share code"
  on public.quizzes for select
  using (status in ('published', 'active'));

-- =============================================
-- QUESTIONS
-- =============================================
create table public.questions (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  question_text text not null,
  question_type text not null default 'multiple_choice'
    check (question_type in ('multiple_choice', 'true_false', 'short_answer', 'fill_blank')),
  options jsonb, -- ["Option A", "Option B", "Option C", "Option D"]
  correct_answer text not null, -- index for MCQ, "true"/"false" for T/F, text for short answer
  explanation text,
  topic text,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  marks integer default 1,
  order_index integer default 0,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

-- Hosts can manage questions on their quizzes
create policy "Hosts can manage quiz questions"
  on public.questions for all
  using (
    exists (
      select 1 from public.quizzes
      where quizzes.id = questions.quiz_id
      and quizzes.host_id = auth.uid()
    )
  );

-- Participants can read questions on published/active quizzes
create policy "Participants can view questions on active quizzes"
  on public.questions for select
  using (
    exists (
      select 1 from public.quizzes
      where quizzes.id = questions.quiz_id
      and quizzes.status in ('published', 'active')
    )
  );

-- =============================================
-- QUIZ ATTEMPTS
-- =============================================
create table public.quiz_attempts (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  participant_id uuid references public.profiles(id) on delete cascade,
  participant_name text, -- for non-auth participants
  
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  time_taken_seconds integer,
  
  total_questions integer default 0,
  correct_answers integer default 0,
  score_percentage numeric(5,2) default 0,
  marks_earned integer default 0,
  marks_total integer default 0,
  
  status text default 'in_progress'
    check (status in ('in_progress', 'completed', 'timed_out', 'abandoned')),
  
  created_at timestamptz not null default now()
);

alter table public.quiz_attempts enable row level security;

-- Participants can read/update their own attempts
create policy "Participants can view own attempts"
  on public.quiz_attempts for select
  using (
    auth.uid() = participant_id
    or participant_id is null
  );

create policy "Participants can update own attempts"
  on public.quiz_attempts for update
  using (
    auth.uid() = participant_id
    or participant_id is null
  );

create policy "Participants can insert own attempts"
  on public.quiz_attempts for insert
  with check (true);

-- Hosts can read attempts on their quizzes
create policy "Hosts can view attempts on their quizzes"
  on public.quiz_attempts for select
  using (
    exists (
      select 1 from public.quizzes
      where quizzes.id = quiz_attempts.quiz_id
      and quizzes.host_id = auth.uid()
    )
  );

-- =============================================
-- ATTEMPT ANSWERS
-- =============================================
create table public.attempt_answers (
  id uuid default uuid_generate_v4() primary key,
  attempt_id uuid references public.quiz_attempts(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_answer text,
  is_correct boolean,
  marks_awarded integer default 0,
  answered_at timestamptz not null default now(),
  
  unique(attempt_id, question_id)
);

alter table public.attempt_answers enable row level security;

-- Participants can manage their own answers
create policy "Participants can manage own answers"
  on public.attempt_answers for all
  using (
    exists (
      select 1 from public.quiz_attempts
      where quiz_attempts.id = attempt_answers.attempt_id
      and (
        quiz_attempts.participant_id = auth.uid()
        or quiz_attempts.participant_id is null
      )
    )
  );

-- Hosts can read answers on their quiz attempts
create policy "Hosts can view answers on their quizzes"
  on public.attempt_answers for select
  using (
    exists (
      select 1 from public.quiz_attempts
      join public.quizzes on quizzes.id = quiz_attempts.quiz_id
      where quiz_attempts.id = attempt_answers.attempt_id
      and quizzes.host_id = auth.uid()
    )
  );

-- =============================================
-- INDEXES for performance
-- =============================================
create index idx_courses_program_id on public.courses(program_id);
create index idx_profiles_program_id on public.profiles(program_id);
create index idx_quizzes_course_id on public.quizzes(course_id);
create index idx_quizzes_share_code on public.quizzes(share_code);
create index idx_quizzes_host_id on public.quizzes(host_id);
create index idx_quizzes_status on public.quizzes(status);
create index idx_materials_owner_id on public.materials(owner_id);
create index idx_questions_quiz_id on public.questions(quiz_id);
create index idx_quiz_attempts_quiz_id on public.quiz_attempts(quiz_id);
create index idx_quiz_attempts_participant_id on public.quiz_attempts(participant_id);
create index idx_attempt_answers_attempt_id on public.attempt_answers(attempt_id);
