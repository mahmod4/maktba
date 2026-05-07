-- DOMS: Dynamic Order Management — Supabase schema
-- نفّذ هذا الملف في SQL Editor داخل مشروع Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.schema_fields (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  field_type text not null,
  required boolean not null default false,
  show_in_form boolean not null default true,
  show_in_table boolean not null default true,
  searchable boolean not null default true,
  filterable boolean not null default false,
  sort_order int not null default 0,
  is_hidden boolean not null default false,
  options jsonb not null default '[]'::jsonb
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- لمشاركة المفتاح anon علناً ضمن نموذج تجريبي: افتح القراءة/الكتابة للجميع.
-- لمشروع حقيقي: استخدم قيود RLS وحسابات مصادقة.

alter table public.schema_fields enable row level security;
alter table public.orders enable row level security;

drop policy if exists "doms_allow_all_schema" on public.schema_fields;
create policy "doms_allow_all_schema"
  on public.schema_fields for all
  using (true) with check (true);

drop policy if exists "doms_allow_all_orders" on public.orders;
create policy "doms_allow_all_orders"
  on public.orders for all
  using (true) with check (true);

