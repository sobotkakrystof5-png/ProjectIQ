import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { classifyPath, createFrontGate, FRONT_GATE_LIMITS } from '../front-gate'

const request = (path: string, ip: string | null = '203.0.113.5') =>
  new NextRequest(`https://www.zakaziq.cz${path}`, { headers: ip ? { 'x-forwarded-for': ip } : {} })

describe('classifyPath', () => {
  it('API je zvlášť, vše ostatní jsou stránky', () => {
    expect(classifyPath('/api/ws/firma/zmeny')).toBe('api')
    expect(classifyPath('/api/klient/transcribe')).toBe('api')
    expect(classifyPath('/api')).toBe('api')
    expect(classifyPath('/')).toBe('page')
    expect(classifyPath('/dashboard')).toBe('page')
    expect(classifyPath('/apiary')).toBe('page')
  })
})

describe('frontGate', () => {
  it('pustí povolený počet stránek a pak vrátí 429 s Retry-After', async () => {
    const gate = createFrontGate({ enabled: true, now: () => 1_000 })
    for (let i = 0; i < FRONT_GATE_LIMITS.page; i += 1) expect(gate(request('/'))).toBeNull()

    const blocked = gate(request('/'))
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('Retry-After')).toBe('10')
    expect(blocked?.headers.get('Cache-Control')).toBe('no-store')
    expect(await blocked?.text()).toMatch(/Příliš mnoho požadavků/)
  })

  it('jiná IP není dotčená', () => {
    const gate = createFrontGate({ enabled: true, now: () => 0 })
    for (let i = 0; i <= FRONT_GATE_LIMITS.page; i += 1) gate(request('/', '203.0.113.5'))
    expect(gate(request('/', '203.0.113.5'))?.status).toBe(429)
    expect(gate(request('/', '203.0.113.6'))).toBeNull()
  })

  it('API má přísnější strop než stránky a počítá se zvlášť', () => {
    const gate = createFrontGate({ enabled: true, now: () => 0 })
    for (let i = 0; i < FRONT_GATE_LIMITS.api; i += 1) expect(gate(request('/api/ws/firma/zmeny'))).toBeNull()
    expect(gate(request('/api/ws/firma/zmeny'))?.status).toBe(429)
    // Stránky stejné IP zůstávají dostupné.
    expect(gate(request('/'))).toBeNull()
  })

  it('po uplynutí okna se pouští znovu', () => {
    let now = 0
    const gate = createFrontGate({ enabled: true, now: () => now })
    for (let i = 0; i <= FRONT_GATE_LIMITS.page; i += 1) gate(request('/'))
    expect(gate(request('/'))?.status).toBe(429)
    now = 10_001
    expect(gate(request('/'))).toBeNull()
  })

  it('IPv6 z jedné sítě /64 sdílí jedno vědro', () => {
    const gate = createFrontGate({ enabled: true, now: () => 0 })
    for (let i = 0; i <= FRONT_GATE_LIMITS.page; i += 1) {
      gate(request('/', `2001:db8:1:2:${i.toString(16)}::1`))
    }
    expect(gate(request('/', '2001:db8:1:2:ffff::9'))?.status).toBe(429)
    expect(gate(request('/', '2001:db8:1:3::1'))).toBeNull()
  })

  it('bez rozpoznatelné IP nikoho nezamkne', () => {
    const gate = createFrontGate({ enabled: true, now: () => 0 })
    for (let i = 0; i < FRONT_GATE_LIMITS.page * 2; i += 1) expect(gate(request('/', null))).toBeNull()
  })

  it('vypnutá brána nic nezastaví', () => {
    const gate = createFrontGate({ enabled: false })
    for (let i = 0; i < FRONT_GATE_LIMITS.page * 2; i += 1) expect(gate(request('/'))).toBeNull()
  })

  it('mimo produkci je brána ve výchozím stavu vypnutá (vývoj načítá desítky souborů)', () => {
    const gate = createFrontGate()
    for (let i = 0; i < FRONT_GATE_LIMITS.page * 2; i += 1) expect(gate(request('/'))).toBeNull()
  })
})
