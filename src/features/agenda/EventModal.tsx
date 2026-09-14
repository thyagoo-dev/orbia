import { useEffect, useMemo, useState } from 'react'
import { RRule, Weekday } from 'rrule'
import { Trash2 } from 'lucide-react'
import { combineDateAndTime } from './helpers'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { toDateInput, toTimeInput } from '@/lib/format'
import type { AgendaEvent } from '@/types'

type Props = { open: boolean; onClose: () => void; onSaved: () => void; event?: AgendaEvent | null; initialStart?: Date | null }
const dayOptions = [
  ['MO','Seg',RRule.MO],['TU','Ter',RRule.TU],['WE','Qua',RRule.WE],['TH','Qui',RRule.TH],['FR','Sex',RRule.FR],['SA','Sáb',RRule.SA],['SU','Dom',RRule.SU],
] as const

export default function EventModal({ open, onClose, onSaved, event, initialStart }: Props) {
  const fallback = initialStart ?? new Date()
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [date,setDate]=useState(toDateInput(fallback))
  const [start,setStart]=useState(toTimeInput(fallback))
  const [end,setEnd]=useState(toTimeInput(new Date(fallback.getTime()+60*60_000)))
  const [color,setColor]=useState('#635bff')
  const [repeat,setRepeat]=useState<'none'|'daily'|'weekly'|'monthly'>('none')
  const [weekdays,setWeekdays]=useState<string[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    const base = event ? new Date(event.start_at) : (initialStart ?? new Date())
    setTitle(event?.title ?? '')
    setDescription(event?.description ?? '')
    setDate(toDateInput(base)); setStart(toTimeInput(base)); setEnd(toTimeInput(event ? new Date(event.end_at) : new Date(base.getTime()+60*60_000)))
    setColor(event?.color ?? '#635bff')
    if (!event?.rrule) { setRepeat('none'); setWeekdays([]) }
    else {
      const rule = event.rrule
      setRepeat(rule.includes('FREQ=DAILY') ? 'daily' : rule.includes('FREQ=MONTHLY') ? 'monthly' : 'weekly')
      const by = rule.match(/BYDAY=([^;\n]+)/)?.[1]?.split(',') ?? []
      setWeekdays(by)
    }
    setError('')
  },[event,initialStart,open])

  const selectedWeekdays = useMemo(() => weekdays.map(code => dayOptions.find(d=>d[0]===code)?.[2]).filter(Boolean) as Weekday[], [weekdays])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const startAt = combineDateAndTime(date,start)
    const endAt = combineDateAndTime(date,end)
    if (endAt <= startAt) { setError('O horário final precisa ser depois do inicial.'); setBusy(false); return }
    let rrule: string | null = null
    if (repeat !== 'none') {
      const options: ConstructorParameters<typeof RRule>[0] = { dtstart: startAt }
      if (repeat==='daily') options.freq = RRule.DAILY
      if (repeat==='monthly') options.freq = RRule.MONTHLY
      if (repeat==='weekly') { options.freq=RRule.WEEKLY; options.byweekday = selectedWeekdays.length ? selectedWeekdays : [dayOptions[(startAt.getDay()+6)%7][2]] }
      rrule = new RRule(options).toString()
    }
    const payload = { title: title.trim(), description: description.trim() || null, start_at: startAt.toISOString(), end_at: endAt.toISOString(), color, rrule }
    const { error: dbError } = event
      ? await supabase.from('events').update(payload).eq('id',event.id)
      : await supabase.from('events').insert(payload)
    if (dbError) setError(dbError.message)
    else { onSaved(); onClose() }
    setBusy(false)
  }

  async function remove() {
    if (!event || !confirm('Excluir este compromisso? Se for recorrente, toda a série será excluída.')) return
    setBusy(true)
    const { error: dbError } = await supabase.from('events').delete().eq('id',event.id)
    if (dbError) setError(dbError.message); else { onSaved(); onClose() }
    setBusy(false)
  }

  return <Modal open={open} onClose={onClose} title={event ? 'Editar compromisso' : 'Novo compromisso'}>
    <form onSubmit={save} className="grid gap-4">
      <div className="field"><label>Título</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Faculdade" autoFocus/></div>
      <div className="grid grid-cols-2 gap-3"><div className="field col-span-2"><label>Data inicial</label><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div><div className="field"><label>Início</label><input className="input" type="time" value={start} onChange={e=>setStart(e.target.value)} required/></div><div className="field"><label>Fim</label><input className="input" type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></div></div>
      <div className="grid grid-cols-[1fr_100px] gap-3"><div className="field"><label>Repetição</label><select className="select" value={repeat} onChange={e=>setRepeat(e.target.value as typeof repeat)}><option value="none">Não repetir</option><option value="daily">Todos os dias</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></div><div className="field"><label>Cor</label><input className="input h-[43px] p-1" type="color" value={color} onChange={e=>setColor(e.target.value)}/></div></div>
      {repeat==='weekly' && <div className="field"><label>Dias da semana</label><div className="flex flex-wrap gap-2">{dayOptions.map(([code,label])=><button type="button" key={code} onClick={()=>setWeekdays(v=>v.includes(code)?v.filter(x=>x!==code):[...v,code])} className={`rounded-xl border px-3 py-2 text-xs font-bold ${weekdays.includes(code)?'border-brand bg-brand-soft text-brand':'border-line bg-white text-muted'}`}>{label}</button>)}</div></div>}
      <div className="field"><label>Observações</label><textarea className="textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Opcional"/></div>
      {error && <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-1 flex items-center justify-between gap-3">{event ? <button type="button" className="secondary-button text-danger" onClick={()=>void remove()} disabled={busy}><Trash2 size={16}/>Excluir</button>:<span/>}<button className="primary-button" disabled={busy}>{busy?'Salvando…':'Salvar compromisso'}</button></div>
    </form>
  </Modal>
}
