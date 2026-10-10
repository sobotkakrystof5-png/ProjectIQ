import 'server-only'
import { wsDb } from '../db'
import type { WsBusiness, WsContext } from '../context'

// Záznam posledních požadavků na příjem poptávek (ws.intake_log, migrace 076)
// pro Nastavení › Napojený web. Jen čas, cesta, doména a výsledek.

export type IntakeLogRow = {
  id: string
  created_at: Date
  channel: 'secret' | 'widget' | 'page' | 'check'
  origin: string | null
  status: number
  code: string | null
  is_test: boolean
}

export async function getIntakeLog(ctx: WsContext, business: Pick<WsBusiness, 'id'>, limit = 20): Promise<IntakeLogRow[]> {
  return wsDb(ctx)<IntakeLogRow>`
    SELECT id, created_at, channel, origin, status, code, is_test FROM ws.intake_log
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}
    ORDER BY created_at DESC LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `
}

/** Poslední úspěšně přijatá poptávka z webu (tajný klíč nebo widget), i zkušební. */
export async function lastWebSuccess(ctx: WsContext, business: Pick<WsBusiness, 'id'>): Promise<Date | null> {
  const [row] = await wsDb(ctx)<{ created_at: Date }>`
    SELECT created_at FROM ws.intake_log
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}
      AND channel IN ('secret', 'widget') AND status < 300
    ORDER BY created_at DESC LIMIT 1
  `
  return row?.created_at ?? null
}
