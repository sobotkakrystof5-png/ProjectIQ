'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getPublicUrl, getSurveyUrl } from '@/lib/utils'
import { sendBrandedEmail, type EmailCta } from '@/lib/email'
import { STATUS_LABELS, type ProjectStatus, type ProjectType } from '@/lib/types'
import { createNotification } from '@/lib/notifications'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

type ProjectPayload = {
  client_name: string
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  description: string | null
  focus: string | null
  project_url: string | null
  status: ProjectStatus
  progress: number
  price: number | null
  paid: boolean
  deadline: string | null
  notes: string | null
  estimated_costs: number | null
  deposit_amount: number | null
  deposit_paid: boolean
}

async function notifyClientOfProjectChange(
  project: {
    client_name: string
    client_email: string | null
    status: ProjectStatus
    progress: number
    project_url: string | null
    public_token: string
  },
  changeType: 'created' | 'updated'
) {
  if (!project.client_email) return
  const ctas: EmailCta[] = []
  if (project.project_url) ctas.push({ label: 'Zobrazit živou verzi', href: project.project_url })
  ctas.push({ label: 'Otevřít přehled projektu', href: getPublicUrl(project.public_token), primary: false })

  await sendBrandedEmail({
    to: project.client_email,
    subject: changeType === 'created' ? 'Váš projekt byl založen – ZakazIQ' : 'Aktualizace vašeho projektu – ZakazIQ',
    heading: changeType === 'created' ? 'Váš projekt byl založen' : 'Váš projekt byl aktualizován',
    intro: `Dobrý den, ${project.client_name}, právě jsme aktualizovali stav vašeho projektu.`,
    fields: [
      { label: 'Stav', value: STATUS_LABELS[project.status] },
      { label: 'Postup', value: `${project.progress}%` },
    ],
    ctas,
  })
}

type CompletedExtra = {
  project_type: ProjectType
  completed_at: string
  difficulty: number
  time_invested: number | null
}

