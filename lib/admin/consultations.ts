import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { createMeetEvent, deleteGoogleEvent, moveGoogleEvent } from '@/lib/admin/google/calendar'
import { googleConfigured } from '@/lib/admin/google/oauth'
import { renderConsultationEmail } from '@/lib/admin/consultation-email'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { meetingWhen } from '@/lib/admin/meeting-email'
import { createNotification } from '@/lib/notifications'
import { projectPath } from '@/lib/lead-origins'
import { CHANNEL_LABELS, type ConsultationChannel } from '@/lib/types'

/**
 * Co se stane po rezervaci konzultace (KP14, R-126) — z `/klient` i z `/p`.
 *
 * Rezervaci samotnou zapisuje databáze (`consultation_book`, migrace 123).
 * Tady se jen dokončí to, co v Googlu a v poště nesmí rezervaci shodit:
 *  1. **Google Meet** — událost v kalendáři Kryštofa (R-114). Selže-li,
 *     rezervace platí dál a Kryštof dostane upozornění.
 *  2. **Potvrzení klientovi** z krystof@vizeon.cz přes Resend. Řádek si zamkne
 *     `confirmation_sent_at`, takže e-mail neodejde dvakrát.
 *  3. **Zvonek** Kryštofovi.
 *
 * Volá se s id rezervace, které vrátila databázová funkce — nikdy s ničím,
 * co přišlo z prohlížeče (DECISIONS #043). Běží vlastníkem tabulek, protože
 * Google token a pošta patří adminu, ne klientovi.
 */

type Deps = {
  createMeet?: typeof createMeetEvent
  deleteMeet?: typeof deleteGoogleEvent
  moveMeet?: typeof moveGoogleEvent
  send?: typeof sendVizeonMail
  notify?: typeof createNotification
  googleReady?: () => boolean
}

type SlotRow = {
  id: string
  project_id: string
  scheduled_at: string | Date
  duration_minutes: number | null
  channel: ConsultationChannel
  client_wish: string
  meeting_link: string | null
  meet_status: string | null
  booked_via: 'odkaz' | 'prostor' | null
  client_email: string | null
  calendar_event_id: string | null
  google_event_id: string | null
  client_name: string
  project_email: string | null
  member_email: string | null
}

async function loadSlot(slotId: string): Promise<SlotRow | null> {
  const rows = await adminDb<SlotRow>`
    SELECT cs.id::text, cs.project_id::text, cs.scheduled_at, cs.duration_minutes, cs.channel,
           cs.client_wish, cs.meeting_link, cs.meet_status, cs.booked_via, cs.client_email,
           cs.calendar_event_id::text, e.google_event_id,
           p.client_name, p.client_email AS project_email, m.email AS member_email
    FROM consultation_slots cs
    JOIN projects p ON p.id = cs.project_id
    LEFT JOIN calendar_events e ON e.id = cs.calendar_event_id
    LEFT JOIN portal.members m ON m.id = cs.portal_member_id
    WHERE cs.id = ${slotId}
  `
  return rows[0] ?? null
}

const iso = (v: string | Date) => new Date(v).toISOString()
const minutesOf = (row: SlotRow) => row.duration_minutes ?? 60

/** Kam jde potvrzení: člen z prostoru, u odkazu `/p` jen e-mail ze zakázky (audit 2026-11-15). */
function recipientOf(row: SlotRow): string | null {
  const to = row.booked_via === 'prostor' ? (row.member_email ?? row.client_email) : row.project_email
  return to?.trim() || null
}

function manageUrlOf(row: SlotRow): string | null {
  if (row.booked_via !== 'prostor') return null
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return base.startsWith('https://') ? `${base}/klient/projekt/${row.project_id}` : null
}

