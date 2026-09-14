import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { emptyResourceDraft, persistResources, removeResourceFiles, type ResourceDraft } from '@/lib/resources'
import ResourcesEditor from '@/features/resources/ResourcesEditor'
import type { Reminder } from '@/types'

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Não foi possível salvar o lembrete.'
}

export default function ReminderModal({
  open,
  onClose,
  onSaved,
  reminder,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  reminder?: Reminder | null
}) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>(emptyResourceDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(reminder?.title ?? '')
    setNote(reminder?.note ?? '')
    if (reminder?.due_at) {
      const due = new Date(reminder.due_at)
      setDate(format(due, 'yyyy-MM-dd'))
      setTime(format(due, 'HH:mm'))
    } else {
      setDate('')
      setTime('')
    }
    setPriority(reminder?.priority ?? 'medium')
    setResourceDraft(emptyResourceDraft())
    setError('')
  }, [reminder, open])

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!user) return

    setBusy(true)
    setError('')
    const due = date ? new Date(`${date}T${time || '23:59'}:00`).toISOString() : null
    const payload = { title: title.trim(), note: note.trim() || null, due_at: due, priority }
    let createdId: string | null = null

    try {
      const reminderId = reminder?.id ?? await (async () => {
        const { data, error: insertError } = await supabase.from('reminders').insert(payload).select('id').single()
        if (insertError || !data) throw insertError ?? new Error('Não foi possível criar o lembrete.')
        createdId = data.id
        return data.id as string
      })()

      if (reminder) {
        const { error: updateError } = await supabase.from('reminders').update(payload).eq('id', reminder.id)
        if (updateError) throw updateError
      }

      await persistResources({
        ownerType: 'reminder',
        ownerId: reminderId,
        userId: user.id,
        existing: reminder?.resources ?? [],
        draft: resourceDraft,
      })

      onSaved()
      onClose()
    } catch (caught) {
      if (createdId) await supabase.from('reminders').delete().eq('id', createdId)
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!reminder || !confirm('Excluir este lembrete?')) return
    setBusy(true)
    const { error: removeError } = await supabase.from('reminders').delete().eq('id', reminder.id)
    if (removeError) setError(removeError.message)
    else {
      await removeResourceFiles(reminder.resources ?? [])
      onSaved()
      onClose()
    }
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={reminder ? 'Editar lembrete' : 'Novo lembrete'} maxWidth="max-w-2xl">
      <form className="grid gap-4" onSubmit={save}>
        <div className="field">
          <label>Título</label>
          <input className="input" value={title} onChange={event => setTitle(event.target.value)} required placeholder="Ex.: Entregar atividade" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label>Data limite</label>
            <input className="input" type="date" value={date} onChange={event => setDate(event.target.value)} />
          </div>
          <div className="field">
            <label>Horário</label>
            <input className="input" type="time" value={time} onChange={event => setTime(event.target.value)} disabled={!date} />
          </div>
        </div>

        <div className="field">
          <label>Prioridade</label>
          <select className="select" value={priority} onChange={event => setPriority(event.target.value as typeof priority)}>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </div>

        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={note} onChange={event => setNote(event.target.value)} />
        </div>

        <ResourcesEditor existing={reminder?.resources ?? []} draft={resourceDraft} onChange={setResourceDraft} />

        {error && <p className="feedback feedback-error">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {reminder ? (
            <button className="secondary-button text-danger" type="button" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={16} />
              Excluir
            </button>
          ) : <span />}
          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar lembrete'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
