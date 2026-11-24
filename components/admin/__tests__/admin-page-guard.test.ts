import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

/**
 * Každá serverová stránka adminu si přihlášení ověří sama (audit 2026-11-24, #2).
 *
 * Layout `app/dashboard/layout.tsx` přesměrovává, ale podle dokumentace Next 16
 * nebrání vykreslení stránky v RSC payloadu. Session jen s heslem (`aal1`)
 * by si tak data stránky mohla vyžádat. `requireAdminPage()` drží totéž
 * pravidlo jako layout a je cachovaná na požadavek, takže nic nestojí.
 *
 * Klientské stránky (`'use client'`) data na serveru nečtou; jejich akce mají
 * vlastní `requireAuth()`.
 */

const pages = execFileSync('git', ['ls-files', 'app/dashboard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('/page.tsx'))

describe('stránky adminu', () => {
  it('je jich víc než pár (rozsah se nerozbil)', () => {
    expect(pages.length).toBeGreaterThan(30)
  })

  it('každá serverová stránka volá requireAdminPage() hned na začátku', () => {
    const missing = pages.filter((file) => {
      const src = readFileSync(file, 'utf8')
      if (/^['"]use client['"]/m.test(src)) return false
      const body = src.slice(src.indexOf('export default async function'))
      const open = body.indexOf(') {') >= 0 ? body.indexOf('{', body.indexOf(')')) : -1
      // První příkaz těla, ne někde dál za načtením dat.
      const firstStatement = body.slice(open + 1).split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('//'))
      return !firstStatement || !/^(const session = )?await requireAdminPage\(\)/.test(firstStatement)
    })
    expect(missing).toEqual([])
  })
})
