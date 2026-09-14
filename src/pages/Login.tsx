import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, Moon, Orbit, ReceiptText, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

type MessageType = 'error' | 'success' | 'info'

export default function Login() {
  const { user, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<MessageType>('info')

  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

  useEffect(() => {
    setMessage('')
  }, [mode])

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')

    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: appUrl },
          })

    if (result.error) {
      setMessageType('error')
      setMessage(result.error.message)
    } else if (mode === 'signup' && !result.data.session) {
      setMessageType('success')
      setMessage('Conta criada. Confira seu e-mail para confirmar o cadastro.')
    }

    setBusy(false)
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl },
    })
  }

  return (
    <main className="relative min-h-screen bg-app p-4 sm:p-6">
      <button
        type="button"
        className="icon-button absolute right-5 top-5 z-20"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[30px] border border-line bg-white shadow-2xl shadow-[#172033]/10 lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden bg-[#181b2f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand">
              <Orbit />
            </div>
            <span className="text-xl font-black">Orbia</span>
          </div>

          <div className="max-w-lg">
            <p className="mb-4 text-sm font-bold uppercase tracking-[.2em] text-[#b9b5ff]">
              Seu painel pessoal
            </p>
            <h1 className="text-5xl font-black leading-[1.03] tracking-tight">
              Organize a semana sem espalhar sua vida em cinco apps.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#c7cad8]">
              Agenda, contas e lembretes sincronizados entre seus dispositivos.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              [CalendarDays, 'Agenda'],
              [ReceiptText, 'Contas'],
              [CheckCircle2, 'Lembretes'],
            ].map(([Icon, label]) => {
              const C = Icon as typeof CalendarDays
              return (
                <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <C size={20} />
                  <p className="mt-3 text-sm font-bold">{String(label)}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="grid place-items-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">
                <Orbit size={21} />
              </div>
              <span className="text-xl font-black">Orbia</span>
            </div>

            <p className="text-sm font-bold text-brand">
              {mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu espaço'}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-ink">
              {mode === 'login' ? 'Entre na sua conta' : 'Comece agora'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Seus dados ficam vinculados à sua conta e sincronizam em qualquer dispositivo.
            </p>

            <form onSubmit={submit} className="mt-7 grid gap-4">
              <div className="field">
                <label>E-mail</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label>Senha</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {message && <p className={`feedback feedback-${messageType}`}>{message}</p>}

              <button className="primary-button mt-1" disabled={busy}>
                {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>

            <button className="secondary-button w-full" onClick={() => void google()}>
              Continuar com Google
            </button>

            <p className="mt-6 text-center text-sm text-muted">
              {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
              <button
                className="font-bold text-brand"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login' ? 'Criar conta' : 'Entrar'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
