import Link from 'next/link'
import { Cake, Gift, Moon, Sparkles } from 'lucide-react'
import { SectionLabel } from '@/components/ws/brand'
import type { DraftItem, OutreachKind, OutreachSuggestion } from '@/lib/ws/outreach'
import { DraftList } from './draft-list'

const ICONS: Record<OutreachKind, typeof Cake> = {
  birthday: Cake,
  almost: Gift,
  winback: Moon,
  thanks: Sparkles,
}

/**
 * „Komu napsat“ (S12, plán: Segmenty zákazníků): návrhy jen pro zákazníky
 * se souhlasem s nabídkami. „Připravit zprávu“ otevře pravý panel s textem.
 */
export function OutreachPanel({
  slug,
  suggestions,
  drafts,
  hrefFor,
}: {
  slug: string
  suggestions: OutreachSuggestion[]
  drafts: DraftItem[]
  hrefFor: (customerId: string, kind: OutreachKind) => string
}) {
  return (
    <aside aria-labelledby="komu-napsat" className="flex flex-col gap-4 self-start rounded-panel border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 id="komu-napsat">
          <SectionLabel>Komu napsat</SectionLabel>
        </h2>
        <p className="text-sm text-quiet">Jen zákazníci, kteří souhlasili s nabídkami.</p>
      </div>

      {suggestions.length === 0 ? (
        <p className="rounded-chip bg-navy-50 px-3 py-3 text-sm text-quiet dark:bg-navy-900 dark:text-navy-200">
          Teď nikomu. Návrhy se objeví u spících zákazníků, u skoro plné karty, před narozeninami a po první návštěvě. Souhlas
          zapnete v kartě zákazníka.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => {
            const Icon = ICONS[s.kind]
            return (
              <li key={`${s.customerId}:${s.kind}`}>
                <Link
                  href={hrefFor(s.customerId, s.kind)}
                  scroll={false}
                  className="flex min-h-[56px] items-center gap-3 rounded-chip px-2 py-2 transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-navy-900"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-tiny bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-200">
                    <Icon aria-hidden size={18} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{s.name}</span>
                    <span className="block truncate text-sm text-quiet">{s.reason}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-navy-700 dark:text-navy-200">Připravit zprávu</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {drafts.length > 0 && <DraftList slug={slug} drafts={drafts.map((d) => ({ id: d.id, name: d.name, subject: d.subject }))} />}
    </aside>
  )
}
