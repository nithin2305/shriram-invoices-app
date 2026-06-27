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
-- RLS is ON. The policies below let the public "anon" key (the one in the app)
-- read & write these tables. This is the simplest setup and is fine for a
-- single-business internal tool.
--
-- ⚠️  SECURITY NOTE: because the site is public, ANYONE who finds your site URL
-- could read/write these two tables. The data is NOT private. If that matters,
-- lock it down later with Supabase Auth (email login) and change the policies
-- to `to authenticated` instead of `to anon`.

alter table public.invoices enable row level security;
alter table public.clients  enable row level security;

drop policy if exists "anon all invoices" on public.invoices;
create policy "anon all invoices" on public.invoices
  for all to anon using (true) with check (true);

drop policy if exists "anon all clients" on public.clients;
create policy "anon all clients" on public.clients
  for all to anon using (true) with check (true);
