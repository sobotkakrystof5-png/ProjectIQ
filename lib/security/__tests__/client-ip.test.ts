import { describe, expect, it } from 'vitest'
import { clientIpFromHeaders, ipRateKey, UNKNOWN_IP } from '../client-ip'

const headers = (init: Record<string, string>) => new Headers(init)

describe('clientIpFromHeaders', () => {
  it('bere první adresu z x-forwarded-for', () => {
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
  })

  it('x-vercel-forwarded-for má přednost', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '203.0.113.9' })),
    ).toBe('198.51.100.7')
  })

  it('x-real-ip je záloha', () => {
    expect(clientIpFromHeaders(headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
  })

  it('umí IPv6', () => {
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
  })

  it('hodnota, která není IP, se do klíče limitu nedostane', () => {
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': 'neco-vymysleneho' }))).toBe(UNKNOWN_IP)
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '<script>alert(1)</script>' }))).toBe(UNKNOWN_IP)
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '1.2.3.4.5' }))).toBe(UNKNOWN_IP)
  })

  it('bez hlaviček je unknown', () => {
    expect(clientIpFromHeaders(headers({}))).toBe(UNKNOWN_IP)
  })
})

describe('ipRateKey', () => {
  it('IPv4 a neznámé hodnoty nechá beze změny', () => {
    expect(ipRateKey('203.0.113.9')).toBe('203.0.113.9')
    expect(ipRateKey('unknown')).toBe('unknown')
    expect(ipRateKey('project')).toBe('project')
  })

  it('IPv6 sráží na /64, takže střídání koncovky limit neobejde', () => {
    const a = ipRateKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    const b = ipRateKey('2001:db8:1:2:1111:2222:3333:4444')
    expect(a).toBe('2001:0db8:0001:0002::/64')
    expect(b).toBe(a)
  })

  it('jiná síť /64 je jiný klíč', () => {
    expect(ipRateKey('2001:db8:1:3::1')).not.toBe(ipRateKey('2001:db8:1:2::1'))
  })

  it('zvládne zkrácený zápis', () => {
    expect(ipRateKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64')
    expect(ipRateKey('::1')).toBe('0000:0000:0000:0000::/64')
    expect(ipRateKey('2001:DB8:0:0:1::1')).toBe('2001:0db8:0000:0000::/64')
  })

  it('adresu s vloženou IPv4 nechá, jak je (nejde rozložit)', () => {
    expect(ipRateKey('::ffff:1.2.3.4')).toBe('::ffff:1.2.3.4')
  })
})
