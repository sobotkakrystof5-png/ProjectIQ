'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adminActorEmail, requireAuth } from '@/lib/auth'
import { VoiceKeyConfigError } from '@/lib/admin/voice/keys'
import {
  MAX_ACTIVE_DEVICES,
  createDevice,
  isMissingVoiceSchema,
  restoreDevice,
  revokeDevice,
  type VoiceDevice,
} from '@/lib/admin/voice/devices'
import { DICTATION_STATUSES } from '@/lib/admin/voice/labels'
import {
  acceptSuggestion,
  addRule,
  countDictations,
  deleteDictations,
  deleteRule,
  deleteTerm,
  forgetLearnedTerm,
  rejectSuggestion,
  restoreRule,
  restoreTerm,
  ruleInput,
  saveSettings,
  saveSnippet,
  saveTerm,
  setRuleActive,
  settingsInput,
  snippetInput,
  termInput,
  undoSuggestion,
  type DeleteScope,
  type RuleSnapshot,
  type TermSnapshot,
} from '@/lib/admin/voice/manage'
import { SEARCH_MAX } from '@/lib/admin/voice/queries'
import { runVoiceLearningNow } from '@/lib/admin/voice/learner'
import { summarizeMeeting } from '@/lib/admin/voice/meeting-summary'
import { deleteMeeting, loadMeeting, renameMeeting, saveMeetingSummary, setMeetingContact } from '@/lib/admin/voice/meetings'
import { isIsoDate } from '@/lib/prague-time'

// ZakazIQ Voice (R-150): zařízení s klíčem v adminu (VO01). Klíč se vrací jen
// z vytvoření a nikam se neloguje; chyby se logují jen názvem.

export type VoiceResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string }

const PAGE = '/dashboard/voice'
const idSchema = z.string().uuid()
const nameSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Napište název zařízení, třeba „MacBook".').max(80, 'Název může mít nejvýš 80 znaků.'))

const MISSING = 'Databáze ještě nemá tabulky ZakazIQ Voice (migrace 138).'

function failure(err: unknown, what: string): { ok: false; error: string } {
  if (err instanceof VoiceKeyConfigError) {
    return { ok: false, error: 'Chybí nastavení AGENT_KEY_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
  }
  if (isMissingVoiceSchema(err)) return { ok: false, error: MISSING }
  console.error(`[voice] ${what} selhalo:`, err instanceof Error ? err.name : 'unknown')
  return { ok: false, error: 'Něco se nepovedlo. Zkuste to prosím znovu.' }
}

/** Nové zařízení. Klíč je v odpovědi jedinkrát. */
export async function addVoiceDevice(rawName: unknown): Promise<VoiceResult<{ key: string; device: VoiceDevice }>> {
  await requireAuth()
  const name = nameSchema.safeParse(typeof rawName === 'string' ? rawName : '')
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? 'Neplatný název.' }
  try {
    const res = await createDevice(name.data, await adminActorEmail())
    if (!res.ok) {
      return { ok: false, error: `Platných zařízení může být nejvýš ${MAX_ACTIVE_DEVICES}. Nejdřív některé zneplatněte.` }
    }
    revalidatePath(PAGE)
    return { ok: true, key: res.key, device: res.device }
  } catch (err) {
    return failure(err, 'vytvoření zařízení')
  }
}

export async function revokeVoiceDevice(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Neplatné zařízení.' }
  try {
    const done = await revokeDevice(id.data, await adminActorEmail())
    revalidatePath(PAGE)
    return done ? { ok: true } : { ok: false, error: 'Zařízení už platné není.' }
  } catch (err) {
    return failure(err, 'zneplatnění zařízení')
  }
}

/** „Zpět" po zneplatnění. Po dvou minutách už nejde. */
export async function restoreVoiceDevice(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Neplatné zařízení.' }
  try {
    const done = await restoreDevice(id.data)
    revalidatePath(PAGE)
    return done ? { ok: true } : { ok: false, error: 'Vrátit už nejde. Přidejte zařízení znovu, dostane nový klíč.' }
  } catch (err) {
    return failure(err, 'vrácení zařízení')
  }
}

// --- VO10: učení, slovník, nastavení a mazání diktátů ---------------------------

const PAGE_TABS = ['', 'historie', 'uceni', 'slovnik', 'nastaveni']
const refresh = () => {
  for (const tab of PAGE_TABS) revalidatePath(tab ? `${PAGE}?tab=${tab}` : PAGE)
  revalidatePath(PAGE)
  revalidatePath('/dashboard')
}

