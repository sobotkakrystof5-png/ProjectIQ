import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// PGlite a první požadavek na routu jsou pod zátěží celé sady pomalé (známé u testů nad PGlite).
vi.setConfig({ testTimeout: 30_000 })
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => undefined),
  adminActorEmail: vi.fn(async () => 'admin@example.cz'),
}))
vi.mock('@/lib/db', () => ({ sql: vi.fn() }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { hashAgentKey } from '@/lib/agent-keys'
import {
  VoiceKeyConfigError,
  generateVoiceKey,
  hashVoiceKey,
  maskVoiceKey,
  voiceBearerFrom,
  voiceKeyMatches,
  voiceKeyPrefixOf,
} from '@/lib/admin/voice/keys'
import {
  MAX_ACTIVE_DEVICES,
  createDevice,
  listDevices,
  resolveDevice,
  restoreDevice,
  revokeDevice,
} from '@/lib/admin/voice/devices'
import { addVoiceDevice, restoreVoiceDevice, revokeVoiceDevice } from '@/app/voice-actions'

// ZakazIQ Voice (R-148, VO01): klíč zařízení a zařízení nad migrací 136 v PGlite.

const PEPPER = 'p'.repeat(40)
const MIGRATION = fs.readFileSync(path.join(__dirname, '../../migrations/136_zakaziq_voice.sql'), 'utf8')

let db: PGlite
/** Databáze bez migrace 136 — v beforeAll, uvnitř testu by PGlite pod zátěží přetáhla limit 5 s. */
let emptyDb: PGlite

beforeAll(async () => {
  db = new PGlite()
  emptyDb = new PGlite()
  // PGlite startuje až prvním dotazem; ať se to nestane uvnitř testu.
  await emptyDb.query('SELECT 1')
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db?.close()
  await emptyDb?.close()
})

beforeEach(async () => {
  process.env.AGENT_KEY_PEPPER = PEPPER
  await db.exec('DELETE FROM voice_devices')
})

describe('klíč zařízení', () => {
  it('má tvar zk_voice_<10>_<32> a otisk sedí na CHECK z migrace', () => {
    const { key, prefix, hash } = generateVoiceKey()
    expect(key).toMatch(/^zk_voice_[A-Za-z0-9]{10}_[A-Za-z0-9]{32}$/)
    expect(voiceKeyPrefixOf(key)).toBe(prefix)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(maskVoiceKey(prefix)).not.toContain(key.slice(-8))
  })

  it('shoduje se jen se svým otiskem', () => {
    const a = generateVoiceKey()
    const b = generateVoiceKey()
    expect(voiceKeyMatches(a.key, a.hash)).toBe(true)
    expect(voiceKeyMatches(a.key, b.hash)).toBe(false)
    expect(voiceKeyMatches(a.key, 'zkažený')).toBe(false)
    expect(a.hash).not.toBe(b.hash)
  })

  it('stejný řetězec dá jiný otisk než klíč projektu (doména voice:)', () => {
    const { key } = generateVoiceKey()
    expect(hashVoiceKey(key)).not.toBe(hashAgentKey(key))
  })

  it('cizí tvar klíče nerozpozná', () => {
    expect(voiceKeyPrefixOf('zk_agent_AbCdEfGhIj_' + 'a'.repeat(32))).toBeNull()
    expect(voiceKeyPrefixOf('zk_voice_AbCd_' + 'a'.repeat(32))).toBeNull()
    expect(voiceKeyPrefixOf('')).toBeNull()
  })

  it('bez pepře selže zavřeně', () => {
    process.env.AGENT_KEY_PEPPER = 'krátký'
    expect(() => generateVoiceKey()).toThrow(VoiceKeyConfigError)
    expect(() => hashVoiceKey('zk_voice_x')).toThrow(VoiceKeyConfigError)
  })

  it('Bearer hlavička', () => {
    expect(voiceBearerFrom('Bearer zk_voice_abc')).toBe('zk_voice_abc')
    expect(voiceBearerFrom('bearer  zk_voice_abc')).toBe('zk_voice_abc')
    expect(voiceBearerFrom('Basic abc')).toBeNull()
    expect(voiceBearerFrom(null)).toBeNull()
  })
})

describe('zařízení', () => {
  it('vytvoří zařízení, v DB je jen prefix a otisk, klíč se pozná', async () => {
    const res = await createDevice('MacBook', 'admin@example.cz')
    if (!res.ok) throw new Error('nečekané')
    const row = await db.query<Record<string, string>>(`SELECT * FROM voice_devices`)
    const stored = JSON.stringify(row.rows)
    expect(stored).not.toContain(res.key)
    expect(stored).not.toContain(res.key.split('_').pop())
    expect(await resolveDevice(res.key)).toEqual({ id: res.device.id, name: 'MacBook' })
    expect(await resolveDevice(res.key.slice(0, -1) + (res.key.endsWith('a') ? 'b' : 'a'))).toBeNull()
  })

  it('zneplatněné zařízení se nepřipojí, Zpět ho do dvou minut vrátí', async () => {
    const res = await createDevice('MacBook', 'admin@example.cz')
    if (!res.ok) throw new Error('nečekané')
    expect(await revokeDevice(res.device.id, 'admin@example.cz')).toBe(true)
    expect(await resolveDevice(res.key)).toBeNull()
    expect(await revokeDevice(res.device.id, 'admin@example.cz')).toBe(false)
    expect(await restoreDevice(res.device.id)).toBe(true)
    expect(await resolveDevice(res.key)).not.toBeNull()
  })

  it('po dvou minutách už zneplatnění vrátit nejde', async () => {
    const res = await createDevice('MacBook', 'admin@example.cz')
    if (!res.ok) throw new Error('nečekané')
    await revokeDevice(res.device.id, 'admin@example.cz')
    await db.query(`UPDATE voice_devices SET revoked_at = now() - interval '3 minutes' WHERE id = $1`, [res.device.id])
    expect(await restoreDevice(res.device.id)).toBe(false)
    expect(await resolveDevice(res.key)).toBeNull()
  })

  it('platných zařízení je nejvýš MAX_ACTIVE_DEVICES', async () => {
    for (let i = 0; i < MAX_ACTIVE_DEVICES; i++) {
      expect((await createDevice(`Mac ${i}`, 'admin@example.cz')).ok).toBe(true)
    }
    expect(await createDevice('Další', 'admin@example.cz')).toEqual({ ok: false, reason: 'too_many' })
  })

  it('seznam má platná nahoře a nikdy celý klíč', async () => {
    const a = await createDevice('Starý', 'admin@example.cz')
    const b = await createDevice('Nový', 'admin@example.cz')
    if (!a.ok || !b.ok) throw new Error('nečekané')
    await revokeDevice(a.device.id, 'admin@example.cz')
    const list = await listDevices()
    if (!list.ok) throw new Error('nečekané')
    expect(list.devices.map((d) => [d.name, Boolean(d.revokedAt)])).toEqual([
      ['Nový', false],
      ['Starý', true],
    ])
    expect(JSON.stringify(list.devices)).not.toContain(b.key)
  })

  it('bez migrace 136 seznam řekne missing_tables, ne chybu', async () => {
    setAdminDbForTests(pgliteAdminDriver(emptyDb))
    try {
      expect(await listDevices()).toEqual({ ok: false, reason: 'missing_tables' })
      expect(await addVoiceDevice('MacBook')).toEqual({ ok: false, error: expect.stringContaining('migrace 136') })
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
    }
  })
})

describe('akce v adminu', () => {
  it('přidání vrátí klíč jednou a odmítne prázdný nebo dlouhý název', async () => {
    const ok = await addVoiceDevice('  MacBook   Pro ')
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.device.name).toBe('MacBook Pro')
      expect(ok.key).toMatch(/^zk_voice_/)
    }
    expect(await addVoiceDevice('   ')).toMatchObject({ ok: false })
    expect(await addVoiceDevice('x'.repeat(81))).toMatchObject({ ok: false })
    expect(await addVoiceDevice(42)).toMatchObject({ ok: false })
  })

  it('bez pepře řekne, co chybí', async () => {
    process.env.AGENT_KEY_PEPPER = ''
    expect(await addVoiceDevice('MacBook')).toEqual({ ok: false, error: expect.stringContaining('AGENT_KEY_PEPPER') })
  })

  it('zneplatnění a Zpět přes akce, neplatné id odmítnou', async () => {
    const res = await addVoiceDevice('MacBook')
    if (!res.ok) throw new Error('nečekané')
    expect(await revokeVoiceDevice(res.device.id)).toEqual({ ok: true })
    expect(await revokeVoiceDevice(res.device.id)).toMatchObject({ ok: false })
    expect(await restoreVoiceDevice(res.device.id)).toEqual({ ok: true })
    expect(await revokeVoiceDevice('není-uuid')).toMatchObject({ ok: false })
    expect(await restoreVoiceDevice(null)).toMatchObject({ ok: false })
  })
})
