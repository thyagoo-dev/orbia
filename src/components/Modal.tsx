import { X } from 'lucide-react'
import { useEffect } from 'react'

export default function Modal({ open, title, onClose, children, maxWidth = 'max-w-lg' }: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#12182a]/35 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section className={`w-full ${maxWidth} max-h-[92vh] overflow-auto rounded-3xl border border-white/80 bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  )
}
