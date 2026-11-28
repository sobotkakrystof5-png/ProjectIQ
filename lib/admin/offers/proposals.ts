import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { createNotification } from '@/lib/notifications'
import { applyRuleChange, readPricingRules, pricingRulesSchema, VARIANT_NAMES, type PricingRules, type VariantKey } from './pricing'
import {
  applyProposalEdit,
  buildProposal,
  clientOffer,
  variantOf,
  type ClientOffer,
  type ProposalDraft,
  type ProposalEdit,
  type ProposalInputs,
  type ProposalInternal,
  type ProposalStatus,
  type ProposalValue,
  type ProposalVariant,
} from './proposal-model'
import { readStoredResult } from './result'
import { pickSimilar, type SimilarCandidate, type SimilarOffer } from './similar'
import { evaluateOffers, periodLabel, previousPeriod, suggestRuleChanges, type OfferReview, type ReviewRow, type SuggestionPayload } from './review'

/**
 * Nabídky z navrhovače (R-147, kroky N2–N4, R-155).
 *
 * Tok: rozbor firmy doběhne → `createProposalFromResearch` spočítá z pravidel
 * tři varianty (koncept) → Kryštof je u kontaktu upraví a pošle e-mailem
 * Nabídka nebo zkopíruje odkaz (`publishProposal`) → klient na `/nabidka/<token>`
 * vybere variantu (`chooseVariant`). Výsledek se zapisuje sám: výběr varianty,
 * zakázka u kontaktu (trigger v migraci 142) a 14 dní bez odpovědi
 * (`maintainOfferProposals`); Kryštof kliká jen „odmítl" a „smlouvá".
 *
 * Bez migrace 142 se nic z toho neukáže a zbytek adminu běží dál.
 */

/* ------------------------------------------------------------------ */
/* Pravidla                                                            */
/* ------------------------------------------------------------------ */

const missingSchema = (err: unknown) => {
  const code = (err as { code?: unknown })?.code
  return code === '42P01' || code === '42703'
}

export async function loadPricingRules(): Promise<{ rules: PricingRules; stored: boolean; updatedAt: string | null }> {
  try {
    const rows = await adminDb<{ pricing_rules: unknown; updated_at: string | Date | null }>`
      SELECT pricing_rules, updated_at FROM admin_settings WHERE id = true LIMIT 1`
    const raw = rows[0]?.pricing_rules ?? null
    return {
      rules: readPricingRules(raw),
      stored: raw !== null && pricingRulesSchema.safeParse(raw).success,
      updatedAt: raw !== null && rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null,
    }
  } catch (err) {
    if (missingSchema(err)) return { rules: readPricingRules(null), stored: false, updatedAt: null }
    throw err
  }
}

/** Uloží pravidla jako novou verzi. Vrací uložená pravidla, nebo `null`, když neprošla kontrolou. */
export async function savePricingRules(input: unknown): Promise<PricingRules | null> {
  const parsed = pricingRulesSchema.safeParse(input)
  if (!parsed.success) return null
  const { rules: current } = await loadPricingRules()
  const next: PricingRules = { ...parsed.data, version: current.version + 1 }
  await adminDb`UPDATE admin_settings SET pricing_rules = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = true`
  return next
}

/* ------------------------------------------------------------------ */
/* Řádek nabídky                                                       */
/* ------------------------------------------------------------------ */

export type ProposalRow = {
  id: string
  contact_id: string
  research_id: string | null
  project_id: string | null
  status: ProposalStatus
  rules_version: number
  company: string
  kind: 'web' | 'eshop'
  band: number | null
  inputs: ProposalInputs
  value: ProposalValue
  variants: ProposalVariant[]
  recommended: VariantKey
  management_monthly: number
  deposit_percent: number
  intro: string
  internal: ProposalInternal | null
  industry: string | null
  public_token: string
  over_cap_confirmed: boolean
  sent_at: string | null
  sent_variants: ProposalVariant[] | null
  valid_until: string | null
  opened_at: string | null
  last_opened_at: string | null
  open_count: number
  chosen_variant: VariantKey | null
  chosen_management: boolean | null
  chosen_at: string | null
  outcome_at: string | null
  outcome_source: 'client' | 'project' | 'timeout' | 'manual' | null
  final_price_czk: number | null
  reference_price: boolean
  created_at: string
  updated_at: string
}

