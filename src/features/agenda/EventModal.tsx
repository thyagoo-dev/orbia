import { useEffect, useMemo, useState } from 'react'
import { RRule, Weekday } from 'rrule'
import { Trash2 } from 'lucide-react'
import { combineDateAndTime } from './helpers'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { toDateInput, toTimeInput } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { emptyResourceDraft, persistResources, removeResourceFiles, type ResourceDraft } from '@/lib/resources'
import ResourcesEditor from '@/features/resources/ResourcesEditor'
import type { AgendaEvent } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  event?: AgendaEvent | null
  initialStart?: Date | null
}

const dayOptions = [
  ['MO', 'Seg', RRule.MO],
  ['TU', 'Ter', RRule.TU],
  ['WE', 'Qua', RRule.WE],
  ['TH', 'Qui', RRule.TH],
  ['FR', 'Sex', RRule.FR],
  ['SA', 'Sáb', RRule.SA],
  ['SU', 'Dom', RRule.SU],
] as const

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Não foi possível salvar o compromisso.'
}

export default function EventModal({ open, onClose, onSaved, event, initialStart }: Props) {
  const { user } = useAuth()
  const fallback = initialStart ?? new Date()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(toDateInput(fallback))
  const [start, setStart] = useState(toTimeInput(fallback))
  const [end, setEnd] = useState(toTimeInput(new Date(fallback.getTime() + 60 * 60_000)))
  const [color, setColor] = useState('#635bff')
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [weekdays, setWeekdays] = useState<string[]>([])
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>(emptyResourceDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const base = event ? new Date(event.start_at) : (initialStart ?? new Date())
    setTitle(event?.title ?? '')
    setDescription(event?.description ?? '')
    setDate(toDateInput(base))
    setStart(toTimeInput(base))
    setEnd(toTimeInput(event ? new Date(event.end_at) : new Date(base.getTime() + 60 * 60_000)))
    setColor(event?.color ?? '#635bff')

    if (!event?.rrule) {
      setRepeat('none')
      setWeekdays([])
    } else {
      const rule = event.rrule
      setRepeat(rule.includes('FREQ=DAILY') ? 'daily' : rule.includes('FREQ=MONTHLY') ? 'monthly' : 'weekly')
      setWeekdays(rule.match(/BYDAY=([^;\n]+)/)?.[1]?.split(',') ?? [])
    }

    setResourceDraft(emptyResourceDraft())
    setError('')
  }, [event, initialStart, open])

  const selectedWeekdays = useMemo(
    () => weekdays.map(code => dayOptions.find(day => day[0] === code)?.[2]).filter(Boolean) as Weekday[],
    [weekdays],
  )

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!user) return

    setBusy(true)
    setError('')

    const startAt = combineDateAndTime(date, start)
    const endAt = combineDateAndTime(date, end)

    if (endAt <= startAt) {
      setError('O horário final precisa ser depois do inicial.')
      setBusy(false)
      return
    }

    let rrule: string | null = null
    if (repeat !== 'none') {
      // RRULE must use the local wall-clock fields as a floating UTC date.
      // Using the real UTC instant can move late-night events to the next UTC day
      // and make BYDAY disagree with the date selected by the user.
      const recurrenceStart = new Date(Date.UTC(
        startAt.getFullYear(),
        startAt.getMonth(),
        startAt.getDate(),
        startAt.getHours(),
        startAt.getMinutes(),
        startAt.getSeconds(),
        startAt.getMilliseconds(),
      ))
      const options: ConstructorParameters<typeof RRule>[0] = { dtstart: recurrenceStart }
      if (repeat === 'daily') options.freq = RRule.DAILY
      if (repeat === 'monthly') options.freq = RRule.MONTHLY
      if (repeat === 'weekly') {
        options.freq = RRule.WEEKLY
        options.byweekday = selectedWeekdays.length ? selectedWeekdays : [dayOptions[(startAt.getDay() + 6) % 7][2]]
      }
      rrule = new RRule(options).toString()
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      color,
      rrule,
    }

    let createdId: string | null = null

    try {
      const eventId = event?.id ?? await (async () => {
        const { data, error: insertError } = await supabase.from('events').insert(payload).select('id').single()
        if (insertError || !data) throw insertError ?? new Error('Não foi possível criar o compromisso.')
        createdId = data.id
        return data.id as string
      })()

      if (event) {
        const { error: updateError } = await supabase.from('events').update(payload).eq('id', event.id)
        if (updateError) throw updateError
      }

      await persistResources({
        ownerType: 'event',
        ownerId: eventId,
        userId: user.id,
        existing: event?.resources ?? [],
        draft: resourceDraft,
      })

      onSaved()
      onClose()
    } catch (caught) {
      if (createdId) await supabase.from('events').delete().eq('id', createdId)
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!event || !confirm('Excluir este compromisso? Se for recorrente, toda a série será excluída.')) return
    setBusy(true)
    const { error: dbError } = await supabase.from('events').delete().eq('id', event.id)
    if (dbError) setError(dbError.message)
    else {
      await removeResourceFiles(event.resources ?? [])
      onSaved()
      onClose()
    }
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={event ? 'Editar compromisso' : 'Novo compromisso'} maxWidth="max-w-2xl">
      <form onSubmit={save} className="grid gap-4">
        <div className="field">
          <label>Título</label>
          <input className="input" value={title} onChange={event => setTitle(event.target.value)} required placeholder="Ex.: Faculdade" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field col-span-2">
            <label>Data inicial</label>
            <input className="input" type="date" value={date} onChange={event => setDate(event.target.value)} required />
          </div>
          <div className="field">
            <label>Início</label>
            <input className="input" type="time" value={start} onChange={event => setStart(event.target.value)} required />
          </div>
          <div className="field">
            <label>Fim</label>
            <input className="input" type="time" value={end} onChange={event => setEnd(event.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_100px] gap-3">
          <div className="field">
            <label>Repetição</label>
            <select className="select" value={repeat} onChange={event => setRepeat(event.target.value as typeof repeat)}>
              <option value="none">Não repetir</option>
              <option value="daily">Todos os dias</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
          <div className="field">
            <label>Cor</label>
            <input className="input h-[43px] p-1" type="color" value={color} onChange={event => setColor(event.target.value)} />
          </div>
        </div>

        {repeat === 'weekly' && (
          <div className="field">
            <label>Dias da semana</label>
            <div className="flex flex-wrap gap-2">
              {dayOptions.map(([code, label]) => (
                <button
                  type="button"
                  key={code}
                  onClick={() => setWeekdays(value => value.includes(code) ? value.filter(item => item !== code) : [...value, code])}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${weekdays.includes(code) ? 'border-brand bg-brand-soft text-brand' : 'surface border-line text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Observações</label>
          <textarea className="textarea" value={description} onChange={event => setDescription(event.target.value)} placeholder="Opcional" />
        </div>

        <ResourcesEditor existing={event?.resources ?? []} draft={resourceDraft} onChange={setResourceDraft} />

        {error && <p className="feedback feedback-error">{error}</p>}

        <div className="mt-1 flex items-center justify-between gap-3">
          {event ? (
            <button type="button" className="secondary-button text-danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={16} />
              Excluir
            </button>
          ) : <span />}
          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar compromisso'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
