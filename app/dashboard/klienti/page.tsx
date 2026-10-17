import { listClients, type ClientRow } from '@/lib/ws/admin/clients'
import { INDUSTRY_TEMPLATES } from '@/lib/ws/templates'
import { ClientsView } from './clients-view'

// Klienti ZakazIQ Workspace (S17). Admin layout už ověřil NextAuth session;
// data čte vlastník tabulek (lib/ws/admin/db.ts). Jen počty a stav, žádné
// údaje zákazníků klientů.

export const dynamic = 'force-dynamic'

export default async function KlientiPage() {
  let clients: ClientRow[] = []
  let failed = false
  try {
    clients = await listClients()
  } catch (e) {
    failed = true
    console.error('admin.klienti', { error: e instanceof Error ? e.message : 'unknown' })
  }
  return <ClientsView clients={clients} failed={failed} industries={INDUSTRY_TEMPLATES.map((t) => ({ key: t.key, label: t.label }))} />
}
