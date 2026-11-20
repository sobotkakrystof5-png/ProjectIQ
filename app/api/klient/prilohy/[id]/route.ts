import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { attachmentHeaders, downloadFile } from '@/lib/chat/storage'
import { getPortalContext } from '@/lib/portal/context'
import { portalDb } from '@/lib/portal/db'

// Příloha chatu pro klienta (KP15, D-K18). Cestu k souboru vydá jen
// `portal.attachment_file` po kontrole klienta a člena; cizí příloha = 404.
// Soubor jde ven s `nosniff`, sandbox CSP a PDF jako stažení.

const WINDOW_MINUTES = 10
const MAX_REQUESTS = 200

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params
  if (!z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 })
  const ctx = await getPortalContext()
  if (!ctx) return new NextResponse(null, { status: 401 })

  const endpoint = `klient-prilohy:${ctx.memberId}`
  if (await isApiRateLimited(endpoint, 'member', WINDOW_MINUTES, MAX_REQUESTS)) return new NextResponse(null, { status: 429 })
  await recordApiRequest(endpoint, 'member')

  let file: { storage_path: string; mime: string; filename: string } | undefined
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ storage_path: string; mime: string; filename: string }>`
      SELECT storage_path, mime, filename FROM portal.attachment_file(${id}, ${ctx.memberId})
    `
    file = rows[0]
  } catch (err) {
    if ((err as { code?: string })?.code === 'P0002') return new NextResponse(null, { status: 404 })
    throw err
  }
  if (!file) return new NextResponse(null, { status: 404 })
  const bytes = await downloadFile(file.storage_path)
  if (!bytes) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(bytes), { status: 200, headers: attachmentHeaders(file.mime, file.filename, bytes.length) })
}
