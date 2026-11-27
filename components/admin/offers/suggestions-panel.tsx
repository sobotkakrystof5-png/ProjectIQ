'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { decideSuggestionAction, runReviewNowAction, undoSuggestionAction } from '@/app/offer-proposal-actions'
import type { RuleSuggestion } from '@/lib/admin/offers/proposals'
import { OFFER_SUGGESTION_TONE, toneVariant } from '@/lib/admin-status'

/**
 * Návrhy úprav cenových pravidel z vyhodnocení nabídek (N3, R-155).
 * Nic neplatí samo: přijetí uloží novou verzi pravidel a 5 minut jde vzít zpět.
 */

const KIND_LABEL: Record<RuleSuggestion['kind'], string> = {
  raise_band: 'Zvednout ceny',
  shift_variant: 'Posunout variantu',
  insight: 'Postřeh',
}

const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'
const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'

export function SuggestionsPanel({ suggestions }: { suggestions: RuleSuggestion[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const open = suggestions.filter((s) => s.status === 'pending')

  const decide = (s: RuleSuggestion, decision: 'accept' | 'reject') =>
    start(async () => {
      setBusy(s.id)
      const res = await decideSuggestionAction(s.id, decision)
      setBusy(null)
      if (!res.ok) {
        toast.error('Návrh se nepodařilo zapsat. Obnovte stránku.')
        return
      }
      router.refresh()
      toast.message(
        decision === 'accept' ? (s.kind === 'insight' ? 'Bereme na vědomí' : 'Pravidla upravená') : 'Návrh odmítnutý',
        {
          undo: () => {
            void undoSuggestionAction(s.id).then(() => router.refresh())
          },
        },
      )
    })

  const runNow = () =>
    start(async () => {
      const { created } = await runReviewNowAction()
      router.refresh()
      toast.success(created > 0 ? `Nové návrhy: ${created}` : 'Žádný nový návrh', {
        description: created > 0 ? undefined : 'Na úpravu pravidel je zatím málo nabídek, nebo sedí.',
      })
    })

  return (
    <div className="flex flex-col gap-4">
      {open.length === 0 ? (
        <p className="text-sm text-quiet">
          Teď nic nečeká. Návrhy přicházejí jednou měsíčně z odeslaných nabídek, nejdřív po pár nabídkách v jednom pásmu.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-chip border border-navy-100 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={toneVariant(OFFER_SUGGESTION_TONE)}>{KIND_LABEL[s.kind]}</Badge>
              </div>
              <p className="text-sm leading-6 text-ink">{s.reason}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => decide(s, 'accept')} disabled={pending} className={primaryBtn}>
                  {busy === s.id && <Loader2 size={15} className="animate-spin" aria-hidden />}
                  {s.kind === 'insight' ? 'Beru na vědomí' : 'Přijmout'}
                </button>
                {s.kind !== 'insight' && (
                  <button type="button" onClick={() => decide(s, 'reject')} disabled={pending} className={quietBtn}>
                    Odmítnout
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={runNow} disabled={pending} className={`${quietBtn} self-start`}>
        {pending && busy === null && <Loader2 size={15} className="animate-spin" aria-hidden />}
        Vyhodnotit teď
      </button>
    </div>
  )
}
