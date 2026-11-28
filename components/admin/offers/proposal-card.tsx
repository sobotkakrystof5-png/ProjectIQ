'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calculator, Copy, ExternalLink, Loader2, RotateCw, Send, Tag, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { LeadEmailDialog, type LeadEmailReadiness } from '@/components/LeadEmailDialog'
import { ProposalValueBox } from '@/components/admin/offers/proposal-value'
import { SimilarOffers } from '@/components/admin/offers/similar-offers'
import {
  createProposalAction,
  deleteProposalAction,
  extendProposalAction,
  publishProposalAction,
  saveProposalAction,
  setOutcomeAction,
  setReferenceAction,
} from '@/app/offer-proposal-actions'
import {
  VARIANT_KEYS,
  bandIndexFor,
  bandLabel,
  bandPickLabel,
  jobBandLabel,
  paybackJobs,
  paybackSentence,
  type OfferKind,
  type Position,
  type PricingRules,
  type VariantKey,
} from '@/lib/admin/offers/pricing'
import { PROPOSAL_STATUS_LABEL, deviation, rulePrices, variantOf } from '@/lib/admin/offers/proposal-model'
import type { ProposalRow } from '@/lib/admin/offers/proposals'
import type { SimilarOffer } from '@/lib/admin/offers/similar'
import { OFFER_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { cn } from '@/lib/utils'

/**
 * Nabídka u kontaktu (navrhovač nabídek, N2–N3, R-147, R-155).
 *
 * Koncept: odhad hodnoty, tři varianty s cenou podle pravidel, Kryštof je
 * upraví a jednou hlavní akcí „Poslat nabídku" otevře e-mail Nabídka s odkazem
 * na stránku nabídky. Po odeslání: kdy klient nabídku otevřel, co vybral,
 * a na jedno klepnutí „Odmítl" a „Smlouvá" (ostatní výsledky se zapíšou samy).
 */

export type ProposalWithUrl = ProposalRow & { url: string }

type VariantState = { key: VariantKey; price: string; includes: string }
type EditState = {
  kind: OfferKind
  typicalJob: string
  jobsPerMonth: string
  position: Position
  rush: boolean
  languages: number
  showPayback: boolean
  variants: VariantState[]
  recommended: VariantKey
  intro: string
  overCapConfirmed: boolean
}

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const digits = (s: string): number | null => {
  const clean = s.replace(/[^\d]/g, '')
  return clean === '' ? null : Number(clean)
}
/** Počet zakázek za měsíc: dovolí desetinnou čárku i tečku („0,5" = jedna za dva měsíce), jedno desetinné místo. */
const decimal = (s: string): number | null => {
  const clean = s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
  if (clean === '' || clean === '.') return null
  const n = Number(clean)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}
const decimalText = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))
const DELETE_DELAY_MS = 6_000

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(iso))

const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'
const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'
const fieldClass =
  'min-h-11 w-full rounded-chip border border-navy-200 bg-surface px-3 text-sm text-ink placeholder:text-quiet focus:border-navy-700 focus:outline-none'

function stateFrom(p: ProposalRow): EditState {
  return {
    kind: p.inputs.kind,
    typicalJob: p.inputs.typicalJobCzk === null ? '' : String(p.inputs.typicalJobCzk),
    jobsPerMonth: decimalText(p.inputs.jobsPerMonth ?? null),
    position: p.inputs.position,
    rush: p.inputs.rush,
    languages: p.inputs.languages,
    showPayback: p.inputs.showPayback,
    variants: VARIANT_KEYS.map((key) => {
      const v = variantOf(p.variants, key)
      return { key, price: v ? String(v.price) : '', includes: (v?.includes ?? []).join('\n') }
    }),
    recommended: p.recommended,
    intro: p.intro,
    overCapConfirmed: p.over_cap_confirmed,
  }
}

function payloadFrom(s: EditState) {
  return {
    inputs: {
      kind: s.kind,
      typicalJobCzk: digits(s.typicalJob),
      jobsPerMonth: decimal(s.jobsPerMonth),
      position: s.position,
      rush: s.rush,
      languages: s.languages,
      showPayback: s.showPayback,
    },
    variants: s.variants.map((v) => ({
      key: v.key,
      price: digits(v.price) ?? 0,
      includes: v.includes
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .slice(0, 10),
    })),
    recommended: s.recommended,
    intro: s.intro,
    overCapConfirmed: s.overCapConfirmed,
  }
}

