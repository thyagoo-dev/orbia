import type { PaymentMethod } from '@/types'

export const BILL_CATEGORIES = [
  'Alimentação',
  'Assinaturas',
  'Compras',
  'Cuidados pessoais',
  'Documentos e taxas',
  'Educação',
  'Eletrônicos',
  'Empréstimos e dívidas',
  'Impostos',
  'Lazer',
  'Manutenção',
  'Moradia',
  'Pets',
  'Presentes e doações',
  'Saúde',
  'Serviços',
  'Trabalho',
  'Transporte',
  'Viagens',
  'Vestuário',
  'Outros',
] as const

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'pix_automatic', label: 'Pix Automático' },
  { value: 'automatic_debit', label: 'Débito automático' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'carne', label: 'Carnê' },
  { value: 'bank_transfer', label: 'Transferência bancária' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'digital_wallet', label: 'Carteira digital' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Outro' },
]

export function paymentMethodLabel(value?: string | null) {
  if (!value) return null
  return PAYMENT_METHODS.find(item => item.value === value)?.label ?? value
}
