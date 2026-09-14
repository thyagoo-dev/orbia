import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const shortDate = (date: Date | string) => format(new Date(date), "dd 'de' MMM", { locale: ptBR })
export const dateTime = (date: Date | string) => format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
export const toDateInput = (date: Date) => format(date, 'yyyy-MM-dd')
export const toTimeInput = (date: Date) => format(date, 'HH:mm')
