import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadHandoverForPdf } from '@/lib/admin/handover'
import { renderHandoverPdf } from '@/lib/invoice-pdf/handover'

/**
 * Předávací dokument „co bylo dodané" jako PDF (AD16).
 *
 * Vyrábí se při otevření, neukládá se — stejně jako faktura vystavená
 * v adminu (R-098). Z týchž dat vznikne vždy totéž a v databázi by zbytečně
 * ležely megabajty.
 *
 * `proxy.ts` hlídá jen `/dashboard` — na `/api` nesahá, takže přihlášení
 * tady není pojistka navíc, ale jediná ochrana: dokument nese údaje klienta.
 */

export const runtime = 'nodejs'
// Chromium se rozjíždí při každém otevření.
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse('Neautorizovaný přístup', { status: 401 })
  if (!UUID.test(params.id)) return new NextResponse('Zakázka nenalezena', { status: 404 })

  const data = await loadHandoverForPdf(params.id)
  if (!data) {
    return new NextResponse('Předávací dokument u téhle zakázky zatím není vyplněný.', { status: 404 })
  }

  try {
    const pdf = await renderHandoverPdf(
      {
        projectTitle: data.projectTitle,
        clientName: data.clientName,
        issuerName: data.issuerName,
        issuedOn: data.issuedOn,
        summary: data.doc.summary,
        items: data.doc.items,
        access: data.doc.access,
        maintenance: data.doc.maintenance,
        note: data.doc.note,
      },
      { name: data.issuerName, logo: null },
    )
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
        'Content-Length': String(pdf.byteLength),
        // Dokument se mění, dokud ho Kryštof dopisuje — cache ho nesmí držet.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error(
      '[Předání] PDF se nepodařilo vyrobit.',
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    )
    return new NextResponse('PDF se nepovedlo připravit. Zkuste to prosím znovu.', { status: 503 })
  }
}
