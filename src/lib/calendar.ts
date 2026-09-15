import { addDays, endOfDay, isBefore, isSameDay, startOfDay } from 'date-fns'
import { RRule } from 'rrule'
import type { AgendaEvent, EventInstance } from '@/types'

/**
 * rrule works internally with UTC-like dates. For calendar UIs we want recurrence
 * to preserve the user's wall-clock time (e.g. Monday 21:30 must stay Monday
 * 21:30 in Brazil instead of crossing to Tuesday because of the UTC offset).
 *
 * We therefore convert local date/time fields to a "floating UTC" date before
 * asking rrule for occurrences, then convert the result back to local time.
 */
function toFloatingUtc(date: Date) {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ))
}

function fromFloatingUtc(date: Date) {
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  )
}

function recurrenceRule(rrule: string, baseStart: Date) {
  // Older Orbia rows may contain a DTSTART generated from the real UTC instant.
  // That DTSTART can disagree with BYDAY for late-night events (21:00+ in UTC-3).
  // start_at is the canonical first occurrence, so we intentionally discard the
  // serialized DTSTART and rebuild it from start_at using floating local time.
  const ruleLine = rrule
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('RRULE:'))

  const ruleText = (ruleLine ?? rrule).replace(/^RRULE:/, '')
  const options = RRule.parseString(ruleText)
  options.dtstart = toFloatingUtc(baseStart)
  return new RRule(options)
}

export function expandEvents(events: AgendaEvent[], weekStart: Date): EventInstance[] {
  const rangeStart = startOfDay(weekStart)
  const rangeEnd = endOfDay(addDays(weekStart, 6))
  const floatingRangeStart = toFloatingUtc(rangeStart)
  const floatingRangeEnd = toFloatingUtc(rangeEnd)
  const out: EventInstance[] = []

  for (const event of events) {
    const baseStart = new Date(event.start_at)
    const baseEnd = new Date(event.end_at)
    const duration = Math.max(15 * 60_000, baseEnd.getTime() - baseStart.getTime())

    if (event.rrule) {
      try {
        const rule = recurrenceRule(event.rrule, baseStart)
        const occurrences = rule.between(floatingRangeStart, floatingRangeEnd, true)
        for (const occurrence of occurrences) {
          const start = fromFloatingUtc(occurrence)
          out.push({
            key: `${event.id}-${start.toISOString()}`,
            source: event,
            start,
            end: new Date(start.getTime() + duration),
          })
        }
      } catch (error) {
        console.error('RRULE inválida', event.rrule, error)
      }
    } else if (baseStart <= rangeEnd && baseEnd >= rangeStart) {
      out.push({ key: event.id, source: event, start: baseStart, end: baseEnd })
    }
  }

  return out
}

export function eventsForDay(instances: EventInstance[], day: Date) {
  return instances
    .filter(item => isSameDay(item.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export type PositionedEvent = EventInstance & { column: number; columns: number }

export function layoutOverlaps(items: EventInstance[]): PositionedEvent[] {
  if (!items.length) return []
  const sorted = [...items].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  )
  const result: PositionedEvent[] = []
  let cluster: EventInstance[] = []
  let clusterEnd: Date | null = null

  const flush = () => {
    if (!cluster.length) return
    const columnEnds: Date[] = []
    const assigned = cluster.map(item => {
      let col = columnEnds.findIndex(end => !isBefore(item.start, end))
      if (col === -1) {
        col = columnEnds.length
        columnEnds.push(item.end)
      } else {
        columnEnds[col] = item.end
      }
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

export function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}
