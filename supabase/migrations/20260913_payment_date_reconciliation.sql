-- ORBIA — reconciliação de datas de pagamento históricas.
-- Execute UMA VEZ no projeto Supabase existente.
--
-- Motivo: versões antigas do Orbia marcavam `paid_at` com a data do clique.
-- Ao cadastrar histórico de contas, isso pode ter feito vários pagamentos antigos
-- parecerem pagos no mês atual. Esta migration passa a distinguir pagamentos cuja
-- data real já foi confirmada pelo usuário daqueles que ainda precisam de revisão.

alter table public.bill_installments
  add column if not exists payment_date_confirmed boolean not null default false;

-- Pagamentos que já possuem metadados preenchidos pela tela nova provavelmente
-- foram revisados manualmente. Mantemos esses como confirmados. Os demais ficam
-- explicitamente "a revisar" e deixam de contaminar os totais mensais até que a
-- data real seja confirmada no Orbia.
update public.bill_installments
set payment_date_confirmed = true
where status = 'paid'
  and payment_date_confirmed = false
  and (payment_method is not null or payment_note is not null);

create index if not exists installments_user_payment_date_confirmed_idx
  on public.bill_installments(user_id, payment_date_confirmed)
  where status = 'paid';

notify pgrst, 'reload schema';
