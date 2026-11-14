import { describe, it, expect } from 'vitest'
import {
  activityInputSchema,
  buildTimeline,
  canApprove,
  prepareActivity,
  redactSensitive,
  reportInputSchema,
  reportKindToActivityKind,
  ACTIVITY_BODY_MAX,
  ACTIVITY_TITLE_MAX,
  REDACTION_MARK,
} from '@/lib/project-activity'

describe('redactSensitive', () => {
  it('nechá běžnou českou větu beze změny', () => {
    const text = 'Upravili jsme kontaktní stránku a přidali nový telefon. Na adrese /kontakt je teď formulář, v Brně a okolí.'
    expect(redactSensitive(text)).toEqual({ text, found: false })
  })

  it('nechá běžnou adresu stránky /home a odkazy beze změny', () => {
    const text = 'Úvodní stránka /home je rychlejší, odkaz https://example.cz/o-nas funguje.'
    expect(redactSensitive(text).found).toBe(false)
  })

  it('zakryje klíče různých služeb', () => {
    const samples = [
      'Klíč je sk-ant-api03-abcdefghijklmnop1234 a funguje.',
      'Použili jsme sk_live_abcdef1234567890 pro platby.',
      'Token ghp_abcdefghijklmnopqrstuvwxyz0123 jsme otočili.',
      'zk_agent_Ab12Cd34Ef_abcdefghijklmnopqrstuvwxyz012345 je v prostředí.',
      'AWS klíč AKIAABCDEFGHIJKLMNOP je venku.',
      // Doplněno auditem 2026-11-14: tyhle tvary filtr dřív pustil dál.
      'Podpis webhooku whsec_AbCdEf0123456789XyZ nastav ve Vercelu.',
      'Resend klíč re_AbCdEf0123456789XyZ už neplatí.',
      'Maps klíč AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz0123456 je v konfiguraci.',
      'Heslo role je npg_AbCdEf0123456789 a nikomu ho nedávej.',
    ]
    for (const sample of samples) {
      const r = redactSensitive(sample)
      expect(r.found, sample).toBe(true)
      expect(r.text).toContain(REDACTION_MARK)
    }
  })

  it('zakryje hlavičku Bearer a JWT', () => {
    expect(redactSensitive('Authorization: Bearer abcdefghijklmnop1234567').found).toBe(true)
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstu'
    const r = redactSensitive(`Token ${jwt} vypršel`)
    expect(r.found).toBe(true)
    expect(r.text).not.toContain('eyJhbGci')
  })

  it('zakryje connection string s heslem', () => {
    const r = redactSensitive('Databáze je postgres://admin:tajneheslo@db.example.com/app a běží.')
    expect(r.found).toBe(true)
    expect(r.text).not.toContain('tajneheslo')
  })

  it('zakryje řádky z .env', () => {
    const r = redactSensitive('Nastavili jsme:\nDATABASE_URL=neco\nSTRIPE_SECRET_KEY=abc\nHotovo.')
    expect(r.found).toBe(true)
    expect(r.text).not.toContain('DATABASE_URL')
    expect(r.text).not.toContain('STRIPE_SECRET_KEY')
    expect(r.text).toContain('Hotovo.')
  })

  it('zakryje celý blok soukromého klíče, ne jen hlavičku', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n')
    const r = redactSensitive(`Klíč serveru:\n${pem}\nTím to je.`)
    expect(r.found).toBe(true)
    expect(r.text).not.toContain('MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu')
    expect(r.text).not.toContain('BEGIN RSA PRIVATE KEY')
    expect(r.text).toContain('Tím to je.')
  })

  it('zakryje cesty v domovské složce', () => {
    for (const sample of [
      'Soubor je v /Users/jana/projekty/web/app.ts',
      'Soubor je v /home/jana/web/app.ts',
      'Soubor je v C:\\Users\\Jana\\web\\app.ts',
    ]) {
      expect(redactSensitive(sample).found, sample).toBe(true)
    }
  })
})