export async function createProject(payload: ProjectPayload, completedExtra?: CompletedExtra) {
  await requireAuth()
  const progress = clampProgress(payload.progress)
  const rows = await sql`
    INSERT INTO projects (client_name, client_email, client_phone, service_type, description, focus, project_url, status, progress, price, paid, deadline, notes, estimated_costs, deposit_amount, deposit_paid)
    VALUES (
      ${payload.client_name},
      ${payload.client_email},
      ${payload.client_phone},
      ${payload.service_type},
      ${payload.description},
      ${payload.focus},
      ${payload.project_url},
      ${payload.status},
      ${progress},
      ${payload.price},
      ${payload.paid},
      ${payload.deadline},
      ${payload.notes},
      ${payload.estimated_costs},
      ${payload.deposit_amount},
      ${payload.deposit_paid}
    )
    RETURNING id, public_token
  `
  const newProjectId = (rows[0] as { id: string; public_token: string }).id
  const publicToken = (rows[0] as { id: string; public_token: string }).public_token

  // Záloha zaplacena při vytvoření → okamžitě zapsat do financí
  if (payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0) {
    const note = payload.client_name + (payload.description ? ' — ' + payload.description : '') + ' (záloha)'
    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction)
      VALUES (${payload.deposit_amount}, 'income', 'zakázka', ${note}, now()::date, NULL, ${newProjectId}, true)
    `
  }
  // Projekt vytvořen rovnou jako zaplacený → zapsat zbývající část
  if (payload.paid && payload.price && payload.price > 0) {
    const depositAlreadyPaid = payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0
    const remaining = depositAlreadyPaid ? payload.price - (payload.deposit_amount ?? 0) : payload.price
    if (remaining > 0) {
      const note = payload.client_name + (payload.description ? ' — ' + payload.description : '')
      await sql`
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction)
        VALUES (${remaining}, 'income', 'zakázka', ${note}, now()::date, NULL, ${newProjectId}, false)
      `
    }
  }
  await notifyClientOfProjectChange(
    { client_name: payload.client_name, client_email: payload.client_email, status: payload.status, progress, project_url: payload.project_url, public_token: publicToken },
    'created'
  )
  if (completedExtra) {
    await sql`
      INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested, notes, project_type)
      VALUES (
        ${payload.description || payload.client_name},
        ${payload.client_name},
        null,
        ${completedExtra.completed_at},
        ${payload.price ?? 0},
        ${completedExtra.difficulty},
        ${completedExtra.time_invested},
        ${payload.notes},
        ${completedExtra.project_type}
      )
    `
    revalidatePath('/dashboard/dokoncene')
  }
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function updateProject(
  id: string,
  payload: ProjectPayload,
  progressUpdate?: { from: number; description: string }
) {
  await requireAuth()
  const progress = clampProgress(payload.progress)

  const oldRows = await sql`SELECT status, paid, deposit_paid FROM projects WHERE id = ${id} LIMIT 1`
  const oldStatus = (oldRows[0] as { status: string; paid: boolean; deposit_paid: boolean } | undefined)?.status
  const wasPaid = (oldRows[0] as { status: string; paid: boolean; deposit_paid: boolean } | undefined)?.paid ?? false
  const wasDepositPaid = (oldRows[0] as { status: string; paid: boolean; deposit_paid: boolean } | undefined)?.deposit_paid ?? false

  const rows = await sql`
    UPDATE projects SET
      client_name = ${payload.client_name},
      client_email = ${payload.client_email},
      client_phone = ${payload.client_phone},
      service_type = ${payload.service_type},
      description = ${payload.description},
      focus = ${payload.focus},
      project_url = ${payload.project_url},
      status = ${payload.status},
      progress = ${progress},
      price = ${payload.price},
      paid = ${payload.paid},
      deadline = ${payload.deadline},
      notes = ${payload.notes},
      estimated_costs = ${payload.estimated_costs},
      deposit_amount = ${payload.deposit_amount},
      deposit_paid = ${payload.deposit_paid},
      updated_at = now()
    WHERE id = ${id}
    RETURNING public_token
  `
  if (progressUpdate && progressUpdate.from !== progress) {
    await sql`
      INSERT INTO progress_updates (project_id, progress_from, progress_to, description)
      VALUES (${id}, ${progressUpdate.from}, ${progress}, ${progressUpdate.description})
    `
  }
  const publicToken = (rows[0] as { public_token: string }).public_token
  await notifyClientOfProjectChange(
    { client_name: payload.client_name, client_email: payload.client_email, status: payload.status, progress, project_url: payload.project_url, public_token: publicToken },
    'updated'
  )

  if (oldStatus && oldStatus !== payload.status) {
    void createNotification({
      type: 'project_status_changed',
      title: `Stav zakázky změněn — ${payload.client_name}`,
      body: `${STATUS_LABELS[oldStatus as ProjectStatus] ?? oldStatus} → ${STATUS_LABELS[payload.status]}`,
      link: `/dashboard/${id}`,
    })
  }

  // Záloha zaplacena → okamžitě zapsat do financí
  if (!wasDepositPaid && payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0) {
    const existingDeposit = await sql`
      SELECT id FROM finance_transactions
      WHERE source_project_id = ${id} AND deposit_transaction = true LIMIT 1
    `
    if ((existingDeposit as unknown[]).length === 0) {
      const note = payload.client_name + (payload.description ? ' — ' + payload.description : '') + ' (záloha)'
      await sql`
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction)
        VALUES (${payload.deposit_amount}, 'income', 'zakázka', ${note}, now()::date, NULL, ${id}, true)
      `
    }
  }

  // Přechod na zaplaceno → zapsat zbývající část (cena − záloha, nebo celá cena pokud záloha nebyla)
  if (!wasPaid && payload.paid && payload.price && payload.price > 0) {
    const depositAlreadyPaid = payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0
    const remaining = depositAlreadyPaid ? payload.price - (payload.deposit_amount ?? 0) : payload.price
    if (remaining > 0) {
      const existingFinal = await sql`
        SELECT id FROM finance_transactions
        WHERE source_project_id = ${id} AND (deposit_transaction = false OR deposit_transaction IS NULL) LIMIT 1
      `
      if ((existingFinal as unknown[]).length === 0) {
        const note = payload.client_name + (payload.description ? ' — ' + payload.description : '')
        await sql`
          INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction)
          VALUES (${remaining}, 'income', 'zakázka', ${note}, now()::date, NULL, ${id}, false)
        `
      }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${id}`)
  revalidatePath('/hub/finance')
}

