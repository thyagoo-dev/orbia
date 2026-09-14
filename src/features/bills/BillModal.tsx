import { addMonths, format } from 'date-fns'
import { CalendarClock, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import type { Bill, PaymentMethod } from '@/types'
import { BILL_CATEGORIES, PAYMENT_METHODS } from './constants'

type BillingType = 'one_time' | 'installment' | 'monthly'
type RecurrenceEndMode = 'never' | 'date'

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export default function BillModal({
  open,
  onClose,
  onSaved,
  bill,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  bill?: Bill | null
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Outros')
  const [type, setType] = useState<BillingType>('one_time')
  const [amount, setAmount] = useState('')
  const [count, setCount] = useState(2)
  const [firstDue, setFirstDue] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<PaymentMethod | ''>('')
  const [recurrenceActive, setRecurrenceActive] = useState(true)
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>('never')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDescription(bill?.description ?? '')
    setCategory(bill?.category ?? 'Outros')
    setType(bill?.billing_type ?? 'one_time')
    setAmount(bill ? String(bill.amount) : '')
    setCount(bill?.installment_count ?? 2)
    setFirstDue(bill?.first_due_date ?? format(new Date(), 'yyyy-MM-dd'))
    setNotes(bill?.notes ?? '')
    setDefaultPaymentMethod(bill?.default_payment_method ?? '')
    setRecurrenceActive(bill?.billing_type === 'monthly' ? (bill.recurrence_active ?? true) : true)
    setRecurrenceEndMode(bill?.recurrence_end_date ? 'date' : 'never')
    setRecurrenceEndDate(bill?.recurrence_end_date ?? '')
    setError('')
  }, [bill, open])

  async function materializeMonthlyOccurrences() {
    const { error: materializeError } = await supabase.rpc('materialize_monthly_bill_installments', {
      p_months_ahead: 2,
    })

    if (materializeError) throw materializeError
  }

  async function trimMonthlyOccurrences(billId: string, active: boolean, endDate: string | null) {
    let query = supabase
      .from('bill_installments')
      .delete()
      .eq('bill_id', billId)
      .eq('status', 'pending')

    if (!active) {
      query = query.gt('due_date', format(new Date(), 'yyyy-MM-dd'))
    } else if (endDate) {
      query = query.gt('due_date', endDate)
    } else {
      return
    }

    const { error: trimError } = await query
    if (trimError) throw trimError
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const numeric = Math.round(Number(amount.replace(',', '.')) * 100) / 100
      if (!numeric || numeric <= 0) throw new Error('Informe um valor válido.')

      const normalizedEndDate =
        type === 'monthly' && recurrenceActive && recurrenceEndMode === 'date'
          ? recurrenceEndDate
          : null

      if (type === 'monthly' && recurrenceActive && recurrenceEndMode === 'date') {
        if (!normalizedEndDate) throw new Error('Informe a data de término da recorrência.')
        if (normalizedEndDate < firstDue) {
          throw new Error('A data de término não pode ser anterior ao primeiro vencimento.')
        }
      }

      if (bill) {
        const updatePayload: Record<string, unknown> = {
          description: description.trim(),
          category,
          notes: notes.trim() || null,
          default_payment_method: defaultPaymentMethod || null,
        }

        if (bill.billing_type === 'monthly') {
          updatePayload.recurrence_active = recurrenceActive
          updatePayload.recurrence_end_date = normalizedEndDate
        }

        const { error: updateError } = await supabase
          .from('bills')
          .update(updatePayload)
          .eq('id', bill.id)

        if (updateError) throw updateError

        if (bill.billing_type === 'monthly') {
          await trimMonthlyOccurrences(bill.id, recurrenceActive, normalizedEndDate)
          if (recurrenceActive) await materializeMonthlyOccurrences()
        }

        onSaved()
        onClose()
        return
      }

      const installmentCount = type === 'installment' ? count : 1
      if (type === 'installment' && (installmentCount < 2 || installmentCount > 120)) {
        throw new Error('Informe uma quantidade de parcelas entre 2 e 120.')
      }

      const { data: created, error: billError } = await supabase
        .from('bills')
        .insert({
          description: description.trim(),
          category,
          billing_type: type,
          amount: numeric,
          installment_count: installmentCount,
          first_due_date: firstDue,
          notes: notes.trim() || null,
          default_payment_method: defaultPaymentMethod || null,
          recurrence_active: type === 'monthly',
          recurrence_end_date: type === 'monthly' ? normalizedEndDate : null,
        })
        .select('*')
        .single()

      if (billError || !created) throw billError ?? new Error('Não foi possível criar a conta.')

      const base = new Date(`${firstDue}T12:00:00`)
      const rows: { bill_id: string; number: number; due_date: string; amount: number }[] = []

      if (type === 'installment') {
        const totalCents = Math.round(numeric * 100)
        const each = Math.floor(totalCents / installmentCount)

        for (let i = 0; i < installmentCount; i += 1) {
          const cents =
            i === installmentCount - 1
              ? totalCents - each * (installmentCount - 1)
              : each

          rows.push({
            bill_id: created.id,
            number: i + 1,
            due_date: format(addMonths(base, i), 'yyyy-MM-dd'),
            amount: cents / 100,
          })
        }
      } else {
        rows.push({
          bill_id: created.id,
          number: 1,
          due_date: firstDue,
          amount: numeric,
        })
      }

      const { error: installmentError } = await supabase.from('bill_installments').insert(rows)
      if (installmentError) throw installmentError

      if (type === 'monthly') await materializeMonthlyOccurrences()

      onSaved()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível salvar a conta.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!bill || !confirm('Excluir esta conta e todo o histórico relacionado?')) return

    setBusy(true)
    setError('')

    try {
      const paths = (bill.bill_installments ?? []).flatMap(installment =>
        (installment.attachments ?? []).map(attachment => attachment.file_path),
      )

      if (paths.length) await supabase.storage.from('receipts').remove(paths)

      const { error: deleteError } = await supabase.from('bills').delete().eq('id', bill.id)
      if (deleteError) throw deleteError

      onSaved()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível excluir a conta.'))
    } finally {
      setBusy(false)
    }
  }

  const editingPlan = !!bill
  const isMonthly = type === 'monthly'

  return (
    <Modal open={open} onClose={onClose} title={bill ? 'Editar conta' : 'Nova conta'}>
      <form className="grid gap-4" onSubmit={save}>
        <div className="field">
          <label>Descrição</label>
          <input
            className="input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
            placeholder="Ex.: Conta de água"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label>Categoria</label>
            <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
              {BILL_CATEGORIES.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Forma de pagamento padrão</label>
            <select
              className="select"
              value={defaultPaymentMethod}
              onChange={e => setDefaultPaymentMethod(e.target.value as PaymentMethod | '')}
            >
              <option value="">Definir ao pagar</option>
              {PAYMENT_METHODS.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label>Tipo</label>
            <select
              className="select"
              value={type}
              disabled={editingPlan}
              onChange={e => setType(e.target.value as BillingType)}
            >
              <option value="one_time">À vista</option>
              <option value="installment">Parcelada</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>

          <div className="field">
            <label>{isMonthly ? 'Valor mensal' : 'Valor total'}</label>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              disabled={editingPlan}
              onChange={e => setAmount(e.target.value)}
              required
              placeholder="0,00"
            />
          </div>
        </div>

        <div className={type === 'installment' ? 'grid grid-cols-2 gap-3' : 'grid'}>
          <div className="field">
            <label>Primeiro vencimento</label>
            <input
              className="input"
              type="date"
              value={firstDue}
              disabled={editingPlan}
              onChange={e => setFirstDue(e.target.value)}
              required
            />
          </div>

          {type === 'installment' && (
            <div className="field">
              <label>Parcelas</label>
              <input
                className="input"
                type="number"
                min="2"
                max="120"
                value={count}
                disabled={editingPlan}
                onChange={e => setCount(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {isMonthly && (
          <section className="rounded-2xl border border-line bg-[#fafaff] p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <RefreshCw size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink">Recorrência mensal</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  O Orbia cria automaticamente as próximas cobranças conforme os meses avançam.
                </p>
              </div>
            </div>

            {bill && (
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-white px-3 py-3">
                <div>
                  <p className="text-sm font-bold text-ink">Recorrência ativa</p>
                  <p className="mt-0.5 text-xs text-muted">Desative para impedir novas cobranças futuras.</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#635bff]"
                  checked={recurrenceActive}
                  onChange={e => setRecurrenceActive(e.target.checked)}
                />
              </label>
            )}

            {recurrenceActive && (
              <div className="mt-4 grid gap-3">
                <div className="field">
                  <label>Término</label>
                  <select
                    className="select"
                    value={recurrenceEndMode}
                    onChange={e => setRecurrenceEndMode(e.target.value as RecurrenceEndMode)}
                  >
                    <option value="never">Sem data de término</option>
                    <option value="date">Em uma data específica</option>
                  </select>
                </div>

                {recurrenceEndMode === 'date' && (
                  <div className="field">
                    <label>Repetir até</label>
                    <div className="relative">
                      <CalendarClock
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                      <input
                        className="input pr-10"
                        type="date"
                        min={firstDue}
                        value={recurrenceEndDate}
                        onChange={e => setRecurrenceEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <div className="field">
          <label>Observações</label>
          <textarea
            className="textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {bill && (
          <p className="feedback feedback-info text-xs">
            {bill.billing_type === 'monthly'
              ? 'Valor e primeiro vencimento ficam preservados para manter o histórico consistente. Você pode editar categoria, forma de pagamento, observações e controlar a recorrência.'
              : 'Para proteger parcelas e pagamentos já registrados, valor, tipo e vencimentos ficam bloqueados na edição. Categoria, forma de pagamento e observações continuam editáveis.'}
          </p>
        )}

        {error && <p className="feedback feedback-error">{error}</p>}

        <div className="flex items-center justify-between">
          {bill ? (
            <button
              className="secondary-button text-danger"
              type="button"
              onClick={() => void remove()}
              disabled={busy}
            >
              <Trash2 size={16} />
              Excluir
            </button>
          ) : (
            <span />
          )}

          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar conta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
