import 'server-only'
import { randomUUID } from 'node:crypto'
import { googleAccessToken, type Fetch } from '@/lib/admin/google/oauth'

/**
 * Událost s Google Meet v kalendáři Kryštofa (R-112).
 *
 * Událost **nemá hosty** a posílá se se `sendUpdates=none`: klientovi pozvánka
 * od Googlu nechodí, dostane jen náš e-mail s odkazem (rozhodl Kryštof
 * 2026-11-17). Kryštof ji vidí v Google Kalendáři na telefonu i v počítači
 * a připojí se odtud nebo z kalendáře adminu.
 */

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z0-9-]+(\?[^\s]*)?$/i

type GoogleEvent = {
  id?: string
  hangoutLink?: string
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } }
    entryPoints?: { entryPointType?: string; uri?: string }[]
  }
}

function meetLink(event: GoogleEvent): string | null {
  const uri =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
    null
  return uri && MEET_URL.test(uri) ? uri : null
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  fetchImpl: Fetch,
): Promise<GoogleEvent | null> {
  const token = await googleAccessToken(fetchImpl)
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (method === 'DELETE' && (res.status === 204 || res.status === 404 || res.status === 410)) return null
  const json = (await res.json().catch(() => null)) as GoogleEvent & { error?: { message?: string } } | null
  if (!res.ok) throw new Error(`Google Kalendář ${res.status}: ${json?.error?.message ?? 'bez odpovědi'}`)
  return json
}

export type MeetEvent = { googleEventId: string; meetUrl: string }

/**
 * Založí událost a vrátí odkaz na Meet. Google ho někdy dodá až po chvíli
 * (`createRequest.status = pending`) — pak se třikrát zeptá znovu. Když odkaz
 * nevznikne, událost smaže a vyhodí chybu, ať v Googlu nezůstane schůzka bez Meetu.
 */
export async function createMeetEvent(
  input: { title: string; description: string; startsAt: string; endsAt: string; requestId?: string },
  options: { fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MeetEvent> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  const created = await call(
    'POST',
    `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`,
    {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startsAt, timeZone: 'Europe/Prague' },
      end: { dateTime: input.endsAt, timeZone: 'Europe/Prague' },
      conferenceData: {
        createRequest: { requestId: input.requestId ?? randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      reminders: { useDefault: true },
    },
    fetchImpl,
  )
  const id = created?.id
  if (!id) throw new Error('Google Kalendář nevrátil id události.')

  let event: GoogleEvent | null = created
  for (let attempt = 0; attempt < 3 && !meetLink(event ?? {}); attempt++) {
    if (event?.conferenceData?.createRequest?.status?.statusCode === 'failure') break
    await sleep(1000)
    event = await call('GET', `${EVENTS_URL}/${encodeURIComponent(id)}`, null, fetchImpl)
  }

  const meetUrl = meetLink(event ?? {})
  if (!meetUrl) {
    await deleteGoogleEvent(id, { fetchImpl }).catch(() => {})
    throw new Error('Google nevytvořil odkaz na Meet. Zkuste to prosím znovu.')
  }
  return { googleEventId: id, meetUrl }
}

/** Smaže událost v Googlu. Už smazaná (404/410) je v pořádku. */
export async function deleteGoogleEvent(googleEventId: string, options: { fetchImpl?: Fetch } = {}): Promise<void> {
  await call('DELETE', `${EVENTS_URL}/${encodeURIComponent(googleEventId)}?sendUpdates=none`, null, options.fetchImpl ?? fetch)
}

/** Posune událost v Googlu na nový čas (přesun konzultace klientem, KP14). Odkaz na Meet zůstává. */
export async function moveGoogleEvent(
  googleEventId: string,
  input: { startsAt: string; endsAt: string },
  options: { fetchImpl?: Fetch } = {},
): Promise<void> {
  await call(
    'PATCH',
    `${EVENTS_URL}/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
    {
      start: { dateTime: input.startsAt, timeZone: 'Europe/Prague' },
      end: { dateTime: input.endsAt, timeZone: 'Europe/Prague' },
    },
    options.fetchImpl ?? fetch,
  )
}
