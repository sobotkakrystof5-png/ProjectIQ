import 'server-only'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/admin/db'
import { SIGNATURE } from '@/lib/admin/meeting-email'
import { sendVizeonMail, type SendResult, type VizeonMail } from '@/lib/admin/vizeon-mail'

/**
 * E-mail klientovi, když Kryštof dokončí etapu (KP16, R-128, migrace 125).
 *
 * Souhrnně a nejvýš jednou za 24 hodin na zakázku, jako zprávy o práci
 * (R-072): které etapy už v e-mailu byly a kdy odešel poslední, drží databáze
 * a zabírá je jediná funkce `portal_phase_email_claim` se zámkem řádku, takže
 * souběh ani opakované kliknutí nepošle dva e-maily. Co se do 24 h nevešlo,
 * dopošle ranní cron `send-reminders`.
 *
 * Jen zakázky v klientském prostoru; e-mail jde všem aktivním členům z
 * krystof@vizeon.cz s odkazem rovnou do prostoru. Selhání e-mailu nikdy
 * nezruší změnu etapy — zabrání se vrátí a zkusí se příště.
 */

/** Po dokončení etapy počká na „Zpět" v adminu (toast), pak teprve e-mail. */
export const PHASE_EMAIL_DELAY_MS = 15_000

type Deps = { send?: (mail: VizeonMail) => Promise<SendResult> }

export type PhaseEmailContent = {
  projectName: string
  /** Etapy hotové od posledního e-mailu, v pořadí. */
  done: string[]
  /** Na čem se teď pracuje (probíhající, jinak další čekající). */
  next: { name: string; dueDate: string | null } | null
  /** Co od klienta potřebujeme (úkoly nehotových etap). */
  tasks: string[]
  link: string
}

const C = { ink: '#0c1a36', quiet: '#4a5878', line: '#dce7f7', navy700: '#23478b' } as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** 12. prosince 2026 — bez času, pražské datum etapy. */
function czDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

const MAX_TASKS = 5

