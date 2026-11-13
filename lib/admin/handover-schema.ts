import { z } from 'zod'

/**
 * Předávací dokument „co bylo dodané" (AD16, migrace 112).
 *
 * Samostatný soubor bez `server-only`, protože podle něj počítá i formulář
 * v prohlížeči — stejný důvod jako u `invoice-issue-schema.ts`.
 *
 * Tvar schválně drží čtyři oddělené části: **co bylo dodané**, **kde má
 * klient přístupy**, **co je v ceně údržby** a **co v ní není**. Poslední
 * dvě jsou nejčastější spor po předání, takže mají na dokladu vlastní
 * seznam, ne odstavec.
 */

const text = (max: number) => z.string().trim().max(max)

export const handoverItemSchema = z.object({
  label: text(160).min(1, 'Napište, co bylo dodané.'),
  note: text(400).default(''),
})

export const handoverAccessSchema = z.object({
  label: text(160).min(1, 'Napište, k čemu je přístup.'),
  /** Kde ho klient najde — adresa, ne přihlašovací údaje. */
  where: text(400).default(''),
})

export const handoverSchema = z.object({
  summary: text(2000).default(''),
  items: z.array(handoverItemSchema).max(40).default([]),
  access: z.array(handoverAccessSchema).max(30).default([]),
  maintenance: z
    .object({
      included: z.array(text(200).min(1)).max(30).default([]),
      excluded: z.array(text(200).min(1)).max(30).default([]),
    })
    .default({ included: [], excluded: [] }),
  note: text(2000).default(''),
})

export type HandoverDoc = z.infer<typeof handoverSchema>
export type HandoverItem = z.infer<typeof handoverItemSchema>
export type HandoverAccess = z.infer<typeof handoverAccessSchema>

export const EMPTY_HANDOVER: HandoverDoc = {
  summary: '',
  items: [],
  access: [],
  maintenance: { included: [], excluded: [] },
  note: '',
}

/** Prázdný dokument nemá smysl vystavovat — musí v něm něco být. */
export function handoverIsEmpty(doc: HandoverDoc): boolean {
  return (
    doc.summary === '' &&
    doc.items.length === 0 &&
    doc.access.length === 0 &&
    doc.maintenance.included.length === 0 &&
    doc.maintenance.excluded.length === 0
  )
}

/** Všechen text dokumentu v jednom poli — pro kontrolu citlivých údajů. */
export function handoverTexts(doc: HandoverDoc): string[] {
  return [
    doc.summary,
    doc.note,
    ...doc.items.flatMap((i) => [i.label, i.note]),
    ...doc.access.flatMap((a) => [a.label, a.where]),
    ...doc.maintenance.included,
    ...doc.maintenance.excluded,
  ].filter((value) => value !== '')
}

/**
 * Prázdný řádek je nedopsaný, ne chyba: formulář jich přidává víc najednou
 * a člověk je nedávyplňuje. Vyhodí se před kontrolou, ať uživatel nedostává
 * hlášku o něčem, co ani nechce uložit.
 */
export function cleanHandover(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const doc = input as Record<string, unknown>
  const rows = (value: unknown, key: 'note' | 'where') =>
    Array.isArray(value)
      ? value
          .filter((row) => typeof row === 'object' && row !== null && String((row as Record<string, unknown>).label ?? '').trim() !== '')
          .map((row) => {
            const r = row as Record<string, unknown>
            return { label: String(r.label ?? '').trim(), [key]: String(r[key] ?? '').trim() }
          })
      : []
  const lines = (value: unknown) =>
    Array.isArray(value) ? value.map((row) => String(row ?? '').trim()).filter((row) => row !== '') : []
  const maintenance = (doc.maintenance ?? {}) as Record<string, unknown>

  return {
    ...doc,
    items: rows(doc.items, 'note'),
    access: rows(doc.access, 'where'),
    maintenance: { included: lines(maintenance.included), excluded: lines(maintenance.excluded) },
  }
}
