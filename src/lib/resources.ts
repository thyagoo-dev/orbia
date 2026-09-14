import { supabase } from '@/lib/supabase'
import type { Resource } from '@/types'

export type ResourceOwnerType = 'event' | 'reminder'

export type LinkDraft = {
  clientId: string
  label: string
  url: string
}

export type ResourceDraft = {
  links: LinkDraft[]
  files: File[]
  deletedIds: string[]
}

export function emptyResourceDraft(): ResourceDraft {
  return { links: [], files: [], deletedIds: [] }
}

const MAX_FILE_SIZE = 15 * 1024 * 1024
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const ALLOWED_MIMES = new Set(Object.values(MIME_BY_EXTENSION))

function safeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Informe a URL do link.')

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(candidate)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use um link HTTP ou HTTPS válido.')
  return parsed.toString()
}

function mimeForFile(file: File) {
  if (file.type && ALLOWED_MIMES.has(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? null
}

function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} ultrapassa o limite de 15 MB.`)
  if (!mimeForFile(file)) throw new Error(`${file.name} possui um formato não permitido.`)
}

export async function openResource(resource: Resource) {
  if (resource.kind === 'link' && resource.url) {
    window.open(resource.url, '_blank', 'noopener,noreferrer')
    return
  }

  if (resource.kind === 'file' && resource.file_path) {
    const { data, error } = await supabase.storage.from('resources').createSignedUrl(resource.file_path, 60)
    if (error) throw error
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
}

export async function removeResourceFiles(resources: Resource[]) {
  const paths = resources.flatMap(resource => resource.kind === 'file' && resource.file_path ? [resource.file_path] : [])
  if (paths.length === 0) return
  const { error } = await supabase.storage.from('resources').remove(paths)
  if (error) console.warn('Não foi possível remover todos os arquivos do Storage:', error)
}

export async function persistResources({
  ownerType,
  ownerId,
  userId,
  existing,
  draft,
}: {
  ownerType: ResourceOwnerType
  ownerId: string
  userId: string
  existing: Resource[]
  draft: ResourceDraft
}) {
  const ownerColumn = ownerType === 'event' ? 'event_id' : 'reminder_id'
  const links = draft.links.filter(link => link.url.trim())
  const preparedLinks = links.map(link => ({
    [ownerColumn]: ownerId,
    kind: 'link' as const,
    label: link.label.trim() || null,
    url: normalizeUrl(link.url),
  }))

  draft.files.forEach(validateFile)

  const createdIds: string[] = []
  const uploadedPaths: string[] = []

  try {
    if (preparedLinks.length > 0) {
      const { data, error } = await supabase.from('resources').insert(preparedLinks).select('id')
      if (error) throw error
      createdIds.push(...(data ?? []).map(row => row.id as string))
    }

    for (const file of draft.files) {
      const mime = mimeForFile(file)!
      const path = `${userId}/${ownerType}/${ownerId}/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('resources').upload(path, file, {
        upsert: false,
        contentType: mime,
      })
      if (uploadError) throw uploadError
      uploadedPaths.push(path)

      const { data, error: rowError } = await supabase
        .from('resources')
        .insert({
          [ownerColumn]: ownerId,
          kind: 'file',
          label: file.name,
          file_name: file.name,
          file_path: path,
          mime_type: mime,
          size_bytes: file.size,
        })
        .select('id')
        .single()

      if (rowError || !data) throw rowError ?? new Error('Não foi possível registrar o anexo.')
      createdIds.push(data.id as string)
    }

    // Remoções ficam por último: se um upload falhar, recursos antigos permanecem intactos.
    if (draft.deletedIds.length > 0) {
      const deleted = existing.filter(item => draft.deletedIds.includes(item.id))
      const { error } = await supabase.from('resources').delete().in('id', draft.deletedIds)
      if (error) throw error
      await removeResourceFiles(deleted)
    }
  } catch (error) {
    if (createdIds.length > 0) await supabase.from('resources').delete().in('id', createdIds)
    if (uploadedPaths.length > 0) await supabase.storage.from('resources').remove(uploadedPaths)
    throw error
  }
}
