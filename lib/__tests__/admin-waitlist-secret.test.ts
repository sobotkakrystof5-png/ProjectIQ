import { randomBytes } from 'node:crypto'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Připojení k databázi waitlistu (audit 2026-11-24, #10): ukládá se šifrovaně,
 * rozšifruje se jen na serveru a do prohlížeče nejde.
 */

const stored: { value: string | null } = { value: null }
vi.mock('@/lib/db', () => ({ sql: async () => [{ waitlist_db_url: stored.value }] }))

import {
  isSealed,
  loadWaitlistDbUrl,
  nextStoredWaitlistUrl,
  openWaitlistUrl,
  validWaitlistUrl,
} from '@/lib/admin/waitlist-secret'

const URL = 'postgresql://user:tajneheslo@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require'

beforeEach(() => {
  vi.stubEnv('GOOGLE_TOKEN_KEY', randomBytes(32).toString('base64'))
  stored.value = null
})

describe('připojení k databázi waitlistu', () => {
  it('nové připojení se uloží šifrovaně a na serveru se zase přečte', async () => {
    const sealed = await nextStoredWaitlistUrl('p1', { action: 'set', url: URL })
    expect(sealed).toBeTruthy()
    expect(sealed).not.toContain('tajneheslo')
    expect(isSealed(sealed!)).toBe(true)
    stored.value = sealed!
    expect(await loadWaitlistDbUrl('p1')).toBe(URL)
  })

  it('starý nešifrovaný zápis jde přečíst a při „ponechat" se zašifruje', async () => {
    stored.value = URL
    expect(openWaitlistUrl(URL)).toBe(URL)
    const next = await nextStoredWaitlistUrl('p1', { action: 'keep' })
    expect(next && isSealed(next)).toBe(true)
    expect(openWaitlistUrl(next)).toBe(URL)
  })

  it('„ponechat" u zašifrovaného nic nemění, „odebrat" smaže', async () => {
    stored.value = (await nextStoredWaitlistUrl('p1', { action: 'set', url: URL }))!
    expect(await nextStoredWaitlistUrl('p1', { action: 'keep' })).toBeUndefined()
    expect(await nextStoredWaitlistUrl('p1', { action: 'clear' })).toBeNull()
  })

  it('cizím klíčem zašifrované připojení se nepoužije', async () => {
    const sealed = (await nextStoredWaitlistUrl('p1', { action: 'set', url: URL }))!
    vi.stubEnv('GOOGLE_TOKEN_KEY', randomBytes(32).toString('base64'))
    expect(openWaitlistUrl(sealed)).toBeNull()
  })

  it('pustí jen postgres:// bez mezer', () => {
    expect(validWaitlistUrl(URL)).toBe(true)
    expect(validWaitlistUrl('postgres://a@b/c')).toBe(true)
    expect(validWaitlistUrl('https://utocnik.example')).toBe(false)
    expect(validWaitlistUrl('postgresql://a b@c/d')).toBe(false)
    expect(validWaitlistUrl(`postgresql://${'a'.repeat(1000)}`)).toBe(false)
  })

  it('čtecí akce a typ projektu připojení do prohlížeče nevracejí', () => {
    const actions = readFileSync('app/dashboard/startup/startup-actions.ts', 'utf8')
    // Ve výpisech projektu jen příznak, nikdy samotný sloupec.
    for (const m of actions.matchAll(/SELECT[\s\S]*?FROM startup_projects/g)) {
      if (/has_waitlist_db/.test(m[0])) expect(m[0]).not.toMatch(/,\s*waitlist_db_url\s*,/)
    }
    const types = readFileSync('lib/types.ts', 'utf8')
    expect(types).not.toMatch(/waitlist_db_url/)
    const clientFiles = execFileSync('git', ['grep', '-l', "^'use client'", '--', 'components', 'app'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const leaking = clientFiles.filter((f) => readFileSync(f, 'utf8').includes('waitlist_db_url'))
    expect(leaking).toEqual([])
  })
})
