import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Repeat2,
  Search,
} from 'lucide-react'
import { differenceInMinutes, format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { openResource } from '@/lib/resources'
import { supabase } from '@/lib/supabase'
import type { AgendaEvent, Resource } from '@/types'

type Tab = 'events' | 'recurrences' | 'resources'
type PeriodFilter = 'all' | 'upcoming' | 'past'
type ResourceRow = { event: AgendaEvent; resource: Resource }

const weekdayLabels: Record<string, string> = {
  MO: 'Seg',
  TU: 'Ter',
  WE: 'Qua',
  TH: 'Qui',
  FR: 'Sex',
  SA: 'Sáb',
  SU: 'Dom',
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1)
}

function eventDateLabel(event: AgendaEvent) {
  const start = new Date(event.start_at)
  if (isSameDay(start, new Date())) return 'Hoje'
  return capitalize(format(start, "EEE, dd 'de' MMM. 'de' yyyy", { locale: ptBR }))
}

function eventTimeLabel(event: AgendaEvent) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  return `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
}

function durationLabel(event: AgendaEvent) {
  const minutes = Math.max(0, differenceInMinutes(new Date(event.end_at), new Date(event.start_at)))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}min` : `${hours}h`
}

function recurrenceLabel(rrule: string | null) {
  if (!rrule) return 'Não recorrente'
  if (rrule.includes('FREQ=DAILY')) return 'Diariamente'
  if (rrule.includes('FREQ=MONTHLY')) return 'Mensalmente'
  if (rrule.includes('FREQ=WEEKLY')) {
    const days = rrule.match(/BYDAY=([^;\n]+)/)?.[1]
      ?.split(',')
      .map(code => weekdayLabels[code] ?? code)
      .join(', ')
    return days ? `Semanal · ${days}` : 'Semanalmente'
  }
  return 'Recorrente'
}

function eventStatus(event: AgendaEvent, now: Date) {
  if (event.rrule) return { label: 'Recorrente', className: 'status-paid' }
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  if (start <= now && end >= now) return { label: 'Em andamento', className: 'status-paid' }
  if (end < now) return { label: 'Encerrado', className: 'surface-muted text-muted' }
  return { label: 'Futuro', className: 'status-pending' }
}

function matchesSearch(event: AgendaEvent, query: string) {
  if (!query) return true
  const resources = (event.resources ?? [])
    .map(resource => `${resource.label ?? ''} ${resource.file_name ?? ''} ${resource.url ?? ''}`)
    .join(' ')
  return `${event.title} ${event.description ?? ''} ${resources}`
    .toLocaleLowerCase('pt-BR')
    .includes(query)
}

