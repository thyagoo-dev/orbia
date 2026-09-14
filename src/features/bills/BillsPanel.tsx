import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDollarSign, ListTree, Paperclip, Plus } from 'lucide-react'
import {
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { brl } from '@/lib/format'
import type { Bill, BillInstallment } from '@/types'
import BillModal from './BillModal'
import PaymentModal from './PaymentModal'
import ReceiptModal from './ReceiptModal'
import FinanceModal from './FinanceModal'
import { paymentMethodLabel } from './constants'

type Filter = 'due' | 'payments' | 'pending' | 'upcoming' | 'review'
type PaymentTarget = { bill: Bill; installment: BillInstallment }

function shortDate(value: string) {
  return value.split('-').reverse().slice(0, 2).join('/')
}

function isPastDate(value: string) {
  return value < format(new Date(), 'yyyy-MM-dd')
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function periodLabel(date: Date) {
  return capitalize(format(date, "MMMM 'de' yyyy", { locale: ptBR }))
}

function periodCardLabel(date: Date) {
  return format(date, 'MMM.', { locale: ptBR }).replace('.', '')
}

export default function BillsPanel() {
  const { user } = useAuth()
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [financeOpen, setFinanceOpen] = useState(false)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [receipt, setReceipt] = useState<BillInstallment | null>(null)
  const [payment, setPayment] = useState<PaymentTarget | null>(null)
  const [filter, setFilter] = useState<Filter>('due')
  const [period, setPeriod] = useState(() => startOfMonth(new Date()))

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const { error: recurrenceError } = await supabase.rpc('materialize_monthly_bill_installments', {
      p_months_ahead: 2,
    })
    if (recurrenceError) console.error('Falha ao atualizar recorrências mensais:', recurrenceError)

    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_installments(*, attachments(*))')
      .order('created_at', { ascending: false })

    if (!error) setBills((data ?? []) as Bill[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`bills-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `user_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_installments', filter: `user_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, load])

  const allRows = useMemo(
    () => bills.flatMap(bill => (bill.bill_installments ?? []).map(inst => ({ bill, inst }))).sort((a, b) => a.inst.due_date.localeCompare(b.inst.due_date)),
    [bills],
  )

  const rows = useMemo(() => {
    const periodEnd = format(endOfMonth(period), 'yyyy-MM-dd')

    if (filter === 'review') {
      return allRows
        .filter(({ inst }) => inst.status === 'paid' && inst.payment_date_confirmed !== true)
        .slice()
        .sort((a, b) => b.inst.due_date.localeCompare(a.inst.due_date))
    }

    if (filter === 'payments') {
      return allRows
        .filter(({ inst }) =>
          inst.status === 'paid' &&
          inst.payment_date_confirmed === true &&
          !!inst.paid_at &&
          isSameMonth(parseISO(inst.paid_at), period),
        )
        .slice()
        .sort((a, b) => (b.inst.paid_at ?? '').localeCompare(a.inst.paid_at ?? ''))
    }

    if (filter === 'pending') return allRows.filter(({ inst }) => inst.status === 'pending' && inst.due_date <= periodEnd)
    if (filter === 'upcoming') return allRows.filter(({ inst }) => inst.status === 'pending' && inst.due_date > periodEnd)
    return allRows.filter(({ inst }) => isSameMonth(parseISO(inst.due_date), period))
  }, [allRows, filter, period])

  const paidInPeriod = useMemo(
    () => allRows
      .map(({ inst }) => inst)
      .filter(inst => inst.status === 'paid' && inst.payment_date_confirmed === true && !!inst.paid_at && isSameMonth(parseISO(inst.paid_at), period))
      .reduce((sum, inst) => sum + Number(inst.paid_amount ?? inst.amount), 0),
    [allRows, period],
  )

  const openInPeriod = useMemo(
    () => allRows
      .map(({ inst }) => inst)
      .filter(inst => inst.status === 'pending' && isSameMonth(parseISO(inst.due_date), period))
      .reduce((sum, inst) => sum + Number(inst.amount), 0),
    [allRows, period],
  )

  const reviewCount = useMemo(
    () => allRows.filter(({ inst }) => inst.status === 'paid' && inst.payment_date_confirmed !== true).length,
    [allRows],
  )

  const refreshReceipt = async () => {
    await load()
    if (receipt) {
      const { data } = await supabase
        .from('bill_installments')
        .select('*,attachments(*)')
        .eq('id', receipt.id)
        .single()
      if (data) setReceipt(data as BillInstallment)
    }
  }

  function paidCountFor(bill: Bill) {
    return (bill.bill_installments ?? []).filter(item => item.status === 'paid').length
  }

  function rowPrimaryMeta(bill: Bill, inst: BillInstallment) {
    if (bill.billing_type === 'installment') return `Parcela ${inst.number}/${bill.installment_count} · ${paidCountFor(bill)}/${bill.installment_count} pagas`
    if (bill.billing_type === 'monthly') {
      if (bill.recurrence_active === false) return 'Mensal · encerrada'
      if (bill.recurrence_end_date) return `Mensal · até ${shortDate(bill.recurrence_end_date)}`
      return 'Mensal'
    }
    return bill.category
  }

  function rowPaymentMeta(bill: Bill, inst: BillInstallment) {
    const parts: string[] = []

    if (inst.status === 'paid' && inst.payment_date_confirmed !== true) {
      parts.push('Pago · data a revisar')
      parts.push(`vence ${shortDate(inst.due_date)}`)
    } else if (inst.status === 'paid' && inst.paid_at) {
      parts.push(`Pago ${shortDate(inst.paid_at)}`)
      parts.push(`vence ${shortDate(inst.due_date)}`)
      if (inst.paid_at < inst.due_date) parts.push('adiantado')
      else if (inst.paid_at > inst.due_date) parts.push('após o vencimento')
    } else if (isPastDate(inst.due_date)) {
      parts.push(`Atrasada · venceu ${shortDate(inst.due_date)}`)
    } else {
      parts.push(`Vence ${shortDate(inst.due_date)}`)
    }

    const method = paymentMethodLabel(inst.payment_method ?? bill.default_payment_method)
    if (method) parts.push(method)
    return parts.join(' · ')
  }

  const emptyTitle =
    filter === 'review' ? 'Nenhum pagamento para revisar'
      : filter === 'payments' ? 'Nenhum pagamento neste período'
        : filter === 'pending' ? 'Nenhuma pendência até este período'
          : filter === 'upcoming' ? 'Nenhuma cobrança futura'
            : 'Nenhum vencimento neste período'

  const emptyDescription =
    filter === 'review' ? 'Todas as datas de pagamento do histórico já foram confirmadas.'
      : filter === 'payments' ? 'Pagamentos são organizados pela data real em que você pagou.'
        : filter === 'pending' ? 'Não há cobranças em aberto até o fim do período selecionado.'
          : filter === 'upcoming' ? 'Não há cobranças pendentes após o período selecionado.'
            : 'Cobranças são organizadas pelo mês de vencimento.'

  return (
    <div className="bills-card card overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4">
        <button type="button" className="group text-left" onClick={() => setFinanceOpen(true)} title="Abrir central financeira">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Financeiro</p>
          <span className="mt-1 flex items-center gap-2 text-lg font-black text-ink">
            Contas
            <ListTree size={15} className="text-muted transition group-hover:text-brand" />
          </span>
        </button>
        <button
          className="icon-button"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
          aria-label="Nova conta"
        >
          <Plus size={19} />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 px-5 pb-3">
        <div className="metric-paid rounded-2xl p-3">
          <p className="text-[11px] font-bold text-muted">Pago em {periodCardLabel(period)}</p>
          <p className="mt-1 text-base font-black text-success">{brl.format(paidInPeriod)}</p>
        </div>
        <div className="metric-open rounded-2xl p-3">
          <p className="text-[11px] font-bold text-muted">Em aberto em {periodCardLabel(period)}</p>
          <p className="mt-1 text-base font-black text-warning">{brl.format(openInPeriod)}</p>
        </div>
      </div>

      {reviewCount > 0 && (
        <div className="px-5 pb-3">
          <button
            type="button"
            onClick={() => setFilter('review')}
            className={`review-banner flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${filter === 'review' ? 'is-active' : ''}`}
          >
            <AlertTriangle size={15} className="shrink-0 text-warning" />
            <span className="min-w-0 flex-1 text-[10px] font-bold text-ink">
              {reviewCount} pagamento{reviewCount === 1 ? '' : 's'} antigo{reviewCount === 1 ? '' : 's'} sem data confirmada
            </span>
            <span className="shrink-0 text-[10px] font-black text-brand">Revisar</span>
          </button>
        </div>
      )}

      <div className="px-5 pb-3">
        <div className="surface flex items-center justify-between rounded-xl border border-line px-1 py-1">
          <button type="button" className="nav-mini" onClick={() => setPeriod(current => addMonths(current, -1))} aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="min-w-0 flex-1 truncate px-2 text-center text-xs font-extrabold text-ink" onClick={() => setPeriod(startOfMonth(new Date()))} title="Voltar para o mês atual">
            {periodLabel(period)}
          </button>
          <button type="button" className="nav-mini" onClick={() => setPeriod(current => addMonths(current, 1))} aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 pb-3">
        <div className="segmented-control grid grid-cols-4 rounded-xl p-1">
          {([
            ['due', 'Vencem'],
            ['payments', 'Pagos'],
            ['pending', 'Pendentes'],
            ['upcoming', 'Próximas'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-lg px-1 py-2 text-[10px] font-extrabold transition ${filter === value ? 'segmented-active text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bills-list-shell min-h-0 flex-1 border-t border-line">
        <div className="bills-list scrollbar-thin h-full min-h-0 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted">Sincronizando…</p>
          ) : rows.length === 0 ? (
            <div className="m-2 rounded-2xl border border-dashed border-line p-6 text-center">
              <CircleDollarSign className="mx-auto mb-2 text-muted" />
              <p className="text-sm font-bold text-ink">{emptyTitle}</p>
              <p className="mt-1 text-xs text-muted">{emptyDescription}</p>
            </div>
          ) : (
            rows.map(({ bill, inst }) => (
              <div
                key={inst.id}
                onClick={() => {
                  setEditing(bill)
                  setOpen(true)
                }}
                className="list-row group flex cursor-pointer items-center gap-3 rounded-2xl p-2.5 transition"
              >
                <button
                  onClick={event => {
                    event.stopPropagation()
                    setPayment({ bill, installment: inst })
                  }}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                    inst.status === 'paid' && inst.payment_date_confirmed !== true
                      ? 'payment-review'
                      : inst.status === 'paid'
                        ? 'border-success bg-success text-white'
                        : isPastDate(inst.due_date)
                          ? 'payment-late text-transparent'
                          : 'payment-pending text-transparent'
                  }`}
                  title={inst.status === 'paid' && inst.payment_date_confirmed !== true ? 'Revisar data do pagamento' : inst.status === 'paid' ? 'Ver pagamento' : 'Registrar pagamento'}
                >
                  <Check size={14} />
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-extrabold ${inst.status === 'paid' ? 'text-muted line-through' : 'text-ink'}`}>{bill.description}</p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-muted">{rowPrimaryMeta(bill, inst)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">{rowPaymentMeta(bill, inst)}</p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-black text-ink">{brl.format(Number(inst.status === 'paid' ? (inst.paid_amount ?? inst.amount) : inst.amount))}</p>
                  <button
                    onClick={event => {
                      event.stopPropagation()
                      setReceipt(inst)
                    }}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-muted hover:text-brand"
                  >
                    <Paperclip size={12} />
                    {inst.attachments?.length || ''}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <FinanceModal
        open={financeOpen}
        onClose={() => setFinanceOpen(false)}
        bills={bills}
        loading={loading}
        onEditBill={bill => {
          setEditing(bill)
          setOpen(true)
        }}
        onPayment={(bill, installment) => {
          setPayment({ bill, installment })
        }}
        onReceipt={installment => {
          setReceipt(installment)
        }}
      />

      <BillModal open={open} onClose={() => setOpen(false)} onSaved={() => void load()} bill={editing} />
      <PaymentModal bill={payment?.bill ?? null} installment={payment?.installment ?? null} onClose={() => setPayment(null)} onChanged={() => void load()} />
      <ReceiptModal open={!!receipt} installment={receipt} onClose={() => setReceipt(null)} onChanged={() => void refreshReceipt()} />
    </div>
  )
}
