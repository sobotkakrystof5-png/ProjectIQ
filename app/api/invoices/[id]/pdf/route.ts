import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

/**
 * Servírování PDF faktury.
 *
 * `middleware.ts` hlídá jen `/dashboard`, `/alteno` a `/hub` — na `/api`
 * nesahá. Auth check tady proto není pojistka navíc, ale jediná ochrana:
 * faktura nese údaje klienta (IČO, DIČ, adresu) a nesmí uniknout ven.
 *
 * bytea se čte jako base64 — neonový HTTP driver vrací binární sloupce
 * jako escapovaný text, přes `encode()` je výsledek jednoznačný.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new NextResponse('Neautorizovaný přístup', { status: 401 })
  }

  const rows = await sql`
    SELECT encode(pdf_data, 'base64') AS pdf_base64, pdf_filename, invoice_number
    FROM invoices
    WHERE id = ${params.id} AND pdf_data IS NOT NULL
    LIMIT 1
  `
  const row = rows[0] as
    | { pdf_base64: string; pdf_filename: string | null; invoice_number: string }
    | undefined

  if (!row) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

  const buffer = Buffer.from(row.pdf_base64, 'base64')
  const filename = row.pdf_filename || `faktura-${row.invoice_number}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.byteLength),
      // filename* kvůli diakritice v názvu souboru
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
