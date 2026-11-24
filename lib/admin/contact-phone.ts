import { batchTolerant, q, type AdminRow } from '@/lib/admin/db'
import { normalizeEmail, normalizePhone } from '@/lib/contacts/normalize'

/**
 * Telefon klienta podle e-mailu (R-137): okno schůzky ho doplní samo, aby
 * připomínky šly i SMS. Dřív to záviselo na tom, jestli Kryštof číslo opíše
 * — u schůzky s firmou, které volal AI asistent, číslo v adminu bylo, jen
 * ne u schůzky.
 *
 * Pořadí zdrojů = komu víc věřit, a stejné jako u propisování údajů
 * (R-141, `lib/admin/contact-sync.ts`): kontakt je jediný zdroj (bere se
 * kořen sloučené rodiny), pak Hovory a číslo, na které volal AI asistent,
 * nakonec zakázky a AI leady. V každém zdroji vyhraje nejnovější záznam.
 * Tabulka, která na databázi chybí, se přeskočí.
 */

export type PhoneSource = 'contacts' | 'calls' | 'outreach' | 'projects' | 'agent'

export type FoundPhone = {
  phone: string
  source: PhoneSource
  /** U téhož e-mailu je uložené i jiné číslo — ať se Kryštof podívá. */
  ambiguous: boolean
}

const SOURCES: PhoneSource[] = ['contacts', 'calls', 'outreach', 'projects', 'agent']

/** Z řádků seřazených podle zdroje (pořadí `SOURCES`) vybere číslo. Čistá funkce. */
export function pickPhone(rowsBySource: { source: PhoneSource; phones: unknown[] }[]): FoundPhone | null {
  const seen = new Set<string>()
  let first: { phone: string; source: PhoneSource } | null = null
  for (const { source, phones } of rowsBySource) {
    for (const raw of phones) {
      const phone = normalizePhone(typeof raw === 'string' ? raw : null)
      if (!phone) continue
      seen.add(phone)
      if (!first) first = { phone, source }
    }
  }
  return first ? { ...first, ambiguous: seen.size > 1 } : null
}

export async function findPhoneByEmail(rawEmail: string): Promise<FoundPhone | null> {
  const email = normalizeEmail(rawEmail)
  if (!email) return null
  const results = await batchTolerant([
    // Kontakt sloučený do jiného (R-095) má pravdu v kořeni; jeho vlastní
    // číslo je až záloha, kdyby kořen telefon neměl.
    q`SELECT coalesce(nullif(r.phone, ''), c.phone) AS phone
        FROM contacts c JOIN contacts r ON r.id = coalesce(c.merged_into, c.id)
       WHERE (lower(trim(c.email)) = ${email} OR lower(trim(r.email)) = ${email})
         AND coalesce(nullif(r.phone, ''), c.phone, '') <> ''
       ORDER BY (c.merged_into IS NULL) DESC, r.updated_at DESC NULLS LAST LIMIT 5`,
    q`SELECT phone FROM client_leads
       WHERE lower(trim(email)) = ${email} AND coalesce(phone, '') <> ''
       ORDER BY created_at DESC NULLS LAST LIMIT 5`,
    q`SELECT phone FROM outreach_leads
       WHERE lower(trim(email)) = ${email} AND coalesce(phone, '') <> ''
       ORDER BY updated_at DESC NULLS LAST LIMIT 5`,
    q`SELECT client_phone AS phone FROM projects
       WHERE lower(trim(client_email)) = ${email} AND coalesce(client_phone, '') <> ''
       ORDER BY created_at DESC NULLS LAST LIMIT 5`,
    q`SELECT client_phone AS phone FROM agent_leads
       WHERE lower(trim(client_email)) = ${email} AND coalesce(client_phone, '') <> ''
       ORDER BY received_at DESC NULLS LAST LIMIT 5`,
  ])
  return pickPhone(
    SOURCES.map((source, i) => ({
      source,
      phones: ((results[i] ?? []) as AdminRow[]).map((r) => r.phone),
    })),
  )
}
