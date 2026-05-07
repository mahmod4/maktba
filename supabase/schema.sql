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
  user_id uuid references auth.users on delete cascade,
  reference text unique,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.schema_fields enable row level security;
alter table public.orders enable row level security;

-- السماح للجميع بقراءة/كتابة schema_fields
drop policy if exists "doms_allow_all_schema" on public.schema_fields;
create policy "doms_allow_all_schema"
  on public.schema_fields for all
  using (true) with check (true);

-- المستخدمون المصادقون يمكنهم إدارة طلباتهم فقط
drop policy if exists "doms_orders_select_own" on public.orders;
create policy "doms_orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "doms_orders_insert_own" on public.orders;
create policy "doms_orders_insert_own"
  on public.orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "doms_orders_update_own" on public.orders;
create policy "doms_orders_update_own"
  on public.orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "doms_orders_delete_own" on public.orders;
create policy "doms_orders_delete_own"
  on public.orders for delete
  using (auth.uid() = user_id);

