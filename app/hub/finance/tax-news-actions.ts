'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { syncTaxNews } from '@/lib/tax-news'
import type { TaxNewsSource } from '@/lib/types'

/**
 * Novinky z legislativy pro blok ve Financích.
 *
 * Data plní týdenní cron (`/api/cron/tax-news`); tyhle akce jen čtou
 * a odbavují přečtené. Všechno pod `requireAuth()` — je to interní
 * přehled, ne veřejný feed.
 */

export interface TaxNewsItem {
  id: string
  source: TaxNewsSource
  title: string
  link: string
  published_at: string | null
  summary: string | null
  read: boolean
}

export interface TaxNewsData {
  items: TaxNewsItem[]
  unreadCount: number
  /** Kdy naposledy cron něco zapsal — když je null, ještě neproběhl */
  lastSyncedAt: string | null
}

/** Kolik novinek se v bloku drží. Starší už nikdo nečte a jen prodlužují stránku. */
const NEWS_LIMIT = 12

export async function getTaxNews(): Promise<TaxNewsData> {
  await requireAuth()

  // Nepřečtené napřed; uvnitř obou skupin od nejnovější. `published_at` může
  // chybět (feed datum neuvedl) — takové položky patří na konec, ne nahoru,
  // proto NULLS LAST místo tichého záskoku za nejnovější.
  const [rows, meta] = await Promise.all([
    sql`
      SELECT id::text, source, title, link,
             published_at::text AS published_at, summary, read
      FROM tax_news
      ORDER BY read ASC, published_at DESC NULLS LAST, created_at DESC
      LIMIT ${NEWS_LIMIT}
    `,
    sql`
      SELECT COUNT(*) FILTER (WHERE read = false)::int AS unread,
             MAX(created_at)::text AS last_synced
      FROM tax_news
    `,
  ])

  return {
    items: rows as TaxNewsItem[],
    unreadCount: (meta[0]?.unread as number) ?? 0,
    lastSyncedAt: (meta[0]?.last_synced as string | null) ?? null,
  }
}

export async function markTaxNewsRead(id: string): Promise<void> {
  await requireAuth()

  await sql`UPDATE tax_news SET read = true WHERE id = ${id}`
  revalidatePath('/hub/finance')
}

export async function markAllTaxNewsRead(): Promise<void> {
  await requireAuth()

  await sql`UPDATE tax_news SET read = true WHERE read = false`
  revalidatePath('/hub/finance')
}

/**
 * Ruční stažení mimo týdenní cron — po prvním nasazení je tabulka prázdná
 * a čekat na pondělí by znamenalo dívat se týden na prázdný blok.
 *
 * Bezpečné opakovat: stejná idempotentní cesta jako cron.
 */
export async function refreshTaxNews(): Promise<{ inserted: number; error?: string }> {
  await requireAuth()

  try {
    const result = await syncTaxNews()
    revalidatePath('/hub/finance')

    return {
      inserted: result.inserted,
      ...(result.failedFeeds.length > 0
        ? { error: `Nepodařilo se stáhnout: ${result.failedFeeds.join(', ')}` }
        : {}),
    }
  } catch (err) {
    console.error('[tax-news] Ruční stažení selhalo:', err)
    return { inserted: 0, error: 'Novinky se nepodařilo stáhnout. Zkus to za chvíli.' }
  }
}
