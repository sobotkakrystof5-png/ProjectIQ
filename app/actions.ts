'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getPublicUrl, getSurveyUrl } from '@/lib/utils'
import { sendBrandedEmail, type EmailCta } from '@/lib/email'
import { STATUS_LABELS, type ProjectStatus, type ProjectType } from '@/lib/types'
import { createNotification } from '@/lib/notifications'
import { BUSINESSES, adminEmailFor, projectPath, type Business } from '@/lib/business'
import { parseInvoiceForm, insertInvoice, type InvoiceInput, type InvoicePdf } from '@/lib/invoices'

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
  /** Fakturováno na IČO — příjmy z této zakázky patří do přiznané linie */
  invoiced_on_ico: boolean
}

export async function notifyClientOfProjectChange(
  project: {
    client_name: string
    client_email: string | null
    status: ProjectStatus
    progress: number
    project_url: string | null
    public_token: string
  },
  changeType: 'created' | 'updated',
  business: Business
) {
  // Exportovaná 'use server' funkce je vždy volatelná napřímo (server action
  // endpoint), bez ohledu na to, že interní volající (createProject apod.)
  // už requireAuth() zavolali — bez vlastní kontroly by šlo tuto funkci
  // zneužít jako neautentizovaný email-relay.
  await requireAuth()
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
    business,
  })
}

type CompletedExtra = {
  project_type: ProjectType
  completed_at: string
  difficulty: number
  time_invested: number | null
}