async function ensureMeet(row: SlotRow, deps: Deps): Promise<SlotRow> {
  if (row.channel !== 'meet' || row.meet_status !== 'pending') return row
  const claimed = await adminDb<{ id: string }>`
    UPDATE consultation_slots SET meet_status = 'creating'
    WHERE id = ${row.id} AND meet_status = 'pending'
    RETURNING id::text
  `
  if (!claimed[0]) return row

  const ready = (deps.googleReady ?? googleConfigured)()
  const startsAt = iso(row.scheduled_at)
  const endsAt = new Date(new Date(startsAt).getTime() + minutesOf(row) * 60_000).toISOString()
  try {
    if (!ready) throw new Error('Google účet není nastavený.')
    const meet = await (deps.createMeet ?? createMeetEvent)({
      title: `Konzultace: ${row.client_name}`.slice(0, 120),
      description: [row.client_wish, '', 'Rezervace z klientského prostoru ZakazIQ.'].join('\n').slice(0, 2000),
      startsAt,
      endsAt,
      requestId: row.id,
    })
    try {
      await adminDb.batch([
        {
          text: `UPDATE calendar_events SET meet_url = $2, google_event_id = $3 WHERE id = $1`,
          params: [row.calendar_event_id, meet.meetUrl, meet.googleEventId],
        },
        {
          text: `UPDATE consultation_slots SET meeting_link = $2, meet_status = 'ready' WHERE id = $1`,
          params: [row.id, meet.meetUrl],
        },
      ])
    } catch (err) {
      // Rezervaci mezitím někdo zrušil — událost v Googlu nesmí zůstat viset.
      await (deps.deleteMeet ?? deleteGoogleEvent)(meet.googleEventId).catch(() => {})
      throw err
    }
    return { ...row, meeting_link: meet.meetUrl, meet_status: 'ready', google_event_id: meet.googleEventId }
  } catch (err) {
    console.error('[konzultace] Meet se nevytvořil:', (err as Error).message)
    await adminDb`UPDATE consultation_slots SET meet_status = 'failed' WHERE id = ${row.id} AND meet_status = 'creating'`
    await (deps.notify ?? createNotification)({
      type: 'consultation_meet_failed',
      title: `Odkaz na Meet se nevytvořil — ${row.client_name}`,
      body: `Konzultace ${meetingWhen(startsAt)} platí. Pošlete klientovi odkaz sami.`,
      link: projectPath(row.project_id),
    })
    return { ...row, meet_status: 'failed' }
  }
}

async function sendConfirmation(row: SlotRow, kind: 'booked' | 'moved', deps: Deps): Promise<void> {
  if (row.booked_via === null) return
  const to = recipientOf(row)
  if (!to) {
    // Bez adresy se nemá kam poslat — ať to denní pojistka nezkouší pořád znovu.
    await adminDb`UPDATE consultation_slots SET confirmation_sent_at = now() WHERE id = ${row.id} AND confirmation_sent_at IS NULL`
    return
  }
  const claimed = await adminDb<{ id: string }>`
    UPDATE consultation_slots SET confirmation_sent_at = now()
    WHERE id = ${row.id} AND confirmation_sent_at IS NULL
    RETURNING id::text
  `
  if (!claimed[0]) return

  const startsAt = iso(row.scheduled_at)
  const mail = renderConsultationEmail({
    kind,
    startsAt,
    minutes: minutesOf(row),
    topic: row.client_wish,
    joinUrl: row.meeting_link && row.meeting_link !== '#' ? row.meeting_link : null,
    channelLabel: CHANNEL_LABELS[row.channel] ?? 'Google Meet',
    manageUrl: manageUrlOf(row),
  })
  let ok = false
  try {
    const res = await (deps.send ?? sendVizeonMail)({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      idempotencyKey: `consultation:${row.id}:${new Date(startsAt).getTime()}`,
    })
    ok = res.ok
    if (!res.ok) console.error('[konzultace] Potvrzení neodešlo:', res.error)
  } catch (err) {
    console.error('[konzultace] Potvrzení neodešlo:', (err as Error).message)
  }
  // Neodeslané potvrzení zkusí znovu denní pojistka.
  if (!ok) await adminDb`UPDATE consultation_slots SET confirmation_sent_at = NULL WHERE id = ${row.id}`
}

