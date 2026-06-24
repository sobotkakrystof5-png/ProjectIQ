'use server'

import { sql } from '@/lib/db'
import { neon } from '@neondatabase/serverless'
import { Resend } from 'resend'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type {
  StartupProject,
  StartupImprovement,
  StartupChangelogEntry,
  StartupPhase,
  MonetizationModel,
  PricingTier,
  WaitlistEntry,
} from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getStartupProjects(): Promise<StartupProject[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, monetization,
      plan, know_how, notes, live_url, phase,
      progress::int, currency,
      planned_investment::float,
      total_users::int,
      paying_users_pct::float,
      monetization_model,
      monthly_price::float, annual_price::float,
      annual_discount_pct::float, onetime_price::float,
      COALESCE(pricing_tiers, '[]'::jsonb) AS pricing_tiers,
      archived, waitlist_db_url, created_at::text, updated_at::text
    FROM startup_projects
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as StartupProject[]
}

export async function getStartupProject(id: string): Promise<StartupProject | null> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, monetization,
      plan, know_how, notes, live_url, phase,
      progress::int, currency,
      planned_investment::float,
      total_users::int,
      paying_users_pct::float,
      monetization_model,
      monthly_price::float, annual_price::float,
      annual_discount_pct::float, onetime_price::float,
      COALESCE(pricing_tiers, '[]'::jsonb) AS pricing_tiers,
      archived, waitlist_db_url, created_at::text, updated_at::text
    FROM startup_projects
    WHERE id = ${id}
    LIMIT 1
  `
  return (rows[0] as StartupProject) ?? null
}

export async function createStartupProject(data: {
  name: string
  segment: string
  problem: string
  monetization: boolean
}): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název projektu je povinný' }
    if (!data.segment?.trim()) return { error: 'Segment je povinný' }
    if (!data.problem?.trim()) return { error: 'Popis problému je povinný' }

    const rows = await sql`
      INSERT INTO startup_projects (name, segment, problem, monetization)
      VALUES (${data.name.trim()}, ${data.segment.trim()}, ${data.problem.trim()}, ${data.monetization})
      RETURNING id::text
    `
    revalidatePath('/hub/byznys/startup')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se vytvořit projekt' }
  }
}

export async function updateStartupProject(
  id: string,
  data: {
    name: string
    segment: string
    problem: string
    monetization: boolean
    plan: string | null
    know_how: string | null
    notes: string | null
    live_url: string | null
    phase: StartupPhase
    progress: number
    currency: string
    planned_investment: number | null
    total_users: number | null
    paying_users_pct: number | null
    monetization_model: MonetizationModel
    monthly_price: number | null
    annual_price: number | null
    annual_discount_pct: number | null
    onetime_price: number | null
    pricing_tiers: PricingTier[]
    waitlist_db_url: string | null
  }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název projektu je povinný' }
    if (!data.segment?.trim()) return { error: 'Segment je povinný' }
    if (!data.problem?.trim()) return { error: 'Popis problému je povinný' }

    await sql`
      UPDATE startup_projects SET
        name = ${data.name.trim()},
        segment = ${data.segment.trim()},
        problem = ${data.problem.trim()},
        monetization = ${data.monetization},
        plan = ${data.plan},
        know_how = ${data.know_how},
        notes = ${data.notes},
        live_url = ${data.live_url},
        phase = ${data.phase},
        progress = ${data.progress},
        currency = ${data.currency},
        planned_investment = ${data.planned_investment},
        total_users = ${data.total_users},
        paying_users_pct = ${data.paying_users_pct},
        monetization_model = ${data.monetization_model},
        monthly_price = ${data.monthly_price},
        annual_price = ${data.annual_price},
        annual_discount_pct = ${data.annual_discount_pct},
        onetime_price = ${data.onetime_price},
        pricing_tiers = ${JSON.stringify(data.pricing_tiers)}::jsonb,
        waitlist_db_url = ${data.waitlist_db_url},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/byznys/startup/${id}`)
    revalidatePath('/hub/byznys/startup')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit projekt' }
  }
}

export async function archiveStartupProject(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE startup_projects SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/byznys/startup')
  redirect('/hub/byznys/startup')
}

export async function deleteStartupProject(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM startup_projects WHERE id = ${id}`
  revalidatePath('/hub/byznys/startup')
  redirect('/hub/byznys/startup')
}