const GONE = 'Tohle už se mezitím změnilo. Obnovte stránku.'
const UNDO_LATE = 'Vrátit už nejde, od změny uběhly víc než dvě minuty.'

async function guarded<T>(what: string, fn: () => Promise<VoiceResult<T>>): Promise<VoiceResult<T>> {
  await requireAuth()
  try {
    return await fn()
  } catch (err) {
    return failure(err, what)
  }
}

export async function acceptVoiceSuggestion(rawId: unknown): Promise<VoiceResult> {
  return guarded('přijetí návrhu', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatný návrh.' }
    const res = await acceptSuggestion(id.data)
    if (res === 'invalid') return { ok: false, error: 'Návrh je poškozený, přijmout nejde. Odmítněte ho.' }
    if (res === 'gone') return { ok: false, error: GONE }
    refresh()
    return { ok: true }
  })
}

export async function rejectVoiceSuggestion(rawId: unknown): Promise<VoiceResult> {
  return guarded('odmítnutí návrhu', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatný návrh.' }
    if (!(await rejectSuggestion(id.data))) return { ok: false, error: GONE }
    refresh()
    return { ok: true }
  })
}

export async function undoVoiceSuggestion(rawId: unknown): Promise<VoiceResult> {
  return guarded('vrácení návrhu', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatný návrh.' }
    if (!(await undoSuggestion(id.data))) return { ok: false, error: UNDO_LATE }
    refresh()
    return { ok: true }
  })
}

const termSnapshotSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['term', 'snippet']),
  term: z.string().trim().min(1).max(80),
  heardAs: z.array(z.string().max(120)).max(10),
  expansion: z.string().max(2000).nullable(),
  source: z.enum(['manual', 'learned']),
  uses: z.number().int().min(0).max(10_000_000),
})

export async function forgetVoiceLearnedTerm(rawId: unknown): Promise<VoiceResult<{ snapshot: TermSnapshot }>> {
  return guarded<{ snapshot: TermSnapshot }>('vrácení naučeného slova', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatné slovo.' }
    const snapshot = await forgetLearnedTerm(id.data)
    if (!snapshot) return { ok: false, error: GONE }
    refresh()
    return { ok: true, snapshot }
  })
}

export async function deleteVoiceTerm(rawId: unknown): Promise<VoiceResult<{ snapshot: TermSnapshot }>> {
  return guarded<{ snapshot: TermSnapshot }>('smazání slova', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatné slovo.' }
    const snapshot = await deleteTerm(id.data)
    if (!snapshot) return { ok: false, error: GONE }
    refresh()
    return { ok: true, snapshot }
  })
}

export async function restoreVoiceTerm(raw: unknown): Promise<VoiceResult> {
  return guarded('vrácení slova', async () => {
    const s = termSnapshotSchema.safeParse(raw)
    if (!s.success) return { ok: false, error: 'Vrátit nejde.' }
    if (!(await restoreTerm(s.data))) return { ok: false, error: 'Vrátit nejde, stejné slovo už ve slovníku je.' }
    refresh()
    return { ok: true }
  })
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Zkontrolujte vyplněné údaje.'
const DUPLICATE = 'Tohle už ve slovníku je.'

export async function saveVoiceTerm(raw: unknown): Promise<VoiceResult> {
  return guarded('uložení slova', async () => {
    const input = termInput.safeParse(raw)
    if (!input.success) return { ok: false, error: firstIssue(input.error) }
    const res = await saveTerm(input.data)
    if (res === 'duplicate') return { ok: false, error: DUPLICATE }
    if (res === 'gone') return { ok: false, error: GONE }
    refresh()
    return { ok: true }
  })
}

export async function saveVoiceSnippet(raw: unknown): Promise<VoiceResult> {
  return guarded('uložení zkratky', async () => {
    const input = snippetInput.safeParse(raw)
    if (!input.success) return { ok: false, error: firstIssue(input.error) }
    const res = await saveSnippet(input.data)
    if (res === 'duplicate') return { ok: false, error: 'Tahle zkratka už existuje.' }
    if (res === 'gone') return { ok: false, error: GONE }
    refresh()
    return { ok: true }
  })
}

export async function addVoiceRule(raw: unknown): Promise<VoiceResult> {
  return guarded('přidání pravidla', async () => {
    const input = ruleInput.safeParse(raw)
    if (!input.success) return { ok: false, error: firstIssue(input.error) }
    if ((await addRule(input.data)) === 'duplicate') return { ok: false, error: DUPLICATE }
    refresh()
    return { ok: true }
  })
}

export async function setVoiceRuleActive(rawId: unknown, rawActive: unknown): Promise<VoiceResult> {
  return guarded('přepnutí pravidla', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success || typeof rawActive !== 'boolean') return { ok: false, error: 'Neplatné pravidlo.' }
    if (!(await setRuleActive(id.data, rawActive))) return { ok: false, error: GONE }
    refresh()
    return { ok: true }
  })
}

const ruleSnapshotSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['rule', 'blocklist']),
  text: z.string().trim().min(2).max(300),
  mode: z.enum(['always', 'alone']),
  active: z.boolean(),
  source: z.enum(['manual', 'learned']),
})

export async function deleteVoiceRule(rawId: unknown): Promise<VoiceResult<{ snapshot: RuleSnapshot }>> {
  return guarded<{ snapshot: RuleSnapshot }>('smazání pravidla', async () => {
    const id = idSchema.safeParse(rawId)
    if (!id.success) return { ok: false, error: 'Neplatné pravidlo.' }
    const snapshot = await deleteRule(id.data)
    if (!snapshot) return { ok: false, error: 'Vestavěnou frázi jde jen vypnout, ne smazat.' }
    refresh()
    return { ok: true, snapshot }
  })
}

export async function restoreVoiceRule(raw: unknown): Promise<VoiceResult> {
  return guarded('vrácení pravidla', async () => {
    const s = ruleSnapshotSchema.safeParse(raw)
    if (!s.success) return { ok: false, error: 'Vrátit nejde.' }
    if (!(await restoreRule(s.data))) return { ok: false, error: 'Vrátit nejde, stejné pravidlo už existuje.' }
    refresh()
    return { ok: true }
  })
}

export async function saveVoiceSettings(raw: unknown): Promise<VoiceResult> {
  return guarded('uložení nastavení', async () => {
    const input = settingsInput.safeParse(raw)
    if (!input.success) return { ok: false, error: firstIssue(input.error) }
    await saveSettings(input.data)
    refresh()
    return { ok: true }
  })
}

const isoDay = z.string().refine(isIsoDate, 'Neplatné datum.')
const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one'), id: z.string().uuid() }),
  z
    .object({ kind: z.literal('range'), from: isoDay, to: isoDay })
    .refine((s) => s.from <= s.to, 'Začátek období musí být před koncem.'),
  z.object({
    kind: z.literal('search'),
    filter: z.object({
      query: z.string().trim().max(SEARCH_MAX).transform((s) => s || null).nullable(),
      status: z.enum(DICTATION_STATUSES).nullable(),
    }),
  }),
  z.object({ kind: z.literal('all') }),
])

function parseScope(raw: unknown): { ok: true; scope: DeleteScope } | { ok: false; error: string } {
  const s = scopeSchema.safeParse(raw)
  if (!s.success) return { ok: false, error: firstIssue(s.error) }
  // Hledání bez textu i stavu by bylo „smazat všechno" pod jiným jménem.
  if (s.data.kind === 'search' && !s.data.filter.query && !s.data.filter.status) {
    return { ok: false, error: 'Nejdřív něco vyhledejte.' }
  }
  return { ok: true, scope: s.data as DeleteScope }
}

export async function countVoiceDictations(raw: unknown): Promise<VoiceResult<{ count: number }>> {
  return guarded<{ count: number }>('spočítání diktátů', async () => {
    const parsed = parseScope(raw)
    if (!parsed.ok) return parsed
    return { ok: true, count: await countDictations(parsed.scope) }
  })
}

export async function deleteVoiceDictations(raw: unknown): Promise<VoiceResult<{ deleted: number }>> {
  return guarded<{ deleted: number }>('smazání diktátů', async () => {
    const parsed = parseScope(raw)
    if (!parsed.ok) return parsed
    const deleted = await deleteDictations(parsed.scope)
    refresh()
    return { ok: true, deleted }
  })
}

// --- VO08: učení na tlačítko -----------------------------------------------------

const AI_SKIP: Record<'not_configured' | 'few' | 'failed', string> = {
  not_configured: 'Rozbor AI neběžel, chybí klíč k modelu.',
  few: 'Rozbor AI neběžel, za 30 dní je méně než 8 opravených diktátů.',
  failed: 'Rozbor AI se nepovedl, zkuste to později.',
}

