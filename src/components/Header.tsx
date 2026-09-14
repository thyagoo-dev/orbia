import { LogOut, Orbit } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthContext'

export default function Header() {
  const { user, signOut } = useAuth()
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Você'
  return (
    <header className="orbia-header mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20"><Orbit size={23}/></div>
        <div>
          <div className="flex items-baseline gap-2"><h1 className="text-xl font-black tracking-tight text-ink">Orbia</h1><span className="hidden text-xs font-semibold text-muted sm:inline">beta pessoal</span></div>
          <p className="text-xs text-muted">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block"><p className="text-sm font-bold text-ink">{name}</p><p className="max-w-52 truncate text-xs text-muted">{user?.email}</p></div>
        <button className="icon-button" onClick={() => void signOut()} aria-label="Sair" title="Sair"><LogOut size={17}/></button>
      </div>
    </header>
  )
}