export function ProposalCard({
  contactId,
  rules,
  proposals: initial,
  similar,
  researchDoneId,
  researchOpen,
  mail,
}: {
  contactId: string
  rules: PricingRules
  proposals: ProposalWithUrl[]
  /** Ke konceptu: dřívější nabídky podobným firmám (N3). */
  similar: SimilarOffer[]
  /** Poslední hotový rozbor (pro „Navrhnout cenu"). */
  researchDoneId: string | null
  /** Rozbor čeká nebo běží: návrh vznikne sám, až doběhne. */
  researchOpen: boolean
  mail: { company: string; email: string | null; readiness: LeadEmailReadiness }
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [pending, startTransition] = useTransition()
  const hidden = useRef(new Set<string>())
  useEffect(() => setRows(initial), [initial])

  const current = rows[0] ?? null

  function create(researchId: string) {
    startTransition(async () => {
      const res = await createProposalAction(researchId)
      if (!res.ok) {
        toast.error('Návrh se nepřipravil', { description: 'Rozbor nemá výsledek. Připravte ho znovu.' })
        return
      }
      toast.success('Návrh nabídky je připravený')
      router.refresh()
    })
  }

  function remove(row: ProposalWithUrl) {
    hidden.current.add(row.id)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    const timer = setTimeout(() => {
      if (!hidden.current.has(row.id)) return
      void deleteProposalAction(row.id, contactId)
    }, DELETE_DELAY_MS)
    toast.message('Nabídka smazaná', {
      duration: DELETE_DELAY_MS,
      undo: () => {
        clearTimeout(timer)
        hidden.current.delete(row.id)
        setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      },
    })
  }

  const replace = (next: ProposalRow | null) => {
    if (next === null) return
    setRows((prev) => prev.map((r) => (r.id === next.id ? { ...next, url: r.url } : r)))
  }

  return (
    <Card>
      <CardHead
        title="Nabídka"
        hint="Cena podle hodnoty, kterou web klientovi přinese. Tři varianty spočítané podle vašich cenových pravidel, klient si jednu vybere na stránce nabídky."
        action={
          <Link href="/dashboard/nabidky/pravidla" className="inline-flex min-h-11 items-center text-sm text-navy-700 underline underline-offset-2">
            Cenová pravidla
          </Link>
        }
      />

      {current === null && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-quiet">
            {researchOpen
              ? 'Návrh se připraví sám, jakmile doběhne rozbor firmy níž.'
              : researchDoneId
                ? 'K rozboru zatím nabídka není. Spočítám tři varianty podle cenových pravidel.'
                : 'Nejdřív připravte rozbor firmy níž. Návrh nabídky se pak připraví sám.'}
          </p>
          {researchDoneId && !researchOpen && (
            <button type="button" onClick={() => create(researchDoneId)} disabled={pending} className={primaryBtn}>
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Calculator size={16} strokeWidth={1.75} aria-hidden />}
              Navrhnout cenu
            </button>
          )}
        </div>
      )}

      {current?.status === 'draft' && (
        <ProposalEditor
          key={current.id}
          proposal={current}
          rules={rules}
          mail={mail}
          contactId={contactId}
          similar={similar}
          onSaved={replace}
          onRemove={() => remove(current)}
        />
      )}

      {current !== null && current.status !== 'draft' && (
        <ProposalSent
          key={current.id}
          proposal={current}
          rules={rules}
          onChange={replace}
          onRemove={() => remove(current)}
          onNew={current.research_id ? () => create(current.research_id as string) : null}
          pending={pending}
        />
      )}

      {rows.length > 1 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-quiet">Starší nabídky ({rows.length - 1})</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {rows.slice(1).map((row) => {
              const rec = variantOf(row.sent_variants ?? row.variants, row.recommended)
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-2">
                  <span className="text-sm text-ink">
                    <span className="font-num text-xs text-quiet">{dateText(row.sent_at ?? row.created_at)}</span>
                    {' · '}
                    {PROPOSAL_STATUS_LABEL[row.status]}
                    {rec && <span className="font-num"> · {czk(rec.price)}</span>}
                  </span>
                  <button type="button" onClick={() => remove(row)} className={quietBtn}>
                    Smazat
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Koncept                                                             */
/* ------------------------------------------------------------------ */

function ProposalEditor({
  proposal,
  rules,
  mail,
  contactId,
  similar,
  onSaved,
  onRemove,
}: {
  proposal: ProposalWithUrl
  rules: PricingRules
  mail: { company: string; email: string | null; readiness: LeadEmailReadiness }
  contactId: string
  similar: SimilarOffer[]
  onSaved: (row: ProposalRow) => void
  onRemove: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<EditState>(() => stateFrom(proposal))
  const [saved, setSaved] = useState<EditState>(() => stateFrom(proposal))
  const [pending, startTransition] = useTransition()
  const [mailOpen, setMailOpen] = useState(false)
  const dirty = JSON.stringify(state) !== JSON.stringify(saved)

  const job = digits(state.typicalJob)
  const jobs = decimal(state.jobsPerMonth)
  const band = state.kind === 'eshop' ? null : bandIndexFor(rules, job, jobs)
  const bandText = band === null ? 'E-shop' : bandPickLabel(rules, band)
  const capAt = proposal.inputs.terms.confirmAbove
  const overCap = state.variants.some((v) => (digits(v.price) ?? 0) > capAt)
  const proposedByRules = useMemo(
    () =>
      rulePrices(rules, {
        kind: state.kind,
        typicalJobCzk: job,
        jobsPerMonth: jobs,
        position: state.position,
        rush: state.rush,
        languages: state.languages,
      }),
    [rules, state.kind, job, jobs, state.position, state.rush, state.languages],
  )
  const recPrice = digits(state.variants.find((v) => v.key === state.recommended)?.price ?? '') ?? 0
  const jobMin = job === proposal.inputs.typicalJobCzk ? (proposal.value.typicalJob?.min ?? job) : job
  const payback = paybackSentence(paybackJobs(recPrice, jobMin))

  const set = (patch: Partial<EditState>) => setState((s) => ({ ...s, ...patch }))
  const setVariant = (key: VariantKey, patch: Partial<VariantState>) =>
    setState((s) => ({ ...s, variants: s.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }))

  const recalc = () =>
    setState((s) => ({ ...s, variants: s.variants.map((v) => ({ ...v, price: String(proposedByRules[v.key]) })) }))

  /** Uloží rozpracovaný koncept. Vrací, jestli se povedlo. */
  async function persist(): Promise<boolean> {
    if (!dirty) return true
    const res = await saveProposalAction(proposal.id, payloadFrom(state))
    if (!res.ok) {
      toast.error('Nabídka se neuložila', { description: res.error })
      return false
    }
    onSaved(res.proposal)
    setSaved(state)
    return true
  }

  const save = () =>
    startTransition(async () => {
      if (await persist()) toast.success('Uloženo')
    })

  const send = () =>
    startTransition(async () => {
      if (overCap && !state.overCapConfirmed) {
        toast.error('Potvrďte cenu nad 50 000 Kč', { description: 'Zaškrtněte potvrzení pod variantami.' })
        return
      }
      if (await persist()) setMailOpen(true)
    })

  const copyLink = () =>
    startTransition(async () => {
      if (!(await persist())) return
      const res = await publishProposalAction(proposal.id)
      if (!res.ok) {
        toast.error('Odkaz se nezveřejnil', { description: res.error })
        return
      }
      await navigator.clipboard.writeText(res.url).catch(() => {})
      toast.success('Odkaz zkopírovaný', { description: `Nabídka je odeslaná a platí ${proposal.inputs.terms.validityDays} dní.` })
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={toneVariant(OFFER_STATUS_TONE.draft)}>Koncept</Badge>
        <span className="text-sm text-quiet">Klient zatím nic neviděl.</span>
      </div>

      <ProposalValueBox value={proposal.value} internal={proposal.internal} position={state.position} bandText={bandText} />

      <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <legend className="sr-only">Z čeho se cena počítá</legend>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Jedna zakázka klienta (Kč)</span>
          <input
            inputMode="numeric"
            value={state.typicalJob}
            onChange={(e) => set({ typicalJob: e.target.value })}
            placeholder="třeba 60 000"
            className={cn(fieldClass, 'font-num')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Zakázek z webu za měsíc</span>
          <input
            inputMode="decimal"
            value={state.jobsPerMonth}
            onChange={(e) => set({ jobsPerMonth: e.target.value })}
            placeholder="třeba 6"
            className={cn(fieldClass, 'font-num')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Kde v pásmu</span>
          <select value={state.position} onChange={(e) => set({ position: e.target.value as Position })} className={fieldClass}>
            <option value="low">Dolní třetina</option>
            <option value="mid">Střed</option>
            <option value="high">Horní třetina</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Co stavím</span>
          <select value={state.kind} onChange={(e) => set({ kind: e.target.value as OfferKind })} className={fieldClass}>
            <option value="web">Web</option>
            <option value="eshop">E-shop</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Jazyky navíc</span>
          <select value={state.languages} onChange={(e) => set({ languages: Number(e.target.value) })} className={fieldClass}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Jen čeština' : `+${n} (+${n * rules.languagePercent} %)`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-ink sm:col-span-2 xl:col-span-5">
          <input type="checkbox" checked={state.rush} onChange={(e) => set({ rush: e.target.checked })} className="h-5 w-5" />
          Spěch, rychleji než běžný termín (+{rules.rushPercent} %)
        </label>
      </fieldset>

      <SimilarOffers offers={similar} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={recalc} className={quietBtn}>
          <RotateCw size={15} strokeWidth={1.75} aria-hidden />
          Přepočítat ceny podle pravidel
        </button>
        <span className="text-xs text-quiet">Přepíše ceny níž. Obsah variant zůstane.</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {state.variants.map((v) => {
          const price = digits(v.price) ?? 0
          const rule = proposedByRules[v.key]
          const d = deviation({ price, proposed: rule })
          return (
            <fieldset key={v.key} className="flex flex-col gap-3 rounded-chip border border-navy-100 p-4">
              <legend className="px-1 text-sm font-semibold text-ink">{variantOf(proposal.variants, v.key)?.name ?? v.key}</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`doporucena-${proposal.id}`}
                  checked={state.recommended === v.key}
                  onChange={() => set({ recommended: v.key })}
                  className="h-5 w-5"
                />
                Doporučit
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-quiet">Cena (Kč)</span>
                <input
                  inputMode="numeric"
                  value={v.price}
                  onChange={(e) => setVariant(v.key, { price: e.target.value })}
                  className={cn(fieldClass, 'font-num text-base font-semibold')}
                />
                <span className="text-xs text-quiet">
                  Podle pravidel <span className="font-num">{czk(rule)}</span>
                  {d !== null && Math.abs(d) > 0.005 && (
                    <span className="font-num">
                      {' '}
                      ({d > 0 ? '+' : ''}
                      {Math.round(d * 100)} %)
                    </span>
                  )}
                </span>
                {price > capAt && <span className="text-xs font-medium text-ink">Nad {czk(capAt)}, chce potvrzení.</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-quiet">Co obsahuje (řádek = položka)</span>
                <textarea
                  value={v.includes}
                  onChange={(e) => setVariant(v.key, { includes: e.target.value })}
                  rows={8}
                  className="w-full resize-y rounded-chip border border-navy-200 bg-surface px-3 py-2 text-sm leading-6 text-ink focus:border-navy-700 focus:outline-none"
                />
              </label>
            </fieldset>
          )
        })}
      </div>

      {overCap && (
        <label className="flex min-h-11 items-center gap-2.5 rounded-chip border border-navy-200 px-4 text-sm text-ink">
          <input
            type="checkbox"
            checked={state.overCapConfirmed}
            onChange={(e) => set({ overCapConfirmed: e.target.checked })}
            className="h-5 w-5"
          />
          Potvrzuji cenu nad {czk(capAt)}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Úvod pro klienta</span>
        <textarea
          value={state.intro}
          onChange={(e) => set({ intro: e.target.value })}
          rows={4}
          maxLength={2000}
          className="w-full resize-y rounded-chip border border-navy-200 bg-surface px-3 py-2 text-sm leading-6 text-ink focus:border-navy-700 focus:outline-none"
        />
      </label>
      <label className="flex min-h-11 items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={state.showPayback}
          onChange={(e) => set({ showPayback: e.target.checked })}
          className="mt-0.5 h-5 w-5"
        />
        <span>
          Ukázat větu o návratnosti
          <span className="block text-xs text-quiet">{payback ?? 'Bez ceny zakázky klienta věta nevznikne.'}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
        {mail.email ? (
          <button type="button" onClick={send} disabled={pending} className={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} strokeWidth={1.75} aria-hidden />}
            Poslat nabídku
          </button>
        ) : (
          <button type="button" onClick={copyLink} disabled={pending} className={primaryBtn}>
            <Copy size={16} strokeWidth={1.75} aria-hidden />
            Zkopírovat odkaz
          </button>
        )}
        {dirty && (
          <button type="button" onClick={save} disabled={pending} className={quietBtn}>
            Uložit změny
          </button>
        )}
        {mail.email && (
          <button type="button" onClick={copyLink} disabled={pending} className={quietBtn}>
            <Copy size={15} strokeWidth={1.75} aria-hidden />
            Zkopírovat odkaz
          </button>
        )}
        <a href={`/dashboard/nabidky/${proposal.id}/nahled`} target="_blank" rel="noopener" className={quietBtn}>
          <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
          Náhled
        </a>
        <button type="button" onClick={onRemove} className={quietBtn}>
          <Trash2 size={15} strokeWidth={1.75} aria-hidden />
          Smazat
        </button>
      </div>
      {!mail.email && <p className="text-xs text-quiet">Kontakt nemá e-mail. Odkaz pošlete jinak, třeba SMS nebo WhatsAppem.</p>}

      {mailOpen && mail.email && (
        <LeadEmailDialog
          target={{ kind: 'contact', id: contactId, company: mail.company, email: mail.email }}
          readiness={mail.readiness}
          offer={{ id: proposal.id, url: proposal.url, price: recPrice }}
          onSent={() => router.refresh()}
          onClose={() => setMailOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Odeslaná nabídka                                                    */
/* ------------------------------------------------------------------ */

function ProposalSent({
  proposal,
  rules,
  onChange,
  onRemove,
  onNew,
  pending: outerPending,
}: {
  proposal: ProposalWithUrl
  rules: PricingRules
  onChange: (row: ProposalRow | null) => void
  onRemove: () => void
  onNew: (() => void) | null
  pending: boolean
}) {
  const [pending, startTransition] = useTransition()
  const variants = proposal.sent_variants ?? proposal.variants
  const expired = proposal.valid_until !== null && Date.parse(proposal.valid_until) <= Date.now()
  const canMark = proposal.project_id === null && ['sent', 'no_reply', 'negotiating', 'declined'].includes(proposal.status)
  const chosen = proposal.chosen_variant ? variantOf(variants, proposal.chosen_variant) : null
  const bandText =
    proposal.kind === 'eshop'
      ? 'E-shop'
      : proposal.band === null
        ? 'pásmo neznámé'
        : proposal.inputs.bandBasis === 'job'
          ? jobBandLabel(rules, proposal.band)
          : bandLabel(rules, proposal.band)

  const mark = (outcome: 'declined' | 'negotiating') =>
    startTransition(async () => {
      const previous = proposal.status
      const row = await setOutcomeAction(proposal.id, outcome)
      if (row === null) {
        toast.error('Výsledek se nezapsal. Obnovte stránku.')
        return
      }
      onChange(row)
      toast.message(outcome === 'declined' ? 'Zapsáno: odmítl' : 'Zapsáno: smlouvá', {
        undo:
          previous === 'sent' || previous === 'no_reply'
            ? () => {
                void setOutcomeAction(proposal.id, 'sent').then(onChange)
              }
            : undefined,
      })
    })

  const extend = () =>
    startTransition(async () => {
      const row = await extendProposalAction(proposal.id)
      if (row) {
        onChange(row)
        toast.success('Platnost prodloužená', { description: `Nabídka platí do ${dateText(row.valid_until as string)}.` })
      }
    })

  const copy = () => {
    void navigator.clipboard.writeText(proposal.url).then(
      () => toast.success('Odkaz zkopírovaný'),
      () => toast.error('Odkaz se nezkopíroval', { description: proposal.url }),
    )
  }

  const toggleReference = (value: boolean) =>
    startTransition(async () => {
      const res = await setReferenceAction(proposal.id, value)
      if (res.ok) onChange({ ...proposal, reference_price: value })
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={toneVariant(OFFER_STATUS_TONE[proposal.status])}>{PROPOSAL_STATUS_LABEL[proposal.status]}</Badge>
        {proposal.sent_at && (
          <span className="text-sm text-quiet">
            Odeslaná {dateText(proposal.sent_at)}
            {proposal.valid_until && (expired ? `, platnost skončila ${dateText(proposal.valid_until)}` : `, platí do ${dateText(proposal.valid_until)}`)}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5 text-sm text-ink">
        <li>
          {proposal.opened_at
            ? `Klient nabídku otevřel ${proposal.open_count}× (poprvé ${dateText(proposal.opened_at)}).`
            : 'Klient nabídku zatím neotevřel.'}
        </li>
        {chosen && proposal.chosen_at && (
          <li className="font-semibold">
            Vybral variantu {chosen.name} za <span className="font-num">{czk(chosen.price)}</span>
            {proposal.chosen_management ? ' se správou webu' : ' bez správy'} ({dateText(proposal.chosen_at)}).
          </li>
        )}
        {proposal.project_id && (
          <li>
            Vznikla{' '}
            <Link href={`/dashboard/${proposal.project_id}`} className="text-navy-700 underline underline-offset-2">
              zakázka
            </Link>
            {proposal.final_price_czk !== null && (
              <>
                {' '}
                za <span className="font-num">{czk(proposal.final_price_czk)}</span>
              </>
            )}
            .
          </li>
        )}
      </ul>

      <div className="grid gap-3 sm:grid-cols-3">
        {variants.map((v) => (
          <div
            key={v.key}
            className={cn(
              'rounded-chip border px-4 py-3',
              v.key === proposal.chosen_variant ? 'border-navy-700' : 'border-navy-100',
            )}
          >
            <p className="text-sm font-semibold text-ink">
              {v.name}
              {v.key === proposal.recommended && <span className="ml-2 text-xs font-normal text-quiet">doporučená</span>}
            </p>
            <p className="mt-1 font-num text-lg font-semibold text-ink">{czk(v.price)}</p>
            {v.price !== v.proposed && <p className="text-xs text-quiet">Podle pravidel {czk(v.proposed)}</p>}
          </div>
        ))}
      </div>

      <details>
        <summary className="cursor-pointer text-sm text-quiet">Odhad hodnoty a předpoklady</summary>
        <div className="mt-3">
          <ProposalValueBox value={proposal.value} internal={proposal.internal} position={proposal.inputs.position} bandText={bandText} />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
        {canMark && proposal.status !== 'declined' && (
          <button type="button" onClick={() => mark('declined')} disabled={pending} className={quietBtn}>
            Odmítl
          </button>
        )}
        {canMark && proposal.status !== 'negotiating' && (
          <button type="button" onClick={() => mark('negotiating')} disabled={pending} className={quietBtn}>
            Smlouvá
          </button>
        )}
        {expired && proposal.project_id === null && (
          <button type="button" onClick={extend} disabled={pending} className={quietBtn}>
            Prodloužit o {rules.validityDays} dní
          </button>
        )}
        <button type="button" onClick={copy} className={quietBtn}>
          <Copy size={15} strokeWidth={1.75} aria-hidden />
          Zkopírovat odkaz
        </button>
        <a href={`/dashboard/nabidky/${proposal.id}/nahled`} target="_blank" rel="noopener" className={quietBtn}>
          <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
          Náhled
        </a>
        {onNew && (
          <button type="button" onClick={onNew} disabled={outerPending} className={quietBtn}>
            <Tag size={15} strokeWidth={1.75} aria-hidden />
            Připravit novou nabídku
          </button>
        )}
        <button type="button" onClick={onRemove} className={quietBtn}>
          <Trash2 size={15} strokeWidth={1.75} aria-hidden />
          Smazat
        </button>
      </div>
      <label className="flex min-h-11 items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={proposal.reference_price}
          disabled={pending}
          onChange={(e) => toggleReference(e.target.checked)}
          className="mt-0.5 h-5 w-5"
        />
        <span>
          Cena kvůli referenci
          <span className="block text-xs text-quiet">Navrhovač se z téhle nabídky neučí.</span>
        </span>
      </label>
    </div>
  )
}
