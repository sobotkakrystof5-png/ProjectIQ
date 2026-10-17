'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { LAST_BUSINESS_COOKIE } from '@/lib/ws/paths'
import { fail, ok, type Result } from '@/lib/ws/result'
import { SEARCH_MAX_LENGTH, searchWorkspace, type SearchHit } from '@/lib/ws/search'

// Akce kostry aplikace (S09). Jen čtení a cookie s posledním byznysem —
// nic neměnného v datech, proto bez assertWritable (režim jen pro čtení).

const slugSchema = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const searchSchema = z.object({ slug: slugSchema, query: z.string().max(SEARCH_MAX_LENGTH * 2) })

/** Hledání pro ⌘K. Byznys z URL se ověří proti účtu (cizí = 404). */
export async function searchAction(raw: unknown): Promise<Result<SearchHit[]>> {
  const ctx = await requireWorkspace()
  const parsed = searchSchema.safeParse(raw)
  if (!parsed.success) return fail('Hledaný text je moc dlouhý. Zkraťte ho prosím.')
  const business = await requireBusiness(ctx, parsed.data.slug)
  try {
    return ok(await searchWorkspace(ctx, business, parsed.data.query))
  } catch (e) {
    console.error('searchAction', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Hledání se nepovedlo. Zkuste to prosím znovu.')
  }
}

/**
 * Zapamatuje si naposledy otevřený byznys, aby /w otevřelo ten. Cookie nese
 * jen slug (není tajný) a platí jen pod /w; při čtení se slug vždy znovu
 * ověří proti účtu.
 */
export async function rememberBusinessAction(raw: unknown): Promise<void> {
  const ctx = await requireWorkspace()
  const parsed = slugSchema.safeParse(raw)
  if (!parsed.success) return
  await requireBusiness(ctx, parsed.data)
  const jar = await cookies()
  jar.set(LAST_BUSINESS_COOKIE, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/w',
    maxAge: 60 * 60 * 24 * 365,
  })
}