const COLUMNS = `id::text, contact_id::text, research_id::text, project_id::text, status, rules_version, company, kind, band,
  inputs, value, variants, recommended, management_monthly, deposit_percent, intro, internal, industry,
  public_token::text, over_cap_confirmed, sent_at, sent_variants, valid_until, opened_at, last_opened_at, open_count,
  chosen_variant, chosen_management, chosen_at, outcome_at, outcome_source, final_price_czk, reference_price,
  created_at, updated_at`

const DATE_FIELDS = ['sent_at', 'valid_until', 'opened_at', 'last_opened_at', 'chosen_at', 'outcome_at', 'created_at', 'updated_at'] as const

function toRow(raw: Record<string, unknown>): ProposalRow {
  const row = { ...raw } as Record<string, unknown>
  for (const key of DATE_FIELDS) {
    const v = row[key]
    row[key] = v === null || v === undefined ? null : new Date(v as string | Date).toISOString()
  }
  return row as unknown as ProposalRow
}

async function select(where: string, params: unknown[]): Promise<ProposalRow[]> {
  const [rows] = await adminDb.batch([{ text: `SELECT ${COLUMNS} FROM offer_proposals ${where}`, params }])
  return (rows as Record<string, unknown>[]).map(toRow)
}

export async function getProposal(id: string): Promise<ProposalRow | null> {
  return (await select('WHERE id = $1', [id]))[0] ?? null
}

export async function listProposalsForContact(contactId: string, limit = 5): Promise<ProposalRow[]> {
  return select(
    `WHERE contact_id IN (SELECT id FROM contacts WHERE id = $1 OR merged_into = $1)
     ORDER BY created_at DESC LIMIT $2`,
    [contactId, limit],
  )
}

/** Adresa stránky nabídky pro klienta. */
export function offerUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.zakaziq.cz').replace(/\/+$/, '')
  return `${base}/nabidka/${token}`
}

/* ------------------------------------------------------------------ */
/* Vznik a úprava                                                      */
/* ------------------------------------------------------------------ */

async function insertDraft(contactId: string, researchId: string | null, draft: ProposalDraft): Promise<string> {
  const rows = await adminDb<{ id: string }>`
    INSERT INTO offer_proposals
      (contact_id, research_id, status, rules_version, company, kind, band, inputs, value, variants, recommended,
       management_monthly, deposit_percent, intro, internal, industry)
    VALUES
      (${contactId}, ${researchId}, 'draft', ${draft.rulesVersion}, ${draft.company.slice(0, 200)}, ${draft.kind}, ${draft.band},
       ${JSON.stringify(draft.inputs)}::jsonb, ${JSON.stringify(draft.value)}::jsonb, ${JSON.stringify(draft.variants)}::jsonb,
       ${draft.recommended}, ${draft.managementMonthly}, ${draft.depositPercent}, ${draft.intro.slice(0, 2000)},
       ${JSON.stringify(draft.internal)}::jsonb, ${draft.industry?.slice(0, 80) ?? null})
    RETURNING id::text`
  return rows[0].id
}

/**
 * Návrh nabídky z hotového rozboru. Volá se sám po odevzdání rozboru a tlačítkem
 * „Navrhnout cenu" (starší rozbory). Rozbor bez kontaktu nebo bez výsledku = `null`.
 */
