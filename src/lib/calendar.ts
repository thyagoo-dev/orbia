import { addDays, endOfDay, isBefore, isSameDay, startOfDay } from 'date-fns'
import { rrulestr } from 'rrule'
import type { AgendaEvent, EventInstance } from '@/types'

export function expandEvents(events: AgendaEvent[], weekStart: Date): EventInstance[] {
  const rangeStart = startOfDay(weekStart)
  const rangeEnd = endOfDay(addDays(weekStart, 6))
  const out: EventInstance[] = []

  for (const event of events) {
    const baseStart = new Date(event.start_at)
    const baseEnd = new Date(event.end_at)
    const duration = Math.max(15 * 60_000, baseEnd.getTime() - baseStart.getTime())

    if (event.rrule) {
      try {
        const rule = rrulestr(event.rrule)
        const occurrences = rule.between(rangeStart, rangeEnd, true)
        for (const start of occurrences) {
          out.push({ key: `${event.id}-${start.toISOString()}`, source: event, start, end: new Date(start.getTime() + duration) })
        }
      } catch (err) {
        console.error('RRULE inválida', event.rrule, err)
      }
    } else if (baseStart <= rangeEnd && baseEnd >= rangeStart) {
      out.push({ key: event.id, source: event, start: baseStart, end: baseEnd })
    }
  }
  return out
}

export function eventsForDay(instances: EventInstance[], day: Date) {
  return instances.filter((item) => isSameDay(item.start, day)).sort((a,b) => a.start.getTime() - b.start.getTime())
}

export type PositionedEvent = EventInstance & { column: number; columns: number }

export function layoutOverlaps(items: EventInstance[]): PositionedEvent[] {
  if (!items.length) return []
  const sorted = [...items].sort((a,b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
  const result: PositionedEvent[] = []
  let cluster: EventInstance[] = []
  let clusterEnd: Date | null = null

  const flush = () => {
    if (!cluster.length) return
    const columnEnds: Date[] = []
    const assigned = cluster.map((item) => {
      let col = columnEnds.findIndex((end) => !isBefore(item.start, end))
      if (col === -1) { col = columnEnds.length; columnEnds.push(item.end) }
      else columnEnds[col] = item.end
      return { item, col }
    })
    const columns = Math.max(1, columnEnds.length)
    result.push(...assigned.map(({ item, col }) => ({ ...item, column: col, columns })))
    cluster = []
    clusterEnd = null
  }

  for (const item of sorted) {
    if (clusterEnd && !isBefore(item.start, clusterEnd)) flush()
    cluster.push(item)
    if (!clusterEnd || item.end > clusterEnd) clusterEnd = item.end
  }
  flush()
  return result
}

export function minutesOfDay(date: Date) { return date.getHours() * 60 + date.getMinutes() }
