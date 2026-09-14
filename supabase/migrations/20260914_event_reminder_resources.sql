-- ORBIA — recursos (links e arquivos) para Agenda e Lembretes
-- Migração aditiva: preserva todos os dados existentes.

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

-- A posse do recurso é derivada do compromisso/lembrete. O cliente não escolhe user_id.
create or replace function public.enforce_resource_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if num_nonnulls(new.event_id, new.reminder_id) <> 1 then
    raise exception 'resource must belong to exactly one event or reminder';
  end if;

  if new.event_id is not null then
    select user_id into owner from public.events where id = new.event_id;
  else
    select user_id into owner from public.reminders where id = new.reminder_id;
  end if;

  if owner is null or owner <> auth.uid() then
    raise exception 'resource owner mismatch';
  end if;

  new.user_id := owner;
  return new;
end;
$$;

drop trigger if exists trg_resource_owner on public.resources;
create trigger trg_resource_owner
before insert or update of event_id, reminder_id
on public.resources
for each row execute function public.enforce_resource_owner();

alter table public.resources enable row level security;

drop policy if exists "resources_owner_all" on public.resources;
create policy "resources_owner_all"
on public.resources
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Bucket privado separado dos comprovantes financeiros.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources',
  'resources',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resource_file_owner_select" on storage.objects;
create policy "resource_file_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "resource_file_owner_insert" on storage.objects;
create policy "resource_file_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "resource_file_owner_delete" on storage.objects;
create policy "resource_file_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Realtime: mudanças em anexos/links atualizam Agenda e Lembretes sem F5.
do $$ begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'resources'
  ) then
    alter publication supabase_realtime add table public.resources;
  end if;
end $$;

grant select, insert, update, delete on table public.resources to authenticated;

-- Atualiza imediatamente o schema cache do PostgREST.
notify pgrst, 'reload schema';