export async function createProposalFromResearch(researchId: string): Promise<string | null> {
  const rows = await adminDb<{ contact_id: string | null; brief: unknown; result: unknown; status: string }>`
    SELECT contact_id::text, brief, result, status FROM offer_research WHERE id = ${researchId}`
  const row = rows[0]
  if (!row || row.contact_id === null || row.status !== 'done') return null
  const result = readStoredResult(row.result)
  if (result === null) return null
  const { rules } = await loadPricingRules()
  const company = (row.brief as { company?: unknown } | null)?.company
  const draft = buildProposal(rules, result, typeof company === 'string' && company.trim() !== '' ? company : 'Firma')
  return insertDraft(row.contact_id, researchId, draft)
}

/** Po odevzdání rozboru: návrh se připraví sám. Chyba (třeba chybí migrace 142) rozbor nezastaví. */
export async function createProposalAfterResearch(researchId: string): Promise<void> {
  try {
    await createProposalFromResearch(researchId)
  } catch (err) {
    if (!missingSchema(err)) {
      console.error('[navrhovac] návrh nabídky se nepřipravil:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
    }
  }
}

export type EditOutcome = { ok: true; proposal: ProposalRow } | { ok: false; error: 'not_found' | 'not_draft' }

/** Uloží úpravu konceptu. Odeslanou nabídku už měnit nejde (klient ji má). */
export async function updateProposal(id: string, edit: ProposalEdit, overCapConfirmed: boolean): Promise<EditOutcome> {
  const current = await getProposal(id)
  if (!current) return { ok: false, error: 'not_found' }
  if (current.status !== 'draft') return { ok: false, error: 'not_draft' }
  const { rules } = await loadPricingRules()
  const next = applyProposalEdit(rules, current, edit)
  const rows = await adminDb<{ id: string }>`
    UPDATE offer_proposals
       SET inputs = ${JSON.stringify(next.inputs)}::jsonb, value = ${JSON.stringify(next.value)}::jsonb,
           variants = ${JSON.stringify(next.variants)}::jsonb, recommended = ${next.recommended},
           intro = ${next.intro.slice(0, 2000)}, kind = ${next.kind}, band = ${next.band},
           rules_version = ${rules.version}, over_cap_confirmed = ${overCapConfirmed}, updated_at = now()
     WHERE id = ${id} AND status = 'draft'
 RETURNING id::text`
  if (!rows[0]) return { ok: false, error: 'not_draft' }
  return { ok: true, proposal: (await getProposal(id)) as ProposalRow }
}

export type PublishOutcome =
  | { ok: true; url: string; token: string }
  | { ok: false; error: 'not_found' | 'needs_confirmation' | 'wrong_contact' }

type PublishCheck = { ok: true; row: ProposalRow } | { ok: false; error: 'not_found' | 'needs_confirmation' | 'wrong_contact' }

async function checkPublish(id: string, contactId?: string): Promise<PublishCheck> {
  const row = await getProposal(id)
  if (!row) return { ok: false, error: 'not_found' }
  if (contactId !== undefined) {
    const family = await adminDb<{ ok: boolean }>`
      SELECT coalesce((SELECT merged_into FROM contacts WHERE id = ${row.contact_id}), ${row.contact_id}::uuid)
           = coalesce((SELECT merged_into FROM contacts WHERE id = ${contactId}), ${contactId}::uuid) AS ok`
    if (!family[0]?.ok) return { ok: false, error: 'wrong_contact' }
  }
  if (row.status === 'draft' && !row.over_cap_confirmed && row.variants.some((v) => v.needsConfirmation)) {
    return { ok: false, error: 'needs_confirmation' }
  }
  return { ok: true, row }
}

/**
 * Smí nabídka odejít? Cena nad stropem jen s potvrzením (pravidla, oddíl 5)
 * a jen kontaktu, ke kterému patří (adresu e-mailu čte server sám).
 */
export async function canPublish(id: string, contactId?: string): Promise<PublishOutcome> {
  const check = await checkPublish(id, contactId)
  if (!check.ok) return check
  return { ok: true, url: offerUrl(check.row.public_token), token: check.row.public_token }
}

/** Zveřejní odkaz a zapíše odeslání. Opakované zavolání nic nezmění. */
export async function publishProposal(id: string, contactId?: string): Promise<PublishOutcome> {
  const check = await checkPublish(id, contactId)
  if (!check.ok) return check
  await adminDb`
    UPDATE offer_proposals
       SET status = 'sent', sent_at = now(), sent_variants = variants,
           valid_until = now() + interval '1 day' * ${check.row.inputs.terms.validityDays},
           updated_at = now()
     WHERE id = ${id} AND status = 'draft'`
  return { ok: true, url: offerUrl(check.row.public_token), token: check.row.public_token }
}

export type OutcomeChoice = 'declined' | 'negotiating' | 'sent'

/**
 * „Odmítl" a „Smlouvá" (Kryštof), „sent" vrací zpět (Zpět v toastu).
 * Nabídku, ze které vznikla zakázka, už nikdo nepřepíše.
 */
export async function setOutcome(id: string, next: OutcomeChoice): Promise<ProposalRow | null> {
  const rows =
    next === 'sent'
      ? await adminDb<{ id: string }>`
          UPDATE offer_proposals
             SET status = CASE WHEN valid_until IS NOT NULL AND valid_until <= now() THEN 'no_reply' ELSE 'sent' END,
                 outcome_source = CASE WHEN valid_until IS NOT NULL AND valid_until <= now() THEN 'timeout' ELSE NULL END,
                 outcome_at = CASE WHEN valid_until IS NOT NULL AND valid_until <= now() THEN now() ELSE NULL END,
                 updated_at = now()
           WHERE id = ${id} AND project_id IS NULL AND status IN ('declined', 'negotiating') AND outcome_source = 'manual'
       RETURNING id::text`
      : await adminDb<{ id: string }>`
          UPDATE offer_proposals
             SET status = ${next}, outcome_source = 'manual', outcome_at = now(), updated_at = now()
           WHERE id = ${id} AND project_id IS NULL AND status <> 'draft'
       RETURNING id::text`
  return rows[0] ? getProposal(id) : null
}

export async function setReferencePrice(id: string, value: boolean): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`
    UPDATE offer_proposals SET reference_price = ${value}, updated_at = now() WHERE id = ${id} RETURNING id::text`
  return rows.length > 0
}

