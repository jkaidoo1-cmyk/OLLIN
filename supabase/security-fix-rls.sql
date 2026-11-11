-- ============================================================
-- OLLIN — security fix: lock down server-only tables
--
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
--
-- WHY: public.audit_log and public.sessions were created without
-- `enable row level security`. Both are server-only registries, but with RLS
-- off the PostgREST anon role could read them with the public anon key:
--   - audit_log  → admin emails, actions, target ids and source IPs
--   - sessions   → live session ids (user_id + sid), i.e. a path to forging a
--                  logged-in session
--
-- Enabling RLS with NO policies leaves the tables reachable only through the
-- service-role key, which is exactly what the server uses. The anon and
-- authenticated clients get an empty result set instead.
--
-- Safe to re-run.
-- ============================================================

alter table public.audit_log enable row level security;
alter table public.sessions  enable row level security;

-- Defence in depth: if any permissive policy was ever created on these tables
-- by hand, drop it. There are none in schema.sql by design.
drop policy if exists "audit_log: read all" on public.audit_log;
drop policy if exists "audit_log: anyone reads" on public.audit_log;
drop policy if exists "sessions: read all" on public.sessions;
drop policy if exists "sessions: anyone reads" on public.sessions;

-- Verify: both must report rowsecurity = true.
-- (Run separately after the statements above.)
--
--   select tablename, rowsecurity
--     from pg_tables
--    where schemaname = 'public'
--      and tablename in ('audit_log', 'sessions');
