import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Link2, Paperclip, Plus } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Reminder } from '@/types'
import ReminderModal from './ReminderModal'

export default function RemindersPanel() {
  const { user } = useAuth()
  const [items, setItems] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('reminders')
      .select('*, resources(*)')
      .order('completed')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20)

    if (!error) setItems((data ?? []) as Reminder[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`reminders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders', filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'resources', filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, load])

  const visible = useMemo(() => items.slice(0, 12), [items])
  const pending = items.filter(item => !item.completed).length

  async function toggle(reminder: Reminder) {
    await supabase
      .from('reminders')
      .update({
        completed: !reminder.completed,
        completed_at: reminder.completed ? null : new Date().toISOString(),
      })
      .eq('id', reminder.id)

    void load()
  }

  return (
    <div className="reminders-card card overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Pendências</p>
          <h2 className="mt-1 text-lg font-black text-ink">
            Lembretes <span className="ml-1 text-xs font-bold text-muted">{pending}</span>
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
          aria-label="Novo lembrete"
        >
          <Plus size={19} />
        </button>
      </header>

      <div className="reminders-list scrollbar-thin min-h-0 flex-1 overflow-y-auto border-t border-line px-3 py-2">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted">Sincronizando…</p>
        ) : visible.length === 0 ? (
          <div className="m-2 rounded-2xl border border-dashed border-line p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-success" />
            <p className="text-sm font-bold text-ink">Tudo em dia</p>
            <p className="mt-1 text-xs text-muted">Nenhum lembrete pendente.</p>
          </div>
        ) : (
          visible.map(reminder => {
            const due = reminder.due_at ? new Date(reminder.due_at) : null
            const late = due && !reminder.completed && isPast(due) && !isToday(due)
            const fileCount = (reminder.resources ?? []).filter(resource => resource.kind === 'file').length
            const linkCount = (reminder.resources ?? []).filter(resource => resource.kind === 'link').length

            return (
              <div
                key={reminder.id}
                onClick={() => {
                  setEditing(reminder)
                  setOpen(true)
                }}
                className="list-row flex cursor-pointer items-start gap-3 rounded-2xl p-2.5 transition"
              >
                <button
                  onClick={event => {
                    event.stopPropagation()
                    void toggle(reminder)
                  }}
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                    reminder.completed ? 'border-success bg-success text-white' : 'surface border-line text-transparent'
                  }`}
                  aria-label={reminder.completed ? 'Marcar como pendente' : 'Concluir lembrete'}
                >
                  <Check size={14} />
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-extrabold ${reminder.completed ? 'text-muted line-through' : 'text-ink'}`}>
                    {reminder.title}
                  </p>
                  <p className={`mt-1 text-[11px] font-semibold ${late ? 'text-danger' : 'text-muted'}`}>
                    {due
                      ? isToday(due)
                        ? `Hoje · ${format(due, 'HH:mm')}`
                        : format(due, "d 'de' MMM · HH:mm", { locale: ptBR })
                      : 'Sem prazo'}{' '}
                    · {reminder.priority === 'high' ? 'Alta' : reminder.priority === 'low' ? 'Baixa' : 'Média'}
                  </p>
                  {(fileCount > 0 || linkCount > 0) && (
                    <p className="mt-1 flex items-center gap-2 text-[10px] font-bold text-muted">
                      {fileCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={10} />{fileCount}</span>}
                      {linkCount > 0 && <span className="inline-flex items-center gap-1"><Link2 size={10} />{linkCount}</span>}
                    </p>
                  )}
                </div>

                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                  reminder.priority === 'high' ? 'bg-danger' : reminder.priority === 'medium' ? 'bg-warning' : 'bg-[#9aa4b2]'
                }`} />
              </div>
            )
          })
        )}
      </div>

      <ReminderModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
        reminder={editing}
      />
    </div>
  )
}
