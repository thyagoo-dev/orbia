import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

const modalStack: string[] = []

function removeFromStack(id: string) {
  const index = modalStack.lastIndexOf(id)
  if (index >= 0) modalStack.splice(index, 1)
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = 'max-w-lg',
  layout = 'default',
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
  layout?: 'default' | 'workspace'
}) {
  const id = useId()
  const closeRef = useRef(onClose)
  const [layer, setLayer] = useState(0)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    removeFromStack(id)
    modalStack.push(id)
    setLayer(modalStack.length - 1)

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (modalStack.at(-1) !== id) return

      event.preventDefault()
      closeRef.current()
    }

    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      removeFromStack(id)
    }
  }, [id, open])

  if (!open) return null

  const closeIfTopmost = () => {
    if (modalStack.at(-1) !== id) return
    closeRef.current()
  }

  const panelSizing = layout === 'workspace'
    ? 'h-[calc(100dvh-2rem)] max-h-[47.5rem]'
    : 'max-h-[92dvh]'

  return (
    <div
      className="modal-backdrop fixed inset-0 grid place-items-center p-4 backdrop-blur-[2px]"
      style={{ zIndex: 50 + layer * 10 }}
      onMouseDown={closeIfTopmost}
      role="presentation"
    >
      <section
        className={`modal-panel flex w-full flex-col ${maxWidth} ${panelSizing} overflow-hidden rounded-3xl border shadow-2xl`}
        onMouseDown={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header z-10 flex shrink-0 items-center justify-between border-b px-5 py-4 backdrop-blur">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button className="icon-button" type="button" onClick={closeIfTopmost} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className={`min-h-0 overflow-y-auto p-5 ${layout === 'workspace' ? 'flex-1' : ''}`}>{children}</div>
      </section>
    </div>
  )
}
