-- ORBIA — esquema inicial
-- Execute este arquivo no SQL Editor do Supabase em um projeto vazio.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  color text not null default '#635bff',
  rrule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_check check (end_at > start_at)
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  note text,
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 180),
  category text not null default 'Outros',
  billing_type text not null check (billing_type in ('one_time','installment','monthly')),
  amount numeric(12,2) not null check (amount > 0),
  installment_count integer not null default 1 check (installment_count between 1 and 120),
  first_due_date date not null,
  recurrence_active boolean not null default false,
  recurrence_end_date date,
  default_payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_recurrence_end_check check (recurrence_end_date is null or recurrence_end_date >= first_due_date)
);

create table if not exists public.bill_installments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number integer not null check (number > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at date,
  payment_date_confirmed boolean not null default false,
  paid_amount numeric(12,2),
  payment_method text,
  payment_note text,
  created_at timestamptz not null default now(),
  unique (bill_id, number),
  constraint bill_installments_paid_amount_check check (paid_amount is null or paid_amount > 0)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  installment_id uuid not null references public.bill_installments(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists events_user_time_idx on public.events(user_id,start_at);
create index if not exists reminders_user_due_idx on public.reminders(user_id,due_at);
create index if not exists bills_user_idx on public.bills(user_id);
create index if not exists installments_user_due_idx on public.bill_installments(user_id,due_date);
create index if not exists installments_user_paid_at_idx on public.bill_installments(user_id,paid_at);

-- Garante que uma parcela nunca seja associada a um usuário diferente do dono da conta.
create or replace function public.enforce_installment_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.bills where id = new.bill_id;
  if owner is null or owner <> auth.uid() then raise exception 'bill owner mismatch'; end if;
  new.user_id := owner;
  return new;
end;
$$;
drop trigger if exists trg_installment_owner on public.bill_installments;
create trigger trg_installment_owner before insert or update of bill_id on public.bill_installments for each row execute function public.enforce_installment_owner();

create or replace function public.enforce_attachment_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.bill_installments where id = new.installment_id;
  if owner is null or owner <> auth.uid() then raise exception 'installment owner mismatch'; end if;
  new.user_id := owner;
  return new;
end;
$$;
drop trigger if exists trg_attachment_owner on public.attachments;
create trigger trg_attachment_owner before insert or update of installment_id on public.attachments for each row execute function public.enforce_attachment_owner();

-- updated_at
drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
drop trigger if exists reminders_updated_at on public.reminders;
create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();
drop trigger if exists bills_updated_at on public.bills;
create trigger bills_updated_at before update on public.bills for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.events enable row level security;
alter table public.reminders enable row level security;
alter table public.bills enable row level security;
alter table public.bill_installments enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "events_owner_all" on public.events;
create policy "events_owner_all" on public.events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "reminders_owner_all" on public.reminders;
create policy "reminders_owner_all" on public.reminders for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "bills_owner_all" on public.bills;
create policy "bills_owner_all" on public.bills for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "installments_owner_all" on public.bill_installments;
create policy "installments_owner_all" on public.bill_installments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "attachments_owner_all" on public.attachments;
create policy "attachments_owner_all" on public.attachments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bucket privado para comprovantes
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('receipts','receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=10485760;

drop policy if exists "receipt_owner_select" on storage.objects;
create policy "receipt_owner_select" on storage.objects for select to authenticated using (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "receipt_owner_insert" on storage.objects;
create policy "receipt_owner_insert" on storage.objects for insert to authenticated with check (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "receipt_owner_delete" on storage.objects;
create policy "receipt_owner_delete" on storage.objects for delete to authenticated using (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);

-- Recorrência mensal: calcula uma data equivalente N meses depois preservando o dia quando possível.
create or replace function public.monthly_due_date(p_first_due date, p_offset integer)
returns date
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  month_start date;
  last_day integer;
  desired_day integer;
begin
  if p_offset < 0 then raise exception 'month offset must be non-negative'; end if;
  month_start := (date_trunc('month', p_first_due)::date + make_interval(months => p_offset))::date;
  desired_day := extract(day from p_first_due)::integer;
  last_day := extract(day from (month_start + interval '1 month - 1 day')::date)::integer;
  return month_start + (least(desired_day, last_day) - 1);
end;
$$;

-- Gera somente o mês atual e uma pequena janela futura; chamadas repetidas não duplicam cobranças.
create or replace function public.materialize_monthly_bill_installments(p_months_ahead integer default 2)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  horizon_month date;
  target_month date;
  max_offset integer;
  offset_index integer;
  due_date_value date;
  generated_count integer := 0;
  changed_rows integer := 0;
  recurring_bill record;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_months_ahead < 0 or p_months_ahead > 24 then raise exception 'p_months_ahead must be between 0 and 24'; end if;

  horizon_month := (date_trunc('month', current_date)::date + make_interval(months => p_months_ahead))::date;

  for recurring_bill in
    select id, amount, first_due_date, recurrence_end_date
    from public.bills
    where user_id = current_user_id
      and billing_type = 'monthly'
      and recurrence_active = true
  loop
    target_month := horizon_month;
    if recurring_bill.recurrence_end_date is not null
       and date_trunc('month', recurring_bill.recurrence_end_date)::date < target_month then
      target_month := date_trunc('month', recurring_bill.recurrence_end_date)::date;
    end if;

    max_offset :=
      (extract(year from target_month)::integer - extract(year from recurring_bill.first_due_date)::integer) * 12
      + (extract(month from target_month)::integer - extract(month from recurring_bill.first_due_date)::integer);

    if max_offset < 0 then continue; end if;

    for offset_index in 0..max_offset loop
      due_date_value := public.monthly_due_date(recurring_bill.first_due_date, offset_index);
      if recurring_bill.recurrence_end_date is not null and due_date_value > recurring_bill.recurrence_end_date then exit; end if;

      insert into public.bill_installments (bill_id, user_id, number, due_date, amount)
      values (recurring_bill.id, current_user_id, offset_index + 1, due_date_value, recurring_bill.amount)
      on conflict (bill_id, number) do nothing;

      get diagnostics changed_rows = row_count;
      generated_count := generated_count + changed_rows;
    end loop;
  end loop;

  return generated_count;
end;
$$;

revoke all on function public.materialize_monthly_bill_installments(integer) from public;
grant execute on function public.materialize_monthly_bill_installments(integer) to authenticated;

-- Realtime (seguro porque o RLS continua valendo)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then alter publication supabase_realtime add table public.events; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reminders') then alter publication supabase_realtime add table public.reminders; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bills') then alter publication supabase_realtime add table public.bills; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bill_installments') then alter publication supabase_realtime add table public.bill_installments; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='attachments') then alter publication supabase_realtime add table public.attachments; end if;
end $$;


-- API permissions
-- O Data API pode alcançar as tabelas, enquanto o RLS continua restringindo cada usuário aos próprios registros.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.events to authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;
grant select, insert, update, delete on table public.bills to authenticated;
grant select, insert, update, delete on table public.bill_installments to authenticated;
grant select, insert, update, delete on table public.attachments to authenticated;

-- =========================================================
-- RESOURCES — links e arquivos em compromissos/lembretes
-- =========================================================

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  label text,
  url text,
  file_name text,
  file_path text unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint resources_single_owner_check check (num_nonnulls(event_id, reminder_id) = 1),
  constraint resources_payload_check check (
    (kind = 'link' and url is not null and file_path is null)
    or
    (kind = 'file' and file_path is not null and file_name is not null and url is null)
  ),
  constraint resources_size_check check (size_bytes is null or size_bytes >= 0)
);

create index if not exists resources_user_idx on public.resources(user_id);
create index if not exists resources_event_idx on public.resources(event_id) where event_id is not null;
create index if not exists resources_reminder_idx on public.resources(reminder_id) where reminder_id is not null;

create or replace function public.enforce_resource_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if num_nonnulls(new.event_id, new.reminder_id) <> 1 then raise exception 'resource must belong to exactly one event or reminder'; end if;
  if new.event_id is not null then
    select user_id into owner from public.events where id = new.event_id;
  else
    select user_id into owner from public.reminders where id = new.reminder_id;
  end if;
  if owner is null or owner <> auth.uid() then raise exception 'resource owner mismatch'; end if;
  new.user_id := owner;
  return new;
end;
$$;

drop trigger if exists trg_resource_owner on public.resources;
create trigger trg_resource_owner before insert or update of event_id, reminder_id on public.resources for each row execute function public.enforce_resource_owner();

alter table public.resources enable row level security;
drop policy if exists "resources_owner_all" on public.resources;
create policy "resources_owner_all" on public.resources for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('resources','resources',false,15728640,array[
  'image/jpeg','image/png','image/webp','application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update set public=false, file_size_limit=15728640, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "resource_file_owner_select" on storage.objects;
create policy "resource_file_owner_select" on storage.objects for select to authenticated using (bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "resource_file_owner_insert" on storage.objects;
create policy "resource_file_owner_insert" on storage.objects for insert to authenticated with check (bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "resource_file_owner_delete" on storage.objects;
create policy "resource_file_owner_delete" on storage.objects for delete to authenticated using (bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resources') then alter publication supabase_realtime add table public.resources; end if;
end $$;

grant select, insert, update, delete on table public.resources to authenticated;
notify pgrst, 'reload schema';
