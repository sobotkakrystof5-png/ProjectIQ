'use server'

import { z } from 'zod'
import { applyActionLink } from '@/lib/ws/email/action-link'
import { formatWhen } from '@/lib/ws/email/notify'
import { hitLimit } from '@/lib/ws/intake/rate-limit'
import { fail, ok, type Result } from '@/lib/ws/result'
import { isIsoDate, pragueToUtc } from '@/lib/ws/time'

// Potvrzení poptávky z e-mailu majitele (S15). Bez přihlášení — oprávnění
// dává podepsaný jednorázový odkaz (lib/ws/email/action-link.ts).

const schema = z.object({
  token: z.string().min(10).max(120),
  at: z
    .object({
      day: z.string().refine((v) => isIsoDate(v) && v >= '2020-01-01' && v <= '2100-12-31'),
      minutes: z.number().int().min(0).max(1439),
    })
    .nullable()
    .optional(),
})

const REASONS: Record<string, string> = {
  invalid: 'Tenhle odkaz neplatí. Poptávku otevřete v aplikaci.',
  used: 'Tenhle odkaz už byl použitý. Poptávku najdete v aplikaci.',
  expired: 'Odkaz už vypršel. Poptávku otevřete v aplikaci.',
  handled: 'Tahle poptávka už je vyřízená.',
  read_only: 'Předplatné je pozastavené. Poptávku vyřídíte po obnovení předplatného v aplikaci.',
  overlap: 'Tenhle čas už je obsazený. Vyberte prosím jiný.',
  needs_time: 'Vyberte prosím den a čas termínu.',
  invalid_staff: 'Termín se nepodařilo uložit. Vyřiďte prosím poptávku v aplikaci.',
  invalid_customer: 'Termín se nepodařilo uložit. Vyřiďte prosím poptávku v aplikaci.',
  not_found: 'Poptávka už tu není.',
  already_handled: 'Tahle poptávka už je vyřízená.',
}

export async function confirmFromLink(raw: unknown): Promise<Result<{ message: string }>> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return fail('Zkontrolujte prosím den a čas.')
  const { token, at } = parsed.data
  try {
    // Pojistka proti zkoušení odkazů (podpis je hlavní ochrana).
    if (await hitLimit({ name: 'email-link', max: 20, windowSec: 600 }, token.slice(0, 40))) {
      return fail('Zkuste to prosím za chvíli.')
    }
    const res = await applyActionLink(token, { start: at ? pragueToUtc(at.day, at.minutes) : null })
    if (!res.ok) return fail(REASONS[res.reason] ?? REASONS.invalid)
    const when = res.start ? formatWhen(res.start) : null
    return ok({ message: when ? `Potvrzeno na ${when}. Zákazník dostane e-mail.` : 'Poptávka je přijatá.' })
  } catch (e) {
    console.error('ws.email.link', { error: e instanceof Error ? e.message : 'unknown' })
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu, nebo poptávku vyřiďte v aplikaci.')
  }
}
