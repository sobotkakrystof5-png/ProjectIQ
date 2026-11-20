import 'server-only'
import { CONSULTATION_LIST_DAYS, type FreeSlot } from '@/lib/consultations/rules'
import { portalDb, pq } from './db'

// Konzultace v klientském prostoru (KP14, migrace 123, R-126). Klient čte jen
// projekci portal.consultations přes portalDb(clientId) — RLS a výslovný filtr
// client_id — a volné časy úzkou funkcí, která nevrací nic kromě začátku
// a konce. Bez migrace nebo bez práv se vrátí `enabled: false` a stránka
// rezervaci nenabídne.

export interface PortalConsultation {
  id: string
  startsAt: string
  endsAt: string
  topic: string
  channel: 'whatsapp' | 'teams' | 'meet' | 'phone' | 'other'
  meetUrl: string | null
  meetPending: boolean
}

export interface PortalConsultations {
  enabled: boolean
  upcoming: PortalConsultation[]
  freeSlots: FreeSlot[]
}

// Chybějící tabulka, funkce nebo právo = funkce ještě není nasazená.
const TOLERATED = new Set(['42P01', '42883', '42501'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

const iso = (v: unknown): string => new Date(v as string).toISOString()
const CHANNELS = new Set(['whatsapp', 'teams', 'meet', 'phone', 'other'])

export async function loadClientConsultations(clientId: string, projectId: string): Promise<PortalConsultations> {
  const now = new Date()
  const until = new Date(now.getTime() + CONSULTATION_LIST_DAYS * 86_400_000)
  try {
    const [rows, slots] = await portalDb({ clientId }).batch([
      pq`
        SELECT id::text, starts_at, ends_at, topic, channel, meet_url, meet_pending
        FROM portal.consultations
        WHERE client_id = ${clientId} AND project_id = ${projectId} AND ends_at > now()
        ORDER BY starts_at
        LIMIT 20
      `,
      pq`SELECT starts_at, ends_at FROM portal.free_consultation_slots(${now.toISOString()}, ${until.toISOString()})`,
    ])
    return {
      enabled: true,
      upcoming: rows.map((r) => ({
        id: String(r.id),
        startsAt: iso(r.starts_at),
        endsAt: iso(r.ends_at),
        topic: String(r.topic ?? ''),
        channel: (CHANNELS.has(String(r.channel)) ? r.channel : 'other') as PortalConsultation['channel'],
        meetUrl: typeof r.meet_url === 'string' && r.meet_url.startsWith('https://meet.google.com/') ? r.meet_url : null,
        meetPending: r.meet_pending === true,
      })),
      freeSlots: slots.map((s) => ({ startsAt: iso(s.starts_at), endsAt: iso(s.ends_at) })),
    }
  } catch (err) {
    if (TOLERATED.has(pgCode(err) ?? '')) return { enabled: false, upcoming: [], freeSlots: [] }
    throw err
  }
}

/** Údaje konzultace před zrušením (pro zvonek). Jen z projekce klienta. */
export async function loadClientConsultation(
  clientId: string,
  consultationId: string,
): Promise<{ projectId: string; startsAt: string } | null> {
  const rows = await portalDb({ clientId })`
    SELECT project_id::text, starts_at FROM portal.consultations
    WHERE client_id = ${clientId} AND id = ${consultationId}
  `
  const r = rows[0]
  return r ? { projectId: String(r.project_id), startsAt: iso(r.starts_at) } : null
}