/** Čistá funkce: předmět, text a HTML. Názvy etap a úkolů se v HTML escapují. */
export function phaseEmail(c: PhaseEmailContent): { subject: string; text: string; html: string } {
  const doneLine =
    c.done.length === 1 ? `Etapa ${c.done[0]} je hotová.` : `Hotové etapy: ${c.done.join(', ')}.`
  const nextLine = c.next
    ? `Teď pracuji na etapě ${c.next.name}${c.next.dueDate ? `, hotová by měla být do ${czDate(c.next.dueDate)}` : ''}.`
    : 'Tím jsou hotové všechny etapy.'
  const tasks = c.tasks.slice(0, MAX_TASKS)
  const moreTasks = c.tasks.length - tasks.length
  const subject = (c.done.length === 1 ? `Hotovo: ${c.done[0]} · ${c.projectName}` : `Hotové etapy · ${c.projectName}`).slice(0, 150)

  const text = [
    'Dobrý den,',
    '',
    `u zakázky ${c.projectName} se pohnulo. ${doneLine}`,
    nextLine,
    ...(tasks.length
      ? ['', 'Od vás potřebuji:', ...tasks.map((t) => `- ${t}`), ...(moreTasks > 0 ? [`- a ještě ${moreTasks} další`] : [])]
      : []),
    '',
    `Všechno najdete ve vašem prostoru: ${c.link}`,
    '',
    ...SIGNATURE,
  ].join('\n')

  const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`
  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:#ffffff;font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${p('Dobrý den,')}
${p(`u zakázky <strong>${escapeHtml(c.projectName)}</strong> se pohnulo. ${escapeHtml(doneLine)}`)}
${p(escapeHtml(nextLine))}
${
  tasks.length
    ? `<p style="margin:0 0 6px;font-weight:600">Od vás potřebuji:</p><ul style="margin:0 0 14px;padding-left:20px">${tasks.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}${moreTasks > 0 ? `<li style="color:${C.quiet}">a ještě ${moreTasks} další</li>` : ''}</ul>`
    : ''
}
<p style="margin:18px 0"><a href="${escapeHtml(c.link)}" style="display:inline-block;background:${C.navy700};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Otevřít váš prostor</a></p>
<p style="margin-top:18px;color:${C.quiet}">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject, text, html }
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://www.zakaziq.cz').replace(/\/+$/, '')
}

function missing(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42883' || code === '42703'
}

const day = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

export type PhaseEmailOutcome = 'sent' | 'skipped' | 'failed'

/**
 * Pošle e-mail, pokud je co a smí se (24 h). Bez migrace 125, bez klientského
 * prostoru nebo bez nové hotové etapy nic nedělá.
 */
export async function sendPhaseEmailIfDue(projectId: string, deps: Deps = {}): Promise<PhaseEmailOutcome> {
  let claimed: { phase_id: string; name: string; phase_position: number; stamp: string | Date }[]
  try {
    claimed = (await adminDb`SELECT * FROM portal_phase_email_claim(${projectId})`) as typeof claimed
  } catch (err) {
    if (missing(err)) return 'skipped'
    throw err
  }
  if (claimed.length === 0) return 'skipped'
  const stamp = claimed[0].stamp

  const release = async () => {
    await adminDb`SELECT portal_phase_email_release(${projectId}, ${stamp})`.catch((err: unknown) =>
      console.error('[etapy] vrácení e-mailu selhalo:', err instanceof Error ? err.name : 'unknown'),
    )
  }

  try {
    const [projects, phases, tasks] = await adminDb.batch([
      { text: 'SELECT name, client_id::text FROM portal.projects WHERE id = $1', params: [projectId] },
      {
        text: 'SELECT name, status, due_date FROM project_phases WHERE project_id = $1 ORDER BY position',
        params: [projectId],
      },
      {
        text: `SELECT t.body FROM project_phase_tasks t
               JOIN project_phases ph ON ph.id = t.phase_id
               WHERE t.project_id = $1 AND ph.status <> 'done' AND t.client_done_at IS NULL
               ORDER BY ph.position, t.position`,
        params: [projectId],
      },
    ])
    const project = projects[0]
    if (!project) return 'skipped'
    const members = (await adminDb`
      SELECT DISTINCT lower(email) AS email FROM portal.members
      WHERE client_id = ${String(project.client_id)} AND removed_at IS NULL AND email IS NOT NULL
    `) as { email: string }[]
    // Nikoho, komu psát — etapy zůstanou zabrané, klient je uvidí v prostoru.
    if (members.length === 0) return 'skipped'

    const next = phases.find((p) => p.status === 'running') ?? phases.find((p) => p.status === 'waiting') ?? null
    const mail = phaseEmail({
      projectName: String(project.name),
      done: [...claimed].sort((a, b) => a.phase_position - b.phase_position).map((c) => c.name),
      next: next ? { name: String(next.name), dueDate: day(next.due_date) } : null,
      tasks: tasks.map((t) => String(t.body)),
      link: `${appUrl()}/klient/projekt/${projectId}`,
    })
    const stampKey = new Date(stamp as string).getTime()
    let sentAny = false
    for (const m of members) {
      const res = await (deps.send ?? sendVizeonMail)({
        to: m.email,
        ...mail,
        // Adresa jen jako otisk: klíč má u Resendu omezenou délku a adresa do něj nepatří.
        idempotencyKey: `etapa-${projectId}-${stampKey}-${createHash('sha256').update(m.email).digest('hex').slice(0, 16)}`,
      }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : 'unknown' }))
      if (res.ok) sentAny = true
      else console.error('[etapy] e-mail klientovi neodešel:', res.error)
    }
    if (!sentAny) {
      await release()
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error('[etapy] e-mail o etapě selhal:', err instanceof Error ? err.name : 'unknown')
    await release()
    return 'failed'
  }
}

/**
 * Ranní dopis (cron `send-reminders`): zakázky s hotovou etapou, o které
 * klient ještě nedostal e-mail. Kde 24 h ještě neuplynulo, funkce nic nepošle.
 */
export async function flushPhaseEmails(deps: Deps = {}): Promise<number> {
  let rows: { id: string }[]
  try {
    rows = (await adminDb`
      SELECT DISTINCT ph.project_id::text AS id FROM project_phases ph
      JOIN portal.projects pp ON pp.id = ph.project_id
      WHERE ph.status = 'done' AND ph.client_notified_at IS NULL
      LIMIT 200
    `) as { id: string }[]
  } catch (err) {
    if (missing(err)) return 0
    throw err
  }
  let sent = 0
  for (const r of rows) {
    if ((await sendPhaseEmailIfDue(r.id, deps)) === 'sent') sent++
  }
  return sent
}
