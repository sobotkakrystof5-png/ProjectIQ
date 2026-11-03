import { describe, expect, it } from 'vitest'
import { clerkAuthorizedParties } from '../clerk'

describe('clerkAuthorizedParties', () => {
  it('v produkci pustí jen origin hlavního hostu', () => {
    expect(clerkAuthorizedParties('production', 'https://www.zakaziq.cz')).toEqual(['https://www.zakaziq.cz'])
    expect(clerkAuthorizedParties('production', 'https://www.zakaziq.cz/w?x=1')).toEqual(['https://www.zakaziq.cz'])
  })

  it('Preview, dev a lokální běh kontrolu nemají', () => {
    expect(clerkAuthorizedParties('preview', 'https://www.zakaziq.cz')).toBeUndefined()
    expect(clerkAuthorizedParties('development', 'http://localhost:3000')).toBeUndefined()
    expect(clerkAuthorizedParties(undefined, 'https://www.zakaziq.cz')).toBeUndefined()
  })

  it('chybějící, neplatná nebo nešifrovaná adresa přihlášení nerozbije', () => {
    expect(clerkAuthorizedParties('production', undefined)).toBeUndefined()
    expect(clerkAuthorizedParties('production', 'není adresa')).toBeUndefined()
    expect(clerkAuthorizedParties('production', 'http://www.zakaziq.cz')).toBeUndefined()
  })
})
