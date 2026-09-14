export type Resource = {
  id: string
  user_id: string
  event_id: string | null
  reminder_id: string | null
  kind: 'link' | 'file'
  label: string | null
  url: string | null
  file_name: string | null
  file_path: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type AgendaEvent = {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  color: string
  rrule: string | null
  created_at: string
  updated_at: string
  resources?: Resource[]
}

export type EventInstance = {
  key: string
  source: AgendaEvent
  start: Date
  end: Date
}

export type Reminder = {
  id: string
  user_id: string
  title: string
  note: string | null
  due_at: string | null
  priority: 'low' | 'medium' | 'high'
  completed: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
  resources?: Resource[]
}

export type Attachment = {
  id: string
  user_id: string
  installment_id: string
  file_name: string
  file_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type PaymentMethod =
  | 'pix'
  | 'pix_automatic'
  | 'automatic_debit'
  | 'credit_card'
  | 'debit_card'
  | 'boleto'
  | 'carne'
  | 'bank_transfer'
  | 'cash'
  | 'digital_wallet'
  | 'check'
  | 'other'

export type BillInstallment = {
  id: string
  bill_id: string
  user_id: string
  number: number
  due_date: string
  amount: number
  status: 'pending' | 'paid'
  paid_at: string | null
  payment_date_confirmed?: boolean
  paid_amount?: number | null
  payment_method?: PaymentMethod | null
  payment_note?: string | null
  attachments?: Attachment[]
}

export type Bill = {
  id: string
  user_id: string
  description: string
  category: string
  billing_type: 'one_time' | 'installment' | 'monthly'
  amount: number
  installment_count: number
  first_due_date: string
  recurrence_active?: boolean
  recurrence_end_date?: string | null
  default_payment_method?: PaymentMethod | null
  notes: string | null
  created_at: string
  updated_at: string
  bill_installments?: BillInstallment[]
}
