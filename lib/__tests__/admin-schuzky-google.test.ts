import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * Schůzky s Google Meet a e-mail z vizeon.cz (R-112, krok 3 a 4) — části bez
 * celé schůzky: šablona e-mailu, šifrování tokenu, Google (podstrčený fetch),
 * Resend.
 */

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { renderMeetingEmail, defaultSubject, meetingWhen } from '@/lib/admin/meeting-email'
import { decryptSecret, encryptSecret } from '@/lib/admin/google/crypto'
import {
  completeAuth,
  googleAccessToken,
  googleStatus,
  newAuthRequest,
  resetGoogleCacheForTests,
} from '@/lib/admin/google/oauth'
import { createMeetEvent } from '@/lib/admin/google/calendar'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const KEY = Buffer.alloc(32, 7).toString('base64')
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id),
                   updated_at timestamptz NOT NULL DEFAULT now());
                 INSERT INTO admin_settings (id) VALUES (true);
                 CREATE TABLE calendar_events (id uuid PRIMARY KEY);
                 ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS google_oauth jsonb;`)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('GOOGLE_TOKEN_KEY', KEY)
  resetGoogleCacheForTests()
  await db.exec('UPDATE admin_settings SET google_oauth = NULL')
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('e-mail se schůzkou', () => {
  const base = {
    intro: 'Dobrý den,\n\nděkuji za domluvu <script>alert(1)</script>.',
    startsAt: '2026-11-20T14:00:00Z',
    minutes: 30,
    meetUrl: 'https://meet.google.com/abc-defg-hij',
    demoUrl: 'https://navrhy.vizeon.cz/topeni/',
  }

  it('má termín v pražském čase, odkaz na Meet, ukázku, web a podpis', () => {
    expect(meetingWhen(base.startsAt)).toBe('pátek 20. listopadu v 15:00')
    expect(defaultSubject(base.startsAt)).toBe('Naše schůzka pátek 20. listopadu v 15:00')
    const { text, html } = renderMeetingEmail(base)
    expect(text).toContain('Kdy: pátek 20. listopadu v 15:00 (30 minut)')
    expect(text).toContain('Připojit se: https://meet.google.com/abc-defg-hij')
    expect(text).toContain('Ukázka vašeho webu: https://navrhy.vizeon.cz/topeni/')
    expect(text).toContain('Náš web: https://vizeon.cz')
    expect(text).toContain('krystof@vizeon.cz')
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"')
    expect(html).toContain('Připojit se ke schůzce')
  })

  it('text od člověka se escapuje a odkaz bez https neprojde', () => {
    const { html } = renderMeetingEmail(base)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(() => renderMeetingEmail({ ...base, meetUrl: 'javascript:alert(1)' })).toThrow()
    expect(renderMeetingEmail({ ...base, demoUrl: 'http://x.cz' }).text).not.toContain('Ukázka')
  })
})

describe('šifrování obnovovacího tokenu', () => {
  it('zašifruje, rozšifruje a pozná podvrh', () => {
    const sealed = encryptSecret('1//refresh-token')
    expect(sealed).not.toContain('refresh-token')
    expect(decryptSecret(sealed)).toBe('1//refresh-token')
    const parts = sealed.split('.')
    parts[3] = Buffer.from('jiný obsah').toString('base64url')
    expect(() => decryptSecret(parts.join('.'))).toThrow()
  })
})

describe('Google OAuth', () => {
  it('žádá jen kalendář, koncepty v Gmailu a e-mail, s PKCE a offline přístupem', () => {
    const { url, state, verifier } = newAuthRequest('https://www.zakaziq.cz')
    const params = new URL(url).searchParams
    expect(params.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose',
    )
    expect(params.get('redirect_uri')).toBe('https://www.zakaziq.cz/api/google/callback')
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('state')).toBe(state)
    expect(params.get('code_challenge')).not.toBe(verifier)
  })

  it('uloží token zašifrovaný a odvolaný token propojení zahodí', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'krystof@vizeon.cz' })).toString('base64url')}.y`
    const fetchImpl = vi.fn(async () =>
      json({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-tajny', scope: 'openid email https://www.googleapis.com/auth/calendar.events', id_token: idToken }),
    )
    expect(await completeAuth('kod', 'verifier', 'https://www.zakaziq.cz', fetchImpl as unknown as typeof fetch)).toEqual({
      email: 'krystof@vizeon.cz',
    })
    const stored = await db.query<{ g: string }>(`SELECT google_oauth::text AS g FROM admin_settings`)
    expect(stored.rows[0].g).not.toContain('rt-tajny')
    expect(await googleStatus()).toMatchObject({ connected: true, email: 'krystof@vizeon.cz' })

    resetGoogleCacheForTests()
    const revoked = vi.fn(async () => json({ error: 'invalid_grant' }, 400))
    await expect(googleAccessToken(revoked as unknown as typeof fetch)).rejects.toThrow(/Propojte účet v Profilu znovu/)
    expect(await googleStatus()).toEqual({ configured: true, connected: false })
  })

  it('bez oprávnění ke kalendáři propojení odmítne', async () => {
    const fetchImpl = async () => json({ access_token: 'a', expires_in: 3600, refresh_token: 'r', scope: 'openid email' })
    await expect(completeAuth('kod', 'v', 'https://x.cz', fetchImpl as unknown as typeof fetch)).rejects.toThrow(/kalendáři/)
  })
})

