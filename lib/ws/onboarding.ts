import { randomInt, randomUUID } from 'crypto'
import { isUniqueViolation, pgConstraint, q, wsDb, wsSystem } from './db'
import { RESERVED_BUSINESS_SLUGS } from './paths'
import { getIndustryTemplate, templateSeedQueries, type IndustryKey } from './templates'

// Založení účtu s prvním byznysem (průvodce /w/novy, S07). Účet = firma;
// kdo do něj patří, drží ws.members (od R-080 bez Clerk organizací).
//
// Účet ještě neexistuje, takže jeho id vygenerujeme sami a celá transakce
// běží s app.account_id = to nové id — RLS (WITH CHECK) pustí jen řádky
// zakládaného účtu. Účet, vlastník, byznys a šablona oboru jdou v jedné
// transakci: buď je všechno, nebo nic.

/** Účet, do kterého uživatel patří (nejstarší členství), nebo null. SECURITY DEFINER — účet ještě neznáme. */
export async function accountIdForUser(userId: string): Promise<string | null> {
  const [row] = await wsSystem<{ account_id: string | null }>`SELECT account_id FROM ws.membership_for_user(${userId})`
  return row?.account_id ?? null
}

const SLUG_MAX = 60
const SUFFIX_LENGTH = 4

/** „Kadeřnictví U Lenky“ → `kadernictvi-u-lenky`. Slug je v adrese objednávací stránky /r/[slug]. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX - SUFFIX_LENGTH - 1)
    .replace(/-+$/, '')
  return slug || 'byznys'
}

function slugCandidate(base: string, attempt: number): string {
  // Rezervovaný slug („novy“, „ucet“…) by zakryla pevná cesta pod /w — rovnou s koncovkou.
  if (attempt === 0 && !RESERVED_BUSINESS_SLUGS.has(base)) return base
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) suffix += alphabet[randomInt(alphabet.length)]
  return `${base}-${suffix}`
}

export type NewAccountInput = {
  /** Název byznysu — zatím i název účtu (firmy), IČO a fakturační údaje se doplní v Nastavení. */
  name: string
  industry: IndustryKey
  /**
   * Vlastník z průvodce. `null` = účet zakládá admin pro pozvaného klienta
   * (S17) — člen se zapíše, až pozvánku přijme (ws.redeem_account_invite).
   */
  owner: { userId: string; name: string | null; email: string | null } | null
}

export type NewAccountResult = { accountId: string; created: boolean }

const MAX_ATTEMPTS = 5

/**
 * Založí účet, vlastníka, byznys a obsah ze šablony oboru. Obsazený slug zkusí
 * znovu s náhodnou koncovkou. Vlastní-li uživatel účet už teď (dvojklik, druhá
 * záložka), vrátí ten existující s `created: false` (members_one_owned_account_uq).
 */
export async function createAccountWithBusiness(input: NewAccountInput): Promise<NewAccountResult> {
  const template = getIndustryTemplate(input.industry)
  const base = slugify(input.name)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const accountId = randomUUID()
    const businessId = randomUUID()
    const slug = slugCandidate(base, attempt)
    try {
      await wsDb({ accountId }).batch([
        q`INSERT INTO ws.accounts (id, name) VALUES (${accountId}, ${input.name})`,
        ...(input.owner
          ? [
              q`
                INSERT INTO ws.members (account_id, user_id, role, name, email)
                VALUES (${accountId}, ${input.owner.userId}, 'owner', ${input.owner.name}, ${input.owner.email})
              `,
            ]
          : []),
        q`
          INSERT INTO ws.businesses (id, account_id, name, slug, industry)
          VALUES (${businessId}, ${accountId}, ${input.name}, ${slug}, ${template.key})
        `,
        ...templateSeedQueries({ accountId, businessId }, template),
      ])
      return { accountId, created: true }
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      const constraint = pgConstraint(e)
      if (constraint === 'members_one_owned_account_uq' && input.owner) {
        const existing = await accountIdForUser(input.owner.userId)
        if (existing) return { accountId: existing, created: false }
      }
      if (constraint !== 'businesses_slug_key') throw e
    }
  }
  throw new Error('createAccountWithBusiness: nenašel se volný slug')
}
