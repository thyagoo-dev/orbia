-- ORBIA — migração: recorrência mensal real
-- Execute UMA VEZ no SQL Editor do Supabase antes de usar a nova interface de contas.

-- 1) Metadados de recorrência.
do $$
declare
  had_recurrence_active boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bills'
      and column_name = 'recurrence_active'
  ) into had_recurrence_active;

  if not had_recurrence_active then
    alter table public.bills
      add column recurrence_active boolean not null default false;

    -- Contas mensais já existentes passam a ser tratadas como recorrências ativas.
    update public.bills
      set recurrence_active = true
      where billing_type = 'monthly';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bills'
      and column_name = 'recurrence_end_date'
  ) then
    alter table public.bills
      add column recurrence_end_date date;
  end if;
end $$;

-- 2) Validação da data final.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bills_recurrence_end_check'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_recurrence_end_check
      check (recurrence_end_date is null or recurrence_end_date >= first_due_date);
  end if;
end $$;

-- 3) Calcula o vencimento equivalente N meses depois, preservando o dia quando possível.
-- Ex.: 31/jan -> 28/fev (ou 29 em ano bissexto), sem "pular" para março.
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
  if p_offset < 0 then
    raise exception 'month offset must be non-negative';
  end if;

  month_start := (
    date_trunc('month', p_first_due)::date + make_interval(months => p_offset)
  )::date;

  desired_day := extract(day from p_first_due)::integer;
  last_day := extract(day from (month_start + interval '1 month - 1 day')::date)::integer;

  return month_start + (least(desired_day, last_day) - 1);
end;
$$;

-- 4) Materializa apenas uma janela pequena de cobranças futuras.
-- A função é idempotente: rodar várias vezes não duplica parcelas.
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
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_months_ahead < 0 or p_months_ahead > 24 then
    raise exception 'p_months_ahead must be between 0 and 24';
  end if;

  horizon_month := (
    date_trunc('month', current_date)::date + make_interval(months => p_months_ahead)
  )::date;

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

    if max_offset < 0 then
      continue;
    end if;

    for offset_index in 0..max_offset loop
      due_date_value := public.monthly_due_date(recurring_bill.first_due_date, offset_index);

      if recurring_bill.recurrence_end_date is not null
         and due_date_value > recurring_bill.recurrence_end_date then
        exit;
      end if;

      insert into public.bill_installments (
        bill_id,
        user_id,
        number,
        due_date,
        amount
      )
      values (
        recurring_bill.id,
        current_user_id,
        offset_index + 1,
        due_date_value,
        recurring_bill.amount
      )
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

-- Mantém as permissões explícitas da Data API.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.bills to authenticated;
grant select, insert, update, delete on table public.bill_installments to authenticated;
