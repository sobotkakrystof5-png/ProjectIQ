import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { TableSearch } from '@/components/admin/table-search'
import { Badge } from '@/components/ui/badge'
import { SendEmailButton } from '@/components/admin/send-email-button'
import { loadMailReadiness } from '@/lib/admin/mail-readiness'
import { CONTACT_SORT, loadContactsScreen, type ContactRow, type ContactView } from '@/lib/admin/contacts'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { formatDate } from '@/lib/utils'

// Kontakty (AD09): jeden člověk = jeden řádek. Telefony a e-maily, které byly
// rozkopírované v pěti tabulkách, ukazují jeden kontakt — a duplicity, které
// zůstaly, se tady slučují.

const PATH = '/dashboard/kontakty'

const dash = <span className="text-quiet">—</span>

const VIEWS: { value: ContactView; label: string }[] = [
  { value: 'aktivni', label: 'Kontakty' },
  { value: 'duplicity', label: 'Možné duplicity' },
  { value: 'sloucene', label: 'Sloučené' },
]

/** „3 zakázky · 2 hovory“ — kde se kontakt objevuje. */
function occurrences(row: ContactRow): React.ReactNode {
  const parts: string[] = []
  const add = (n: number, forms: [string, string, string]) => {
    if (n === 0) return
    const word = n === 1 ? forms[0] : n < 5 ? forms[1] : forms[2]
    parts.push(`${n} ${word}`)
  }
  add(row.zakazky, ['zakázka', 'zakázky', 'zakázek'])
  add(row.hovory, ['hovor', 'hovory', 'hovorů'])
  add(row.konzultace, ['konzultace', 'konzultace', 'konzultací'])
  add(row.poptavky, ['poptávka', 'poptávky', 'poptávek'])
  if (parts.length === 0) return <span className="text-quiet">Zatím nikde</span>
  return <span className="text-quiet">{parts.join(' · ')}</span>
}

function columnsFor(readiness: { google: boolean; mail: boolean }): AdminColumn<ContactRow>[] {
  return [

  {
    key: 'jmeno',
    header: 'Jméno',
    sortable: true,
    mobile: 'title',
    cell: (c) => c.display_name,
  },
  { key: 'firma', header: 'Firma', sortable: true, cell: (c) => c.company ?? dash },
  {
    key: 'telefon',
    header: 'Telefon',
    sortable: true,
    cell: (c) => (c.phone !== null ? <span className="font-num">{c.phone}</span> : dash),
  },
  {
    key: 'email',
    header: 'E-mail',
    sortable: true,
    // Sloučený kontakt už nepíšeme — e-mail patří tomu, do kterého je sloučený.
    cell: (c) =>
      c.email === null ? (
        dash
      ) : (
        <div className="flex flex-col items-start gap-1">
          <span>{c.email}</span>
          {c.merged_into === null && (
            <SendEmailButton
              appearance="chip"
              readiness={readiness}
              target={{ kind: 'contact', id: c.id, company: c.company ?? c.display_name, email: c.email }}
            />
          )}
        </div>
      ),
  },
  { key: 'kde', header: 'Kde se objevuje', cell: (c) => occurrences(c) },
  {
    key: 'naposledy',
    header: 'Naposledy',
    sortable: true,
    cell: (c) => (c.last_seen_at !== null ? <span className="font-num">{formatDate(c.last_seen_at)}</span> : dash),
  },
  {
    key: 'sloucen',
    header: '',
    mobile: 'badge',
    className: 'w-32',
    cell: (c) =>
      c.merged_into !== null ? (
        <Badge variant="outline">Sloučen do {c.merged_into_name ?? 'jiného'}</Badge>
      ) : null,
  },
  ]
}

const EMPTY: Record<ContactView, { title: string; description: string }> = {
  aktivni: {
    title: 'Zatím žádné kontakty',
    description:
      'Kontakty vznikají z hovorů, zakázek a poptávek z webů. Historii do nich převede skript admin-contacts-backfill.',
  },
  duplicity: {
    title: 'Žádné duplicity',
    description: 'Nikdo tu není dvakrát pod stejným jménem. Až se to stane, uvidíte je tady a sloučíte je v detailu.',
  },
  sloucene: {
    title: 'Nic sloučeného',
    description: 'Sloučené kontakty zůstávají uložené a vede z nich odkaz na ten, do kterého patří.',
  },
}

export default async function KontaktyPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const raw = searchParams.pohled
  const view: ContactView = raw === 'duplicity' || raw === 'sloucene' ? raw : 'aktivni'
  const q = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q

  const params = parseTableParams(searchParams, {
    allowed: CONTACT_SORT,
    defaultSort: 'jmeno',
    pageSize: 50,
    tiebreak: 'c.created_at',
  })
  const [{ rows, total, counts }, readiness] = await Promise.all([
    loadContactsScreen(view, q ?? null, params),
    loadMailReadiness(),
  ])
  const links = tableLinks(PATH, searchParams)

  return (
    <PageShell width="table">
      <PageHeader
        title="Kontakty"
        subtitle="Jeden člověk jeden řádek. Hovory, zakázky i dokončená práce se vážou na stejný kontakt."
        subtitleFont="sans"
      />

      <DataTable
        rows={rows}
        columns={columnsFor(readiness)}
        rowKey={(c) => c.id}
        href={(c) => `${PATH}/${c.id}`}
        sort={{ params, links }}
        page={{ params, total, links }}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-3">
            <PillNav
              label="Které kontakty"
              items={VIEWS.map((item) => ({
                key: item.value,
                label: item.label,
                href: tableHref(PATH, searchParams, {
                  pohled: item.value === 'aktivni' ? null : item.value,
                  page: null,
                }),
                active: view === item.value,
                count: counts[item.value],
              }))}
            />
            <TableSearch
              action={PATH}
              searchParams={searchParams}
              placeholder="Jméno, firma, telefon nebo e-mail"
              className="max-w-[320px]"
            />
          </div>
        }
        empty={EMPTY[view]}
      />
    </PageShell>
  )
}