/** Prodlouží platnost o lhůtu z pravidel. Nabídka bez odpovědi zase čeká. */
export async function extendValidity(id: string): Promise<ProposalRow | null> {
  const { rules } = await loadPricingRules()
  const rows = await adminDb<{ id: string }>`
    UPDATE offer_proposals
       SET valid_until = now() + interval '1 day' * ${rules.validityDays},
           status = CASE WHEN status = 'no_reply' THEN 'sent' ELSE status END,
           outcome_source = CASE WHEN status = 'no_reply' THEN NULL ELSE outcome_source END,
           outcome_at = CASE WHEN status = 'no_reply' THEN NULL ELSE outcome_at END,
           updated_at = now()
     WHERE id = ${id} AND status <> 'draft' AND project_id IS NULL
 RETURNING id::text`
  return rows[0] ? getProposal(id) : null
}

export async function deleteProposal(id: string): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`DELETE FROM offer_proposals WHERE id = ${id} RETURNING id::text`
  return rows.length > 0
}

/* ------------------------------------------------------------------ */
/* Stránka nabídky (klient, bez přihlášení)                             */
/* ------------------------------------------------------------------ */

export type PublicOffer = { id: string; offer: ClientOffer }

/** Nabídka podle odkazu. Koncept (neodeslaný) neexistuje. */
export async function loadPublicOffer(token: string): Promise<PublicOffer | null> {
  const [row] = await select(`WHERE public_token = $1 AND status <> 'draft'`, [token])
  if (!row) return null
  return { id: row.id, offer: clientOffer(row) }
}

/** Náhled pro Kryštofa (i konceptu), stejný obsah jako klient uvidí. */
export async function loadOfferPreview(id: string): Promise<PublicOffer | null> {
  const row = await getProposal(id)
  if (!row) return null
  const offer = clientOffer(row)
  return { id: row.id, offer: row.status === 'draft' ? { ...offer, sentAt: new Date().toISOString() } : offer }
}