// ─── Improvements ─────────────────────────────────────────────────────────────

export async function getStartupImprovements(projectId: string): Promise<StartupImprovement[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, startup_project_id::text, content, status,
      created_at::text, updated_at::text
    FROM startup_improvements
    WHERE startup_project_id = ${projectId}
    ORDER BY created_at ASC
  `
  return rows as StartupImprovement[]
}

export async function addImprovement(
  projectId: string,
  content: string
): Promise<{ error?: string; item?: StartupImprovement }> {
  try {
    await requireAuth()
    if (!content?.trim()) return { error: 'Text nápadu je povinný' }
    const rows = await sql`
      INSERT INTO startup_improvements (startup_project_id, content)
      VALUES (${projectId}, ${content.trim()})
      RETURNING id::text, startup_project_id::text, content, status,
        created_at::text, updated_at::text
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return { item: rows[0] as StartupImprovement }
  } catch {
    return { error: 'Nepodařilo se přidat nápad' }
  }
}

export async function updateImprovement(
  id: string,
  projectId: string,
  data: { content?: string; status?: string }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`
      UPDATE startup_improvements SET
        content = COALESCE(${data.content ?? null}, content),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se aktualizovat nápad' }
  }
}

export async function deleteImprovement(id: string, projectId: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM startup_improvements WHERE id = ${id}`
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat nápad' }
  }
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export async function getStartupChangelog(projectId: string): Promise<StartupChangelogEntry[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, startup_project_id::text, change_date::text, change_type,
      description, progress_from::int, progress_to::int, created_at::text
    FROM startup_changelog
    WHERE startup_project_id = ${projectId}
    ORDER BY change_date DESC, created_at DESC
  `
  return rows as StartupChangelogEntry[]
}

export async function addChangelogEntry(
  projectId: string,
  data: {
    change_date: string
    change_type: string
    description: string
    progress_from: number | null
    progress_to: number | null
  }
): Promise<{ error?: string; entry?: StartupChangelogEntry }> {
  try {
    await requireAuth()
    if (!data.description?.trim()) return { error: 'Popis změny je povinný' }
    if (!data.change_type) return { error: 'Typ změny je povinný' }
    const rows = await sql`
      INSERT INTO startup_changelog
        (startup_project_id, change_date, change_type, description, progress_from, progress_to)
      VALUES (
        ${projectId}, ${data.change_date}, ${data.change_type},
        ${data.description.trim()}, ${data.progress_from}, ${data.progress_to}
      )
      RETURNING id::text, startup_project_id::text, change_date::text, change_type,
        description, progress_from::int, progress_to::int, created_at::text
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return { entry: rows[0] as StartupChangelogEntry }
  } catch {
    return { error: 'Nepodařilo se přidat záznam' }
  }
}

