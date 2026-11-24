import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Proxy pustí do adminu jen session, která prošla druhým faktorem, pokud ho
 * admin má zapsaný (audit 2026-11-24, #2). Dřív kontroloval jen e-mail
 * a stáří session, druhý faktor hlídal jen layout.
 */

const ADMIN = 'admin@example.cz'
process.env.SUPABASE_URL = 'https://projekt.supabase.co'
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
process.env.ADMIN_EMAIL = ADMIN

const state: {
  claims: Record<string, unknown> | null
  totp: { id: string }[]
  factorsError: unknown
  listCalls: number
} = { claims: null, totp: [], factorsError: null, listCalls: 0 }

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      mfa: {
        listFactors: async () => {
          state.listCalls++
          return state.factorsError
            ? { data: null, error: state.factorsError }
            : { data: { totp: state.totp, all: state.totp }, error: null }
        },
      },
    },
  }),
}))

import { checkAdminSession } from '@/lib/supabase/proxy'

const req = () => new NextRequest('https://admin.test/dashboard/kontakty')
const fresh = () => [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }]

beforeEach(() => {
  state.claims = null
  state.totp = []
  state.factorsError = null
  state.listCalls = 0
})

describe('checkAdminSession', () => {
  it('session jen s heslem a zapsaným TOTP neprojde', async () => {
    state.claims = { email: ADMIN, sub: 'u1', aal: 'aal1', amr: fresh() }
    state.totp = [{ id: 'faktor-1' }]
    expect((await checkAdminSession(req())).admin).toBeNull()
  })

  it('po druhém faktoru projde a Supabase se na faktory neptá', async () => {
    state.claims = { email: ADMIN, sub: 'u1', aal: 'aal2', amr: fresh() }
    state.totp = [{ id: 'faktor-1' }]
    expect((await checkAdminSession(req())).admin).toEqual({ email: ADMIN, userId: 'u1', aal: 'aal2' })
    expect(state.listCalls).toBe(0)
  })

  it('bez zapsaného faktoru projde i s heslem', async () => {
    state.claims = { email: ADMIN, sub: 'u1', aal: 'aal1', amr: fresh() }
    expect((await checkAdminSession(req())).admin).not.toBeNull()
  })

  it('když se na faktory nejde zeptat, nepustí', async () => {
    state.claims = { email: ADMIN, sub: 'u1', aal: 'aal1', amr: fresh() }
    state.factorsError = new Error('síť')
    expect((await checkAdminSession(req())).admin).toBeNull()
  })

  it('cizí účet ani s druhým faktorem neprojde', async () => {
    state.claims = { email: 'kdokoli@jinde.cz', sub: 'u2', aal: 'aal2', amr: fresh() }
    expect((await checkAdminSession(req())).admin).toBeNull()
  })
})
