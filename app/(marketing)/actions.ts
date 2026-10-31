'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { sql } from '@/lib/db'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'

export type ContactFormState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(3).max(3000),
})

const RATE_LIMIT_ENDPOINT = 'landing_contact'

function success(message: string): ContactFormState {
  return { status: 'success', message }
}

function failure(message: string): ContactFormState {
  return { status: 'error', message }
}

/** Veřejný dotaz skončí v Hovorech jako úkol odpovědět e-mailem do 24 hodin. */
export async function submitContactForm(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const honeypot = formData.get('company_website')
  if (typeof honeypot === 'string' && honeypot.trim()) {
    return success('Děkujeme. Ozveme se do 24 hodin.')
  }

  const startedAtRaw = formData.get('form_started_at')
  const startedAt = typeof startedAtRaw === 'string' ? Number(startedAtRaw) : Number.NaN
  if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 2_000) {
    return success('Děkujeme. Ozveme se do 24 hodin.')
  }

  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
  })
  if (!parsed.success) {
    return failure('Zkontrolujte prosím jméno, e-mail a zprávu.')
  }

  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-real-ip')
      || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown'

    if (await isApiRateLimited(RATE_LIMIT_ENDPOINT, ip, 15, 5)) {
      return failure('Dnes už přišlo několik zpráv. Zkuste to prosím později nebo napište na info@vizeon.cz.')
    }
    await recordApiRequest(RATE_LIMIT_ENDPOINT, ip)

    const { name, email, message } = parsed.data
    const dueDate = addIsoDays(getPragueTodayISO(), 1)
    await sql`
      INSERT INTO client_leads (
        company_name, contact_name, email, lead_status,
        next_action, next_action_date, next_action_type, notes
      ) VALUES (
        'ZakazIQ – web', ${name}, ${email}, 'cold',
        'Odpovědět na dotaz do 24 hodin', ${dueDate}::date, 'email', ${message}
      )
    `
    revalidatePath('/dashboard/calls')
    return success('Děkujeme. Ozveme se do 24 hodin.')
  } catch (error: unknown) {
    const kind = error instanceof Error ? error.name : 'unknown'
    console.error('[marketing-contact] Uložení dotazu selhalo:', kind)
    return failure('Zprávu se nepodařilo odeslat. Zkuste to prosím později nebo napište na info@vizeon.cz.')
  }
}
