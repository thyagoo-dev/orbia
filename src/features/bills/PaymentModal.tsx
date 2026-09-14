import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { brl } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Bill, BillInstallment, PaymentMethod } from '@/types'
import { PAYMENT_METHODS } from './constants'

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export default function PaymentModal({
  bill,
  installment,
  onClose,
  onChanged,
}: {
  bill: Bill | null
  installment: BillInstallment | null
  onClose: () => void
  onChanged: () => void
}) {
  const open = !!bill && !!installment
  const [paidAt, setPaidAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paidAmount, setPaidAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!installment || !bill) return
    const needsHistoricalReview = installment.status === 'paid' && installment.payment_date_confirmed !== true
    setPaidAt(needsHistoricalReview ? installment.due_date : (installment.paid_at ?? format(new Date(), 'yyyy-MM-dd')))
    setPaidAmount(String(installment.paid_amount ?? installment.amount))
    setMethod(installment.payment_method ?? bill.default_payment_method ?? '')
    setNote(installment.payment_note ?? '')
    setError('')
  }, [bill, installment])

  const timing = useMemo(() => {
    if (!installment || !paidAt) return null
    const days = differenceInCalendarDays(parseISO(installment.due_date), parseISO(paidAt))
    if (days > 0) return { kind: 'early' as const, days }
    if (days < 0) return { kind: 'late' as const, days: Math.abs(days) }
    return { kind: 'on_time' as const, days: 0 }
  }, [installment, paidAt])

  if (!bill || !installment) return null

  // Capture the narrowed values for async callbacks. TypeScript does not
  // preserve prop narrowing inside nested async functions because the values
  // could theoretically change between renders.
  const currentBill = bill
  const currentInstallment = installment
  const needsHistoricalReview = currentInstallment.status === 'paid' && currentInstallment.payment_date_confirmed !== true

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const numeric = Math.round(Number(paidAmount.replace(',', '.')) * 100) / 100
      if (!numeric || numeric <= 0) throw new Error('Informe o valor realmente pago.')

      const { error: updateError } = await supabase
        .from('bill_installments')
        .update({
          status: 'paid',
          paid_at: paidAt,
          payment_date_confirmed: true,
          paid_amount: numeric,
          payment_method: method || null,
          payment_note: note.trim() || null,
        })
        .eq('id', currentInstallment.id)

      if (updateError) throw updateError
      onChanged()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível registrar o pagamento.'))
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!confirm('Desfazer este pagamento e marcar a cobrança como pendente?')) return
    setBusy(true)
    setError('')

    try {
      const { error: updateError } = await supabase
        .from('bill_installments')
        .update({
          status: 'pending',
          paid_at: null,
          payment_date_confirmed: false,
          paid_amount: null,
          payment_method: null,
          payment_note: null,
        })
        .eq('id', currentInstallment.id)

      if (updateError) throw updateError
      onChanged()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível desfazer o pagamento.'))
    } finally {
      setBusy(false)
    }
  }

  const installmentLabel =
    currentBill.billing_type === 'installment'
      ? `Parcela ${currentInstallment.number}/${currentBill.installment_count}`
      : currentBill.billing_type === 'monthly'
        ? 'Cobrança mensal'
        : 'Pagamento único'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={needsHistoricalReview ? 'Revisar pagamento' : currentInstallment.status === 'paid' ? 'Detalhes do pagamento' : 'Registrar pagamento'}
    >
      <form className="grid gap-4" onSubmit={save}>
        <div className="rounded-2xl border border-line bg-[#fafbff] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-ink">{currentBill.description}</p>
              <p className="mt-1 text-xs text-muted">{installmentLabel}</p>
            </div>
            <p className="shrink-0 text-sm font-black text-ink">{brl.format(Number(currentInstallment.amount))}</p>
          </div>
          <p className="mt-3 text-xs text-muted">
            Vencimento: {currentInstallment.due_date.split('-').reverse().join('/')}
          </p>
        </div>

        {needsHistoricalReview && (
          <div className="feedback feedback-info text-xs">
            <p className="font-bold">A data deste pagamento ainda não foi confirmada.</p>
            <p className="mt-1">
              Ele veio do histórico da versão antiga do Orbia. O vencimento foi colocado abaixo apenas como sugestão — ajuste para a data em que você realmente pagou.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <div className="flex items-center justify-between gap-2">
              <label>Data real do pagamento</label>
              {needsHistoricalReview && (
                <button
                  type="button"
                  className="text-[10px] font-bold text-brand hover:underline"
                  onClick={() => setPaidAt(currentInstallment.due_date)}
                >
                  Usar vencimento
                </button>
              )}
            </div>
            <input className="input" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required />
          </div>
          <div className="field">
            <label>Valor pago</label>
            <input
              className="input"
              inputMode="decimal"
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>
        </div>

        {timing && timing.kind !== 'on_time' && (
          <p className={`feedback text-xs ${timing.kind === 'early' ? 'feedback-success' : 'feedback-info'}`}>
            {timing.kind === 'early'
              ? `Pagamento antecipado em ${timing.days} dia${timing.days === 1 ? '' : 's'}.`
              : `Pagamento registrado ${timing.days} dia${timing.days === 1 ? '' : 's'} após o vencimento.`}
          </p>
        )}

        <div className="field">
          <label>Forma de pagamento</label>
          <select className="select" value={method} onChange={e => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">Não informar</option>
            {PAYMENT_METHODS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Observação do pagamento</label>
          <textarea
            className="textarea"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex.: pago antecipadamente pelo carnê"
          />
        </div>

        {error && <p className="feedback feedback-error">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {currentInstallment.status === 'paid' ? (
            <button className="secondary-button text-danger" type="button" onClick={() => void undo()} disabled={busy}>
              <RotateCcw size={15} />
              Desfazer pagamento
            </button>
          ) : <span />}

          <button className="primary-button" disabled={busy}>
            {busy
              ? 'Salvando…'
              : needsHistoricalReview
                ? 'Confirmar dados do pagamento'
                : currentInstallment.status === 'paid'
                  ? 'Atualizar pagamento'
                  : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
