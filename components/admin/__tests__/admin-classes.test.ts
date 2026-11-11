import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

/**
 * Ukazatel postupu místo screenshot testů (AD04, plán sekce 4h).
 *
 * Počítá třídy, které v adminu zbývají přepsat do Dílků, a tvrdí, že číslo je
 * **nejvýš** strop. Strop se po každém sezení (AD05, AD17…) sníží na naměřenou
 * hodnotu — test tak hlídá, že nikdo omylem nepřidá starou třídu zpátky, ale
 * nebrání postupnému úklidu. Čísla patří i do plánu, sekce 11.
 *
 * Rozsah je admin a stránky bez data-app, tedy to, co AD05 a AD17 překreslují.
 * Workspace, landing page a components/ui/* jsou mimo — ty Dílky dodržují.
 */

const PATHS = ['app/dashboard', 'app/p', 'app/h', 'app/(auth)', 'app/globals.css', 'components/admin', 'lib/types.ts']

const RAINBOW = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PREFIX = 'bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|accent|caret|fill|stroke|shadow'

/** Naměřeno 2026-11-11 po AD07. Snižovat, nikdy nezvyšovat. */
const LIMITS: Record<string, { limit: number; re: RegExp }> = {
  'muted-foreground': { limit: 589, re: /muted-foreground/g },
  'rounded-lg|xl|2xl': { limit: 396, re: /\brounded-(lg|xl|2xl)\b/g },
  'brand-*': { limit: 0, re: new RegExp(`\\b(${PREFIX})-brand-\\d{2,3}\\b`, 'g') },
  'border-border': { limit: 269, re: /\bborder-border\b/g },
  'duhové barvy': { limit: 677, re: new RegExp(`\\b(bg|text|border|ring)-(${RAINBOW})-\\d{2,3}\\b`, 'g') },
  'bg-white': { limit: 176, re: /\bbg-white\b/g },
}

function adminSource() {
  const files = execFileSync('git', ['ls-files', '--', ...PATHS, 'components/*.tsx'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(tsx|ts|css)$/.test(f) && !f.includes('__tests__'))
  expect(files.length).toBeGreaterThan(100)
  return files.map((f) => readFileSync(f, 'utf8')).join('\n')
}

describe('admin — kolik zbývá do Dílků', () => {
  const source = adminSource()

  it.each(Object.entries(LIMITS))('%s je nejvýš strop', (_name, { limit, re }) => {
    expect((source.match(re) || []).length).toBeLessThanOrEqual(limit)
  })

  it('brand-* je po přejmenování nula; zůstává jen dočasný .brand-gradient', () => {
    expect((source.match(LIMITS['brand-*'].re) || []).length).toBe(0)
    expect(readFileSync('app/globals.css', 'utf8')).toContain('.brand-gradient')
  })
})
