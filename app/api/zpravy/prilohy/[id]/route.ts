import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { attachmentHeaders, downloadFile } from '@/lib/chat/storage'

// Příloha chatu pro admina (KP15). Stejné hlavičky jako u klienta.

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params
  if (!z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 })
  if (!(await getAdminSession())) return new NextResponse(null, { status: 401 })
  const rows = await adminDb<{ storage_path: string; mime: string; filename: string }>`
    SELECT storage_path, mime, filename FROM portal.message_attachments WHERE id = ${id}
  `
  const file = rows[0]
  if (!file) return new NextResponse(null, { status: 404 })
  const bytes = await downloadFile(file.storage_path)
  if (!bytes) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(bytes), { status: 200, headers: attachmentHeaders(file.mime, file.filename, bytes.length) })
}
