import 'server-only'
import { randomUUID } from 'node:crypto'
import { CHAT_MAX_FILE_BYTES, CHAT_MAX_FILES, CHAT_MAX_TOTAL_BYTES } from '@/lib/chat/types'

/**
 * Přílohy chatu v soukromém bucketu Supabase Storage (KP15, D-K18, R-127).
 *
 * Volá se jen ze serveru přes REST API klíčem `SUPABASE_SERVICE_ROLE_KEY`
 * — prohlížeč na Supabase nesahá (CSP beze změny) a soubor vydá jen naše
 * routa po kontrole členství. Bez nové závislosti.
 *
 * Typ se pozná podle prvních bajtů souboru, ne podle přípony ani hlavičky
 * z prohlížeče: PNG, JPEG, WebP, PDF. SVG, HTML ani nic jiného neprojde.
 */

export const CHAT_BUCKET = 'chat-prilohy'

const url = () => (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export function chatStorageConfigured(): boolean {
  return url().startsWith('https://') && key().length > 0
}

export type ChatFileMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'

/** Typ podle obsahu. `null` = soubor nepovolíme. */
export function sniffMime(bytes: Uint8Array): ChatFileMime | null {
  const at = (i: number) => bytes[i]
  const ascii = (from: number, text: string) => [...text].every((c, i) => at(from + i) === c.charCodeAt(0))
  if (bytes.length >= 8 && at(0) === 0x89 && ascii(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (bytes.length >= 5 && ascii(0, '%PDF-')) return 'application/pdf'
  return null
}

const EXTENSION: Record<ChatFileMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/** Zobrazovaný název: bez cesty a řídicích znaků, s příponou podle skutečného typu. */
export function safeFilename(name: string, mime: ChatFileMime): string {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>]/g, '')
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .trim()
    .slice(0, 100)
  return `${base || 'priloha'}.${EXTENSION[mime]}`
}

export type PreparedFile = { id: string; path: string; mime: ChatFileMime; size: number; filename: string; bytes: Uint8Array }
export type PrepareResult = { ok: true; files: PreparedFile[] } | { ok: false; error: string }

/** Ověří soubory z formuláře a přidělí jim místo ve složce klienta a zakázky. */
export async function prepareFiles(entries: FormDataEntryValue[], clientId: string, projectId: string): Promise<PrepareResult> {
  const blobs = entries.filter((e): e is File => typeof e !== 'string' && e.size > 0)
  if (blobs.length > CHAT_MAX_FILES) return { ok: false, error: `Najednou jde poslat nejvýš ${CHAT_MAX_FILES} souborů.` }
  if (blobs.reduce((sum, b) => sum + b.size, 0) > CHAT_MAX_TOTAL_BYTES) {
    return { ok: false, error: 'Soubory jsou dohromady moc velké. Najednou jde poslat nejvýš 4 MB.' }
  }
  const files: PreparedFile[] = []
  for (const blob of blobs) {
    if (blob.size > CHAT_MAX_FILE_BYTES) return { ok: false, error: 'Soubor je moc velký. Největší může mít 4 MB.' }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const mime = sniffMime(bytes)
    if (!mime) return { ok: false, error: 'Poslat jde jen obrázek (PNG, JPG, WebP) nebo PDF.' }
    const id = randomUUID()
    files.push({ id, path: `${clientId}/${projectId}/${id}`, mime, size: bytes.length, filename: safeFilename(blob.name, mime), bytes })
  }
  return { ok: true, files }
}

async function storageFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${url()}/storage/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, apikey: key(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
}

export async function uploadFiles(files: PreparedFile[]): Promise<void> {
  const done: string[] = []
  try {
    for (const f of files) {
      const res = await storageFetch(`/object/${CHAT_BUCKET}/${f.path}`, {
        method: 'POST',
        headers: { 'Content-Type': f.mime, 'x-upsert': 'false' },
        body: Buffer.from(f.bytes),
      })
      if (!res.ok) throw new Error(`Úložiště ${res.status}`)
      done.push(f.path)
    }
  } catch (err) {
    await deleteStoredFiles(done).catch(() => {})
    throw err
  }
}

export async function downloadFile(path: string): Promise<Uint8Array | null> {
  const res = await storageFetch(`/object/authenticated/${CHAT_BUCKET}/${path}`, { method: 'GET' })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error(`Úložiště ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function deleteStoredFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const res = await storageFetch(`/object/${CHAT_BUCKET}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  })
  if (!res.ok) throw new Error(`Úložiště ${res.status}`)
}

/** Hlavičky pro vydání přílohy: nic se nespustí ani nevloží jako stránka. */
export function attachmentHeaders(mime: string, filename: string, size: number): Headers {
  const inline = mime.startsWith('image/')
  const encoded = encodeURIComponent(filename)
  return new Headers({
    'Content-Type': mime,
    'Content-Length': String(size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="priloha"; filename*=UTF-8''${encoded}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  })
}
