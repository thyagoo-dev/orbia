import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  isSameWeek,
  startOfWeek,
  subWeeks,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Link2, ListTree, Paperclip, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { eventsForDay, expandEvents, layoutOverlaps, minutesOfDay } from '@/lib/calendar'
import type { AgendaEvent } from '@/types'
import EventModal from './EventModal'
import AgendaCentralModal from './AgendaCentralModal'

const DAY_START_HOUR = 0
const DAY_END_HOUR = 24
const DEFAULT_SCROLL_HOUR = 5
const HOUR_HEIGHT = 62
const colors = ['#635bff', '#0ea5a4', '#f59e0b', '#ec4899', '#3b82f6', '#16a34a']

export default function AgendaPanel() {
  const { user } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [centralOpen, setCentralOpen] = useState(false)
  const [centralRefreshKey, setCentralRefreshKey] = useState(0)
  const [editing, setEditing] = useState<AgendaEvent | null>(null)
  const [initialStart, setInitialStart] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())
  const agendaScrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const from = subWeeks(weekStart, 1).toISOString()
    const to = addWeeks(endOfWeek(weekStart, { weekStartsOn: 0 }), 1).toISOString()
    const { data, error } = await supabase
      .from('events')
      .select('*, resources(*)')
      .or(`rrule.not.is.null,and(start_at.lte.${to},end_at.gte.${from})`)
      .order('start_at')

    if (!error) setEvents((data ?? []) as AgendaEvent[])
    setLoading(false)
  }, [user, weekStart])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`events-${user.id}`)
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
  }, [user, load])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )
  const instances = useMemo(() => expandEvents(events, weekStart), [events, weekStart])
  const hours = useMemo(
    () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => DAY_START_HOUR + index),
    [],
  )
  const weekLabel = `${format(weekStart, "d 'de' MMM.", { locale: ptBR })} — ${format(
    addDays(weekStart, 6),
    "d 'de' MMM. 'de' yyyy",
    { locale: ptBR },
  )}`

  const showNow = isSameWeek(now, weekStart, { weekStartsOn: 0 })
  const nowTop = ((minutesOfDay(now) - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!agendaScrollRef.current) return
      agendaScrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - DAY_START_HOUR) * HOUR_HEIGHT
    })

    return () => window.cancelAnimationFrame(frame)
  }, [weekStart])

  function openNew(date?: Date) {
    setEditing(null)
    setInitialStart(date ?? null)
    setModal(true)
  }

  function clickDay(event: React.MouseEvent<HTMLDivElement>, day: Date) {
    if ((event.target as HTMLElement).closest('[data-event]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const rawMinutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15 + DAY_START_HOUR * 60
    const mins = Math.min(DAY_END_HOUR * 60 - 15, Math.max(DAY_START_HOUR * 60, rawMinutes))
    const date = new Date(day)
    date.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    openNew(date)
  }

  return (
    <div className="agenda-card card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <button type="button" className="group text-left" onClick={() => setCentralOpen(true)} title="Abrir central da agenda">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Sua semana</p>
          <span className="mt-1 flex items-center gap-2 text-xl font-black text-ink">
            Agenda
            <ListTree size={16} className="text-muted transition group-hover:text-brand" />
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            className="secondary-button hidden sm:inline-flex"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
          >
            Hoje
          </button>
          <button className="icon-button" onClick={() => setWeekStart(value => subWeeks(value, 1))} aria-label="Semana anterior">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setWeekStart(value => addWeeks(value, 1))} aria-label="Próxima semana">
            <ChevronRight size={18} />
          </button>
          <button className="primary-button" onClick={() => openNew()}>
            <Plus size={17} />
            <span className="hidden sm:inline">Compromisso</span>
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm font-bold text-ink">{weekLabel}</p>
        {loading && <span className="text-xs text-muted">Sincronizando…</span>}
      </div>

      <div ref={agendaScrollRef} className="agenda-scroll scrollbar-thin min-h-0 overflow-auto">
        <div className="min-w-[940px]">
          <div className="agenda-days-header sticky top-0 z-30 grid grid-cols-[72px_repeat(7,minmax(118px,1fr))] border-b border-line backdrop-blur">
            <div className="agenda-sticky-corner sticky left-0 z-40" />
            {days.map(day => {
              const today = isSameDay(day, now)
              return (
                <div key={day.toISOString()} className={`px-2 py-3 text-center ${today ? 'bg-brand-soft/60' : ''}`}>
                  <div className={`mx-auto grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${today ? 'bg-brand text-white' : 'text-ink'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                    {format(day, 'EEE', { locale: ptBR })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-[72px_repeat(7,minmax(118px,1fr))]">
            <div
              className="agenda-hours sticky left-0 z-20 border-r border-line"
              style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
            >
              {hours.slice(0, -1).map((hour, index) => (
                <div
                  key={hour}
                  className="absolute right-3 text-[11px] font-semibold text-muted"
                  style={{ top: index === 0 ? 6 : index * HOUR_HEIGHT - 7 }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {days.map(day => {
              const laid = layoutOverlaps(eventsForDay(instances, day))
              const isToday = isSameDay(day, now)
              return (
                <div
                  key={day.toISOString()}
                  onClick={event => clickDay(event, day)}
                  className={`agenda-day relative border-r border-line ${isToday ? 'agenda-day-today' : ''}`}
                  style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
                >
                  {hours.slice(0, -1).map((hour, index) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-line/80"
                      style={{ top: index * HOUR_HEIGHT }}
                    />
                  ))}

                  {showNow && isToday && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-[6] flex items-center"
                      style={{ top: nowTop }}
                      aria-hidden="true"
                    >
                      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-danger" />
                      <span className="h-px flex-1 bg-danger" />
                    </div>
                  )}

                  {laid.map(item => {
                    const startM = Math.max(DAY_START_HOUR * 60, minutesOfDay(item.start))
                    const endM = Math.min(DAY_END_HOUR * 60, minutesOfDay(item.end))
                    if (endM <= DAY_START_HOUR * 60 || startM >= DAY_END_HOUR * 60) return null

                    const top = ((startM - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT
                    const height = Math.max(24, ((endM - startM) / 60) * HOUR_HEIGHT)
                    const gap = 3
                    const width = `calc(${100 / item.columns}% - ${gap + 1}px)`
                    const left = `calc(${(100 / item.columns) * item.column}% + ${gap / 2}px)`
                    const color = item.source.color || colors[item.column % colors.length]
                    const fileCount = (item.source.resources ?? []).filter(resource => resource.kind === 'file').length
                    const linkCount = (item.source.resources ?? []).filter(resource => resource.kind === 'link').length

                    return (
                      <button
                        data-event
                        key={item.key}
                        onClick={event => {
                          event.stopPropagation()
                          setEditing(item.source)
                          setInitialStart(null)
                          setModal(true)
                        }}
                        className="absolute z-[2] overflow-hidden rounded-xl border px-2 py-1.5 text-left shadow-sm transition hover:z-10 hover:shadow-md"
                        style={{
                          top: top + 2,
                          height: height - 4,
                          left,
                          width,
                          background: `color-mix(in srgb, ${color} 10%, var(--orbia-card))`,
                          borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
                          color,
                        }}
                        title={`${item.source.title} • ${format(item.start, 'HH:mm')}–${format(item.end, 'HH:mm')}`}
                      >
                        <p className="truncate text-[11px] font-black">{item.source.title}</p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold opacity-75">
                          {format(item.start, 'HH:mm')}–{format(item.end, 'HH:mm')}
                        </p>
                        {(fileCount > 0 || linkCount > 0) && (
                          <span className="mt-1 flex items-center gap-2 text-[9px] font-bold opacity-75">
                            {fileCount > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={9} />{fileCount}</span>}
                            {linkCount > 0 && <span className="inline-flex items-center gap-0.5"><Link2 size={9} />{linkCount}</span>}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <AgendaCentralModal
        open={centralOpen}
        onClose={() => setCentralOpen(false)}
        onCreate={() => openNew()}
        onEdit={event => {
          setEditing(event)
          setInitialStart(null)
          setModal(true)
        }}
        refreshKey={centralRefreshKey}
      />

      <EventModal
        open={modal}
        onClose={() => setModal(false)}
        onSaved={() => {
          void load()
          setCentralRefreshKey(value => value + 1)
        }}
        event={editing}
        initialStart={initialStart}
      />
    </div>
  )
}
