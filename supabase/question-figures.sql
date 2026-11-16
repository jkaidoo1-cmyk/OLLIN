-- ============================================================
-- Question figures (charts attached to a question)
-- Run once in: Supabase Dashboard → SQL Editor → New query
--
-- Questions that refer to data ("according to the chart…") store the chart's
-- values in this column; the app draws them as SVG. Safe to re-run.
-- Until this runs, quizzes still save — figures are dropped for that save and
-- the server logs a warning.
-- ============================================================

alter table public.questions
  add column if not exists figure jsonb;

comment on column public.questions.figure is
  'Chart data the question refers to: {kind, title, labels[], values[], x_label, y_label, caption}. Drawn client-side as SVG.';