export default function AgendaCentralModal({
  open,
  onClose,
  onCreate,
  onEdit,
  refreshKey = 0,
}: {
  open: boolean
  onClose: () => void
  onCreate: () => void
  onEdit: (event: AgendaEvent) => void
  refreshKey?: number
}) {
  const { user } = useAuth()
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('events')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('upcoming')
  const [search, setSearch] = useState('')
  const [resourceError, setResourceError] = useState('')

  const load = useCallback(async () => {
    if (!user || !open) return
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*, resources(*)')
      .order('start_at', { ascending: true })

    if (!error) setEvents((data ?? []) as AgendaEvent[])
    setLoading(false)
  }, [open, refreshKey, user])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open || !user) return
    const channel = supabase
      .channel(`agenda-central-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${user.id}` },
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
  }, [load, open, user])

  const query = search.trim().toLocaleLowerCase('pt-BR')
  const now = new Date()

  const recurringEvents = useMemo(() => events.filter(event => !!event.rrule), [events])
  const resourceRows = useMemo<ResourceRow[]>(
    () => events.flatMap(event => (event.resources ?? []).map(resource => ({ event, resource }))),
    [events],
  )

  const filteredEvents = useMemo(() => {
    const rows = events.filter(event => {
      if (!matchesSearch(event, query)) return false
      if (periodFilter === 'all') return true
      if (periodFilter === 'past') return !event.rrule && new Date(event.end_at) < now
      return !!event.rrule || new Date(event.end_at) >= now
    })

    return rows.slice().sort((a, b) => {
      const aPast = !a.rrule && new Date(a.end_at) < now
      const bPast = !b.rrule && new Date(b.end_at) < now
      if (aPast !== bPast) return aPast ? 1 : -1
      return aPast
        ? new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
        : new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    })
  }, [events, now, periodFilter, query])

  const filteredRecurring = useMemo(
    () => recurringEvents
      .filter(event => matchesSearch(event, query))
      .slice()
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [query, recurringEvents],
  )

  const filteredResources = useMemo(
    () => resourceRows.filter(({ event, resource }) => {
      if (!query) return true
      return `${event.title} ${resource.label ?? ''} ${resource.file_name ?? ''} ${resource.url ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(query)
    }),
    [query, resourceRows],
  )

  async function handleOpenResource(resource: Resource) {
    setResourceError('')
    try {
      await openResource(resource)
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : 'Não foi possível abrir este recurso.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Central da agenda" maxWidth="max-w-6xl" layout="workspace">
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted">
              <CalendarDays size={16} />
              <span className="text-xs font-bold">Compromissos</span>
            </div>
            <p className="mt-2 text-2xl font-black text-ink">{events.length}</p>
          </div>
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted">
              <Repeat2 size={16} />
              <span className="text-xs font-bold">Recorrentes</span>
            </div>
            <p className="mt-2 text-2xl font-black text-brand">{recurringEvents.length}</p>
          </div>
          <div className="metric-card rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-muted">
              <Paperclip size={16} />
              <span className="text-xs font-bold">Recursos</span>
            </div>
            <p className="mt-2 text-2xl font-black text-ink">{resourceRows.length}</p>
          </div>
        </div>

        <div className="grid gap-3">
          <div
            className="segmented-control grid w-full grid-cols-3 rounded-xl p-1"
            role="tablist"
            aria-label="Seções da Central da agenda"
          >
            {([
              ['events', 'Compromissos'],
              ['recurrences', 'Recorrências'],
              ['resources', 'Recursos'],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={`min-w-0 whitespace-nowrap rounded-lg px-2 py-2.5 text-[11px] font-extrabold transition sm:px-4 sm:text-xs ${tab === value ? 'segmented-active text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`flex flex-col gap-2 lg:flex-row lg:items-center ${tab === 'events' ? 'lg:justify-between' : 'lg:justify-end'}`}>
            {tab === 'events' && (
              <div className="segmented-control grid w-full grid-cols-3 rounded-xl p-1 sm:w-auto sm:min-w-[270px]">
                {([
                  ['upcoming', 'Próximos'],
                  ['past', 'Encerrados'],
                  ['all', 'Todos'],
                ] as const).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`min-w-0 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-extrabold transition ${periodFilter === value ? 'segmented-active text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                    onClick={() => setPeriodFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <label className="search-field flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2 sm:w-72 sm:flex-none">
                <Search size={15} className="shrink-0 text-muted" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar na agenda"
                />
              </label>
              <button type="button" className="primary-button shrink-0 justify-center" onClick={onCreate}>
                <Plus size={16} />
                <span>Novo</span>
              </button>
            </div>
          </div>
        </div>

        {resourceError && <p className="feedback feedback-error">{resourceError}</p>}

        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Sincronizando agenda…</p>
        ) : tab === 'events' ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="hidden grid-cols-[1.35fr_.95fr_.65fr_.7fr_.75fr_auto] gap-3 border-b border-line px-4 py-3 text-[11px] font-black uppercase tracking-wide text-muted md:grid">
              <span>Compromisso</span>
              <span>Data</span>
              <span>Horário</span>
              <span>Duração</span>
              <span>Status</span>
              <span>Ações</span>
            </div>
            <div className="divide-y divide-line">
              {filteredEvents.map(event => {
                const status = eventStatus(event, now)
                const fileCount = (event.resources ?? []).filter(resource => resource.kind === 'file').length
                const linkCount = (event.resources ?? []).filter(resource => resource.kind === 'link').length
                return (
                  <div key={event.id} className="grid gap-3 px-4 py-3 transition hover:bg-[var(--orbia-surface-muted)] md:grid-cols-[1.35fr_.95fr_.65fr_.7fr_.75fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
                        <p className="truncate text-sm font-extrabold text-ink">{event.title}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px] text-[10px] text-muted">
                        {event.description && <span className="max-w-[300px] truncate">{event.description}</span>}
                        {fileCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={10} />{fileCount}</span>}
                        {linkCount > 0 && <span className="inline-flex items-center gap-1"><Link2 size={10} />{linkCount}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-ink">{eventDateLabel(event)}</p>
                    <p className="text-xs font-bold text-ink">{eventTimeLabel(event)}</p>
                    <p className="text-xs text-muted">{durationLabel(event)}</p>
                    <div>
                      <span className={`status-pill ${status.className}`}>{status.label}</span>
                    </div>
                    <button className="icon-button h-9 w-9" type="button" onClick={() => onEdit(event)} title="Editar compromisso">
                      <Pencil size={15} />
                    </button>
                  </div>
                )
              })}
              {filteredEvents.length === 0 && (
                <p className="py-12 text-center text-sm text-muted">Nenhum compromisso encontrado.</p>
              )}
            </div>
          </div>
        ) : tab === 'recurrences' ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredRecurring.map(event => (
              <article key={event.id} className="metric-card rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
                      <p className="truncate text-sm font-black text-ink">{event.title}</p>
                    </div>
                    <p className="mt-1 pl-[18px] text-xs font-bold text-brand">{recurrenceLabel(event.rrule)}</p>
                  </div>
                  <button className="icon-button h-9 w-9" type="button" onClick={() => onEdit(event)} title="Editar série">
                    <Pencil size={15} />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="surface-muted rounded-xl p-3">
                    <p className="font-bold text-muted">Início da série</p>
                    <p className="mt-1 font-black text-ink">{format(new Date(event.start_at), 'dd/MM/yyyy')}</p>
                  </div>
                  <div className="surface-muted rounded-xl p-3">
                    <p className="font-bold text-muted">Horário</p>
                    <p className="mt-1 font-black text-ink">{eventTimeLabel(event)}</p>
                  </div>
                </div>
                {event.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">{event.description}</p>}
              </article>
            ))}
            {filteredRecurring.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted">Nenhuma recorrência encontrada.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredResources.map(({ event, resource }) => {
              const isFile = resource.kind === 'file'
              const title = resource.label || resource.file_name || resource.url || (isFile ? 'Arquivo' : 'Link')
              return (
                <article key={resource.id} className="metric-card flex items-center gap-3 rounded-2xl border border-line p-4">
                  <button
                    type="button"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition hover:scale-[1.03]"
                    onClick={() => void handleOpenResource(resource)}
                    title={isFile ? 'Abrir arquivo' : 'Abrir link'}
                  >
                    {isFile ? <FileText size={19} /> : <Link2 size={19} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-ink">{title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{event.title} · {isFile ? 'Arquivo' : 'Link'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className="icon-button h-9 w-9" type="button" onClick={() => void handleOpenResource(resource)} title="Abrir recurso">
                      <ExternalLink size={15} />
                    </button>
                    <button className="icon-button h-9 w-9" type="button" onClick={() => onEdit(event)} title="Editar compromisso">
                      <Pencil size={15} />
                    </button>
                  </div>
                </article>
              )
            })}
            {filteredResources.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted">Nenhum recurso encontrado.</p>
            )}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="surface-muted rounded-2xl border border-dashed border-line p-8 text-center">
            <Clock3 className="mx-auto text-muted" size={24} />
            <p className="mt-3 text-sm font-black text-ink">Sua agenda ainda está vazia</p>
            <p className="mt-1 text-xs text-muted">Crie o primeiro compromisso para começar a organizar sua rotina.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
