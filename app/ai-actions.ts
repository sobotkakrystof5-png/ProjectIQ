'use server'

import { z } from 'zod'
import { getAdminSession, requireAuth } from '@/lib/auth'
import { proposeAction } from '@/lib/ai/propose'
import { CONFIDENCE_FLOOR, suggestionSchema, type Suggestion } from '@/lib/ai/suggestion-schema'
import { actionClass, autoRunIndexes, type ActionClass } from '@/lib/ai/action-policy'
import { actionLines, actionTitle, type Line } from '@/lib/ai/action-lines'
import { CONTEXT_KINDS } from '@/lib/ai/context'
import { HISTORY_MAX, TEXT_MAX } from '@/lib/ai/assistant-limits'
import { gapsQuestion, planGaps } from '@/lib/ai/action-requirements'
import { pastActions, pragueNow } from '@/lib/ai/time-context'
import { runAction, undoStep } from '@/lib/admin/suggestion-apply'
import {
  claimForApply,
  loadSuggestion,
  markRejected,
  replaceSteps,
  saveSteps,
  saveSuggestion,
  suggestionsAvailable,
  toStepView,
  type StepState,
  type StepView,
} from '@/lib/admin/suggestions'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'

/**
 * Asistent: věta → plán → **provedení** (R-111; dřív jen návrh, AD14).
 *
 * - `proposeSuggestion` zeptá model, plán uloží a vratné akce rovnou provede
 *   (`lib/ai/action-policy.ts` rozhoduje které). Zbytek čeká.
 * - `applySuggestion` provede, co čeká — z prohlížeče dostane **jen `id`**
 *   (a případně pořadí akce), plán si načte z databáze a znovu ho prožene
 *   schématem. Pozměněný plán poslaný z prohlížeče nemá kudy projít.
 * - `undoSuggestion` vrátí provedené kroky podle údajů uložených v databázi.
 */

const SUGGESTION_ID = z.string().uuid()
const STEP_INDEX = z.number().int().min(0).max(20)

const proposeInput = z.object({
  text: z.string().trim().min(1).max(TEXT_MAX),
  contextRef: z.object({ kind: z.enum(CONTEXT_KINDS), id: z.string().uuid() }).nullish(),
  source: z.enum(['command', 'panel', 'voice']).default('panel'),
  /** Předchozí repliky téhož chatu (R-113). Každé otevření panelu po pauze začíná nový. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(TEXT_MAX * 2) }))
    .max(HISTORY_MAX)
    .optional(),
  /**
   * Viděl už tenhle chat text, který mohl napsat někdo cizí (kontext záznamu,
   * výsledky dotazů)? Pak se nic neprovede samo ani v dalších kolech —
   * podstrčený pokyn by jinak mohl projít přes odpověď asistenta v historii.
   */
  tainted: z.boolean().optional(),
})

export type ActionView = {
  index: number
  title: string
  lines: Line[]
  cls: ActionClass
}

export type PlanView = {
  id: string | null
  reply: string
  actions: ActionView[]
  steps: StepView[]
  assumptions: string[]
  missing: string[]
  /** Nízká jistota — nic se neprovedlo samo. */
  unsure: boolean
  /** Kontext mohl nést cizí text — nic se neprovedlo samo. */
  guarded: boolean
  /** Plán nejde uložit (chybí migrace 110) — nic se neprovede vůbec. */
  cannotRun: boolean
  /** Chybí povinný údaj — nic se neprovedlo, asistent se ptá (R-113). */
  needsInfo: boolean
  /** Termín nebo další krok míří do minulosti — nic se neprovedlo samo, čeká na klepnutí. */
  pastTime: boolean
  /** Shrnutí kola pro historii chatu: odpověď a co se s čím stalo, i s id záznamů. */
  turn: string
  /** Chat od teď nesmí nic provádět sám (viz `tainted` ve vstupu). */
  tainted: boolean
}

export type ProposeOutcome = ({ ok: true } & PlanView) | { ok: false; error: string }

/** Pár dotazů za minutu stačí člověku, co mluví. Víc znamená skript. */
const RATE_KEY = 'ai-navrh'
const RATE_WINDOW_MINUTES = 1
const RATE_MAX_REQUESTS = 12
/** Denní strop drží účet za model na uzdě, i kdyby se něco zacyklilo. */
const DAY_KEY = 'ai-navrh-den'
const DAY_WINDOW_MINUTES = 24 * 60
const DAY_MAX_REQUESTS = 300
const RATE_ACTOR = 'admin'

