import { describe, expect, it } from 'vitest'
import { contextRefFromPath } from '@/lib/admin/assistant-open'

/**
 * Kontext asistenta se bere z adresy obrazovky (AD14). Poznává jen tvary
 * s identifikátorem v cestě; kdekoli jinde se ptá naslepo, což je správně —
 * horší by bylo podsunout mu cizí zakázku.
 */
describe('kontext podle adresy', () => {
  const uuid = '11111111-2222-3333-4444-555555555555'

  it('detail zakázky dá odkaz na zakázku', () => {
    expect(contextRefFromPath(`/dashboard/${uuid}`)).toEqual({ kind: 'project', id: uuid })
    expect(contextRefFromPath(`/dashboard/${uuid}/fakturace`)).toEqual({ kind: 'project', id: uuid })
  })

  it('startupový projekt se nesplete se zakázkou', () => {
    expect(contextRefFromPath(`/dashboard/startup/${uuid}`)).toEqual({ kind: 'startup', id: uuid })
  })

  it('běžná obrazovka kontext nemá', () => {
    for (const path of ['/dashboard', '/dashboard/calls', '/dashboard/faktury', '/dashboard/zakazky', '/dashboard/profil']) {
      expect(contextRefFromPath(path)).toBeNull()
    }
  })

  it('cesta s něčím, co není identifikátor, kontext nedá', () => {
    expect(contextRefFromPath('/dashboard/kontakty')).toBeNull()
    expect(contextRefFromPath('/dashboard/1; DROP TABLE projects')).toBeNull()
  })
})