describe('prepareActivity', () => {
  it('zakryje nadpis i text a nastaví příznak', () => {
    const p = prepareActivity({ title: 'Klíč sk-abcdefghijklmnopqrstu', body: 'Hotovo.', kind: 'done' })
    expect(p.containsSensitive).toBe(true)
    expect(p.title).toContain(REDACTION_MARK)
  })

  it('příznak zůstává, dokud v textu zbývá značka [skryto]', () => {
    const p = prepareActivity({ title: 'Nadpis', body: `Použili jsme ${REDACTION_MARK} pro přihlášení.`, kind: 'done' })
    expect(p.containsSensitive).toBe(true)
  })

  it('čistý text má příznak vypnutý', () => {
    expect(prepareActivity({ title: 'Nová stránka', body: 'Přidali jsme stránku Kontakt.', kind: 'done' }).containsSensitive).toBe(false)
  })
})

describe('canApprove', () => {
  it('schválit lze jen koncept bez citlivých údajů', () => {
    expect(canApprove({ status: 'draft', contains_sensitive: false })).toBe(true)
    expect(canApprove({ status: 'draft', contains_sensitive: true })).toBe(false)
    expect(canApprove({ status: 'published', contains_sensitive: false })).toBe(false)
    expect(canApprove({ status: 'rejected', contains_sensitive: false })).toBe(false)
  })
})

describe('schémata', () => {
  it('hlídají hranice délek', () => {
    const ok = { title: 'a'.repeat(ACTIVITY_TITLE_MAX), body: 'b'.repeat(ACTIVITY_BODY_MAX), kind: 'done' }
    expect(activityInputSchema.safeParse(ok).success).toBe(true)
    expect(activityInputSchema.safeParse({ ...ok, title: 'a'.repeat(ACTIVITY_TITLE_MAX + 1) }).success).toBe(false)
    expect(activityInputSchema.safeParse({ ...ok, body: 'b'.repeat(ACTIVITY_BODY_MAX + 1) }).success).toBe(false)
    expect(activityInputSchema.safeParse({ ...ok, title: '   ' }).success).toBe(false)
    expect(activityInputSchema.safeParse({ ...ok, body: '' }).success).toBe(false)
  })

  it('odmítne neznámý druh', () => {
    expect(activityInputSchema.safeParse({ title: 'a', body: 'b', kind: 'jine' }).success).toBe(false)
  })

  it('hlášení přijímá česká slova a mapuje je na interní druh', () => {
    const r = reportInputSchema.safeParse({ title: 'a', body: 'b', kind: 'rozpracováno' })
    expect(r.success && reportKindToActivityKind(r.data.kind)).toBe('in_progress')
    expect(reportInputSchema.safeParse({ title: 'a', body: 'b', kind: 'done' }).success).toBe(false)
    expect(reportInputSchema.parse({ title: 'a', body: 'b' }).kind).toBe('hotovo')
  })
})

describe('buildTimeline', () => {
  const progress = [
    { id: 'p1', progress_from: 0, progress_to: 40, description: 'Základ', created_at: '2026-10-01T10:00:00Z' },
    { id: 'p2', progress_from: 40, progress_to: 80, description: 'Skoro', created_at: '2026-10-05T10:00:00Z' },
  ]
  const activity = [
    { id: 'a1', kind: 'done' as const, title: 'Kontakt', body: 'Hotovo', published_at: '2026-10-03T10:00:00Z' },
    { id: 'a2', kind: 'done' as const, title: 'Shoda', body: 'Hotovo', published_at: '2026-10-05T10:00:00Z' },
  ]

  it('řadí od nejnovějšího a při shodě času dává aktivitu první', () => {
    const t = buildTimeline(progress, activity)
    expect(t.map((e) => e.id)).toEqual(['a2', 'p2', 'a1', 'p1'])
  })

  it('vynechá dvojí záznam téhož id', () => {
    const t = buildTimeline(progress, [...activity, activity[0]])
    expect(t.filter((e) => e.type === 'activity')).toHaveLength(2)
  })

  it('prázdné vstupy dají prázdnou osu', () => {
    expect(buildTimeline([], [])).toEqual([])
  })
})
