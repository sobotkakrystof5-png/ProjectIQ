import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { issueDraft } from '@/lib/admin/invoice-drafts'
import { sendIssuedInvoice } from '@/lib/admin/invoice-send'

/**
 * „Schválit a poslat" u konceptu faktury (R-117): vystaví fakturu (teprve
 * teď dostane číslo z řady), vyrobí PDF a pošle ho klientovi.
 *
 * Route handler, ne server action, ze stejného důvodu jako
 * `/api/invoices/[id]/email`: PDF vyrábí Chromium a ten build stopuje jen
 * do vyjmenovaných cest (`next.config.mjs`).
 *
 * Ochrana: přihlášení **a** shodný `Origin` (route handler kontrolu původu
 * nemá vestavěnou), strop na počet a zámek konceptu v databázi — dvojí
 * kliknutí nevystaví dvě faktury.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  to: z.string().trim().max(254).email(),
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
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Neautorizovaný přístup' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 403 })
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Koncept nenalezen' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Zkontrolujte e-mail odběratele.' }, { status: 400 })

  // Stejný strop jako u ručního odeslání: jedna faktura = jedno spuštění Chromia.
  const ip = getClientIp(req)
  if (await isApiRateLimited('invoice-email', ip, 10, 10)) {
    return NextResponse.json({ error: 'Moc pokusů po sobě. Zkuste to prosím za chvíli.' }, { status: 429 })
  }
  await recordApiRequest('invoice-email', ip)

  const issued = await issueDraft(params.id, parsed.data.to)
  if (!issued.ok) {
    return NextResponse.json({ error: issued.error, editHref: issued.editHref }, { status: issued.status })
  }

  revalidatePath('/dashboard/faktury')
  const invoiceHref = `/dashboard/faktury/${issued.invoiceId}`

  const sent = await sendIssuedInvoice(issued.invoiceId, { to: parsed.data.to })
  if (!sent.ok) {
    // Faktura už existuje (má číslo), jen neodešla. Neříkat „nepovedlo se"
    // obecně — člověk musí vědět, že ji má poslat znovu, ne vystavit znovu.
    return NextResponse.json(
      {
        error: `Faktura ${issued.number} je vystavená, ale e-mail neodešel. Pošlete ji znovu z detailu faktury.`,
        invoiceHref,
      },
      { status: 502 },
    )
  }

  revalidatePath(invoiceHref)
  return NextResponse.json({ ok: true, number: issued.number, invoiceHref })
}
