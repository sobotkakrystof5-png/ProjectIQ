import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { bearerFrom, isAgentKeyConfigured, resolveAgentKey, touchAgentKey } from '@/lib/agent-keys'
import { createNotification } from '@/lib/notifications'
import {
  prepareActivity,
  reportInputSchema,
  reportKindToActivityKind,
} from '@/lib/project-activity'

// Příjem hlášení z Claude Code (KP04). Klíč projektu umí jen zapsat KONCEPT
// do téhož projektu: nic nečte, nic nepublikuje. Hlášení schvaluje Kryštof
// v adminu. Chyby neprozrazují, jestli projekt existuje. CORS není — volá se
// ze skriptu v terminálu, ne z prohlížeče.

const projectIdSchema = z.string().uuid()
const IP_ENDPOINT = 'agent_report_ip'
const IP_WINDOW_MINUTES = 60
const IP_MAX = 60
const KEY_WINDOW_MINUTES = 60
const KEY_MAX = 20
// Nadpis 160 + text 4000 znaků s rezervou na uvozovky a diakritiku v JSON.
const MAX_BODY_BYTES = 32 * 1024

function fail(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  if (!isAgentKeyConfigured()) return fail(503, 'NOT_CONFIGURED')

  const ip = getClientIp(req)
  // Počítá se každé volání včetně neúspěšných, aby šlo omezit i hádání klíčů.
  if (await isApiRateLimited(IP_ENDPOINT, ip, IP_WINDOW_MINUTES, IP_MAX)) return fail(429, 'RATE_LIMITED')
  await recordApiRequest(IP_ENDPOINT, ip)

  const { projectId } = await ctx.params
  const key = bearerFrom(req.headers.get('authorization'))
  const resolved = key && projectIdSchema.safeParse(projectId).success ? await resolveAgentKey(key) : null
  // Stejná odpověď pro špatný klíč, cizí projekt i neexistující projekt.
  if (!resolved || resolved.projectId !== projectId) return fail(401, 'UNAUTHORIZED')

  const keyEndpoint = `agent_report_key:${resolved.keyId}`
  if (await isApiRateLimited(keyEndpoint, 'key', KEY_WINDOW_MINUTES, KEY_MAX)) return fail(429, 'RATE_LIMITED')
  await recordApiRequest(keyEndpoint, 'key')

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'TOO_LARGE')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail(400, 'INVALID_BODY')
  }
  const parsed = reportInputSchema.safeParse(raw)
  if (!parsed.success) return fail(400, 'INVALID_BODY')

  const prepared = prepareActivity({
    title: parsed.data.title,
    body: parsed.data.body,
    kind: reportKindToActivityKind(parsed.data.kind),
  })

  const rows = await sql`
    INSERT INTO project_activity (project_id, status, source, kind, title, body, contains_sensitive)
    VALUES (${resolved.projectId}, 'draft', 'claude_code', ${prepared.kind}, ${prepared.title}, ${prepared.body}, ${prepared.containsSensitive})
    RETURNING id
  `
  await touchAgentKey(resolved.keyId)

  const nameRows = await sql`SELECT client_name, business FROM projects WHERE id = ${resolved.projectId}`
  const project = nameRows[0] as { client_name: string; business: string } | undefined
  await createNotification({
    type: 'activity_draft',
    title: `Hlášení ke schválení: ${project?.client_name ?? 'zakázka'}`,
    body: prepared.containsSensitive ? 'Obsahuje zakryté údaje, před schválením je potřeba upravit.' : undefined,
    link: project?.business === 'alteno' ? `/alteno/${resolved.projectId}` : `/dashboard/${resolved.projectId}`,
  })

  return NextResponse.json({ ok: true, id: String((rows[0] as { id: string }).id) }, { status: 201 })
}
