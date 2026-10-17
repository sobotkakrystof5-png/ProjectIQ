import 'server-only'
import { q } from '../db'
import { flushAll } from '../email/queue'
import { queueNewsForAccount } from '../email/scheduled'
import { isNewsTag, NEWS_LIMITS, normalizeNewsLink, sniffImageType, type NewsTag } from '../news-format'
import { adminDb } from './db'
import { type AdminIdentity } from './auth'

// /dashboard/novinky (S17): novinky ZakazIQ pro všechny klienty. Koncept →
// „Zveřejnit v aplikaci“ (zvonek „Co je nového“) → „Poslat e-mailem všem“
// (jednou, s potvrzeným počtem příjemců, jen účtům s novinkami zapnutými).

export type AdminNews = {
  id: string
  title: string
  body: string
  link: string | null
  tag: NewsTag
  hasImage: boolean
  publishedAt: Date | null
  emailedAt: Date | null
  emailRecipients: number | null
  updatedAt: Date
}

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null)

function mapNews(r: Record<string, unknown>): AdminNews {
  return {
    id: String(r.id),
    title: String(r.title),
    body: String(r.body),
    link: (r.link_url as string | null) ?? null,
    tag: isNewsTag(r.tag) ? r.tag : 'new',
    hasImage: Boolean(r.has_image),
    publishedAt: toDate(r.published_at),
    emailedAt: toDate(r.emailed_at),
    emailRecipients: r.email_recipients == null ? null : Number(r.email_recipients),
    updatedAt: new Date(r.updated_at as string),
  }
}

const COLUMNS = `id, title, body, link_url, tag, image_type IS NOT NULL AS has_image, published_at, emailed_at, email_recipients, updated_at`

export async function listNews(): Promise<AdminNews[]> {
  const [rows] = await adminDb.batch([{ text: `SELECT ${COLUMNS} FROM ws.product_news ORDER BY coalesce(published_at, created_at) DESC LIMIT 100`, params: [] }])
  return rows.map(mapNews)
}

export async function getNewsItem(id: string): Promise<(AdminNews & { imageDataUrl: string | null }) | null> {
  const [rows] = await adminDb.batch([
    { text: `SELECT ${COLUMNS}, image_type, encode(image_data, 'base64') AS image_b64 FROM ws.product_news WHERE id = $1`, params: [id] },
  ])
  const r = rows[0]
  if (!r) return null
  return { ...mapNews(r), imageDataUrl: r.image_b64 ? `data:${String(r.image_type)};base64,${String(r.image_b64).replace(/\s+/g, '')}` : null }
}

export type NewsImageInput = { action: 'keep' } | { action: 'remove' } | { action: 'set'; base64: string }

export type NewsInput = { title: string; body: string; link: string; tag: NewsTag; image: NewsImageInput }

export class NewsInputError extends Error {}

/** Obrázek z formuláře (base64) → bajty a typ podle obsahu. Chyba = česká hláška. */
export function parseNewsImage(base64: string): { bytes: Buffer; type: string } {
  const clean = base64.replace(/^data:[^;]+;base64,/, '')
  if (clean.length > Math.ceil((NEWS_LIMITS.imageBytes * 4) / 3) + 8) throw new NewsInputError('Obrázek je větší než 600 kB. Zmenšete ho prosím.')
  const bytes = Buffer.from(clean, 'base64')
  if (bytes.length === 0) throw new NewsInputError('Obrázek se nepodařilo přečíst.')
  if (bytes.length > NEWS_LIMITS.imageBytes) throw new NewsInputError('Obrázek je větší než 600 kB. Zmenšete ho prosím.')
  const type = sniffImageType(bytes)
  if (!type) throw new NewsInputError('Obrázek musí být PNG, JPEG nebo WebP.')
  return { bytes, type }
}

function validate(input: NewsInput): { title: string; body: string; link: string | null } {
  const title = input.title.trim()
  const body = input.body.trim()
  if (!title) throw new NewsInputError('Doplňte nadpis.')
  if (title.length > NEWS_LIMITS.title) throw new NewsInputError(`Nadpis může mít nejvýš ${NEWS_LIMITS.title} znaků.`)
  if (!body) throw new NewsInputError('Doplňte krátký text.')
  if (body.length > NEWS_LIMITS.body) throw new NewsInputError(`Text může mít nejvýš ${NEWS_LIMITS.body} znaků.`)
  const link = input.link.trim() ? normalizeNewsLink(input.link) : null
  if (input.link.trim() && !link) throw new NewsInputError('Odkaz musí začínat https://')
  if (link && link.length > NEWS_LIMITS.link) throw new NewsInputError('Odkaz je moc dlouhý.')
  return { title, body, link }
}

