-- OLLIN — Row Level Security
--
-- SUPERSEDED: the complete, current RLS setup lives in supabase/schema.sql
-- (section 3 plus the audit_log and sessions blocks at the end). Run that file
-- instead of this one.
--
-- This file previously duplicated the policies and had drifted from the real
-- schema: it referenced `quiz_attempts.user_id` and `attempt_answers.user_id`,
-- columns that do not exist (the column is `participant_id`), and one
-- `create policy` was missing its `on <table>` clause. Running it would either
-- error out or leave tables unprotected, which is worse than not running it.
--
-- What remains here is the one thing schema.sql did not cover until now: the
-- two server-only tables had Row Level Security switched off entirely, so the
-- public anon key could read admin audit rows (emails, IPs) and live session
-- ids. Apply the block below — or run supabase/security-fix-rls.sql, which is
-- the same statements.
--
-- Safe to re-run.

alter table public.audit_log enable row level security;
alter table public.sessions  enable row level security;

-- No policies on purpose: the server reaches these with the service-role key,
-- which bypasses RLS. Browser clients get nothing.
