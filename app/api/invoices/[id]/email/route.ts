import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { sql } from '@/lib/db'
import { loadIssuedInvoiceForPdf } from '@/lib/admin/invoice-issue'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'
import { loadHandoverForPdf } from '@/lib/admin/handover'
import { renderHandoverPdf } from '@/lib/invoice-pdf/handover'
import { adminDb } from '@/lib/admin/db'
import { sendInvoiceEmail } from '@/lib/email'

/**
 * Odeslání vystavené faktury klientovi s PDF v příloze (AD12).
 *
 * Proč route handler a ne server action: PDF vyrábí Chromium, a ten patří
 * jen tam, kde pro něj `next.config.mjs` stopuje binárku — tedy do cesty s PDF
 * a sem. Server action stránky by ho tahala do každé trasy, kde formulář je.
 *
 * Posílá se **jen na kliknutí**. Vystavení faktury samo o sobě nikdy nic
 * neodešle (B10: nic neodchází bez vědomí uživatele).
 *
 * Ochrana: přihlášení (na `/api` proxy nesahá) **a** shodný `Origin` —
 * server actions mají kontrolu původu vestavěnou, route handler ji musí
 * mít vlastní, jinak by cizí stránka uměla poslat fakturu za vás.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  to: z.string().trim().max(254).email(),
  subject: z.string().trim().max(200).optional(),
  text: z.string().trim().max(4000).optional(),
  /** Přiložit i předávací dokument „co bylo dodané" (AD16). */
  predani: z.boolean().optional(),
})

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Neautorizovaný přístup' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 403 })
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Faktura nenalezena' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Zkontrolujte e-mailovou adresu.' }, { status: 400 })

  // Strop na odesílání: přihlášení drží dveře, tohle drží množství. Jedna
  // faktura = jeden e-mail a jedno spuštění Chromia, takže deset za deset
  // minut je víc, než kdy bude potřeba.
  const ip = getClientIp(req)
  if (await isApiRateLimited('invoice-email', ip, 10, 10)) {
    return NextResponse.json({ error: 'Moc pokusů po sobě. Zkuste to prosím za chvíli.' }, { status: 429 })
  }
  await recordApiRequest('invoice-email', ip)

  const issued = await loadIssuedInvoiceForPdf(params.id)
  if (!issued) return NextResponse.json({ error: 'Poslat jde jen fakturu vystavenou tady.' }, { status: 404 })
  if (issued.invoice.cancelled) {
    return NextResponse.json({ error: 'Stornovanou fakturu neposílejte — vystavte novou.' }, { status: 400 })
  }

  let pdf: Buffer
  try {
    pdf = await renderInvoicePdf(issued.invoice, { name: issued.invoice.issuer.name, logo: null })
  } catch (err) {
    console.error('[Faktury] PDF k e-mailu se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    return NextResponse.json({ error: 'PDF se nepovedlo připravit, e-mail jsem neposlal.' }, { status: 503 })
  }

  const subject = parsed.data.subject || `Faktura ${issued.invoice.number}`
  const text =
    parsed.data.text ||
    `Dobrý den,\n\nposílám fakturu ${issued.invoice.number} se splatností ${issued.invoice.dueOn}.\nNajdete ji v příloze.\n\nDěkuju,\n${issued.invoice.issuer.name}`

  // Předávací dokument se přikládá jen na výslovné zaškrtnutí a jen když
  // u zakázky je vyplněný. Když se nepodaří, e-mail se **neposlíže** —
  // klient by dostal fakturu bez soupisu, o kterém si myslíte, že ho má.
  const attachments = [{ filename: issued.filename, content: pdf }]
  if (parsed.data.predani === true) {
    const projectRows = await adminDb<{ project_id: string | null }>`
      SELECT project_id::text AS project_id FROM invoices WHERE id = ${params.id} LIMIT 1
    `
    const projectId = projectRows[0]?.project_id ?? null
    const handover = projectId === null ? null : await loadHandoverForPdf(projectId)
    if (!handover) {
      return NextResponse.json(
        { error: 'Předávací dokument u téhle zakázky zatím není vyplněný.' },
        { status: 400 },
      )
    }
    try {
      const handoverPdf = await renderHandoverPdf(
        {
          projectTitle: handover.projectTitle,
          clientName: handover.clientName,
          issuerName: handover.issuerName,
          issuedOn: handover.issuedOn,
          summary: handover.doc.summary,
          items: handover.doc.items,
          access: handover.doc.access,
          maintenance: handover.doc.maintenance,
          note: handover.doc.note,
        },
        { name: handover.issuerName, logo: null },
      )
      attachments.push({ filename: handover.filename, content: handoverPdf })
    } catch (err) {
      console.error('[Faktury] Předávací dokument se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      return NextResponse.json({ error: 'Předávací dokument se nepovedlo připravit, e-mail jsem neposlal.' }, { status: 503 })
    }
  }

  const sent = await sendInvoiceEmail({ to: parsed.data.to, subject, text, pdfs: attachments })
  if (!sent) return NextResponse.json({ error: 'E-mail se nepodařilo odeslat. Zkuste to prosím znovu.' }, { status: 502 })

  await sql`UPDATE invoices SET sent_at = now() WHERE id = ${params.id}`
  return NextResponse.json({ ok: true })
}
