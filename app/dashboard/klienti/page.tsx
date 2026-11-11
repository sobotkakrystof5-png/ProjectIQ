import { CLIENT_SORT, CLIENTS_PAGE_SIZE, listClients, type ClientList } from '@/lib/ws/admin/clients'
import { INDUSTRY_TEMPLATES } from '@/lib/ws/templates'
import { parseTableParams, tableLinks } from '@/lib/admin-table'
import { ClientsView } from './clients-view'

// Klienti ZakazIQ Workspace (S17). Admin layout už ověřil NextAuth session;
// data čte vlastník tabulek (lib/ws/admin/db.ts). Jen počty a stav, žádné
// údaje zákazníků klientů.
//
// Od AD07 má seznam sdílenou tabulku: řazení i stránka jsou v adrese
// (`?sort=&dir=&page=`), takže přežijí reload i tlačítko Zpět.

export const dynamic = 'force-dynamic'

const PATH = '/dashboard/klienti'
const EMPTY: ClientList = { rows: [], total: 0, byAccess: { none: 0, trialing: 0, active: 0, grace: 0, read_only: 0 } }

export default async function KlientiPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const params = parseTableParams(searchParams, {
    allowed: CLIENT_SORT,
    defaultSort: 'aktivita',
    pageSize: CLIENTS_PAGE_SIZE,
    tiebreak: 'a.created_at',
  })

  let list = EMPTY
  let failed = false
  try {
    list = await listClients(params)
  } catch (e) {
    failed = true
    console.error('admin.klienti', { error: e instanceof Error ? e.message : 'unknown' })
  }

  return (
    <ClientsView
      clients={list.rows}
      total={list.total}
      byAccess={list.byAccess}
      params={params}
      links={tableLinks(PATH, searchParams)}
      failed={failed}
      industries={INDUSTRY_TEMPLATES.map((t) => ({ key: t.key, label: t.label }))}
    />
  )
}
