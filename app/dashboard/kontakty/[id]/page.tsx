import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Badge } from '@/components/ui/badge'
import { ContactActions } from '@/components/admin/contact-actions'
import { ContactForm } from '@/components/admin/contacts/contact-form'
import { MergeButton, UnmergeButton } from '@/components/admin/contacts/merge-actions'
import { loadContactDetail, type ContactOccurrence } from '@/lib/admin/contacts'
import { formatDate } from '@/lib/utils'
import { nameKey } from '@/lib/contacts/normalize'

// Karta kontaktu (AD09): co o člověku víme, kde se objevuje a kdo je asi on
// taky. Sloučení je tady — nikdy se nedělá samo a vždycky se dá vzít zpět.
//
// Souhrn čísel (příjem, zisk, nezaplacené faktury) sem přijde až s pohledy
// z AD13; dokud nejsou, karta nic nepočítá a jen poctivě odkazuje.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const KIND_LABEL: Record<ContactOccurrence['kind'], string> = {
  zakazka: 'Zakázky',
  hovor: 'Hovory',
  dokoncene: 'Dokončená práce',
  konzultace: 'Konzultace',
  poptavka: 'Poptávky z webu',
}

const KIND_ORDER: ContactOccurrence['kind'][] = ['zakazka', 'hovor', 'dokoncene', 'konzultace', 'poptavka']

const REASON_LABEL = {
  jmeno: 'stejné jméno',
  firma: 'stejná firma',
  ico: 'stejné IČO',
} as const

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <p className="text-sm text-quiet">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export default async function KontaktPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  if (!UUID.test(id)) notFound()

  const detail = await loadContactDetail(id)
  if (detail === null) notFound()

  const { contact, merged, occurrences, candidates } = detail

  // „Objevuje se také jako…" — jiné zápisy téhož člověka, jak je nesou řádky
  // v zakázkách a hovorech. Text v nich zůstává jako snímek dokladu.
  const seen = new Set([nameKey(contact.display_name)])
  const alsoKnownAs: string[] = []
  for (const row of occurrences) {
    const written = row.written?.trim()
    if (written === undefined || written === '') continue
    const key = nameKey(written)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    alsoKnownAs.push(written)
  }

  const byKind = KIND_ORDER.map((kind) => ({ kind, rows: occurrences.filter((o) => o.kind === kind) })).filter(
    (group) => group.rows.length > 0,
  )

  return (
    <PageShell width="default">
      <Link
        href="/dashboard/kontakty"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
        Kontakty
      </Link>

      <PageHeader
        title={contact.display_name}
        subtitle={contact.company ?? (contact.last_seen_at !== null ? `Naposledy ${formatDate(contact.last_seen_at)}` : undefined)}
        subtitleFont="sans"
      />

      {/*
        Zavolat a napsat rovnou z karty (AD10). Karta kontaktu je jediná
        obrazovka, která je o člověku celá — a jako jediná to do AD10 neuměla.
      */}
      <ContactActions
        phone={contact.phone}
        email={contact.email}
        context={{ projectName: contact.company ?? contact.display_name }}
        emptyHint="Kontakt nemá telefon ani e-mail. Doplňte je v Údajích a zavoláte jedním klikem."
      />

      {contact.merged_into !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-navy-100 bg-navy-50 px-4 py-3">
          <p className="text-sm text-ink">
            Tenhle kontakt je sloučený do{' '}
            <Link href={`/dashboard/kontakty/${contact.merged_into}`} className="font-semibold underline">
              {contact.merged_into_name ?? 'jiného kontaktu'}
            </Link>
            . Nic se nesmazalo, jde to vzít zpět.
          </p>
          <UnmergeButton sourceId={contact.id} />
        </div>
      )}

      {alsoKnownAs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-quiet">Objevuje se také jako</span>
          {alsoKnownAs.slice(0, 8).map((written) => (
            <Badge key={written} variant="outline">
              {written}
            </Badge>
          ))}
        </div>
      )}

      {/*
        `grid-cols-1` tu není navíc: bez něj má jediný sloupec šířku `auto`,
        takže ho nejširší vnitřek (datum u položky, pole formuláře) roztáhne
        přes okno — na 390 px stránka přetékala o 71 px. `minmax(0,…)` to
        podlahou na nule zaručí v obou rozvrženích.
      */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <Section
            title="Kde se objevuje"
            hint="Zakázky, hovory a dokončená práce, které patří k tomuhle člověku."
          >
            {byKind.length === 0 ? (
              <p className="rounded-box border border-dashed border-navy-200 px-4 py-6 text-sm text-quiet">
                Zatím nikde. Kontakt se naváže, až z něj vznikne hovor nebo zakázka.
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {byKind.map((group) => (
                  <div key={group.kind} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-quiet">
                      {KIND_LABEL[group.kind]}
                    </h3>
                    <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
                      {group.rows.map((row) => (
                        <li key={`${row.kind}-${row.id}`} className="border-t border-navy-100 first:border-t-0">
                          {row.href !== null ? (
                            <Link
                              href={row.href}
                              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-navy-50/60"
                            >
                              <span className="min-w-0 truncate text-sm text-ink">{row.title}</span>
                              {row.at !== null && <span className="shrink-0 font-num text-xs text-quiet">{formatDate(row.at)}</span>}
                            </Link>
                          ) : (
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                              <span className="min-w-0 truncate text-sm text-ink">{row.title}</span>
                              {row.at !== null && <span className="shrink-0 font-num text-xs text-quiet">{formatDate(row.at)}</span>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {merged.length > 0 && (
            <Section title="Sloučené kontakty" hint="Zápisy téhož člověka, které už vedou sem.">
              <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
                {merged.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 px-4 py-3 first:border-t-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{row.display_name}</p>
                      <p className="truncate font-num text-xs text-quiet">{row.phone ?? row.email ?? '—'}</p>
                    </div>
                    <UnmergeButton sourceId={row.id} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <Section title="Údaje">
            <ContactForm
              id={contact.id}
              initial={{
                display_name: contact.display_name,
                company: contact.company,
                email: contact.email,
                phone: contact.phone,
                ico: contact.ico,
                dic: contact.dic,
                note: contact.note,
              }}
            />
          </Section>

          {contact.merged_into === null && candidates.length > 0 && (
            <Section
              title="Možné duplicity"
              hint="Někdo se stejným jménem, firmou nebo IČEM. Sloučení se dá vzít zpět."
            >
              <ul className="flex flex-col gap-2">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-navy-100 bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link href={`/dashboard/kontakty/${candidate.id}`} className="truncate text-sm font-medium text-ink hover:underline">
                        {candidate.display_name}
                      </Link>
                      <p className="truncate font-num text-xs text-quiet">
                        {candidate.phone ?? candidate.email ?? '—'} · {REASON_LABEL[candidate.reason]}
                      </p>
                    </div>
                    <MergeButton
                      sourceId={candidate.id}
                      targetId={contact.id}
                      sourceName={candidate.display_name}
                      targetName={contact.display_name}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </PageShell>
  )
}
