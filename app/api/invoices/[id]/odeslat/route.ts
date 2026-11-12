import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { loadInvoiceDoc, loadIssuerProfile } from '@/lib/admin/invoicing'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'
import { sendInvoiceEmail } from '@/lib/email'

/**
 * Odeslání vystavené faktury e-mailem (AD12).
 *
 * Jen na výslovné kliknutí, nikdy automaticky. Běží jako route handler,
 * protože se tu vyrábí PDF (Chromium) — v server action stránky by viselo
 * u obrazovky, která s odesíláním nemá nic společného.
 *
 * Odpovídá se až po odeslání: uživatel má vědět, jestli e-mail opravdu
 * odešel, ne jen že se o to někdo pokusí.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = {
  invoice_number: string
  client_email: string | null
  amount: number
  currency: string
  due_on: string | null
  cancelled_at: string | null
  pdf_base64: string | null
}

function castka(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount)
}

function den(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}. ${m}. ${y}`
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Neautorizovaný přístup' }, { status: 401 })

  // Požadavek musí přijít z vlastní stránky. Session cookie NextAuth je
  // `SameSite=Lax`, takže cizí formulář ji neposílá — tohle je druhá pojistka
  // u akce, která odesílá poštu ven.
  const site = req.headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin') {
    return NextResponse.json({ error: 'Neautorizovaný přístup' }, { status: 403 })
  }
  if (!UUID.test(id)) return NextResponse.json({ error: 'Faktura nenalezena' }, { status: 404 })

  const rows = await adminDb<Row>`
    SELECT invoice_number, client_email, amount::float AS amount, currency, due_on::text, cancelled_at::text,
           encode(pdf_data, 'base64') AS pdf_base64
    FROM invoices
    WHERE id = ${id} AND pdf_generated
    LIMIT 1
  `
  const invoice = rows[0]
  if (!invoice) return NextResponse.json({ error: 'Faktura nenalezena' }, { status: 404 })
  if (invoice.cancelled_at) return NextResponse.json({ error: 'Stornovanou fakturu neposíláme.' }, { status: 400 })
  if (!invoice.client_email) {
    return NextResponse.json({ error: 'Faktura nemá e-mail odběratele. Doplňte ho a vystavte znovu.' }, { status: 400 })
  }

  let pdf: Buffer
  if (invoice.pdf_base64) {
    pdf = Buffer.from(invoice.pdf_base64, 'base64')
  } else {
    const doc = await loadInvoiceDoc(id)
    if (!doc) return NextResponse.json({ error: 'Faktura nenalezena' }, { status: 404 })
    const profile = await loadIssuerProfile()
    try {
      pdf = await renderInvoicePdf(doc, { name: profile.name || 'ZakazIQ', logo: null })
    } catch (err) {
      console.error('[faktury] PDF k odeslání se nepodařilo vyrobit:', err)
      return NextResponse.json({ error: 'PDF se teď nepodařilo vyrobit. Zkuste to prosím znovu.' }, { status: 503 })
    }
    await adminDb`
      UPDATE invoices
      SET pdf_data = decode(${pdf.toString('base64')}::text, 'base64'),
          pdf_filename = ${`faktura-${invoice.invoice_number}.pdf`},
          pdf_size = ${pdf.byteLength}
      WHERE id = ${id}
    `
  }

  const profile = await loadIssuerProfile()
  const splatnost = invoice.due_on ? ` se splatností ${den(invoice.due_on)}` : ''
  const sent = await sendInvoiceEmail({
    to: invoice.client_email,
    subject: `Faktura ${invoice.invoice_number}`,
    text:
      `Dobrý den,\n\nv příloze posílám fakturu ${invoice.invoice_number} na ` +
      `${castka(invoice.amount, invoice.currency)}${splatnost}.\n\n` +
      `Děkuji${profile.name ? `,\n${profile.name}` : '.'}`,
    attachment: { filename: `faktura-${invoice.invoice_number}.pdf`, content: pdf },
  })

  if (!sent) {
    return NextResponse.json({ error: 'E-mail se nepodařilo odeslat. Zkuste to prosím znovu.' }, { status: 502 })
  }

  await adminDb`UPDATE invoices SET sent_at = now() WHERE id = ${id}`
  revalidatePath(`/dashboard/faktury/${id}`)
  return NextResponse.json({ ok: true })
}