/** Jaký záznam krok založil nebo změnil — model na něj v dalším kole odkáže přes id. */
function stepRecord(step: StepState): string | null {
  const undo = step.undo
  if (!undo) return null
  switch (undo.type) {
    case 'lead':
    case 'lead_updated':
      return `kontakt ${undo.id}`
    case 'event_created':
    case 'event_moved':
      return `termín ${undo.id}`
    case 'project':
    case 'project_updated':
      return `zakázka ${undo.id}`
    case 'status':
      return `zakázka ${undo.projectId}`
    case 'income':
      return `příjem ${undo.id}`
    case 'cost':
      return `náklad ${undo.id}`
    case 'invoice_paid':
      return `faktura ${undo.id}`
    default:
      return null
  }
}

/**
 * Co se v kole stalo, jako text pro historii chatu. Model z toho v dalším
 * kole pozná, co je hotové, co čeká a na co se ptal — a má id záznamů,
 * aby „posuň to na čtvrtou" sáhlo na správný termín.
 */
function turnSummaryFor(suggestion: Suggestion, steps: StepState[], needsInfo: boolean): string {
  const lines: string[] = []
  if (suggestion.reply) lines.push(suggestion.reply)
  for (const [index, action] of suggestion.actions.entries()) {
    const step = steps.find((s) => s.index === index)
    const detail = actionLines(action)
      .map((l) => `${l.label}: ${l.value}`)
      .join('; ')
    if (step?.ok && step.undone) lines.push(`[Vráceno] ${step.message} (${detail})`)
    else if (step?.ok) {
      const record = stepRecord(step)
      lines.push(`[Provedeno] ${step.message}${step.description ? ` — ${step.description}` : ''}${record ? ` (${record})` : ''}`)
    } else if (step && !step.ok) lines.push(`[Nepovedlo se] ${actionTitle(action)}: ${step.error ?? ''} (${detail})`)
    else if (needsInfo) lines.push(`[Neprovedeno, čeká na doplnění] ${actionTitle(action)} (${detail})`)
    else lines.push(`[Čeká na klepnutí] ${actionTitle(action)} (${detail})`)
  }
  return lines.join('\n').slice(0, TEXT_MAX * 2)
}

function view(
  id: string | null,
  suggestion: Suggestion,
  steps: StepState[],
  flags: { unsure: boolean; guarded: boolean; cannotRun: boolean; needsInfo: boolean; pastTime: boolean; tainted: boolean },
  turn: string,
): PlanView {
  return {
    id,
    reply: suggestion.reply,
    actions: suggestion.actions.map((action, index) => ({
      index,
      title: actionTitle(action),
      lines: actionLines(action),
      cls: actionClass(action),
    })),
    steps: steps.map(toStepView),
    assumptions: suggestion.assumptions,
    missing: suggestion.missing,
    ...flags,
    turn,
  }
}

/** Provede akce plánu v pořadí. Chyba jedné akce zbytek nezastaví — každá nese svou hlášku. */
async function runIndexes(suggestion: Suggestion, indexes: number[]): Promise<StepState[]> {
  const steps: StepState[] = []
  for (const index of indexes) {
    const action = suggestion.actions[index]
    if (!action) continue
    const outcome = await runAction(action)
    steps.push(
      outcome.ok
        ? {
            index,
            ok: true,
            message: outcome.message,
            description: outcome.description ?? null,
            href: outcome.href ?? null,
            undo: outcome.undo,
          }
        : { index, ok: false, message: actionTitle(action), error: outcome.error, href: outcome.href ?? null },
    )
  }
  return steps
}

/** Které akce ještě neproběhly úspěšně. Neúspěšný krok jde zkusit znovu. */
function pendingIndexes(suggestion: Suggestion, steps: StepState[]): number[] {
  const done = new Set(steps.filter((s) => s.ok).map((s) => s.index))
  return suggestion.actions.map((_, index) => index).filter((index) => !done.has(index))
}

/** Nový pokus o krok nahradí starý záznam o něm. */
function mergeSteps(before: StepState[], fresh: StepState[]): StepState[] {
  const replaced = new Set(fresh.map((s) => s.index))
  return [...before.filter((s) => !replaced.has(s.index)), ...fresh].sort((a, b) => a.index - b.index)
}

