-- ترقية جداول موجودة قبل إضافة عمود المرجع والحالة (نفّذ مرة واحدة على مشروع قائم).

alter table public.orders add column if not exists reference text;
alter table public.orders add column if not exists status text not null default 'new';

create unique index if not exists orders_reference_unique_idx on public.orders (reference)
  where reference is not null;

