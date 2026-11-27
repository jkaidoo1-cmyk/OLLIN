-- Theory (free-response) questions are a question type the app has always
-- offered: the generator writes them, the editor lets a host switch a question
-- to "theory", and grading marks them against a stored model answer.
--
-- The original check constraint only allowed multiple_choice, true_false,
-- short_answer and fill_blank, so saving a quiz that contained even one theory
-- question failed the whole question insert (and, before the create route
-- rolled back, left a published quiz with no questions behind).
--
-- Run this once in the Supabase SQL editor.

alter table public.questions drop constraint if exists questions_question_type_check;

alter table public.questions add constraint questions_question_type_check
  check (question_type in ('multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'theory'));
