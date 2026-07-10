-- ════════════════════════════════════════════════════════════════════════════
-- Migration: lock the data down to logged-in users only.
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- BEFORE running, do these two things in the dashboard (order matters — once
-- this SQL runs, the app can only be used by a logged-in user):
--   1. Authentication → Sign In / Providers → keep the Email provider enabled,
--      and turn "Allow new users to sign up" OFF.
--   2. Authentication → Users → Add user → your e-mail + a strong password
--      (tick "Auto confirm user" so no confirmation e-mail is needed).
-- ════════════════════════════════════════════════════════════════════════════

-- remove the old wide-open policies (anyone with the public anon key)
drop policy if exists "anon all invoices" on public.invoices;
drop policy if exists "anon all clients"  on public.clients;

-- allow full access only to authenticated (logged-in) users
drop policy if exists "auth all invoices" on public.invoices;
create policy "auth all invoices" on public.invoices
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all clients" on public.clients;
create policy "auth all clients" on public.clients
  for all to authenticated using (true) with check (true);
