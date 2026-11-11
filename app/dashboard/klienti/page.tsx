import { listClients, CLIENTS_PAGE_SIZE, type ClientList } from '@/lib/ws/admin/clients'
import { INDUSTRY_TEMPLATES } from '@/lib/ws/templates'
import { ClientsView } from './clients-view'

// Klienti ZakazIQ Workspace (S17). Admin layout už ověřil NextAuth session;
// data čte vlastník tabulek (lib/ws/admin/db.ts). Jen počty a stav, žádné
// údaje zákazníků klientů.
//
// Od AD06 se čte po padesáti (`?strana=`); čísla v hlavičce se počítají přes
// všechny účty, aby nezávisela na otevřené stránce. Obyčejné odkazy Vedle
// a Zpět nahradí sdílená tabulka v AD07.

export const dynamic = 'force-dynamic'

const EMPTY: ClientList = { rows: [], total: 0, byAccess: { none: 0, trialing: 0, active: 0, grace: 0, read_only: 0 } }

export default async function KlientiPage(props: { searchParams: Promise<{ strana?: string }> }) {
  const { strana } = await props.searchParams
  const page = Math.max(1, Number(strana) || 1)

  let list = EMPTY
  let failed = false
  try {
    list = await listClients(page)
  } catch (e) {
    failed = true
    console.error('admin.klienti', { error: e instanceof Error ? e.message : 'unknown' })
  }
  return (
    <ClientsView
      clients={list.rows}
      total={list.total}
      byAccess={list.byAccess}
      page={page}
      pageSize={CLIENTS_PAGE_SIZE}
      failed={failed}
      industries={INDUSTRY_TEMPLATES.map((t) => ({ key: t.key, label: t.label }))}
    />
  )
}
