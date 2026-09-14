-- ORBIA — Financeiro v2: formas de pagamento, valor efetivamente pago e pagamentos antecipados.
-- Execute UMA VEZ no projeto Supabase existente.

alter table public.bills
  add column if not exists default_payment_method text;

alter table public.bill_installments
  add column if not exists paid_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists payment_note text;

-- Preserva o histórico já marcado como pago: na ausência de valor efetivo,
-- considera-se que o valor pago foi igual ao valor previsto da parcela.
update public.bill_installments
set paid_amount = amount
where status = 'paid'
  and paid_amount is null;

-- Evita valores pagos inválidos sem limitar formas de pagamento futuras.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bill_installments_paid_amount_check'
      and conrelid = 'public.bill_installments'::regclass
  ) then
    alter table public.bill_installments
      add constraint bill_installments_paid_amount_check
      check (paid_amount is null or paid_amount > 0);
  end if;
end $$;

create index if not exists installments_user_paid_at_idx
  on public.bill_installments(user_id, paid_at);

-- Atualiza imediatamente o schema cache da Data API.
notify pgrst, 'reload schema';
