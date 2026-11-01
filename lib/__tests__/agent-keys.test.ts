import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const sqlMock = vi.fn()
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sqlMock(...a) }))

import {
  agentKeyMatches,
  agentKeyPrefixOf,
  bearerFrom,
  generateAgentKey,
  hashAgentKey,
  maskAgentKey,
  resolveAgentKey,
  AgentKeyConfigError,
} from '@/lib/agent-keys'
import { buildAgentEnvBlock, buildClaudeMdBlock } from '@/lib/agent-setup'

const PEPPER = 'p'.repeat(40)

beforeEach(() => {
  sqlMock.mockReset()
  process.env.AGENT_KEY_PEPPER = PEPPER
})

describe('klíč projektu', () => {
  it('má tvar zk_agent_<10>_<32> a hash sedí na CHECK z migrace 094', () => {
    const { key, prefix, hash } = generateAgentKey()
    expect(key).toMatch(/^zk_agent_[A-Za-z0-9]{10}_[A-Za-z0-9]{32}$/)
    expect(agentKeyPrefixOf(key)).toBe(prefix)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(maskAgentKey(prefix)).not.toContain(key.slice(-8))
  })

  it('shoduje se jen se svým hashem', () => {
    const a = generateAgentKey()
    const b = generateAgentKey()
    expect(agentKeyMatches(a.key, a.hash)).toBe(true)
    expect(agentKeyMatches(a.key, b.hash)).toBe(false)
    expect(agentKeyMatches(a.key, 'zkažený')).toBe(false)
  })

  it('bez pepře (nebo s krátkým) selže zavřeně', () => {
    process.env.AGENT_KEY_PEPPER = 'krátký'
    expect(() => hashAgentKey('x')).toThrow(AgentKeyConfigError)
    expect(() => generateAgentKey()).toThrow(AgentKeyConfigError)
  })

  it('jiný pepř dá jiný hash', () => {
    const { key, hash } = generateAgentKey()
    process.env.AGENT_KEY_PEPPER = 'q'.repeat(40)
    expect(agentKeyMatches(key, hash)).toBe(false)
  })

  it('hlavičku Bearer čte přesně', () => {
    expect(bearerFrom('Bearer abc')).toBe('abc')
    expect(bearerFrom('bearer abc')).toBe('abc')
    expect(bearerFrom('Basic abc')).toBeNull()
    expect(bearerFrom('Bearer a b')).toBeNull()
    expect(bearerFrom(null)).toBeNull()
  })
})

describe('resolveAgentKey', () => {
  it('platný klíč vrátí projekt', async () => {
    const { key, prefix, hash } = generateAgentKey()
    sqlMock.mockResolvedValue([{ id: 'k1', project_id: 'p1', key_hash: hash, revoked_at: null }])
    expect(await resolveAgentKey(key)).toEqual({ keyId: 'k1', projectId: 'p1' })
    expect(sqlMock.mock.calls[0][1]).toBe(prefix)
  })

  it('zneplatněný klíč je odmítnutý', async () => {
    const { key, hash } = generateAgentKey()
    sqlMock.mockResolvedValue([{ id: 'k1', project_id: 'p1', key_hash: hash, revoked_at: new Date() }])
    expect(await resolveAgentKey(key)).toBeNull()
  })

  it('klíč se správným prefixem, ale jiným tajemstvím je odmítnutý', async () => {
    const real = generateAgentKey()
    const forged = `${real.key.slice(0, -4)}AAAA`
    sqlMock.mockResolvedValue([{ id: 'k1', project_id: 'p1', key_hash: real.hash, revoked_at: null }])
    expect(await resolveAgentKey(forged)).toBeNull()
  })

  it('špatný tvar a neznámý prefix se nedostanou ani k databázi / vrátí null', async () => {
    expect(await resolveAgentKey('nesmysl')).toBeNull()
    expect(sqlMock).not.toHaveBeenCalled()
    sqlMock.mockResolvedValue([])
    expect(await resolveAgentKey(generateAgentKey().key)).toBeNull()
  })
})

describe('návod pro projekt klienta', () => {
  it('neobsahuje žádný klíč, jen název proměnné', () => {
    const { key } = generateAgentKey()
    const text = `${buildAgentEnvBlock({ projectId: 'p1', baseUrl: 'https://app.example.cz/' })}\n${buildClaudeMdBlock()}`
    expect(text).not.toContain(key)
    expect(text).not.toMatch(/zk_agent_[A-Za-z0-9]{10}_/)
    expect(text).toContain('ZAKAZIQ_AGENT_KEY=')
    expect(text).toContain('ZAKAZIQ_URL=https://app.example.cz\n')
  })
})
