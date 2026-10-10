import 'server-only'
import { createHash, createHmac } from 'crypto'
import { wsSystem } from '../db'

// Rate limit veřejných vstupů Workspace (S11) nad ws.rate_limits (migrace 075):
// pevné okno, jeden atomický upsert na požadavek. Klíč je hash — IP adresa ani
// klíč webu v čitelné podobě do DB nejdou (tabulka je bez RLS a bez osobních
// údajů). Vzor: lib/api-rate-limit.ts adminu (ten zůstává beze změny).

export type Limit = { name: string; max: number; windowSec: number }

export const LIMITS = {
  /** POST /api/public/v1/requests z jedné IP */
  requestsPerIp: { name: 'req-ip', max: 20, windowSec: 60 },
  /** poptávky na jeden byznys (proti zahlcení z mnoha IP) */
  requestsPerBusiness: { name: 'req-biz', max: 300, windowSec: 3600 },
  /** GET /api/public/v1/schema z jedné IP */
  schemaPerIp: { name: 'schema-ip', max: 120, windowSec: 60 },
  /** objednávací stránka /r/[slug] — odeslání z jedné IP */
  pagePerIp: { name: 'page-ip', max: 8, windowSec: 600 },
  /** „Ověřit napojení“ z aplikace */
  checkPerBusiness: { name: 'check-biz', max: 10, windowSec: 600 },
  /** klientský portál /z/[token] — otevření stránky z jedné IP (S16) */
  portalViewPerIp: { name: 'portal-view-ip', max: 120, windowSec: 60 },
  /** klientský portál — přesun, zrušení, hodnocení z jedné IP */
  portalActionPerIp: { name: 'portal-ip', max: 10, windowSec: 600 },
  /** klientský portál — akce na jeden termín/zakázku (jako admin portál: pár pokusů za 10 min) */
  portalActionPerItem: { name: 'portal-item', max: 5, windowSec: 600 },
  /** klientský portál — stažení faktury (PDF se skládá na serveru) */
  portalPdfPerIp: { name: 'portal-pdf-ip', max: 10, windowSec: 600 },
} satisfies Record<string, Limit>

/** Hash hodnoty pro klíč limitu. S pepřem, když je nastavený (IP adres je málo, holý hash by šel zpětně dohledat). */
export function limitKey(limit: Limit, value: string): string {
  const pepper = process.env.WS_KEY_PEPPER
  const digest = pepper
    ? createHmac('sha256', pepper).update(value).digest('hex')
    : createHash('sha256').update(value).digest('hex')
  return `${limit.name}:${digest.slice(0, 40)}`
}

/** Započítá požadavek. `true` = limit překročený, požadavek odmítnout. */
export async function hitLimit(limit: Limit, value: string): Promise<boolean> {
  const key = limitKey(limit, value)
  const [row] = await wsSystem<{ count: number }>`
    INSERT INTO ws.rate_limits (key, window_start, count)
    VALUES (${key}, to_timestamp((floor(extract(epoch FROM now()) / ${limit.windowSec}::int) * ${limit.windowSec}::int)::float8), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = ws.rate_limits.count + 1
    RETURNING count
  `
  // Úklid starých oken občas, ne při každém požadavku.
  if (Math.random() < 0.02) {
    await wsSystem`DELETE FROM ws.rate_limits WHERE window_start < now() - interval '1 day'`
  }
  return Number(row?.count ?? 0) > limit.max
}

/** IP klienta z hlavičky Vercelu (první adresa v x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : headers.get('x-real-ip')) || 'unknown'
}
