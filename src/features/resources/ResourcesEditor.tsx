import { FilePlus2, Link2, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { openResource, type ResourceDraft } from '@/lib/resources'
import type { Resource } from '@/types'

export default function ResourcesEditor({
  existing,
  draft,
  onChange,
}: {
  existing: Resource[]
  draft: ResourceDraft
  onChange: (value: ResourceDraft) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const visibleExisting = existing.filter(item => !draft.deletedIds.includes(item.id))

  function addLink() {
    onChange({
      ...draft,
      links: [...draft.links, { clientId: crypto.randomUUID(), label: '', url: '' }],
    })
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    onChange({ ...draft, files: [...draft.files, ...Array.from(files)] })
  }

  async function openExisting(resource: Resource) {
    try {
      await openResource(resource)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir este recurso.'
      alert(message)
    }
  }

  return (
    <div className="resource-editor rounded-2xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-ink">Anexos e links</p>
          <p className="mt-1 text-xs text-muted">Centralize materiais, documentos e referências relacionados.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="icon-button" onClick={addLink} title="Adicionar link" aria-label="Adicionar link">
            <Link2 size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => input.current?.click()} title="Adicionar arquivo" aria-label="Adicionar arquivo">
            <FilePlus2 size={16} />
          </button>
        </div>
      </div>

      <input
        ref={input}
        className="hidden"
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
        onChange={event => {
          addFiles(event.target.files)
          event.currentTarget.value = ''
        }}
      />

      {visibleExisting.length > 0 && (
        <div className="mt-4 grid gap-2">
          {visibleExisting.map(resource => (
            <div key={resource.id} className="resource-row flex items-center gap-3 rounded-xl border border-line p-3">
              {resource.kind === 'link' ? <Link2 size={16} className="shrink-0 text-brand" /> : <Paperclip size={16} className="shrink-0 text-brand" />}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs font-bold text-ink hover:text-brand"
                onClick={() => void openExisting(resource)}
              >
                {resource.label || resource.file_name || resource.url || 'Recurso'}
              </button>
              <button
                type="button"
                className="icon-button h-8 w-8 text-danger"
                onClick={() => onChange({ ...draft, deletedIds: [...draft.deletedIds, resource.id] })}
                aria-label="Remover recurso"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {draft.links.length > 0 && (
        <div className="mt-4 grid gap-3">
          {draft.links.map((link, index) => (
            <div key={link.clientId} className="resource-draft grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[.8fr_1.4fr_auto]">
              <input
                className="input"
                value={link.label}
                onChange={event => {
                  const links = draft.links.slice()
                  links[index] = { ...link, label: event.target.value }
                  onChange({ ...draft, links })
                }}
                placeholder="Nome do link"
              />
              <input
                className="input"
                value={link.url}
                onChange={event => {
                  const links = draft.links.slice()
                  links[index] = { ...link, url: event.target.value }
                  onChange({ ...draft, links })
                }}
                placeholder="https://..."
                inputMode="url"
              />
              <button
                type="button"
                className="icon-button text-danger"
                onClick={() => onChange({ ...draft, links: draft.links.filter(item => item.clientId !== link.clientId) })}
                aria-label="Remover link"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {draft.files.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {draft.files.map((file, index) => (
            <span key={`${file.name}-${file.lastModified}-${index}`} className="resource-chip inline-flex max-w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink">
              <Paperclip size={13} className="shrink-0" />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => onChange({ ...draft, files: draft.files.filter((_, fileIndex) => fileIndex !== index) })}
                aria-label="Remover arquivo"
              >
                <Trash2 size={13} className="text-danger" />
              </button>
            </span>
          ))}
        </div>
      )}

      {visibleExisting.length === 0 && draft.links.length === 0 && draft.files.length === 0 && (
        <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line p-4 text-xs font-bold text-muted hover:text-brand" onClick={addLink}>
          <Plus size={15} />
          Adicionar primeiro recurso
        </button>
      )}
    </div>
  )
}
