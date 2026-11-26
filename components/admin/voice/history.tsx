import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHead } from '@/components/admin/card'
import { PillNav } from '@/components/ws/app/toolbar'
import { DeleteDictationsButton } from '@/components/admin/voice/delete-dictations'
import { VOICE_DICTATION_TONE, toneVariant } from '@/lib/admin-status'
import { CATEGORY_LABEL } from '@/lib/admin/voice/categories'
import { DICTATION_STATUSES, STATUS_HINT, STATUS_LABEL, guardLabel } from '@/lib/admin/voice/labels'
import { HISTORY_LIMIT, SEARCH_MAX, type HistoryFilter, type HistoryItem } from '@/lib/admin/voice/queries'
import { formatDictations, formatMs, formatWords } from '@/lib/admin/voice/stats'
import { cn } from '@/lib/utils'

/**
 * Historie diktátů (VO10): posledních 100, hledání v textu a filtr stavu
 * v adrese (`?tab=historie&hledat=…&stav=…`). Detail je obyčejný `<details>`,
 * takže stránka nepotřebuje JavaScript, kromě tlačítek na mazání.
 * Text diktátu je vždy jen text (React ho escapuje), nikdy HTML.
 */

const PATH = '/dashboard/voice'

const shortWhen = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(iso))

function hrefFor(filter: HistoryFilter, patch: Partial<HistoryFilter>): string {
  const next = { ...filter, ...patch }
  const params = new URLSearchParams({ tab: 'historie' })
  if (next.query) params.set('hledat', next.query)
  if (next.status) params.set('stav', next.status)
  return `${PATH}?${params.toString()}`
}

function preview(item: HistoryItem, storeText: boolean): { text: string; quiet: boolean } {
  const text = item.editedText ?? item.finalText ?? item.rawText
  if (text) return { text, quiet: false }
  if (item.textPurged) return { text: 'Text už je smazaný, zůstala čísla.', quiet: true }
  if (item.status === 'cancelled' || item.status === 'empty' || item.status === 'error') return { text: STATUS_HINT[item.status], quiet: true }
  return { text: storeText ? 'Bez textu.' : 'Text se neukládá, zůstala jen čísla.', quiet: true }
}

function TextBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-quiet">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words rounded-chip bg-navy-50 px-3 py-2 text-sm text-ink">{text}</dd>
    </div>
  )
}

function Item({ item, storeText }: { item: HistoryItem; storeText: boolean }) {
  const p = preview(item, storeText)
  const changedByCleanup = item.rawText && item.finalText && item.rawText !== item.finalText
  return (
    <li className="border-b border-navy-100 last:border-b-0">
      <details className="group">
        <summary className="flex min-h-[44px] cursor-pointer list-none flex-col gap-1 rounded-chip px-2 py-3 hover:bg-navy-50 sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 shrink-0 items-baseline gap-2 text-xs text-quiet sm:w-36 sm:flex-col sm:items-start sm:gap-0">
            <span className="whitespace-nowrap font-num">{shortWhen(item.startedAt)}</span>
            <span className="min-w-0 max-w-full truncate">{item.appName ?? CATEGORY_LABEL[item.category]}</span>
          </span>
          <span className={cn('min-w-0 flex-1 truncate text-sm', p.quiet ? 'text-quiet' : 'text-ink')}>{p.text}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-num text-xs text-quiet">{formatWords(item.words)}</span>
            <Badge variant={toneVariant(VOICE_DICTATION_TONE[item.status])}>{STATUS_LABEL[item.status]}</Badge>
          </span>
        </summary>
        <div className="space-y-4 px-2 pb-4 pt-1">
          <p className="text-sm text-quiet">{STATUS_HINT[item.status]}</p>
          <dl className="grid gap-3 lg:grid-cols-3">
            <TextBlock label="Přepis řeči" text={item.rawText} />
            <TextBlock label={changedByCleanup ? 'Vloženo po čištění' : 'Vloženo'} text={item.finalText} />
            <TextBlock label="Po vaší opravě" text={item.editedText} />
          </dl>
          {item.textPurged && <p className="text-sm text-quiet">Text už je smazaný, zůstala čísla.</p>}
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-quiet">Kategorie</dt>
              <dd className="text-ink">{CATEGORY_LABEL[item.category]}</dd>
            </div>
            <div>
              <dt className="text-quiet">Délka nahrávky</dt>
              <dd className="font-num text-ink">{formatMs(item.durationMs)}</dd>
            </div>
            <div>
              <dt className="text-quiet">Zpracování</dt>
              <dd className="font-num text-ink">{formatMs(item.totalMs)}</dd>
            </div>
            <div>
              <dt className="text-quiet">Opravy systémem</dt>
              <dd className="font-num text-ink">{item.fixes}</dd>
            </div>
            <div>
              <dt className="text-quiet">Opravená slova po vložení</dt>
              <dd className="font-num text-ink">{item.userEdits}</dd>
            </div>
          </dl>
          {item.guards.length > 0 && (
            <div>
              <p className="text-xs text-quiet">Zasáhly pojistky</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {item.guards.map((g) => (
                  <li key={g}>
                    <Badge variant="neutral">{guardLabel(g)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DeleteDictationsButton scope={{ kind: 'one', id: item.id }} label="Smazat diktát" variant="ghost" />
        </div>
      </details>
    </li>
  )
}

export function VoiceHistoryView({
  items,
  matching,
  filter,
  storeText,
}: {
  items: HistoryItem[]
  matching: number
  filter: HistoryFilter
  storeText: boolean
}) {
  const filtered = Boolean(filter.query || filter.status)
  return (
    <Card>
      <CardHead
        title="Historie"
        hint={
          filtered
            ? `Nalezeno ${formatDictations(matching)}${matching > HISTORY_LIMIT ? `, ukazuji posledních ${HISTORY_LIMIT}` : ''}.`
            : `Posledních ${HISTORY_LIMIT} diktátů. Klepnutím otevřete detail.`
        }
        action={
          filtered && matching > 0 ? (
            <DeleteDictationsButton scope={{ kind: 'search', filter }} label="Smazat nalezené" />
          ) : undefined
        }
      />

      <form action={PATH} method="get" role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="tab" value="historie" />
        {filter.status && <input type="hidden" name="stav" value={filter.status} />}
        <label className="relative flex-1">
          <span className="sr-only">Hledat v diktátech</span>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-quiet" />
          <input
            type="search"
            name="hledat"
            defaultValue={filter.query ?? ''}
            maxLength={SEARCH_MAX}
            placeholder="Hledat v textu nebo aplikaci"
            className="h-11 w-full rounded-full border border-input bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-quiet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800"
        >
          Hledat
        </button>
      </form>

      <PillNav
        label="Stav diktátu"
        className="mb-4"
        items={[
          { key: 'vse', label: 'Všechny', href: hrefFor(filter, { status: null }), active: !filter.status },
          ...DICTATION_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], href: hrefFor(filter, { status: s }), active: filter.status === s })),
        ]}
      />

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-quiet">
          {filtered ? 'Nic takového jsme nenašli. Zkuste jiné slovo nebo stav.' : 'Zatím žádný diktát.'}
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <Item key={item.id} item={item} storeText={storeText} />
          ))}
        </ul>
      )}
    </Card>
  )
}
