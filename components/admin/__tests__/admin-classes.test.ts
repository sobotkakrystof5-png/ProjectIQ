import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

/**
 * Ukazatel postupu místo screenshot testů (AD04, plán sekce 4h).
 *
 * Počítá třídy, které v adminu neměly zůstat, a tvrdí, že jich je **nejvýš**
 * strop. Strop se po každém sezení (AD05, AD07, AD17) snižoval na naměřenou
 * hodnotu; **AD18 ho srazil na nulu**, takže test od teď hlídá návrat staré
 * třídy, ne zbývající práci. Čísla patří i do plánu, sekce 11.
 *
 * Rozsah je admin a stránky bez `data-app` — tedy to, co AD05, AD17 a AD18
 * překreslovaly. `components/ws`, `components/marketing` a `components/ui`
 * jsou mimo: Dílky dodržují a `bg-white` v nich je bílá na tmavém (logo,
 * tlačítko v hero, razítko věrnostní karty), ne nepřepsaná karta. Do AD18 je
 * pathspec `components/*.tsx` bral s sebou, protože `*` v gitu zabírá i lomítko.
 */

const PATHS = [
  'app/dashboard',
  'app/p',
  'app/h',
  'app/(auth)',
  'app/globals.css',
  'components/admin',
  'lib/types.ts',
  'components/*.tsx',
  ':(exclude)components/ws/*',
  ':(exclude)components/marketing/*',
  ':(exclude)components/ui/*',
]

const RAINBOW = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const GREY = 'gray|slate|zinc|neutral|stone'
const PREFIX = 'bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|accent|caret|fill|stroke|shadow'

/** Naměřeno 2026-11-14 po AD18. Snižovat, nikdy nezvyšovat. */
const LIMITS: Record<string, { limit: number; re: RegExp }> = {
  'muted-foreground': { limit: 0, re: new RegExp(`\\b(${PREFIX})-muted-foreground\\b`, 'g') },
  'rounded-lg|xl|2xl': { limit: 0, re: /\brounded-(lg|xl|2xl)\b/g },
  'brand-*': { limit: 0, re: new RegExp(`\\b(${PREFIX})-brand-\\d{2,3}\\b`, 'g') },
  // Jediný zbytek je `@apply border-border` v základní vrstvě app/globals.css —
  // výchozí barva okraje pro celé repo, která se řídí motivem. Třída v TSX žádná.
  'border-border': { limit: 1, re: /\bborder-border\b/g },
  'duhové barvy': { limit: 0, re: new RegExp(`\\b(${PREFIX})-(${RAINBOW})-\\d{2,3}\\b`, 'g') },
  'šedé škály': { limit: 0, re: new RegExp(`\\b(${PREFIX})-(${GREY})-\\d{2,3}\\b`, 'g') },
  'bg-white': { limit: 0, re: /\bbg-white\b/g },
}

function adminFiles() {
  const files = execFileSync('git', ['ls-files', '--', ...PATHS], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(tsx|ts|css)$/.test(f) && !f.includes('__tests__'))
  expect(files.length).toBeGreaterThan(100)
  return files
}

describe('admin — stará vizuální vrstva nezbyla', () => {
  const files = adminFiles()
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n')

  it.each(Object.entries(LIMITS))('%s je nejvýš strop', (_name, { limit, re }) => {
    const hits = source.match(re) || []
    expect(hits.length, hits.slice(0, 10).join(', ')).toBeLessThanOrEqual(limit)
  })

  it('.brand-gradient je pryč z app/globals.css (AD18)', () => {
    expect(readFileSync('app/globals.css', 'utf8')).not.toContain('brand-gradient')
  })

  it('modální okno se nekreslí ručně — focus trap řeší Radix (AD18)', () => {
    // Překryvnou vrstvu kreslí jedině `components/ui/{dialog,sheet}.tsx`.
    // Kdekoli jinde `fixed inset-0` znamená ručně psaný modál bez focus trapu.
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('fixed inset-0'))
    expect(offenders).toEqual([])
  })

  it('emoji v rozhraní adminu nejsou (Dílky § Nikdy)', () => {
    // Jen vykreslované soubory. Text e-mailu, který admin posílá ven, je obsah
    // od člověka — ten si emoji dovolit smí (`app/dashboard/startup/startup-actions.ts`).
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    const offenders = files.filter((f) => f.endsWith('.tsx') && emoji.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