export async function createProject(
  payload: ProjectPayload,
  completedExtra?: CompletedExtra,
  business: Business = 'vizeon',
  /** Volitelná faktura přiložená rovnou při zakládání zakázky (pole z `InvoiceFields`) */
  invoiceForm?: FormData
): Promise<{ error?: string } | void> {
  await requireAuth()
  const basePath = BUSINESSES[business].basePath

  // Fakturu ověřit dřív, než vznikne zakázka. Kdyby se validovala až po
  // vložení, zůstala by po chybě viset zakázka bez faktury a uživatel by
  // dostal jen hlášku, že se nic neuložilo — což by nebyla pravda.
  let invoice: { data: InvoiceInput; pdf: InvoicePdf | null } | null = null
  if (invoiceForm) {
    const parsed = await parseInvoiceForm(invoiceForm)
    if ('error' in parsed) return { error: parsed.error }
    const clash = await sql`
      SELECT 1 FROM invoices WHERE invoice_number = ${parsed.data.invoice_number} LIMIT 1
    `
    if ((clash as unknown[]).length > 0) return { error: 'Faktura s tímhle číslem už v archivu je' }
    invoice = { data: parsed.data, pdf: parsed.pdf }
  }

  const progress = clampProgress(payload.progress)
  const rows = await sql`
    INSERT INTO projects (client_name, client_email, client_phone, service_type, description, focus, project_url, status, progress, price, paid, deadline, notes, estimated_costs, deposit_amount, deposit_paid, business, invoiced_on_ico)
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
      ${payload.deposit_paid},
      ${business},
      ${payload.invoiced_on_ico}
    )
    RETURNING id, public_token
  `
  const newProjectId = (rows[0] as { id: string; public_token: string }).id
  const publicToken = (rows[0] as { id: string; public_token: string }).public_token

  // Záloha zaplacena při vytvoření → okamžitě zapsat do financí
  if (payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0) {
    const note = payload.client_name + (payload.description ? ' — ' + payload.description : '') + ' (záloha)'
    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction, declared)
      VALUES (${payload.deposit_amount}, 'income', 'zakázka', ${note}, now()::date, NULL, ${newProjectId}, true, ${payload.invoiced_on_ico})
    `
  }
  // Projekt vytvořen rovnou jako zaplacený → zapsat zbývající část
  if (payload.paid && payload.price && payload.price > 0) {
    const depositAlreadyPaid = payload.deposit_paid && payload.deposit_amount && payload.deposit_amount > 0
    const remaining = depositAlreadyPaid ? payload.price - (payload.deposit_amount ?? 0) : payload.price
    if (remaining > 0) {
      const note = payload.client_name + (payload.description ? ' — ' + payload.description : '')
      await sql`
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction, declared)
        VALUES (${remaining}, 'income', 'zakázka', ${note}, now()::date, NULL, ${newProjectId}, false, ${payload.invoiced_on_ico})
      `
    }
  }
  await notifyClientOfProjectChange(
    { client_name: payload.client_name, client_email: payload.client_email, status: payload.status, progress, project_url: payload.project_url, public_token: publicToken },
    'created',
    business
  )
  if (completedExtra) {
    await sql`
      INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested, notes, project_type, source_project_id)
      VALUES (
        ${payload.description || payload.client_name},
        ${payload.client_name},
        null,
        ${completedExtra.completed_at},
        ${payload.price ?? 0},
        ${completedExtra.difficulty},
        ${completedExtra.time_invested},
        ${payload.notes},
        ${completedExtra.project_type},
        ${newProjectId}
      )
    `
    revalidatePath('/dashboard/dokoncene')
  }

  // Až za příjmovými transakcemi ze zakázky — `syncInvoiceTransaction` pak
  // může existující příjem převzít místo toho, aby založil druhý.
  if (invoice) {
    await insertInvoice({ ...invoice.data, project_id: newProjectId }, invoice.pdf)
    revalidatePath('/hub/finance')
  }

  revalidatePath(basePath)
  redirect(basePath)
}

export async function updateProject(
  id: string,
  payload: ProjectPayload,
  progressUpdate?: { from: number; description: string },
  business: Business = 'vizeon'
) {
  await requireAuth()
  const basePath = BUSINESSES[business].basePath
  const progress = clampProgress(payload.progress)

  const oldRows = await sql`SELECT status, paid, deposit_paid, invoiced_on_ico FROM projects WHERE id = ${id} LIMIT 1`
  type OldProject = { status: string; paid: boolean; deposit_paid: boolean; invoiced_on_ico: boolean }
  const old = oldRows[0] as OldProject | undefined
  const oldStatus = old?.status
  const wasPaid = old?.paid ?? false
  const wasDepositPaid = old?.deposit_paid ?? false
  const wasInvoicedOnIco = old?.invoiced_on_ico ?? false

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
      invoiced_on_ico = ${payload.invoiced_on_ico},
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
    'updated',
    business
  )

  // Přepnutí „fakturováno na IČO" musí přerovnat i příjmy, které ze zakázky
  // už vznikly — jinak by zakázka byla v jedné linii a její peníze v druhé
  // a součet obou linií by přestal sedět na celkový příjem.
  // Zakázka je pro své transakce zdroj pravdy: ruční přeřazení jednotlivé
  // transakce tenhle přepis přebije.
  if (wasInvoicedOnIco !== payload.invoiced_on_ico) {
    await sql`
      UPDATE finance_transactions
      SET declared = ${payload.invoiced_on_ico}
      WHERE source_project_id = ${id} AND type = 'income'
    `
    revalidatePath('/hub/finance')
  }

  if (oldStatus && oldStatus !== payload.status) {
    void createNotification({
      type: 'project_status_changed',
      title: `Stav zakázky změněn — ${payload.client_name}`,
      body: `${STATUS_LABELS[oldStatus as ProjectStatus] ?? oldStatus} → ${STATUS_LABELS[payload.status]}`,
      link: projectPath(business, id),
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
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction, declared)
        VALUES (${payload.deposit_amount}, 'income', 'zakázka', ${note}, now()::date, NULL, ${id}, true, ${payload.invoiced_on_ico})
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
          INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id, deposit_transaction, declared)
          VALUES (${remaining}, 'income', 'zakázka', ${note}, now()::date, NULL, ${id}, false, ${payload.invoiced_on_ico})
        `
      }
    }
  }

  revalidatePath(basePath)
  revalidatePath(projectPath(business, id))
  revalidatePath('/hub/finance')
}

