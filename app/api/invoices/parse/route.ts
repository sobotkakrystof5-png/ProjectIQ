import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readPdfUpload } from '@/lib/invoices'
import { extractInvoiceFromPdf } from '@/lib/invoice-ai'

/**
 * AI přepis nahraného PDF do polí faktury.
 *
 * Nic neukládá — jen vrátí, co model vyčetl, aby si to uživatel v formuláři
 * prohlédl a případně přepsal. Uložení řeší až server action archivu.
 *
 * Stejně jako u servírování PDF platí, že `middleware.ts` na `/api` nesahá:
 * `getServerSession` je jediná ochrana, ne pojistka navíc. Faktury nesou
 * údaje klientů a nesmí projít ven.
 */

// Model čte celé PDF — na Vercelu je výchozích 10 s málo.
export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Neautorizovaný přístup' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Neplatný požadavek' }, { status: 400 })
  }

  const file = form.get('pdf')
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