export async function deleteProject(id: string) {
  await requireAuth()
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function addClientMessage(projectId: string, publicToken: string, content: string) {
  await requireAuth()
  if (!content.trim()) return
  await sql`INSERT INTO client_messages (project_id, content) VALUES (${projectId}, ${content.trim()})`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}

export async function deleteClientMessage(messageId: string, projectId: string, publicToken: string) {
  await requireAuth()
  await sql`DELETE FROM client_messages WHERE id = ${messageId} AND project_id = ${projectId}`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}

export async function confirmVizeonBooking(projectId: string) {
  await requireAuth()
  const rows = await sql`
    SELECT client_name, client_email, service_type, description, public_token, project_url
    FROM projects WHERE id = ${projectId} AND source = 'vizeon_web' AND vizeon_confirmed = false
    LIMIT 1
  `
  if (!rows.length) throw new Error('Rezervace nenalezena nebo již potvrzena')
  const p = rows[0] as {
    client_name: string
    client_email: string | null
    service_type: string | null
    description: string | null
    public_token: string
    project_url: string | null
  }

  await sql`
    UPDATE projects
    SET vizeon_confirmed = true, status = 'in_progress', updated_at = now()
    WHERE id = ${projectId}
  `

  const adminEmail = process.env.ADMIN_EMAIL
  const portalUrl = getPublicUrl(p.public_token)

  if (p.client_email) {
    await sendBrandedEmail({
      to: p.client_email,
      subject: 'Váš projekt byl oficálně potvrzen – ZakazIQ',
      heading: 'Váš projekt je oficálně zahájen',
      intro: `Dobrý den, ${p.client_name}! S radostí vám oznamuji, že váš projekt byl oficálně potvrzen a podle vašeho zadání nyní začínám pracovat. Jakmile bude první ukázka hotová, pošlu vám odkaz, kde uvidíte aktuální stav projektu — budete ho moci ohodnotit, napsat zpětnou vazbu, nebo si se mnou rovnou rezervovat konzultaci a vše osobně probrat.`,
      fields: [
        { label: 'Typ projektu', value: p.service_type ?? 'Webový projekt' },
        { label: 'Stav', value: 'V řešení' },
      ],
      ctas: [
        { label: 'Sledovat stav projektu', href: portalUrl },
      ],
    })
  }

  if (adminEmail) {
    await sendBrandedEmail({
      to: adminEmail,
      subject: `Vizeon rezervace potvrzena – ${p.client_name}`,
      heading: 'Rezervace přesunuta do zakázek',
      intro: `Zakázka od klienta ${p.client_name} byla úspěšně potvrzena a přesunuta do aktivních zakázek.`,
      fields: [
        { label: 'Klient', value: p.client_name },
        ...(p.service_type ? [{ label: 'Typ projektu', value: p.service_type }] : []),
        ...(p.description ? [{ label: 'Popis', value: p.description }] : []),
      ],
      ctas: [{ label: 'Otevřít zakázku', href: `${process.env.NEXTAUTH_URL ?? ''}/dashboard/${projectId}` }],
    })
  }

  revalidatePath('/dashboard/vizeon')
  revalidatePath('/dashboard')
}

export async function deleteVizeonBooking(projectId: string) {
  await requireAuth()
  await sql`DELETE FROM projects WHERE id = ${projectId} AND source = 'vizeon_web' AND vizeon_confirmed = false`
  revalidatePath('/dashboard/vizeon')
}

export async function markProjectAsCompleted(
  projectId: string,
  extra: {
    project_type: ProjectType
    completed_at: string
    difficulty: number
    time_invested: number | null
    include_costs: boolean
  }
) {
  await requireAuth()
  const rows = await sql`
    SELECT client_name, client_email, description, price, notes, estimated_costs
    FROM projects WHERE id = ${projectId} LIMIT 1
  `
  if (!rows.length) throw new Error('Zakázka nenalezena')
  const p = rows[0] as {
    client_name: string
    client_email: string | null
    description: string | null
    price: number | null
    notes: string | null
    estimated_costs: number | null
  }

  const title = p.description || p.client_name
  const existing = await sql`
    SELECT id FROM completed_projects WHERE title = ${title} AND client_name = ${p.client_name} LIMIT 1
  `
  if (existing.length) throw new Error('Tato zakázka již byla přidána do dokončených.')

  const inserted = await sql`
    INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested, notes, project_type, client_email)
    VALUES (
      ${p.description || p.client_name},
      ${p.client_name},
      null,
      ${extra.completed_at},
      ${p.price ?? 0},
      ${extra.difficulty},
      ${extra.time_invested},
      ${p.notes},
      ${extra.project_type},
      ${p.client_email}
    )
    RETURNING survey_token
  `
  const surveyToken = (inserted[0] as { survey_token: string }).survey_token

  // Děkovný email + dotazník spokojenosti — jen u klientských zakázek s emailem
  if (extra.project_type === 'client' && p.client_email) {
    await sendBrandedEmail({
      to: p.client_email,
      subject: 'Děkuji za spolupráci – ZakazIQ',
      heading: 'Děkuji za spolupráci!',
      intro: `Dobrý den, ${p.client_name}, projekt je hotový a moc vám děkuji za spolupráci — byla mi potěšením. Budu rád, když si najdete chvilku a vyplníte krátký dotazník spokojenosti. Pomůže mi to zlepšovat mé služby a zabere jen pár minut. Na konci můžete napsat i referenci, kterou se mnou chcete sdílet.`,
      fields: [
        { label: 'Projekt', value: title },
      ],
      ctas: [{ label: 'Vyplnit dotazník spokojenosti', href: getSurveyUrl(surveyToken) }],
    })
  }

  if (extra.include_costs && p.estimated_costs && p.estimated_costs > 0) {
    await sql`
      INSERT INTO costs (name, amount, cost_type, category, description)
      VALUES (
        ${'Náklady: ' + (p.description || p.client_name)},
        ${p.estimated_costs},
        ${'one_time'},
        ${'client'},
        ${'Předpokládané náklady ze zakázky ' + p.client_name}
      )
    `
    revalidatePath('/dashboard/naklady')
  }

  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/dashboard/hodnoceni')
  revalidatePath(`/dashboard/${projectId}`)
}
