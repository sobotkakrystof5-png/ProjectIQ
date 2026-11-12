import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * AD08: kolik JavaScriptu stáhne admin, než vůbec něco udělá.
 *
 * Framer Motion se do adminu dostal kvůli kalendáři a čtyřem modalům, ale
 * platily ho **všechny** obrazovky, které si některou z nich zavolaly:
 * Hovory i Kalendář nesly ~28 kB gzip navíc, než někdo vůbec klikl. Admin
 * proto animuje přes `m` a balíček se načítá líně z `AdminRoot`, stejně jako
 * ve Workspace (`lib/ws/__tests__/ws-bundle-guard.test.ts`, RD03).
 *
 * Naměřeno (plán modernizace, sekce 11): Hovory 292,1 → 263,8 kB,
 * Kalendář 289,0 → 260,6 kB; ostatní trasy +0,4 kB za samotnou `LazyMotion`.
 */

const ROOT = path.resolve(__dirname, '../../..')

const tracked = (...patterns: string[]): string[] =>
  execFileSync('git', ['ls-files', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8')

/**
 * Soubory adminu: kořenové `components/*.tsx`, kostra, obrazovky a datová
 * vrstva. Workspace, landing page a `components/ui` mají vlastní pravidla.
 */
const ADMIN_FILES = tracked(
  'components/*.tsx',
  'components/admin/*.tsx',
  'app/dashboard/**/*.tsx',
  'app/dashboard/**/*.ts',
  'lib/admin/*.ts',
).filter((f) => !f.includes('__tests__'))

/**
 * Výjimky z pravidla „jen `m`". Každá potřebuje důvod — `m` bez `LazyMotion`
 * nad sebou nic nevykreslí.
 */
const MOTION_ALLOWED: Record<string, string> = {
  // Klientský portál /p není uvnitř AdminRoot, takže nad ním žádná LazyMotion
  // není. Přesun portálu pod společný kořen je samostatná práce.
  'components/BookingModal.tsx': 'klientský portál /p mimo AdminRoot',
}

describe('velikost balíčku adminu', () => {
  it('seznam souborů adminu není prázdný (jinak test nic netvrdí)', () => {
    expect(ADMIN_FILES.length).toBeGreaterThan(50)
  })

  it('admin animuje přes `m`, ne přes `motion`', () => {
    const offenders = ADMIN_FILES
      .filter((f) => /import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*'framer-motion'/.test(read(f)))
      .filter((f) => !(f in MOTION_ALLOWED))
    expect(offenders).toEqual([])
  })

  it('kdo smí `motion`, má pro to zapsaný důvod a pořád existuje', () => {
    for (const [file, reason] of Object.entries(MOTION_ALLOWED)) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} už neexistuje — smaž výjimku`).toBe(true)
      expect(reason.length).toBeGreaterThan(10)
    }
  })

  it('LazyMotion je v kostře adminu a funkce se importují líně', () => {
    const root = read('components/admin/admin-root.tsx')
    expect(root).toMatch(/<LazyMotion features=\{loadMotionFeatures\}>/)
    expect(root).toMatch(/const loadMotionFeatures = \(\) => import\('@\/lib\/admin\/motion-features'\)/)
  })

  it('líný balíček zůstává u domAnimation — `domMax` by ho zdvojnásobil', () => {
    const features = read('lib/admin/motion-features.ts')
    expect(features).toMatch(/domAnimation/)
    expect(features).not.toMatch(/domMax/)
  })

  it('kalendář netahá do prohlížeče celou historii (okno je povinné)', () => {
    // Pojistka k AD08: dotazy kalendáře žijí v lib/admin/calendar.ts a každý
    // z nich musí být omezený oknem, jinak se vrací stav před AD08.
    const calendar = read('lib/admin/calendar.ts')
    const selects = calendar.split(/\bq`/).slice(1)
    expect(selects).toHaveLength(4)
    for (const select of selects) {
      expect(select).toMatch(/WHERE/)
      expect(select, select.slice(0, 120)).toMatch(/fromInstant|\$\{from\}/)
    }
  })
})

describe('server actions', () => {
  it("v souboru s 'use server' je každý export async funkce", () => {
    // Build na tom spadne, `tsc` ani vitest ne (AD08 si tím prošel).
    const files = tracked('app/**/*actions.ts').filter((f) => read(f).startsWith("'use server'"))
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const bad = read(file)
        .split('\n')
        .filter((line) => /^export (?!async |type |interface |const |default )/.test(line))
      expect(bad, `${file}: ${bad.join(' | ')}`).toEqual([])
    }
  })
})
