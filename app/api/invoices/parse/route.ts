import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { readPdfUpload } from '@/lib/invoices'
import { MAX_PDF_BYTES } from '@/lib/invoice-constants'
import { readFormDataLimited } from '@/lib/security/request-body'
import { extractInvoiceFromPdf } from '@/lib/invoice-ai'

/**
 * AI přepis nahraného PDF do polí faktury.
 *
 * Nic neukládá — jen vrátí, co model vyčetl, aby si to uživatel v formuláři
 * prohlédl a případně přepsal. Uložení řeší až server action archivu.
 *
 * Stejně jako u servírování PDF platí, že `proxy.ts` na `/api` nesahá:
 * `getServerSession` je jediná ochrana, ne pojistka navíc. Faktury nesou
 * údaje klientů a nesmí projít ven.
 */

// Model čte celé PDF — na Vercelu je výchozích 10 s málo.
export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Neautorizovaný přístup' }, { status: 401 })
  }

  // Strop těla i bez `content-length`: PDF smí mít `MAX_PDF_BYTES`, zbytek je rezerva na multipart.
  const body = await readFormDataLimited(req, MAX_PDF_BYTES + 256 * 1024)
  if (!body.ok) {
    return NextResponse.json(
      { success: false, error: body.reason === 'too-large' ? 'PDF je příliš velké' : 'Neplatný požadavek' },
      { status: body.reason === 'too-large' ? 413 : 400 },
    )
  }

  const file = body.form.get('pdf')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Chybí PDF ke zpracování' }, { status: 400 })
  }

  const read = await readPdfUpload(file)
  if ('error' in read) {
    return NextResponse.json({ success: false, error: read.error }, { status: 400 })
  }

  const result = await extractInvoiceFromPdf(read.pdf.base64)
  if (result.error) {
    // 200 schválně: neúspěšný přepis není chyba požadavku. Klient hlášku jen
    // zobrazí vedle formuláře, který zůstane vyplnitelný ručně.
    return NextResponse.json({ success: false, error: result.error })
  }

  return NextResponse.json({ success: true, data: result.data })
}