export async function deleteProject(id: string, business: Business = 'vizeon') {
  await requireAuth()
  const basePath = BUSINESSES[business].basePath
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath(basePath)
  redirect(basePath)
}

export async function addClientMessage(
  projectId: string,
  publicToken: string,
  content: string,
  business: Business = 'vizeon'
) {
  await requireAuth()
  if (!content.trim()) return
  await sql`INSERT INTO client_messages (project_id, content) VALUES (${projectId}, ${content.trim()})`
  revalidatePath(projectPath(business, projectId))
  revalidatePath(`/p/${publicToken}`)
}

export async function deleteClientMessage(
  messageId: string,
  projectId: string,
  publicToken: string,
  business: Business = 'vizeon'
) {
  await requireAuth()
  await sql`DELETE FROM client_messages WHERE id = ${messageId} AND project_id = ${projectId}`
  revalidatePath(projectPath(business, projectId))
  revalidatePath(`/p/${publicToken}`)
}

// VIZEON i ALTENO mají vlastní `source` a vlastní potvrzovací flag, takže
// dotaz nejde napsat jedním sql`` (neon tagged template neumí fragmenty).
// Rozvětvené jsou proto jen samotné dotazy — logika potvrzení je společná.
//
// Potvrzení a pending-gate jsou schválně v jednom atomickém UPDATE (místo
// dřívějšího SELECT + samostatný UPDATE bez gate) — dva souběžné pokusy o
// potvrzení stejné rezervace by jinak oba prošly select kontrolou a poslaly
// duplicitní potvrzovací email. Takhle vyhraje jen ten UPDATE, jehož WHERE
// ještě sedí; druhý vrátí 0 řádků.
function confirmPendingBooking(projectId: string, business: Business) {
  return business === 'alteno'
    ? sql`
        UPDATE projects
        SET alteno_confirmed = true, status = 'in_progress', updated_at = now()
        WHERE id = ${projectId} AND is_alteno_pending(source, alteno_confirmed)
        RETURNING client_name, client_email, service_type, description, public_token, project_url
      `
    : sql`
        UPDATE projects
        SET vizeon_confirmed = true, status = 'in_progress', updated_at = now()
        WHERE id = ${projectId} AND is_vizeon_pending(source, vizeon_confirmed)
        RETURNING client_name, client_email, service_type, description, public_token, project_url
      `
}

function deletePendingBooking(projectId: string, business: Business) {
  return business === 'alteno'
    ? sql`DELETE FROM projects WHERE id = ${projectId} AND is_alteno_pending(source, alteno_confirmed)`
    : sql`DELETE FROM projects WHERE id = ${projectId} AND is_vizeon_pending(source, vizeon_confirmed)`
}

async function confirmWebBooking(projectId: string, business: Business) {
  await requireAuth()
  const cfg = BUSINESSES[business]
  const rows = await confirmPendingBooking(projectId, business)
  if (!rows.length) throw new Error('Rezervace nenalezena nebo již potvrzena')
  const p = rows[0] as {
    client_name: string
    client_email: string | null
    service_type: string | null
    description: string | null
    public_token: string
    project_url: string | null
  }

  const adminEmail = adminEmailFor(business)
  const portalUrl = getPublicUrl(p.public_token)

  if (p.client_email) {
    await sendBrandedEmail({
      to: p.client_email,
      subject: 'Váš projekt byl oficálně potvrzen – ZakazIQ',
      heading: 'Váš projekt je oficálně zahájen',
      intro: `Dobrý den, ${p.client_name}! S radostí vám oznamuji, že váš projekt byl oficálně potvrzen a podle vašeho zadání nyní začínám pracovat. Jakmile bude první ukázka hotová, pošlu vám odkaz, kde uvidíte aktuální stav projektu — budete ho moci ohodnotit, napsat zpětnou vazbu, nebo si se mnou rovnou rezervovat konzultaci a vše osobně probrat.`,
      fields: [
        { label: 'Typ projektu', value: p.service_type ?? cfg.defaultServiceType },
        { label: 'Stav', value: 'V řešení' },
      ],
      ctas: [
        { label: 'Sledovat stav projektu', href: portalUrl },
      ],
      business,
    })
  }

  if (adminEmail) {
    await sendBrandedEmail({
      to: adminEmail,
      subject: `${cfg.name} rezervace potvrzena – ${p.client_name}`,
      heading: 'Rezervace přesunuta do zakázek',
      intro: `Zakázka od klienta ${p.client_name} byla úspěšně potvrzena a přesunuta do aktivních zakázek.`,
      fields: [
        { label: 'Klient', value: p.client_name },
        ...(p.service_type ? [{ label: 'Typ projektu', value: p.service_type }] : []),
        ...(p.description ? [{ label: 'Popis', value: p.description }] : []),
      ],
      ctas: [{ label: 'Otevřít zakázku', href: `${process.env.NEXTAUTH_URL ?? ''}${projectPath(business, projectId)}` }],
      business,
    })
  }

  revalidatePath(cfg.inboxPath)
  revalidatePath(cfg.basePath)
}