/** „Spustit učení teď": pravidla i rozbor AI hned, souhrn jednou větou. */
export async function runVoiceLearning(): Promise<VoiceResult<{ summary: string; note: string | null }>> {
  return guarded<{ summary: string; note: string | null }>('učení', async () => {
    const run = await runVoiceLearningNow()
    const parts: string[] = []
    if (run.termsLearned) parts.push(`naučená slova: ${run.termsLearned}`)
    const proposals = run.termSuggestions + run.blockSuggestions + (run.ai?.added ?? 0)
    if (proposals) parts.push(`nové návrhy: ${proposals}`)
    refresh()
    return {
      ok: true,
      summary: parts.length ? `Hotovo, ${parts.join(', ')}.` : 'Hotovo, nic nového k naučení.',
      note: run.ai?.skipped ? AI_SKIP[run.ai.skipped] : null,
    }
  })
}

// --- Schůzky (R-151) -----------------------------------------------------------

const MISSING_MEETINGS = 'Databáze ještě nemá tabulky schůzek (migrace 139).'

function meetingFailure(err: unknown, what: string): { ok: false; error: string } {
  if (isMissingVoiceSchema(err)) return { ok: false, error: MISSING_MEETINGS }
  return failure(err, what)
}

const SUMMARY_ERRORS: Record<string, string> = {
  NOT_CONFIGURED: 'AI není nastavená (chybí ANTHROPIC_API_KEY).',
  EMPTY: 'Schůzka zatím nemá přepis, není co shrnout.',
  REFUSED: 'Model shrnutí odmítl. Zkuste to prosím znovu, nebo přepis zkopírujte.',
  TRUNCATED: 'Shrnutí vyšlo příliš dlouhé a nedokončilo se. Zkuste to znovu.',
  FAILED: 'Shrnutí se nepodařilo vytvořit. Zkuste to prosím znovu.',
}

/** „Shrnout pomocí AI" u schůzky. Placené volání, jen na kliknutí. */
export async function summarizeVoiceMeeting(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Schůzka nenalezena.' }
  try {
    const meeting = await loadMeeting(id.data, null)
    if (!meeting) return { ok: false, error: 'Schůzka nenalezena.' }
    const res = await summarizeMeeting(meeting.transcript, meeting.startedAt)
    if (!res.ok) return { ok: false, error: SUMMARY_ERRORS[res.code] ?? SUMMARY_ERRORS.FAILED }
    await saveMeetingSummary(id.data, res.summary, res.model, res.costUsd)
    revalidatePath(PAGE)
    return { ok: true }
  } catch (err) {
    return meetingFailure(err, 'shrnutí schůzky')
  }
}

export async function deleteVoiceMeeting(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Schůzka nenalezena.' }
  try {
    if (!(await deleteMeeting(id.data, null))) return { ok: false, error: 'Schůzka nenalezena.' }
    revalidatePath(PAGE)
    return { ok: true }
  } catch (err) {
    return meetingFailure(err, 'smazání schůzky')
  }
}

/** Přiřadí schůzku ke kontaktu, `null` ji odpojí. */
export async function setVoiceMeetingContact(rawId: unknown, rawContactId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  const contact = rawContactId === null ? { success: true as const, data: null } : idSchema.safeParse(rawContactId)
  if (!id.success || !contact.success) return { ok: false, error: 'Schůzka nebo kontakt nenalezen.' }
  try {
    if (!(await setMeetingContact(id.data, contact.data))) return { ok: false, error: 'Schůzka nenalezena.' }
    revalidatePath(PAGE)
    return { ok: true }
  } catch (err) {
    if ((err as { code?: string })?.code === '23503') return { ok: false, error: 'Kontakt nenalezen.' }
    return meetingFailure(err, 'přiřazení schůzky')
  }
}

const titleSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().max(160, 'Název může mít nejvýš 160 znaků.'))

export async function renameVoiceMeeting(rawId: unknown, rawTitle: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  const title = titleSchema.safeParse(typeof rawTitle === 'string' ? rawTitle : '')
  if (!id.success) return { ok: false, error: 'Schůzka nenalezena.' }
  if (!title.success) return { ok: false, error: title.error.issues[0]?.message ?? 'Neplatný název.' }
  try {
    if (!(await renameMeeting(id.data, title.data || null))) return { ok: false, error: 'Schůzka nenalezena.' }
    revalidatePath(PAGE)
    return { ok: true }
  } catch (err) {
    return meetingFailure(err, 'přejmenování schůzky')
  }
}