/** Po rezervaci (`notify`) nebo z denní pojistky (bez zvonku). */
export async function finishConsultationBooking(
  slotId: string,
  options: { notify?: boolean } = {},
  deps: Deps = {},
): Promise<void> {
  const loaded = await loadSlot(slotId)
  if (!loaded) return
  const row = await ensureMeet(loaded, deps)
  await sendConfirmation(row, 'booked', deps)
  if (options.notify !== false) {
    await (deps.notify ?? createNotification)({
      type: 'consultation_booked',
      title: `Nová konzultace — ${row.client_name}`,
      body: `${meetingWhen(iso(row.scheduled_at))} · ${row.client_wish}`.slice(0, 300),
      link: projectPath(row.project_id),
    })
  }
}

/** Po přesunu klientem: Google na nový čas, nové potvrzení, zvonek. */
export async function finishConsultationMove(
  slotId: string,
  move: { googleEventId: string | null; minutes: number },
  deps: Deps = {},
): Promise<void> {
  const row = await loadSlot(slotId)
  if (!row) return
  const startsAt = iso(row.scheduled_at)
  if (move.googleEventId) {
    const endsAt = new Date(new Date(startsAt).getTime() + move.minutes * 60_000).toISOString()
    await (deps.moveMeet ?? moveGoogleEvent)(move.googleEventId, { startsAt, endsAt }).catch((err) =>
      console.error('[konzultace] Přesun v Googlu selhal:', (err as Error).message),
    )
  }
  await sendConfirmation(row, 'moved', deps)
  await (deps.notify ?? createNotification)({
    type: 'consultation_changed',
    title: `Klient přesunul konzultaci — ${row.client_name}`,
    body: `Nově ${meetingWhen(startsAt)}.`,
    link: projectPath(row.project_id),
  })
}

/** Po zrušení klientem: událost v Googlu pryč, zvonek. Data už smazala databáze. */
export async function finishConsultationCancel(
  cancelled: { googleEventId: string | null; projectId: string; clientName: string; startsAt: string },
  deps: Deps = {},
): Promise<void> {
  if (cancelled.googleEventId) {
    await (deps.deleteMeet ?? deleteGoogleEvent)(cancelled.googleEventId).catch((err) =>
      console.error('[konzultace] Smazání v Googlu selhalo:', (err as Error).message),
    )
  }
  await (deps.notify ?? createNotification)({
    type: 'consultation_changed',
    title: `Klient zrušil konzultaci — ${cancelled.clientName}`,
    body: `Byla domluvená na ${meetingWhen(cancelled.startsAt)}. Čas je zase volný.`,
    link: projectPath(cancelled.projectId),
  })
}

/**
 * Denní pojistka (cron `send-reminders`): rezervace, kterým po rezervaci
 * nedoběhl Meet nebo potvrzení (spadlá funkce, výpadek Googlu či Resendu).
 * Zaseknuté „zakládá se" starší deseti minut se vrátí do fronty.
 */
export async function finishUnfinishedConsultations(deps: Deps = {}): Promise<number> {
  let ids: { id: string }[]
  try {
    await adminDb`
      UPDATE consultation_slots SET meet_status = 'pending'
      WHERE meet_status = 'creating' AND created_at < now() - interval '10 minutes' AND scheduled_at > now()
    `
    ids = await adminDb<{ id: string }>`
      SELECT id::text FROM consultation_slots
      WHERE scheduled_at > now()
        AND created_at < now() - interval '10 minutes'
        AND (meet_status = 'pending' OR (booked_via IS NOT NULL AND confirmation_sent_at IS NULL))
      ORDER BY scheduled_at
      LIMIT 20
    `
  } catch (err) {
    // Databáze bez migrace 123 — nic k dokončení.
    if ((err as { code?: string })?.code === '42703') return 0
    throw err
  }
  for (const { id } of ids) await finishConsultationBooking(id, { notify: false }, deps)
  return ids.length
}
