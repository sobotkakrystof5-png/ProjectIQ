'use server'

import { z } from 'zod'
import { unsubscribeCustomer, unsubscribeNews } from '@/lib/ws/email/public-links'
import { fail, ok, type Result } from '@/lib/ws/result'

// Odhlášení z e-mailu (S15): zákazník z hromadných zpráv firmy, majitel
// z novinek ZakazIQ. Oprávnění dává podepsaný odkaz.

export async function unsubscribeAction(raw: unknown): Promise<Result<{ message: string }>> {
  const p = z.object({ token: z.string().min(10).max(120) }).safeParse(raw)
  if (!p.success) return fail('Tenhle odkaz neplatí.')
  try {
    if (p.data.token.startsWith('n')) {
      return (await unsubscribeNews(p.data.token))
        ? ok({ message: 'Hotovo. Novinky ZakazIQ vám už chodit nebudou. Zapnout je můžete v Nastavení › E-maily a upozornění.' })
        : fail('Tenhle odkaz neplatí.')
    }
    const res = await unsubscribeCustomer(p.data.token)
    if (!res) return fail('Tenhle odkaz neplatí.')
    return ok({ message: `Hotovo. Další nabídky${res.businessName ? ` od ${res.businessName}` : ''} vám už nepřijdou.` })
  } catch (e) {
    console.error('ws.email.unsubscribe', { error: e instanceof Error ? e.message : 'unknown' })
    return fail('Odhlášení se nepovedlo. Zkuste to prosím znovu.')
  }
}