/** Nový koncept nebo úprava. Vrací id. */
export async function saveNews(admin: AdminIdentity, id: string | null, input: NewsInput): Promise<string> {
  const { title, body, link } = validate(input)
  const image = input.image.action === 'set' ? parseNewsImage(input.image.base64) : null
  const imageB64 = image ? image.bytes.toString('base64') : null
  const imageType = image ? image.type : null
  const setImage = input.image.action !== 'keep'

  if (!id) {
    const [row] = await adminDb<{ id: string }>`
      INSERT INTO ws.product_news (title, body, link_url, tag, image_data, image_type)
      VALUES (${title}, ${body}, ${link}, ${input.tag}, decode(${imageB64}, 'base64'), ${imageType})
      RETURNING id`
    console.info('admin.news_created', { id: row.id, by: admin.email })
    return row.id
  }
  const rows = setImage
    ? await adminDb<{ id: string }>`
        UPDATE ws.product_news SET title = ${title}, body = ${body}, link_url = ${link}, tag = ${input.tag},
          image_data = decode(${imageB64}, 'base64'), image_type = ${imageType}
        WHERE id = ${id} RETURNING id`
    : await adminDb<{ id: string }>`
        UPDATE ws.product_news SET title = ${title}, body = ${body}, link_url = ${link}, tag = ${input.tag}
        WHERE id = ${id} RETURNING id`
  if (!rows[0]) throw new NewsInputError('Tahle novinka už neexistuje.')
  return id
}

/** Zveřejnit v aplikaci (zvonek „Co je nového“). Už zveřejněná zůstane, jak je. */
export async function publishNews(id: string): Promise<boolean> {
  const rows = await adminDb`UPDATE ws.product_news SET published_at = coalesce(published_at, now()) WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Skrýt z aplikace — jen dokud neodešla e-mailem (CHECK v migraci 083). */
export async function unpublishNews(id: string): Promise<boolean> {
  const rows = await adminDb`UPDATE ws.product_news SET published_at = NULL WHERE id = ${id} AND emailed_at IS NULL RETURNING id`
  return rows.length > 0
}

/** Smazat jde jen koncept (nezveřejněný a neodeslaný). */
export async function deleteNewsDraft(id: string): Promise<boolean> {
  const rows = await adminDb`DELETE FROM ws.product_news WHERE id = ${id} AND published_at IS NULL AND emailed_at IS NULL RETURNING id`
  return rows.length > 0
}

export type NewsRecipients = { accounts: number; people: number }

// Příjemci = majitelé s e-mailem v účtech, které novinky e-mailem nevypnuly
// (odkaz „Nechci dostávat…“ nebo Nastavení › E-maily). Stejně jako queueNewsForAccount.
const RECIPIENTS_FROM = `
  FROM ws.accounts a
  JOIN ws.members m ON m.account_id = a.id AND m.role = 'owner' AND m.email IS NOT NULL
  WHERE a.news_emails`

export async function newsRecipients(): Promise<NewsRecipients> {
  const [rows] = await adminDb.batch([
    { text: `SELECT count(DISTINCT a.id)::int AS accounts, count(DISTINCT (a.id, lower(m.email)))::int AS people ${RECIPIENTS_FROM}`, params: [] },
  ])
  return { accounts: Number(rows[0]?.accounts ?? 0), people: Number(rows[0]?.people ?? 0) }
}

export type SendNewsResult =
  | { status: 'sent'; recipients: number; queued: number; delivered: number }
  /** Počet příjemců se mezitím změnil — admin ho musí potvrdit znovu. */
  | { status: 'recipients_changed'; recipients: NewsRecipients }
  | { status: 'not_published' }
  | { status: 'already_sent' }

/**
 * „Poslat e-mailem všem“. Jednou za novinku (emailed_at se nastaví atomicky),
 * jen s počtem příjemců, který admin viděl a potvrdil. Zprávy jdou do fronty
 * každého účtu (klíč události = bez dvojího odeslání, i když je zařadí znovu
 * denní cron) a hned se zkusí odeslat. Bez WS_EMAIL_FROM čekají ve frontě.
 */
export async function sendNewsEmail(admin: AdminIdentity, id: string, confirmedPeople: number): Promise<SendNewsResult> {
  const [item] = await adminDb<{ published: boolean; emailed: boolean }>`
    SELECT published_at IS NOT NULL AS published, emailed_at IS NOT NULL AS emailed FROM ws.product_news WHERE id = ${id}`
  if (!item || !item.published) return { status: 'not_published' }
  if (item.emailed) return { status: 'already_sent' }

  const recipients = await newsRecipients()
  if (recipients.people !== confirmedPeople) return { status: 'recipients_changed', recipients }

  const [marked, accounts] = await adminDb.batch([
    q`UPDATE ws.product_news SET emailed_at = now(), email_recipients = ${recipients.people}
      WHERE id = ${id} AND published_at IS NOT NULL AND emailed_at IS NULL RETURNING id`,
    { text: `SELECT DISTINCT a.id ${RECIPIENTS_FROM}`, params: [] },
  ])
  if (!marked[0]) return { status: 'already_sent' }

  let queued = 0
  for (const a of accounts) {
    try {
      queued += await queueNewsForAccount({ accountId: String(a.id) })
    } catch (e) {
      // Zbytek dožene denní cron (stejný klíč události).
      console.error('admin.news_queue', { accountId: String(a.id), error: e instanceof Error ? e.message : 'unknown' })
    }
  }
  const flushed = await flushAll({ budgetMs: 20_000 }).catch(() => ({ sent: 0 }))
  console.info('admin.news_emailed', { id, by: admin.email, recipients: recipients.people, queued, sent: flushed.sent })
  return { status: 'sent', recipients: recipients.people, queued, delivered: flushed.sent }
}
