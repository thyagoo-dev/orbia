import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Paperclip,
  Pencil,
  Search,
  WalletCards,
} from 'lucide-react'
import Modal from '@/components/Modal'
import { brl } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Attachment, Bill, BillInstallment } from '@/types'
import { paymentMethodLabel } from './constants'

type Tab = 'accounts' | 'installments' | 'attachments'
type Row = { bill: Bill; installment: BillInstallment }
type AttachmentRow = { bill: Bill; installment: BillInstallment; attachment: Attachment }

function dateLabel(value?: string | null) {
  if (!value) return '—'
  return value.split('-').reverse().join('/')
}

function billTypeLabel(bill: Bill) {
  if (bill.billing_type === 'installment') return `${bill.installment_count} parcelas`
  if (bill.billing_type === 'monthly') return bill.recurrence_active === false ? 'Mensal · encerrada' : 'Mensal recorrente'
  return 'À vista'
}

export default function FinanceModal({
  open,
  onClose,
  bills,
  loading,
  onEditBill,
  onPayment,
  onReceipt,
}: {
  open: boolean
  onClose: () => void
  bills: Bill[]
  loading: boolean
  onEditBill: (bill: Bill) => void
  onPayment: (bill: Bill, installment: BillInstallment) => void
  onReceipt: (installment: BillInstallment) => void
}) {
  const [tab, setTab] = useState<Tab>('accounts')
  const [search, setSearch] = useState('')

  const rows = useMemo<Row[]>(
    () => bills.flatMap(bill => (bill.bill_installments ?? []).map(installment => ({ bill, installment }))),
    [bills],
  )

  const attachmentRows = useMemo<AttachmentRow[]>(
    () => rows.flatMap(({ bill, installment }) =>
      (installment.attachments ?? []).map(attachment => ({ bill, installment, attachment }))),
    [rows],
  )

  const query = search.trim().toLocaleLowerCase('pt-BR')
  const filteredBills = useMemo(
    () => bills.filter(bill => !query || `${bill.description} ${bill.category}`.toLocaleLowerCase('pt-BR').includes(query)),
    [bills, query],
  )
  const filteredRows = useMemo(
    () => rows.filter(({ bill, installment }) => !query || `${bill.description} ${bill.category} ${installment.number}`.toLocaleLowerCase('pt-BR').includes(query)),
    [rows, query],
  )
  const filteredAttachments = useMemo(
    () => attachmentRows.filter(({ bill, attachment }) => !query || `${bill.description} ${attachment.file_name}`.toLocaleLowerCase('pt-BR').includes(query)),
    [attachmentRows, query],
  )

  const pendingTotal = rows
    .filter(({ installment }) => installment.status === 'pending')
    .reduce((sum, { installment }) => sum + Number(installment.amount), 0)
  const paidTotal = rows
    .filter(({ installment }) => installment.status === 'paid')
    .reduce((sum, { installment }) => sum + Number(installment.paid_amount ?? installment.amount), 0)

  async function openAttachment(attachment: Attachment) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(attachment.file_path, 60)
    if (error) {
      alert(error.message)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal open={open} onClose={onClose} title="Central financeira" maxWidth="max-w-6xl">
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted"><WalletCards size={16} /><span className="text-xs font-bold">Contas</span></div>
            <p className="mt-2 text-2xl font-black text-ink">{bills.length}</p>
          </div>
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted"><CheckCircle2 size={16} /><span className="text-xs font-bold">Total pago</span></div>
            <p className="mt-2 text-2xl font-black text-success">{brl.format(paidTotal)}</p>
          </div>
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted"><CircleDollarSign size={16} /><span className="text-xs font-bold">Em aberto</span></div>
            <p className="mt-2 text-2xl font-black text-warning">{brl.format(pendingTotal)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="segmented-control inline-grid grid-cols-3 rounded-xl p-1">
            {([
              ['accounts', 'Contas'],
              ['installments', 'Parcelas'],
              ['attachments', `Anexos (${attachmentRows.length})`],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition ${tab === value ? 'segmented-active text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-2 lg:w-80">
            <Search size={15} className="shrink-0 text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar no financeiro"
            />
          </label>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Sincronizando…</p>
        ) : tab === 'accounts' ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredBills.map(bill => {
              const installments = bill.bill_installments ?? []
              const paid = installments.filter(item => item.status === 'paid').length
              const nextPending = installments.find(item => item.status === 'pending')
              return (
                <article key={bill.id} className="finance-card rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{bill.description}</p>
                      <p className="mt-1 text-xs text-muted">{bill.category} · {billTypeLabel(bill)}</p>
                    </div>
                    <button className="icon-button h-9 w-9" type="button" onClick={() => onEditBill(bill)} title="Editar conta">
                      <Pencil size={15} />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="surface-muted rounded-xl p-3">
                      <p className="font-bold text-muted">Progresso</p>
                      <p className="mt-1 font-black text-ink">{paid}/{installments.length} pagas</p>
                    </div>
                    <div className="surface-muted rounded-xl p-3">
                      <p className="font-bold text-muted">Próximo vencimento</p>
                      <p className="mt-1 font-black text-ink">{nextPending ? dateLabel(nextPending.due_date) : 'Tudo pago'}</p>
                    </div>
                  </div>
                  {bill.notes && <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">{bill.notes}</p>}
                </article>
              )
            })}
            {filteredBills.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted">Nenhuma conta encontrada.</p>}
          </div>
        ) : tab === 'installments' ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="finance-table hidden grid-cols-[1.4fr_.65fr_.65fr_.7fr_.9fr_auto] gap-3 border-b border-line px-4 py-3 text-[11px] font-black uppercase tracking-wide text-muted md:grid">
              <span>Conta</span><span>Parcela</span><span>Vencimento</span><span>Valor</span><span>Status</span><span>Ações</span>
            </div>
            <div className="divide-y divide-line">
              {filteredRows
                .slice()
                .sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date))
                .map(({ bill, installment }) => (
                  <div key={installment.id} className="finance-table-row grid gap-3 px-4 py-3 md:grid-cols-[1.4fr_.65fr_.65fr_.7fr_.9fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink">{bill.description}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">{bill.category}</p>
                    </div>
                    <p className="text-xs font-bold text-ink">{bill.billing_type === 'installment' ? `${installment.number}/${bill.installment_count}` : installment.number}</p>
                    <p className="text-xs text-ink">{dateLabel(installment.due_date)}</p>
                    <p className="text-xs font-black text-ink">{brl.format(Number(installment.amount))}</p>
                    <div>
                      <span className={`status-pill ${installment.status === 'paid' ? 'status-paid' : 'status-pending'}`}>
                        {installment.status === 'paid' ? `Pago ${dateLabel(installment.paid_at)}` : 'Pendente'}
                      </span>
                      {installment.payment_method && <p className="mt-1 text-[10px] text-muted">{paymentMethodLabel(installment.payment_method)}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="icon-button h-9 w-9" type="button" onClick={() => onPayment(bill, installment)} title="Pagamento"><CircleDollarSign size={15} /></button>
                      <button className="icon-button h-9 w-9" type="button" onClick={() => onReceipt(installment)} title="Comprovantes"><Paperclip size={15} /></button>
                    </div>
                  </div>
                ))}
              {filteredRows.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhuma parcela encontrada.</p>}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredAttachments.map(({ bill, installment, attachment }) => (
              <button
                type="button"
                key={attachment.id}
                className="finance-card flex items-center gap-3 rounded-2xl border border-line p-4 text-left transition hover:border-brand/40"
                onClick={() => void openAttachment(attachment)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><FileText size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-ink">{attachment.file_name}</span>
                  <span className="mt-1 block truncate text-xs text-muted">{bill.description} · parcela {installment.number}</span>
                </span>
                <Paperclip size={15} className="shrink-0 text-muted" />
              </button>
            ))}
            {filteredAttachments.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted">Nenhum anexo encontrado.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
