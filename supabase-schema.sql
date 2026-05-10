-- DOMS: Dynamic Order Management — Supabase schema (كامل وصحيح)
-- نفّذ هذا الملف بالكامل في SQL Editor داخل مشروع Supabase.

-- التأكد من وجود الامتداد
create extension if not exists "pgcrypto";

-- ── جدول الحقول (schema) ──
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

-- ── جدول الطلبات ──
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  reference text unique,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

-- ── إضافة updated_at لو مش موجود (للترقية من مخطط قديم) ──
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'updated_at'
  ) then
    alter table public.orders add column updated_at timestamptz not null default now();
  end if;
end
$$;

-- ── الفهارس ──
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_user_id_idx on public.orders (user_id);

-- ── تفعيل RLS ──
alter table public.schema_fields enable row level security;
alter table public.orders enable row level security;

-- ── حذف كل السياسات القديمة على schema_fields ──
drop policy if exists "doms_allow_all_schema" on public.schema_fields;

-- ── حذف كل السياسات القديمة على orders ──
drop policy if exists "doms_orders_select_own" on public.orders;
drop policy if exists "doms_orders_insert_own" on public.orders;
drop policy if exists "doms_orders_update_own" on public.orders;
drop policy if exists "doms_orders_delete_own" on public.orders;
drop policy if exists "Allow all operations on orders" on public.orders;
drop policy if exists "doms_allow_all_orders" on public.orders;

-- ── سياسة schema_fields: السماح للكل ──
create policy "doms_allow_all_schema"
  on public.schema_fields for all
  using (true) with check (true);

-- ── سياسة orders: السماح للكل (للتطبيقات التي تستخدم نفس الحساب أو بدون حساب) ──
create policy "doms_allow_all_orders"
  on public.orders for all
  using (true) with check (true);