export async function proposeSuggestion(raw: unknown): Promise<ProposeOutcome> {
  const session = await getAdminSession()
  if (!session) return { ok: false, error: 'Přihlaste se prosím znovu.' }

  const parsed = proposeInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Napište, co se má stát (nejvýš 2000 znaků).' }

  // Je to jeden admin (R-001), takže se limit počítá na jeden klíč.
  if (
    (await isApiRateLimited(RATE_KEY, RATE_ACTOR, RATE_WINDOW_MINUTES, RATE_MAX_REQUESTS)) ||
    (await isApiRateLimited(DAY_KEY, RATE_ACTOR, DAY_WINDOW_MINUTES, DAY_MAX_REQUESTS))
  ) {
    return { ok: false, error: 'Moc dotazů za sebou. Zkuste to za chvíli.' }
  }
  await Promise.all([recordApiRequest(RATE_KEY, RATE_ACTOR), recordApiRequest(DAY_KEY, RATE_ACTOR)])

  const result = await proposeAction({
    text: parsed.data.text,
    contextRef: parsed.data.contextRef,
    history: parsed.data.history,
  })
  if ('error' in result) return { ok: false, error: result.error }
  let suggestion = result.suggestion
  const tainted = result.untrustedContext || parsed.data.tainted === true

  // Pojistka „nejdřív se zeptej" (R-113): s chybějícím povinným údajem se
  // nic neprovede a plán se ani neuloží — zeptá se a další kolo ho sestaví
  // znovu, celý. Když model otázku sám nepoložil, doplní ji server.
  const gaps = planGaps(suggestion.actions)
  const needsInfo = gaps.length > 0
  if (needsInfo) {
    const question = gapsQuestion(gaps)
    const asked = suggestion.reply.includes('?')
    suggestion = {
      ...suggestion,
      reply: asked ? suggestion.reply : [suggestion.reply, question].filter(Boolean).join(' ').slice(0, 500),
      missing: [...new Set([...suggestion.missing, ...gaps])].slice(0, 8),
    }
    const flags = { unsure: false, guarded: false, cannotRun: false, needsInfo: true, pastTime: false, tainted }
    return { ok: true, ...view(null, suggestion, [], flags, turnSummaryFor(suggestion, [], true)) }
  }

  // Termín v minulosti je buď omyl („ve tři" řečené v pět), nebo zpětný
  // zápis. Ani jedno nesmí proběhnout samo — čeká na klepnutí.
  const past = pastActions(suggestion.actions, pragueNow())
  if (past.length > 0) {
    suggestion = { ...suggestion, missing: [...new Set([...past, ...suggestion.missing])].slice(0, 8) }
  }

  // Bez migrace 110 se plán neuloží (`id` je null) — asistent pak řekne, co
  // by udělal, ale nic neprovede: bez uloženého plánu by nešlo „Zpět".
  const id = await saveSuggestion({
    authorEmail: session.email ?? null,
    source: parsed.data.source,
    inputText: parsed.data.text,
    model: result.model,
    suggestion,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  })

  const flags = {
    unsure: suggestion.actions.length > 0 && suggestion.confidence < CONFIDENCE_FLOOR,
    guarded: suggestion.actions.length > 0 && tainted,
    cannotRun: id === null && suggestion.actions.length > 0,
    needsInfo: false,
    pastTime: past.length > 0,
    tainted,
  }
  if (!id) return { ok: true, ...view(null, suggestion, [], flags, turnSummaryFor(suggestion, [], false)) }

  const steps = past.length > 0 ? [] : await runIndexes(suggestion, autoRunIndexes({ suggestion, untrustedContext: tainted }))
  await saveSteps(id, steps, pendingIndexes(suggestion, steps).length === 0)

  return { ok: true, ...view(id, suggestion, steps, flags, turnSummaryFor(suggestion, steps, false)) }
}

export type StepsOutcome =
  | { ok: true; steps: StepView[]; pending: number[]; turn: string }
  | { ok: false; error: string }

/**
 * Provede, co v plánu čeká: všechno, nebo jen akci s pořadím `index`.
 * Klepnutí je tu potvrzení — proto smí i vystavit fakturu nebo stornovat.
 */
