-- جدول مكالمات العملاء + رسائل الإشعارات من السيرفر
-- شغّل الملف كله مرة واحدة في Supabase SQL Editor

create table if not exists public.call_logs (
  id bigserial primary key,
  rep_name text not null,
  number text not null,
  customer_name text default '',
  shipment_code text default '',
  call_type text default '',
  call_time timestamptz not null,
  duration_sec integer default 0,
  created_at timestamptz default now(),
  unique (rep_name, number, call_time)
);
alter table public.call_logs enable row level security;
drop policy if exists call_logs_all on public.call_logs;
create policy call_logs_all on public.call_logs for all using (true) with check (true);

create table if not exists public.push_messages (
  id bigserial primary key,
  title text default 'HALKK',
  body text default '',
  target_rep text default '',   -- فاضي أو all = للكل، أو اسم المندوب
  created_at timestamptz default now()
);
alter table public.push_messages enable row level security;
drop policy if exists push_messages_all on public.push_messages;
create policy push_messages_all on public.push_messages for all using (true) with check (true);

-- مثال إرسال إشعار لكل المناديب:
-- insert into public.push_messages (title, body) values ('تنبيه', 'اجتماع الساعة 5');
