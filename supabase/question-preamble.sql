-- ============================================================
-- Question preamble (a passage or case printed above the question)
-- Run once in: Supabase Dashboard → SQL Editor → New query
--
-- Safe to re-run, and it also covers `figure` so a fresh install can run this
-- one file instead of both. Until it runs, quizzes still save: the optional
-- columns are dropped for that save and the server logs a warning.
-- ============================================================

alter table public.questions add column if not exists preamble text;
alter table public.questions add column if not exists figure jsonb;

comment on column public.questions.preamble is
  'Optional passage/case shown above the question stem (max ~1200 chars).';
