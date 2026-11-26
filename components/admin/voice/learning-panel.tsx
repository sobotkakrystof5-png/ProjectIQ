'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import {
  acceptVoiceSuggestion,
  forgetVoiceLearnedTerm,
  rejectVoiceSuggestion,
  restoreVoiceTerm,
  undoVoiceSuggestion,
} from '@/app/voice-actions'
import { VOICE_SUGGESTION_TONE, toneVariant } from '@/lib/admin-status'
import { SUGGESTION_KIND_LABEL } from '@/lib/admin/voice/labels'
import type { PendingSuggestion, VoiceLearning } from '@/lib/admin/voice/queries'

/**
 * Učení (VO10): návrhy z oprav ke schválení a slova, která se naučila sama.
 * Přijmout, odmítnout i vrátit jde 2 minuty zpátky (Zpět v toastu). Pravidlo
 * stylu a blokovaná fráze se nikdy nepřidají samy (D-V8).
 */

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(iso))

function Suggestion({ s, pending, onDecide }: { s: PendingSuggestion; pending: boolean; onDecide: (s: PendingSuggestion, accept: boolean) => void }) {
  return (
    <li className="rounded-chip border border-navy-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={toneVariant(VOICE_SUGGESTION_TONE)}>{SUGGESTION_KIND_LABEL[s.kind]}</Badge>
          <p className="mt-2 break-words text-base font-semibold text-ink">{s.title}</p>
          {s.heardAs.length > 0 && <p className="mt-0.5 text-sm text-quiet">Přepis píše: {s.heardAs.join(', ')}</p>}
          <p className="mt-1 text-xs text-quiet">
            {s.source === 'ai' ? 'Navrhl rozbor AI' : 'Z vašich oprav'} · <span className="font-num">{s.evidence}×</span>
          </p>
          {s.reason && <p className="mt-2 text-sm text-ink">{s.reason}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" onClick={() => onDecide(s, true)} disabled={pending}>
            Přijmout
          </Button>
          <Button type="button" variant="outline" onClick={() => onDecide(s, false)} disabled={pending}>
            Odmítnout
          </Button>
        </div>
      </div>
      {s.examples.length > 0 && (
        <div className="mt-4">
          <p className="grid gap-3 text-xs font-medium text-quiet sm:grid-cols-2">
            <span>Příklady: vloženo</span>
            <span className="hidden sm:block">Po vaší opravě</span>
          </p>
          <ul className="mt-2 space-y-2">
            {s.examples.map((e) => (
              <li key={e.id} className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-3">
                <span className="min-w-0 break-words rounded-chip bg-navy-50 px-3 py-2 text-quiet">
                  <span className="sr-only">Před: </span>
                  {e.before ?? 'Text už je smazaný.'}
                </span>
                <span className="min-w-0 break-words rounded-chip border border-navy-100 px-3 py-2 text-ink">
                  <span className="sr-only">Po opravě: </span>
                  {e.after ?? 'Celé smazané.'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export function VoiceLearningPanel({ data, runNow }: { data: VoiceLearning; runNow?: React.ReactNode }) {
  const [pending, start] = useTransition()

  const decide = (s: PendingSuggestion, accept: boolean) =>
    start(async () => {
      const res = accept ? await acceptVoiceSuggestion(s.id) : await rejectVoiceSuggestion(s.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(accept ? `Přijato: ${s.title}` : `Odmítnuto: ${s.title}`, {
        description: accept ? undefined : 'Stejný návrh už se nevrátí.',
        undo: () =>
          start(async () => {
            const back = await undoVoiceSuggestion(s.id)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })

  const forget = (id: string, term: string) =>
    start(async () => {
      const res = await forgetVoiceLearnedTerm(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${term} je pryč ze slovníku.`, {
        description: 'Samo se už znovu nenaučí.',
        undo: () =>
          start(async () => {
            const back = await restoreVoiceTerm(res.snapshot)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHead
          title="Návrhy ke schválení"
          hint="Co se systém naučil z vašich oprav. Nic z toho se nepoužije, dokud to nepřijmete."
          action={runNow}
        />
        {data.suggestions.length === 0 ? (
          <p className="text-sm text-quiet">Teď nic nečeká. Nové návrhy přibudou, až budete po vložení opravovat text.</p>
        ) : (
          <ul className="space-y-3">
            {data.suggestions.map((s) => (
              <Suggestion key={s.id} s={s} pending={pending} onDecide={decide} />
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-quiet">
          {data.lastReviewAt
            ? `Rozbor AI proběhl naposledy ${dateTime(data.lastReviewAt)}.`
            : 'Rozbor AI zatím neproběhl. Pouští se v pondělí, když je za týden aspoň 8 oprav.'}
        </p>
      </Card>

      <Card>
        <CardHead
          title="Naučená slova"
          hint={
            data.autoLearn
              ? 'Slovo se naučí samo, když ho opravíte stejně ve třech diktátech. Vrátit jde kdykoli.'
              : 'Samo se teď nic neučí, slova chodí jako návrhy ke schválení.'
          }
          action={
            <Link
              href="/dashboard/voice?tab=nastaveni"
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-navy-700 hover:text-navy-900"
            >
              Nastavení učení
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          }
        />
        {data.learned.length === 0 ? (
          <p className="text-sm text-quiet">Zatím se nic nenaučilo.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {data.learned.map((t) => (
              <li key={t.id} className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block break-words font-medium text-ink">{t.term}</span>
                  <span className="block text-xs text-quiet">
                    {t.heardAs.length ? `Přepis píše: ${t.heardAs.join(', ')} · ` : ''}použito {t.uses}×
                  </span>
                </span>
                <Button type="button" variant="ghost" onClick={() => forget(t.id, t.term)} disabled={pending}>
                  Vrátit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