export async function applySuggestion(id: string, index?: number): Promise<StepsOutcome> {
  await requireAuth()
  if (!SUGGESTION_ID.safeParse(id).success) return { ok: false, error: 'Plán už neplatí. Řekněte to prosím znovu.' }
  if (index !== undefined && !STEP_INDEX.safeParse(index).success) return { ok: false, error: 'Neznámá akce.' }
  if (!(await suggestionsAvailable())) {
    return { ok: false, error: 'Provádění zatím není zapnuté (chybí migrace 110).' }
  }

  const row = await loadSuggestion(id)
  if (!row) return { ok: false, error: 'Plán už neplatí. Řekněte to prosím znovu.' }
  if (row.status !== 'pending') return { ok: false, error: 'Tenhle plán už je vyřízený.' }

  // Druhá kontrola téhož: schéma, ne jen typ — s řádkem mohl někdo hnout.
  const checked = suggestionSchema.safeParse(row.suggestion)
  if (!checked.success) return { ok: false, error: 'Plán už neplatí. Řekněte to prosím znovu.' }
  const suggestion = checked.data

  const waiting = pendingIndexes(suggestion, row.steps)
  const target = index === undefined ? waiting : waiting.filter((i) => i === index)
  if (target.length === 0) return { ok: false, error: 'Tohle už je hotové.' }

  if (!(await claimForApply(id))) return { ok: false, error: 'Na tom se už pracuje.' }

  const fresh = await runIndexes(suggestion, target)
  const steps = mergeSteps(row.steps, fresh)
  const left = pendingIndexes(suggestion, steps)
  await saveSteps(id, steps, left.length === 0)
  return { ok: true, steps: steps.map(toStepView), pending: left, turn: turnSummaryFor(suggestion, steps, false) }
}

/**
 * „Zpět": vrátí všechny provedené kroky plánu, nebo jen krok `index`.
 * Kroky se nejdřív označí jako vrácené (optimistický zámek) a teprve pak se
 * vracejí — dvojí „Zpět" tak smazaný termín neobnoví dvakrát.
 */
export async function undoSuggestion(id: string, index?: number): Promise<StepsOutcome> {
  await requireAuth()
  if (!SUGGESTION_ID.safeParse(id).success) return { ok: false, error: 'Tohle už vrátit nejde.' }
  if (index !== undefined && !STEP_INDEX.safeParse(index).success) return { ok: false, error: 'Neznámá akce.' }

  const row = await loadSuggestion(id)
  if (!row) return { ok: false, error: 'Tohle už vrátit nejde.' }

  const targets = row.steps.filter(
    (s) => s.ok && s.undo && s.undone !== true && (index === undefined || s.index === index),
  )
  if (targets.length === 0) return { ok: false, error: 'Není co vrátit.' }

  const targetSet = new Set(targets.map((s) => s.index))
  const marked = row.steps.map((s) => (targetSet.has(s.index) ? { ...s, undone: true } : s))
  if (!(await replaceSteps(id, row.steps, marked))) return { ok: false, error: 'Tohle už se vrací.' }

  // Pozpátku: poznámka k nové zakázce se maže dřív než zakázka.
  const failed = new Map<number, string>()
  for (const step of [...targets].reverse()) {
    const outcome = await undoStep(step.undo!)
    if (!outcome.ok) failed.set(step.index, outcome.error)
  }

  let finalSteps = marked
  if (failed.size > 0) {
    // Co se vrátit nepodařilo, zůstává provedené — a s hláškou proč.
    finalSteps = marked.map((s) =>
      failed.has(s.index) ? { ...s, undone: false, error: failed.get(s.index) ?? null } : s,
    )
    await replaceSteps(id, marked, finalSteps)
  }

  const views = finalSteps.map(toStepView)
  if (failed.size > 0) return { ok: false, error: [...failed.values()][0] }
  const row2 = suggestionSchema.safeParse(row.suggestion)
  return {
    ok: true,
    steps: views,
    pending: row2.success ? pendingIndexes(row2.data, finalSteps) : [],
    turn: row2.success ? turnSummaryFor(row2.data, finalSteps, false) : '',
  }
}

export async function rejectSuggestion(id: string): Promise<{ ok: boolean }> {
  await requireAuth()
  if (!SUGGESTION_ID.safeParse(id).success) return { ok: false }
  return { ok: await markRejected(id) }
}