/**
 * Klient nabídku otevřel. Zapisuje až prohlížeč po načtení stránky, ne otevření
 * odkazu (poštovní filtry odkazy procházejí, R-119). První otevření = zvonek.
 */
export async function markOpened(token: string): Promise<void> {
  const rows = await adminDb<{ first: boolean; company: string; contact_id: string }>`
    UPDATE offer_proposals
       SET open_count = open_count + 1, opened_at = coalesce(opened_at, now()), last_opened_at = now()
     WHERE public_token = ${token} AND status <> 'draft'
 RETURNING (open_count = 1) AS first, company, contact_id::text`
  const row = rows[0]
  if (row?.first) {
    await createNotification({
      type: 'offer_opened',
      title: `Klient otevřel nabídku: ${row.company.slice(0, 120)}`,
      link: `/dashboard/kontakty/${row.contact_id}`,
    })
  }
}

export type ChooseOutcome = { ok: true } | { ok: false; error: 'not_found' | 'expired' | 'locked' }

/** Klient vybral variantu („Beru tuhle variantu"). Dokud nevznikla zakázka, smí volbu změnit. */
export async function chooseVariant(token: string, variant: VariantKey, management: boolean): Promise<ChooseOutcome> {
  const rows = await adminDb<{ company: string; contact_id: string; variants: ProposalVariant[] }>`
    UPDATE offer_proposals
       SET chosen_variant = ${variant}, chosen_management = ${management}, chosen_at = now(),
           status = 'accepted', outcome_source = 'client', outcome_at = now(), updated_at = now()
     WHERE public_token = ${token} AND status <> 'draft' AND project_id IS NULL
       AND (valid_until IS NULL OR valid_until > now())
 RETURNING company, contact_id::text, variants`
  const row = rows[0]
  if (!row) {
    const [current] = await select('WHERE public_token = $1', [token])
    if (!current || current.status === 'draft') return { ok: false, error: 'not_found' }
    if (current.project_id !== null) return { ok: false, error: 'locked' }
    return { ok: false, error: 'expired' }
  }
  const chosen = variantOf(row.variants, variant)
  const price = chosen ? `${chosen.price.toLocaleString('cs-CZ')} Kč` : ''
  await createNotification({
    type: 'offer_chosen',
    title: `Klient vybral variantu ${VARIANT_NAMES[variant]}: ${row.company.slice(0, 100)}`,
    body: [price, management ? 'se správou webu' : 'bez správy'].filter(Boolean).join(', '),
    link: `/dashboard/kontakty/${row.contact_id}`,
  })
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Údržba (cron)                                                       */
/* ------------------------------------------------------------------ */

/** 14 dní (lhůta nabídky) bez odpovědi = „neodpověděl", samo (pravidla, oddíl 5). */
export async function maintainOfferProposals(): Promise<{ noReply: number }> {
  try {
    const rows = await adminDb<{ id: string }>`
      UPDATE offer_proposals
         SET status = 'no_reply', outcome_source = 'timeout', outcome_at = now(), updated_at = now()
       WHERE status = 'sent' AND valid_until IS NOT NULL AND valid_until <= now()
   RETURNING id::text`
    return { noReply: rows.length }
  } catch (err) {
    if (missingSchema(err)) return { noReply: 0 }
    throw err
  }
}

export async function purgeOfferProposals(): Promise<number> {
  try {
    const rows = await adminDb<{ n: number }>`SELECT purge_offer_proposals() AS n`
    return rows[0]?.n ?? 0
  } catch (err) {
    if ((err as { code?: unknown })?.code === '42883' || missingSchema(err)) return 0
    throw err
  }
}

/* ------------------------------------------------------------------ */
/* Vyhodnocení (N3, N4)                                                 */
/* ------------------------------------------------------------------ */

/** Odeslané nabídky za rok i s počtem poptávek z webu zakázky (KP17). */
async function loadReviewRows(): Promise<ReviewRow[]> {
  const sql = `
    SELECT p.id::text, p.company, p.contact_id::text, p.status, p.sent_at, p.kind, p.band, p.industry,
           p.reference_price, p.recommended, p.sent_variants, p.opened_at, p.project_id::text, p.final_price_czk,
           p.value -> 'inquiries' AS inquiries, p.value -> 'yearly' AS yearly, k.start, e.n6, e.n12
      FROM offer_proposals p
      LEFT JOIN LATERAL (SELECT min(created_at) AS start FROM project_web_keys WHERE project_id = p.project_id) k ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE ev.created_at < k.start + interval '6 months')::int AS n6,
               count(*) FILTER (WHERE ev.created_at < k.start + interval '12 months')::int AS n12
          FROM project_web_events ev
         WHERE ev.project_id = p.project_id AND NOT ev.is_test AND ev.created_at >= k.start) e ON true
     WHERE p.sent_at IS NOT NULL AND p.sent_at > now() - interval '24 months'
     ORDER BY p.sent_at DESC`
  let raw: Record<string, unknown>[]
  try {
    ;[raw] = (await adminDb.batch([{ text: sql, params: [] }])) as [Record<string, unknown>[]]
  } catch (err) {
    // Bez počítání poptávek z webu (migrace 126) vyhodnocení běží dál, jen bez N4.
    if (!missingSchema(err)) throw err
    ;[raw] = (await adminDb.batch([
      {
        text: `SELECT id::text, company, contact_id::text, status, sent_at, kind, band, industry, reference_price, recommended,
                      sent_variants, opened_at, project_id::text, final_price_czk, value -> 'inquiries' AS inquiries, value -> 'yearly' AS yearly,
                      NULL::timestamptz AS start, 0 AS n6, 0 AS n12
                 FROM offer_proposals WHERE sent_at IS NOT NULL AND sent_at > now() - interval '24 months'`,
        params: [],
      },
    ])) as [Record<string, unknown>[]]
  }
  return raw.map((r) => ({
    id: r.id as string,
    company: r.company as string,
    contact_id: r.contact_id as string,
    status: r.status as ProposalStatus,
    sent_at: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
    kind: r.kind as 'web' | 'eshop',
    band: (r.band as number | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    reference_price: r.reference_price === true,
    recommended: r.recommended as VariantKey,
    sent_variants: (r.sent_variants as ProposalVariant[] | null) ?? null,
    opened_at: r.opened_at ? new Date(r.opened_at as string).toISOString() : null,
    project_id: (r.project_id as string | null) ?? null,
    final_price_czk: (r.final_price_czk as number | null) ?? null,
    inquiries: (r.inquiries as { min: number; max: number } | null) ?? null,
    yearly: readRange(r.yearly),
    web: r.start ? { start: new Date(r.start as string).toISOString(), n6: Number(r.n6 ?? 0), n12: Number(r.n12 ?? 0) } : null,
  }))
}

/** Rozmezí z `value` (jsonb); cokoli jiného než dvě čísla = `null`. */
function readRange(raw: unknown): { min: number; max: number } | null {
  const r = raw as { min?: unknown; max?: unknown } | null
  if (!r || typeof r.min !== 'number' || typeof r.max !== 'number' || !Number.isFinite(r.min) || !Number.isFinite(r.max)) return null
  return { min: r.min, max: r.max }
}

export async function loadOfferReview(now: Date = new Date()): Promise<{ review: OfferReview; rules: PricingRules }> {
  const [{ rules }, rows] = await Promise.all([loadPricingRules(), loadReviewRows()])
  return { review: evaluateOffers(rows, rules, now), rules }
}

export type RuleSuggestion = {
  id: string
  kind: 'raise_band' | 'shift_variant' | 'insight'
  period: string
  payload: SuggestionPayload & { before?: PricingRules }
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  decided_at: string | null
}

export async function listSuggestions(): Promise<RuleSuggestion[]> {
  const rows = await adminDb<Record<string, unknown>>`
    SELECT id::text, kind, period, payload, reason, status, created_at, decided_at
      FROM offer_rule_suggestions
     WHERE status = 'pending' OR decided_at > now() - interval '30 days'
     ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 30`
  return rows.map((r) => ({
    ...(r as unknown as RuleSuggestion),
    created_at: new Date(r.created_at as string).toISOString(),
    decided_at: r.decided_at ? new Date(r.decided_at as string).toISOString() : null,
  }))
}

/** Vytvoří návrhy z vyhodnocení. Stejný návrh podruhé nevznikne (otisk). Vrací počet nových. */
export async function createSuggestions(period: string, now: Date = new Date()): Promise<{ created: number; review: OfferReview }> {
  const { review, rules } = await loadOfferReview(now)
  let created = 0
  for (const s of suggestRuleChanges(review, rules, period)) {
    const rows = await adminDb<{ id: string }>`
      INSERT INTO offer_rule_suggestions (fingerprint, kind, period, payload, reason, rules_version)
      VALUES (${s.fingerprint}, ${s.kind}, ${period}, ${JSON.stringify(s.payload)}::jsonb, ${s.reason.slice(0, 600)}, ${rules.version})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id::text`
    created += rows.length
  }
  return { created, review }
}

/**
 * Měsíční vyhodnocení (denní cron): jednou za měsíc za ten předchozí. Zámek
 * v `admin_settings.offer_review_period`, takže dva běhy v tentýž den nic nezdvojí.
 */
export async function runMonthlyOfferReview(now: Date = new Date()): Promise<{ period: string; created: number } | null> {
  const period = previousPeriod(now)
  let claimed: { id: boolean }[]
  try {
    claimed = await adminDb<{ id: boolean }>`
      UPDATE admin_settings SET offer_review_period = ${period}
       WHERE id = true AND offer_review_period IS DISTINCT FROM ${period}
   RETURNING id`
  } catch (err) {
    if (missingSchema(err)) return null
    throw err
  }
  if (claimed.length === 0) return null

  const { created, review } = await createSuggestions(period, now)
  if (review.sent > 0 || created > 0) {
    const rate = review.resolved > 0 ? `přijato ${review.accepted} z ${review.resolved}` : 'zatím bez výsledků'
    const price = review.withinTen.total > 0 ? `, cena podle pravidel u ${review.withinTen.hit} z ${review.withinTen.total}` : ''
    await createNotification({
      type: 'offer_review',
      title: `Vyhodnocení nabídek za ${periodLabel(period)}`,
      body: `${rate}${price}.${created > 0 ? ` Návrhy úprav pravidel: ${created}.` : ''}`,
      link: '/dashboard/nabidky',
    })
  }
  return { period, created }
}

export type DecideOutcome = { ok: true; rules: PricingRules | null } | { ok: false; error: 'not_found' | 'not_applicable' }

/** Přijme návrh: úprava pravidel jako nová verze (předchozí verze se uloží pro Zpět). Postřeh jen označí. */
export async function acceptSuggestion(id: string): Promise<DecideOutcome> {
  const rows = await adminDb<{ kind: string; payload: SuggestionPayload }>`
    SELECT kind, payload FROM offer_rule_suggestions WHERE id = ${id} AND status = 'pending'`
  const s = rows[0]
  if (!s) return { ok: false, error: 'not_found' }
  if (s.payload.type === 'insight') {
    await adminDb`UPDATE offer_rule_suggestions SET status = 'accepted', decided_at = now() WHERE id = ${id} AND status = 'pending'`
    return { ok: true, rules: null }
  }
  const { rules } = await loadPricingRules()
  const next = applyRuleChange(rules, s.payload)
  if (next === null) return { ok: false, error: 'not_applicable' }
  const updated = await adminDb<{ id: string }>`
    UPDATE offer_rule_suggestions
       SET status = 'accepted', decided_at = now(),
           payload = payload || jsonb_build_object('before', ${JSON.stringify(rules)}::jsonb)
     WHERE id = ${id} AND status = 'pending'
 RETURNING id::text`
  if (!updated[0]) return { ok: false, error: 'not_found' }
  await adminDb`UPDATE admin_settings SET pricing_rules = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = true`
  return { ok: true, rules: next }
}

export async function rejectSuggestion(id: string): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`
    UPDATE offer_rule_suggestions SET status = 'rejected', decided_at = now()
     WHERE id = ${id} AND status = 'pending' RETURNING id::text`
  return rows.length > 0
}

/** Zpět do 5 minut: návrh zase čeká a pravidla se vrátí (jako nová verze, ať verze jen roste). */
export async function undoSuggestion(id: string): Promise<boolean> {
  const rows = await adminDb<{ status: string; payload: SuggestionPayload & { before?: unknown } }>`
    SELECT status, payload FROM offer_rule_suggestions
     WHERE id = ${id} AND status <> 'pending' AND decided_at > now() - interval '5 minutes'`
  const s = rows[0]
  if (!s) return false
  if (s.status === 'accepted' && s.payload.type !== 'insight') {
    const before = pricingRulesSchema.safeParse(s.payload.before)
    if (!before.success) return false
    const { rules } = await loadPricingRules()
    const restored = { ...before.data, version: rules.version + 1 }
    await adminDb`UPDATE admin_settings SET pricing_rules = ${JSON.stringify(restored)}::jsonb, updated_at = now() WHERE id = true`
  }
  await adminDb`
    UPDATE offer_rule_suggestions SET status = 'pending', decided_at = NULL, payload = payload - 'before' WHERE id = ${id}`
  return true
}

/**
 * Podobné odeslané nabídky jiným firmám ke konceptu (N3): stejný obor nebo pásmo,
 * za posledních 24 měsíců. Výběr a pořadí dělá `pickSimilar`.
 */
export async function listSimilarOffers(p: ProposalRow, rules: PricingRules): Promise<SimilarOffer[]> {
  const [raw, familyRows] = (await adminDb.batch([
    {
      text: `SELECT id::text, contact_id::text, company, industry, kind, band, status, sent_at, recommended,
                    sent_variants, chosen_variant, final_price_czk, reference_price
               FROM offer_proposals
              WHERE sent_at IS NOT NULL AND sent_at > now() - interval '24 months'
                AND NOT reference_price AND kind = $1 AND id <> $2
              ORDER BY sent_at DESC LIMIT 200`,
      params: [p.kind, p.id],
    },
    {
      text: `SELECT id::text FROM contacts
              WHERE coalesce(merged_into, id) = (SELECT coalesce(merged_into, id) FROM contacts WHERE id = $1)`,
      params: [p.contact_id],
    },
  ])) as [Record<string, unknown>[], { id: string }[]]
  const family = familyRows.map((r) => r.id)
  const candidates: SimilarCandidate[] = raw.map((r) => ({
    id: r.id as string,
    contact_id: r.contact_id as string,
    company: r.company as string,
    industry: (r.industry as string | null) ?? null,
    kind: r.kind as 'web' | 'eshop',
    band: (r.band as number | null) ?? null,
    status: r.status as ProposalStatus,
    sent_at: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
    recommended: r.recommended as VariantKey,
    sent_variants: (r.sent_variants as ProposalVariant[] | null) ?? null,
    chosen_variant: (r.chosen_variant as VariantKey | null) ?? null,
    final_price_czk: (r.final_price_czk as number | null) ?? null,
    reference_price: r.reference_price === true,
  }))
  return pickSimilar({ kind: p.kind, band: p.band, industry: p.industry, contactIds: [p.contact_id, ...family] }, candidates, rules)
}

/** Seznam nabídek pro přehled. */
export async function listRecentProposals(limit = 50): Promise<ProposalRow[]> {
  return select('ORDER BY coalesce(sent_at, created_at) DESC LIMIT $1', [limit])
}