export async function deleteChangelogEntry(
  id: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM startup_changelog WHERE id = ${id}`
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat záznam' }
  }
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

export async function getWaitlistEntries(dbUrl: string): Promise<WaitlistEntry[]> {
  await requireAuth()
  try {
    const wsql = neon(dbUrl)
    const rows = await wsql`
      SELECT id, email, name, locale, created_at::text, launch_notified
      FROM waitlist
      ORDER BY created_at DESC
    `
    return rows as WaitlistEntry[]
  } catch {
    return []
  }
}

export async function sendLaunchEmailBlast(
  projectId: string,
  opts: { dbUrl: string; appUrl: string; fromEmail?: string }
): Promise<{ sent: number; failed: number; total: number; error?: string }> {
  await requireAuth()

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { sent: 0, failed: 0, total: 0, error: 'RESEND_API_KEY není nastaven' }

  const from = opts.fromEmail ?? 'EstatIQ <onboarding@resend.dev>'
  const resend = new Resend(resendKey)

  try {
    const wsql = neon(opts.dbUrl)
    const entries = await wsql`
      SELECT id, email, name FROM waitlist
      WHERE launch_notified = FALSE
      ORDER BY created_at ASC
    ` as { id: number; email: string; name: string | null }[]

    if (entries.length === 0) {
      return { sent: 0, failed: 0, total: 0 }
    }

    let sent = 0
    let failed = 0
    const notifiedIds: number[] = []

    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10)
      await Promise.all(batch.map(async ({ id, email, name }) => {
        try {
          const result = await resend.emails.send({
            from,
            to: email,
            subject: 'EstatIQ spouštíme — 2 měsíce zdarma pro první uživatele 🚀',
            html: launchEmailHtml(opts.appUrl, name),
          })
          if (result.error) {
            console.error(`Resend error for ${email}:`, result.error)
            failed++
          } else {
            notifiedIds.push(id)
            sent++
          }
        } catch (err) {
          console.error(`Failed to send to ${email}:`, err)
          failed++
        }
      }))
      if (i + 10 < entries.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    if (notifiedIds.length > 0) {
      await wsql`UPDATE waitlist SET launch_notified = TRUE WHERE id = ANY(${notifiedIds})`
      revalidatePath(`/hub/byznys/startup/${projectId}`)
    }

    return { sent, failed, total: entries.length }
  } catch (err) {
    console.error('Launch blast error:', err)
    return { sent: 0, failed: 0, total: 0, error: 'Nepodařilo se odeslat emaily' }
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function launchEmailHtml(appUrl: string, name: string | null): string {
  const greeting = name ? `Ahoj ${escapeHtml(name)},` : 'Ahoj,'
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>EstatIQ je spuštěno</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0"
        style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <tr>
          <td style="background:#0b0f19;padding:28px 36px;">
            <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.02em;">
              Estat<span style="color:#10b981;">IQ</span>
            </span>
          </td>
        </tr>
        <tr><td style="height:3px;background:linear-gradient(90deg,#059669,#10b981);"></td></tr>

        <tr>
          <td style="padding:40px 36px 28px;">
            <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#475569;">${greeting}</p>
            <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
              Jsme spuštěni. 🚀
            </h1>
            <p style="margin:0 0 20px;font-size:16px;color:#059669;font-weight:600;">
              Váš early access je připraven.
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
              Čekali jste a my jsme to dokázali. EstatIQ je teď živé a vy jste jako jeden z prvních na řadě.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">
              Správa nájmů, automatické platby, daňový export — všechno na jednom místě. Žádný Excel, žádný papír.
            </p>

            <!-- Free trial offer -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Speciální nabídka pro první uživatele</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">2 měsíce zdarma</p>
              <p style="margin:4px 0 0;font-size:14px;color:#475569;">Za vaši první referenci — doporučte EstatIQ a získejte prémiový přístup bez poplatků na 2 měsíce.</p>
            </div>

            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:12px;background:#059669;">
                  <a href="${appUrl}" target="_blank"
                    style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">
                    Vstoupit do EstatIQ →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;">
              Nebo zkopírujte odkaz: <a href="${appUrl}" style="color:#059669;">${appUrl}</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
              style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
              <tr>
                <td style="padding:16px 20px;font-size:13px;color:#475569;line-height:1.8;">
                  <strong style="color:#0f172a;">Co na vás čeká:</strong><br>
                  ✓ Správa nemovitostí a nájemníků<br>
                  ✓ Automatické QR platby a upomínky<br>
                  ✓ Smlouvy s automatickými expiry alerty<br>
                  ✓ Daňový export PDF pro účetního
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
              EstatIQ &middot; Pronájem, který se řídí sám 🇨🇿<br>
              Dostali jste tento e-mail, protože jste se přihlásili na čekací listinu.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