describe('událost s Google Meet', () => {
  async function connect() {
    const fetchImpl = async () =>
      json({ access_token: 'at', expires_in: 3600, refresh_token: 'rt', scope: 'https://www.googleapis.com/auth/calendar.events' })
    await completeAuth('kod', 'v', 'https://x.cz', fetchImpl as unknown as typeof fetch)
  }

  it('bez hostů a bez pozvánky od Googlu, počká na odkaz, když je „pending"', async () => {
    await connect()
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') return json({ id: 'ev1', conferenceData: { createRequest: { status: { statusCode: 'pending' } } } })
      return json({ id: 'ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' })
    })
    const result = await createMeetEvent(
      { title: 'Schůzka: Firma', description: 'x', startsAt: '2026-11-20T14:00:00Z', endsAt: '2026-11-20T14:30:00Z' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} },
    )
    expect(result).toEqual({ googleEventId: 'ev1', meetUrl: 'https://meet.google.com/abc-defg-hij' })
    expect(calls[0].url).toContain('conferenceDataVersion=1')
    expect(calls[0].url).toContain('sendUpdates=none')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.attendees).toBeUndefined()
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
  })

  it('když Meet nevznikne, událost v Googlu smaže', async () => {
    await connect()
    const methods: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET')
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return json({ id: 'ev2', conferenceData: { createRequest: { status: { statusCode: 'failure' } } } })
    })
    await expect(
      createMeetEvent(
        { title: 't', description: 'd', startsAt: '2026-11-20T14:00:00Z', endsAt: '2026-11-20T14:30:00Z' },
        { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} },
      ),
    ).rejects.toThrow(/Meet/)
    expect(methods).toContain('DELETE')
  })
})

describe('Resend z vizeon.cz', () => {
  it('posílá z krystof@vizeon.cz s idempotencí a odmítne vložení hlavičky', async () => {
    vi.stubEnv('VIZEON_RESEND_API_KEY', 're_test')
    let sent: { headers: Record<string, string>; body: Record<string, unknown> } | null = null
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = { headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) }
      return json({ id: 'email_1' })
    })
    const mail = { to: 'klient@example.cz', subject: 'Schůzka', text: 't', html: '<p>t</p>', idempotencyKey: 'meeting-invite:1' }
    expect(await sendVizeonMail(mail, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, id: 'email_1' })
    expect(sent!.body.from).toBe('Kryštof Sobotka | VIZEON <krystof@vizeon.cz>')
    expect(sent!.body.reply_to).toBe('krystof@vizeon.cz')
    expect(sent!.headers['Idempotency-Key']).toBe('meeting-invite:1')

    expect((await sendVizeonMail({ ...mail, subject: 'a\r\nBcc: x@y.cz' }, fetchImpl as unknown as typeof fetch)).ok).toBe(false)
    expect((await sendVizeonMail({ ...mail, to: 'a@b.cz, c@d.cz' }, fetchImpl as unknown as typeof fetch)).ok).toBe(false)
  })

  it('bez klíče nic neodešle', async () => {
    vi.stubEnv('VIZEON_RESEND_API_KEY', '')
    const fetchImpl = vi.fn()
    const res = await sendVizeonMail(
      { to: 'a@b.cz', subject: 's', text: 't', html: 'h', idempotencyKey: 'k' },
      fetchImpl as unknown as typeof fetch,
    )
    expect(res.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
