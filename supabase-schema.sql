-- ════════════════════════════════════════════════════════════════════════════
-- Shriram Invoice App — Supabase schema
-- Run this ONCE in your Supabase project: Dashboard → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------- TABLES ----------
create table if not exists public.invoices (
  invoice_no    text primary key,
  iso_date      text,                 -- 'yyyy-mm-dd', used for monthly report
  saved_at      text,                 -- ISO timestamp
  total         numeric,
  customer_name text,
  data          jsonb                 -- full invoice (matches the app's StoredInvoice)
);

create index if not exists idx_invoices_iso_date on public.invoices (iso_date);

create table if not exists public.clients (
  id   bigint generated always as identity primary key,
  name text,
  data jsonb                          -- full client (CustomerDetails)
);

-- ---------- ROW LEVEL SECURITY ----------
-- RLS is ON. Only *logged-in* users (Supabase Auth) can read & write these
-- tables. The public "anon" key alone gets nothing.
--
-- Setup (once, in the Supabase dashboard):
--   1. Authentication → Sign In / Providers → keep Email enabled, and turn
--      "Allow new users to sign up" OFF (so nobody can self-register).
--   2. Authentication → Users → Add user → your e-mail + a strong password
--      (tick "Auto confirm user").
-- The app shows a login screen and signs in with that user.

alter table public.invoices enable row level security;
alter table public.clients  enable row level security;

drop policy if exists "anon all invoices" on public.invoices;
drop policy if exists "anon all clients"  on public.clients;

drop policy if exists "auth all invoices" on public.invoices;
create policy "auth all invoices" on public.invoices
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all clients" on public.clients;
create policy "auth all clients" on public.clients
  for all to authenticated using (true) with check (true);
