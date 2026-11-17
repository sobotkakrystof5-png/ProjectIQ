import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { sendIssuedInvoice } from '@/lib/admin/invoice-send'

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
  const session = await getAdminSession()
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

  const result = await sendIssuedInvoice(params.id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