export async function confirmVizeonBooking(projectId: string) {
  await confirmWebBooking(projectId, 'vizeon')
}

export async function confirmAltenoBooking(projectId: string) {
  await confirmWebBooking(projectId, 'alteno')
}

async function deleteWebBooking(projectId: string, business: Business) {
  await requireAuth()
  await deletePendingBooking(projectId, business)
  revalidatePath(BUSINESSES[business].inboxPath)
}

export async function deleteVizeonBooking(projectId: string) {
  await deleteWebBooking(projectId, 'vizeon')
}

export async function deleteAltenoBooking(projectId: string) {
  await deleteWebBooking(projectId, 'alteno')
}

export async function markProjectAsCompleted(
  projectId: string,
  extra: {
    project_type: ProjectType
    completed_at: string
    difficulty: number
    time_invested: number | null
    estimated_hours: number | null
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
  // Scoped na source_project_id, ne na title/client_name — jinak dva různé
  // projekty od stejného klienta s prázdným popisem (title spadne na
  // client_name) vypadají jako "duplicitní", i když jde o odlišné zakázky.
  const existing = await sql`
    SELECT id FROM completed_projects WHERE source_project_id = ${projectId} LIMIT 1
  `
  if (existing.length) throw new Error('Tato zakázka již byla přidána do dokončených.')

  const inserted = await sql`
    INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested, estimated_hours, notes, project_type, client_email, source_project_id)
    VALUES (
      ${p.description || p.client_name},
      ${p.client_name},
      null,
      ${extra.completed_at},
      ${p.price ?? 0},
      ${extra.difficulty},
      ${extra.time_invested},
      ${extra.estimated_hours},
      ${p.notes},
      ${extra.project_type},
      ${p.client_email},
      ${projectId}
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
      business: 'vizeon',
    })
  }

  if (extra.include_costs && p.estimated_costs && p.estimated_costs > 0) {
    const costName = 'Náklady: ' + (p.description || p.client_name)
    const costRows = await sql`
      INSERT INTO costs (name, amount, cost_type, category, description)
      VALUES (
        ${costName},
        ${p.estimated_costs},
        ${'one_time'},
        ${'client'},
        ${'Předpokládané náklady ze zakázky ' + p.client_name}
      )
      RETURNING id
    `
    const costId = (costRows[0] as { id: string }).id
    // Provázat s finance transakcí, ať je náklad vidět i v cash flow (jeden integrovaný systém)
    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
      VALUES (${p.estimated_costs}, 'expense', 'náklady', ${costName}, ${extra.completed_at}, NULL, ${costId})
    `
    revalidatePath('/dashboard/naklady')
    revalidatePath('/hub/finance')
  }

  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/dashboard/hodnoceni')
  revalidatePath(`/dashboard/${projectId}`)
}
